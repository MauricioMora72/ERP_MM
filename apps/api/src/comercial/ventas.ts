import Decimal from 'decimal.js';
import { sql, type Trx } from '@erp/db';
import { tienePermiso, type Sesion } from '../contexto.js';
import { ErrorNegocio } from '../errores.js';
import { contabilizar } from '../nucleo/contabilidad.js';
import { hoy, numerar, tipoDocumento } from '../nucleo/documentos.js';
import { aplicarACuotasCxc, emitirFactura, establecimientoDe, monedaDe, numeroSri, type LineaFactura } from '../nucleo/facturacion.js';
import { cambioManual, estadoDeFase, estadoLinea, faseDe, type Estado } from '../nucleo/flujos.js';
import { comprometer, ligarAsientoKardex, moverInventario } from '../nucleo/inventario.js';
import { precioLista } from '../servicios/comun.js';
import { articulo, D, estadosDe, impuestoVigente, moverLinea } from './comun.js';

/** Ciclo de ventas: cotización, orden de venta, crédito, despacho, facturación, nota de crédito y facturación de contratos. */

interface Cliente {
  clase_contable_id: string;
  condicion_pago_id: string | null;
  lista_precios_id: string | null;
  limite_credito: string;
  bloqueado: boolean;
}

export async function cliente(trx: Trx, companiaId: string, direccionId: string): Promise<Cliente> {
  const r = await sql<Cliente>`
    select clase_contable_id, condicion_pago_id, lista_precios_id, limite_credito, bloqueado
    from erp.mae_clientes where direccion_id = ${direccionId} and compania_id = ${companiaId}`.execute(trx);
  if (!r.rows[0]) throw new ErrorNegocio(400, 'El tercero no está registrado como cliente de esta compañía. Regístrelo en Ventas, Clientes.');
  return r.rows[0];
}

/** Saldo por cobrar más órdenes abiertas sin facturar, para el control de crédito. */
async function exposicion(trx: Trx, companiaId: string, clienteId: string): Promise<Decimal> {
  const r = await sql<{ cxc: string; ordenes: string }>`
    select (select coalesce(sum(saldo), 0) from erp.cxc_documentos where compania_id = ${companiaId} and cliente_id = ${clienteId}) as cxc,
           (select coalesce(sum((l.cantidad - l.cantidad_facturada) * l.precio), 0)
              from erp.ven_ordenes_lineas l join erp.ven_ordenes o on o.id = l.orden_id
              join erp.sis_tipos_documento t on t.id = o.tipo_documento_id
              join erp.sis_flujos_estado f on f.tipo_documento_id = o.tipo_documento_id and f.estado = l.estado_ultimo
             where o.compania_id = ${companiaId} and o.cliente_id = ${clienteId} and t.codigo = 'OV'
               and f.fase in ('RETENIDA','APROBADA','DESPACHADA')) as ordenes`.execute(trx);
  return D(r.rows[0]!.cxc).plus(r.rows[0]!.ordenes);
}

export interface LineaVentaEntrada {
  articuloId: string;
  descripcion?: string | null;
  unidadNegocioId?: string | null;
  cantidad: Decimal.Value;
  precio?: Decimal.Value | null;
  descuentoPorcentaje?: Decimal.Value | null;
}

export interface OrdenVentaEntrada {
  tipo: 'OV' | 'CO';
  clienteId: string;
  unidadNegocioId: string;
  fecha?: string | null;
  fechaRequerida?: string | null;
  referencia?: string | null;
  observacion?: string | null;
  documentoOrigenId?: string | null;
  lineas: LineaVentaEntrada[];
}

export async function crearOrdenVenta(trx: Trx, companiaId: string, d: OrdenVentaEntrada) {
  if (d.lineas.length === 0) throw new ErrorNegocio(400, 'Agregue al menos una línea.');
  const cli = await cliente(trx, companiaId, d.clienteId);
  const tipo = await tipoDocumento(trx, 'VEN', d.tipo);
  const estados = await estadosDe(trx, tipo.id);
  const fecha = d.fecha ?? hoy();

  const preparadas: { a: Awaited<ReturnType<typeof articulo>>; l: LineaVentaEntrada; cantidad: Decimal; precio: Decimal; descuento: Decimal; impuestoId: string | null; bodega: string }[] = [];
  for (const [i, l] of d.lineas.entries()) {
    const a = await articulo(trx, l.articuloId);
    const cantidad = D(l.cantidad);
    if (cantidad.lessThanOrEqualTo(0)) throw new ErrorNegocio(400, `Línea ${i + 1}: la cantidad debe ser mayor que cero.`);
    let precio = l.precio == null || l.precio === '' ? null : D(l.precio);
    precio ??= await precioLista(trx, { articuloId: a.id, listaPreciosId: cli.lista_precios_id, fecha });
    if (precio == null || precio.isNegative()) throw new ErrorNegocio(400, `Línea ${i + 1}: ${a.descripcion} no tiene precio de lista; ingrese el precio.`);
    const pct = D(l.descuentoPorcentaje);
    if (pct.isNegative() || pct.greaterThan(100)) throw new ErrorNegocio(400, `Línea ${i + 1}: el descuento debe estar entre 0 y 100 %.`);
    const descuento = cantidad.times(precio).times(pct).dividedBy(100).toDecimalPlaces(2);
    const imp = await impuestoVigente(trx, a.impuesto_id, fecha);
    preparadas.push({ a, l, cantidad, precio, descuento, impuestoId: imp.id, bodega: l.unidadNegocioId ?? d.unidadNegocioId });
  }

  let inicial = estadoLinea(estados, tipo.estado_inicial ?? estados[0]!.estado);
  let retenida = false;
  if (d.tipo === 'OV') {
    const nueva = preparadas.reduce((s, p) => s.plus(p.cantidad.times(p.precio).minus(p.descuento)), D(0));
    const limite = D(cli.limite_credito);
    if (cli.bloqueado || (limite.greaterThan(0) && (await exposicion(trx, companiaId, d.clienteId)).plus(nueva).greaterThan(limite))) {
      retenida = true;
      inicial = estadoLinea(estados, estadoDeFase(estados, 'RETENIDA').estado);
    }
  }

  const numero = await numerar(trx, companiaId, tipo.id);
  const cab = await sql<{ id: string }>`
    insert into erp.ven_ordenes (compania_id, tipo_documento_id, numero, unidad_negocio_id, cliente_id, fecha, fecha_requerida, condicion_pago_id,
      moneda_id, referencia, documento_origen_id, observacion)
    values (${companiaId}, ${tipo.id}, ${numero}, ${d.unidadNegocioId}, ${d.clienteId}, ${fecha}, ${d.fechaRequerida ?? null}, ${cli.condicion_pago_id},
      ${await monedaDe(trx, companiaId)}, ${d.referencia ?? null}, ${d.documentoOrigenId ?? null}, ${d.observacion ?? null})
    returning id`.execute(trx);
  const id = cab.rows[0]!.id;
  const advertencias: string[] = [];
  for (const [i, p] of preparadas.entries()) {
    await sql`
      insert into erp.ven_ordenes_lineas (orden_id, linea, articulo_id, descripcion, unidad_negocio_id, cantidad, unidad, precio, descuento, impuesto_id,
        estado_siguiente, estado_ultimo)
      values (${id}, ${i + 1}, ${p.a.id}, ${(p.l.descripcion?.trim() || p.a.descripcion).slice(0, 200)}, ${p.bodega}, ${p.cantidad.toFixed(4)},
        ${p.a.unidad_primaria}, ${p.precio.toFixed(6)}, ${p.descuento.toFixed(2)}, ${p.impuestoId}, ${inicial.siguiente}, ${inicial.ultimo})`.execute(trx);
    if (d.tipo === 'OV') {
      const disponible = await comprometer(trx, p.a.id, p.bodega, p.cantidad);
      if (disponible?.isNegative()) advertencias.push(`${p.a.descripcion}: faltan ${disponible.negated()} para cubrir lo comprometido.`);
    }
  }
  if (retenida) advertencias.unshift('La orden quedó retenida por crédito: el cliente está bloqueado o supera su límite.');
  return { id, numero, retenida, advertencias };
}

interface LineaOV {
  id: string;
  orden_id: string;
  linea: number;
  articulo_id: string;
  descripcion: string;
  unidad_negocio_id: string;
  cantidad: string;
  cantidad_despachada: string;
  cantidad_facturada: string;
  precio: string;
  descuento: string;
  impuesto_id: string | null;
  costo_unitario: string | null;
  estado_ultimo: number;
  tipo_existencia: string;
  clase_contable_id: string;
}

async function lineasOV(trx: Trx, ordenId: string): Promise<LineaOV[]> {
  const r = await sql<LineaOV>`
    select l.id, l.orden_id, l.linea, l.articulo_id, l.descripcion, l.unidad_negocio_id, l.cantidad, l.cantidad_despachada, l.cantidad_facturada,
           l.precio, l.descuento, l.impuesto_id, l.costo_unitario, l.estado_ultimo, a.tipo_existencia, a.clase_contable_id
    from erp.ven_ordenes_lineas l join erp.mae_articulos a on a.id = l.articulo_id
    where l.orden_id = ${ordenId} order by l.linea for update of l`.execute(trx);
  return r.rows;
}

async function cabeceraOV(trx: Trx, ordenId: string) {
  const r = await sql<{ id: string; compania_id: string; tipo_documento_id: string; numero: string; cliente_id: string; unidad_negocio_id: string; codigo: string }>`
    select o.id, o.compania_id, o.tipo_documento_id, o.numero, o.cliente_id, o.unidad_negocio_id, t.codigo
    from erp.ven_ordenes o join erp.sis_tipos_documento t on t.id = o.tipo_documento_id where o.id = ${ordenId}`.execute(trx);
  if (!r.rows[0]) throw new ErrorNegocio(404, 'La orden no existe.');
  return r.rows[0];
}

/** Cambio manual: liberar del crédito o cancelar líneas. */
export async function cambiarEstadoVenta(trx: Trx, sesion: Sesion, ordenId: string, d: { estado: number; lineas?: string[] | null }): Promise<number> {
  const cab = await cabeceraOV(trx, ordenId);
  const estados = await estadosDe(trx, cab.tipo_documento_id);
  let cambiadas = 0;
  for (const l of (await lineasOV(trx, ordenId)).filter((x) => !d.lineas?.length || d.lineas.includes(x.id))) {
    let destino: Estado;
    try {
      destino = cambioManual(estados, l.estado_ultimo, d.estado);
    } catch (e) {
      if (d.lineas?.length) throw e;
      continue;
    }
    const origen = faseDe(estados, l.estado_ultimo);
    if (origen === 'RETENIDA' && destino.fase === 'APROBADA' && !(await tienePermiso(trx, sesion, 'ven-credito', 'MODIFICAR'))) {
      throw new ErrorNegocio(403, 'No tiene permiso para liberar órdenes retenidas por crédito.');
    }
    if (destino.fase === 'CANCELADA') {
      if (D(l.cantidad_despachada).greaterThan(0)) throw new ErrorNegocio(400, `La línea ${l.linea} ya tiene despachos; cierre su saldo en lugar de cancelarla.`);
      if (cab.codigo === 'OV') await comprometer(trx, l.articulo_id, l.unidad_negocio_id, D(l.cantidad).negated());
    }
    if (['DESPACHADA', 'FACTURADA', 'CERRADA'].includes(destino.fase ?? '')) {
      throw new ErrorNegocio(400, 'Para despachar, facturar o convertir use la acción correspondiente.');
    }
    const e = estadoLinea(estados, destino.estado);
    await sql`update erp.ven_ordenes_lineas set estado_ultimo = ${e.ultimo}, estado_siguiente = ${e.siguiente} where id = ${l.id}`.execute(trx);
    cambiadas++;
  }
  if (cambiadas === 0) throw new ErrorNegocio(400, 'Ninguna línea admite ese cambio de estado.');
  return cambiadas;
}

/** Cierra el saldo no despachado de una línea y libera su compromiso. */
export async function cerrarSaldoVenta(trx: Trx, ordenId: string, lineaId: string): Promise<void> {
  const cab = await cabeceraOV(trx, ordenId);
  const estados = await estadosDe(trx, cab.tipo_documento_id);
  const l = (await lineasOV(trx, ordenId)).find((x) => x.id === lineaId);
  if (!l) throw new ErrorNegocio(404, 'La línea no existe.');
  const fase = faseDe(estados, l.estado_ultimo);
  if (fase !== 'APROBADA' && fase !== 'RETENIDA') throw new ErrorNegocio(400, 'La línea no tiene saldo por despachar.');
  const despachada = D(l.cantidad_despachada);
  if (despachada.isZero()) throw new ErrorNegocio(400, 'La línea no tiene despachos; cancélela.');
  await comprometer(trx, l.articulo_id, l.unidad_negocio_id, D(l.cantidad).minus(despachada).negated());
  await sql`update erp.ven_ordenes_lineas set cantidad = ${despachada.toFixed(4)} where id = ${l.id}`.execute(trx);
  const destino = D(l.cantidad_facturada).greaterThanOrEqualTo(despachada) ? 'FACTURADA' : 'DESPACHADA';
  await moverLinea(trx, 'ven_ordenes_lineas', l.id, estados, l.estado_ultimo, destino);
}

export async function convertirCotizacion(trx: Trx, ordenId: string, lineasIds?: string[] | null) {
  const cab = await cabeceraOV(trx, ordenId);
  if (cab.codigo !== 'CO') throw new ErrorNegocio(400, 'Solo se convierten cotizaciones.');
  const estados = await estadosDe(trx, cab.tipo_documento_id);
  const lineas = (await lineasOV(trx, ordenId)).filter((l) => faseDe(estados, l.estado_ultimo) === 'REGISTRADA' && (!lineasIds?.length || lineasIds.includes(l.id)));
  if (lineas.length === 0) throw new ErrorNegocio(400, 'La cotización no tiene líneas vigentes para convertir.');
  const ov = await crearOrdenVenta(trx, cab.compania_id, {
    tipo: 'OV', clienteId: cab.cliente_id, unidadNegocioId: cab.unidad_negocio_id, documentoOrigenId: ordenId,
    observacion: `Desde la cotización ${cab.numero}`,
    lineas: lineas.map((l) => ({
      articuloId: l.articulo_id, descripcion: l.descripcion, unidadNegocioId: l.unidad_negocio_id, cantidad: l.cantidad, precio: l.precio,
      descuentoPorcentaje: D(l.cantidad).times(l.precio).isZero() ? 0 : D(l.descuento).times(100).dividedBy(D(l.cantidad).times(l.precio)),
    })),
  });
  for (const l of lineas) await moverLinea(trx, 'ven_ordenes_lineas', l.id, estados, l.estado_ultimo, 'CERRADA');
  return ov;
}

// ---------------------------------------------------------------------------
// Despacho y facturación

export async function despachar(trx: Trx, ordenId: string, d: { fecha?: string | null; lineas: { lineaId: string; cantidad: Decimal.Value }[] }) {
  const cab = await cabeceraOV(trx, ordenId);
  if (cab.codigo !== 'OV') throw new ErrorNegocio(400, 'Solo se despachan órdenes de venta.');
  const estados = await estadosDe(trx, cab.tipo_documento_id);
  const todas = await lineasOV(trx, ordenId);
  const pedidas = d.lineas.filter((x) => D(x.cantidad).greaterThan(0));
  if (pedidas.length === 0) throw new ErrorNegocio(400, 'Indique la cantidad a despachar de al menos una línea.');
  const tipo = await tipoDocumento(trx, 'VEN', 'DS');
  const numero = await numerar(trx, cab.compania_id, tipo.id);
  const fecha = d.fecha ?? hoy();
  for (const p of pedidas) {
    const l = todas.find((x) => x.id === p.lineaId);
    if (!l) throw new ErrorNegocio(400, 'Una de las líneas no pertenece a la orden.');
    const fase = faseDe(estados, l.estado_ultimo);
    if (fase === 'RETENIDA') throw new ErrorNegocio(400, `La línea ${l.linea} está retenida por crédito.`);
    if (fase !== 'APROBADA') throw new ErrorNegocio(400, `La línea ${l.linea} no está por despachar.`);
    const cantidad = D(p.cantidad);
    const pendiente = D(l.cantidad).minus(l.cantidad_despachada);
    if (cantidad.greaterThan(pendiente)) throw new ErrorNegocio(400, `La línea ${l.linea} tiene pendiente ${pendiente} y se intenta despachar ${cantidad}.`);
    let costoTotal = D(0);
    let kardexId: string | null = null;
    if (l.tipo_existencia === 'INVENTARIABLE') {
      await comprometer(trx, l.articulo_id, l.unidad_negocio_id, cantidad.negated());
      const mov = await moverInventario(trx, {
        companiaId: cab.compania_id, fecha, articuloId: l.articulo_id, unidadNegocioId: l.unidad_negocio_id, cantidad: cantidad.negated(),
        tipoDocumentoId: tipo.id, numeroDocumento: numero, origenModulo: 'VEN', origenLineaId: l.id,
      });
      kardexId = mov.kardexId;
      costoTotal = mov.costoTotal;
      const asiento = await contabilizar(trx, {
        companiaId: cab.compania_id, fecha, glosa: `Despacho ${numero}, orden de venta ${cab.numero}, línea ${l.linea}`, origenModulo: 'VEN', origenId: l.id,
        lineas: [
          { concepto: 'DESP_POR_FACTURAR', claseContableId: l.clase_contable_id, unidadNegocioId: l.unidad_negocio_id, debito: costoTotal },
          { concepto: 'INVENTARIO', claseContableId: mov.claseContableId, unidadNegocioId: l.unidad_negocio_id, credito: costoTotal },
        ],
      });
      if (kardexId) await ligarAsientoKardex(trx, kardexId, asiento);
    }
    const previa = D(l.cantidad_despachada);
    const nueva = previa.plus(cantidad);
    const costoPrevio = D(l.costo_unitario).times(previa);
    const costoUnitario = costoPrevio.plus(costoTotal).dividedBy(nueva);
    await sql`update erp.ven_ordenes_lineas set cantidad_despachada = ${nueva.toFixed(4)}, costo_unitario = ${costoUnitario.toDecimalPlaces(6).toFixed(6)},
                kardex_id = coalesce(${kardexId}, kardex_id) where id = ${l.id}`.execute(trx);
    if (cantidad.equals(pendiente)) await moverLinea(trx, 'ven_ordenes_lineas', l.id, estados, l.estado_ultimo, 'DESPACHADA');
  }
  return { numero };
}

/** Factura lo despachado y no facturado de una orden de venta. */
export async function facturarOrdenVenta(trx: Trx, ordenId: string, fecha?: string | null) {
  const cab = await cabeceraOV(trx, ordenId);
  if (cab.codigo !== 'OV') throw new ErrorNegocio(400, 'Solo se facturan órdenes de venta.');
  const estados = await estadosDe(trx, cab.tipo_documento_id);
  const lineas = (await lineasOV(trx, ordenId)).filter((l) => D(l.cantidad_despachada).greaterThan(l.cantidad_facturada));
  if (lineas.length === 0) throw new ErrorNegocio(400, 'La orden no tiene despachos pendientes de facturar.');
  const f = fecha ?? hoy();
  const facturar: LineaFactura[] = [];
  const costos: { claseContableId: string | null; unidadNegocioId: string | null; costo: Decimal }[] = [];
  for (const l of lineas) {
    const cantidad = D(l.cantidad_despachada).minus(l.cantidad_facturada);
    const imp = await impuestoVigente(trx, l.impuesto_id, f);
    facturar.push({
      articuloId: l.articulo_id, descripcion: l.descripcion, cantidad, precio: l.precio,
      descuento: D(l.descuento).times(cantidad).dividedBy(l.cantidad).toDecimalPlaces(2),
      impuestoId: imp.id, porcentajeImpuesto: imp.porcentaje, claseContableId: l.clase_contable_id, unidadNegocioId: l.unidad_negocio_id,
      ordenLineaId: l.id,
    });
    if (l.tipo_existencia === 'INVENTARIABLE') {
      costos.push({ claseContableId: l.clase_contable_id, unidadNegocioId: l.unidad_negocio_id, costo: cantidad.times(D(l.costo_unitario)).toDecimalPlaces(2) });
    }
  }
  const emitida = await emitirFactura(trx, {
    companiaId: cab.compania_id, clienteId: cab.cliente_id, fecha: f, glosa: `Orden de venta ${cab.numero}`, lineas: facturar, lineasCosto: costos,
  });
  for (const l of lineas) {
    const facturada = D(l.cantidad_despachada);
    await sql`update erp.ven_ordenes_lineas set cantidad_facturada = ${facturada.toFixed(4)} where id = ${l.id}`.execute(trx);
    if (facturada.greaterThanOrEqualTo(l.cantidad) && faseDe(estados, l.estado_ultimo) === 'DESPACHADA') {
      await moverLinea(trx, 'ven_ordenes_lineas', l.id, estados, l.estado_ultimo, 'FACTURADA');
    }
  }
  return { facturaId: emitida.facturaId, numero: emitida.numero, total: emitida.total.toFixed(2) };
}

// ---------------------------------------------------------------------------
// Nota de crédito

export async function emitirNotaCredito(
  trx: Trx,
  companiaId: string,
  d: { facturaId: string; fecha?: string | null; motivo: string; devolverInventario: boolean; lineas: { facturaLineaId: string; cantidad: Decimal.Value }[] },
) {
  const fac = await sql<{ id: string; cliente_id: string; establecimiento: string; punto_emision: string; secuencial: string; codigo: string; compania_id: string }>`
    select f.id, f.cliente_id, f.establecimiento, f.punto_emision, f.secuencial, t.codigo, f.compania_id
    from erp.ven_facturas f join erp.sis_tipos_documento t on t.id = f.tipo_documento_id where f.id = ${d.facturaId}`.execute(trx);
  const factura = fac.rows[0];
  if (!factura || factura.compania_id !== companiaId) throw new ErrorNegocio(404, 'La factura no existe.');
  if (factura.codigo !== 'FA') throw new ErrorNegocio(400, 'La nota de crédito se emite sobre una factura.');
  if (!d.motivo?.trim()) throw new ErrorNegocio(400, 'Indique el motivo de la nota de crédito.', { motivo: 'Este campo es obligatorio' });
  const fecha = d.fecha ?? hoy();
  const pedidas = d.lineas.filter((x) => D(x.cantidad).greaterThan(0));
  if (pedidas.length === 0) throw new ErrorNegocio(400, 'Indique la cantidad a devolver de al menos una línea.');

  const calc: { fl: Json; cantidad: Decimal; base: Decimal; iva: Decimal; descuento: Decimal }[] = [];
  for (const p of pedidas) {
    const r = await sql<Json>`
      select fl.*, a.clase_contable_id, a.tipo_existencia, ol.unidad_negocio_id as bodega, ol.costo_unitario as costo_despacho
      from erp.ven_facturas_lineas fl join erp.mae_articulos a on a.id = fl.articulo_id
      left join erp.ven_ordenes_lineas ol on ol.id = fl.orden_linea_id
      where fl.id = ${p.facturaLineaId} and fl.factura_id = ${d.facturaId} for update of fl`.execute(trx);
    const fl = r.rows[0];
    if (!fl) throw new ErrorNegocio(400, 'Una de las líneas no pertenece a la factura.');
    const cantidad = D(p.cantidad);
    const disponible = D(fl.cantidad).minus(fl.cantidad_devuelta);
    if (cantidad.greaterThan(disponible)) throw new ErrorNegocio(400, `La línea ${fl.linea} admite devolver hasta ${disponible}.`);
    const prop = cantidad.dividedBy(fl.cantidad);
    const base = D(fl.cantidad).times(fl.precio).toDecimalPlaces(2).minus(fl.descuento).times(prop).toDecimalPlaces(2);
    calc.push({ fl, cantidad, base, iva: D(fl.valor_impuesto).times(prop).toDecimalPlaces(2), descuento: D(fl.descuento).times(prop).toDecimalPlaces(2) });
  }
  const subtotal = calc.reduce((s, c) => s.plus(c.base).plus(c.descuento), D(0));
  const descuento = calc.reduce((s, c) => s.plus(c.descuento), D(0));
  const impuestos = calc.reduce((s, c) => s.plus(c.iva), D(0));
  const total = subtotal.minus(descuento).plus(impuestos);

  const tipo = await tipoDocumento(trx, 'VEN', 'NC');
  const est = await establecimientoDe(trx, companiaId);
  const secuencial = await numerar(trx, companiaId, tipo.id);
  const nc = await sql<{ id: string }>`
    insert into erp.ven_facturas (compania_id, tipo_documento_id, establecimiento, punto_emision, secuencial, fecha, cliente_id, moneda_id,
      subtotal, descuento, impuestos, total, factura_modificada_id)
    values (${companiaId}, ${tipo.id}, ${est.establecimiento}, ${est.punto_emision}, ${secuencial}, ${fecha}, ${factura.cliente_id},
      ${await monedaDe(trx, companiaId)}, ${subtotal.toFixed(2)}, ${descuento.toFixed(2)}, ${impuestos.toFixed(2)}, ${total.toFixed(2)}, ${d.facturaId})
    returning id`.execute(trx);
  const ncId = nc.rows[0]!.id;
  const numero = numeroSri(est, secuencial);
  const numeroFactura = numeroSri(factura, factura.secuencial);

  const lineasContables: Parameters<typeof contabilizar>[1]['lineas'] = [];
  for (const [i, c] of calc.entries()) {
    await sql`
      insert into erp.ven_facturas_lineas (factura_id, linea, articulo_id, descripcion, cantidad, precio, descuento, impuesto_id, valor_impuesto, total, orden_linea_id)
      values (${ncId}, ${i + 1}, ${c.fl.articulo_id}, ${c.fl.descripcion}, ${c.cantidad.toFixed(4)}, ${c.fl.precio}, ${c.descuento.toFixed(2)},
        ${c.fl.impuesto_id}, ${c.iva.toFixed(2)}, ${c.base.plus(c.iva).toFixed(2)}, ${c.fl.orden_linea_id})`.execute(trx);
    await sql`update erp.ven_facturas_lineas set cantidad_devuelta = cantidad_devuelta + ${c.cantidad.toFixed(4)} where id = ${c.fl.id}`.execute(trx);
    lineasContables.push({ concepto: 'DEVOLUCION_VENTAS', claseContableId: c.fl.clase_contable_id, unidadNegocioId: c.fl.bodega, debito: c.base });
    if (d.devolverInventario && c.fl.tipo_existencia === 'INVENTARIABLE' && c.fl.bodega) {
      const mov = await moverInventario(trx, {
        companiaId, fecha, articuloId: c.fl.articulo_id, unidadNegocioId: c.fl.bodega, cantidad: c.cantidad,
        costoUnitario: D(c.fl.costo_despacho), tipoDocumentoId: tipo.id, numeroDocumento: String(secuencial), origenModulo: 'VEN', origenLineaId: c.fl.id,
      });
      const asientoInv = await contabilizar(trx, {
        companiaId, fecha, glosa: `Devolución a bodega, nota de crédito ${numero}`, origenModulo: 'VEN', origenId: ncId,
        lineas: [
          { concepto: 'INVENTARIO', claseContableId: mov.claseContableId, unidadNegocioId: c.fl.bodega, debito: mov.costoTotal },
          { concepto: 'COSTO_VENTA', claseContableId: c.fl.clase_contable_id, unidadNegocioId: c.fl.bodega, credito: mov.costoTotal },
        ],
      });
      if (mov.kardexId) await ligarAsientoKardex(trx, mov.kardexId, asientoInv);
    }
  }
  const asiento = await contabilizar(trx, {
    companiaId, fecha, glosa: `Nota de crédito ${numero} a la factura ${numeroFactura}. ${d.motivo}`.slice(0, 500), origenModulo: 'VEN', origenId: ncId,
    lineas: [...lineasContables, { concepto: 'IVA_VENTAS', debito: impuestos }, { concepto: 'CLIENTES', terceroId: factura.cliente_id, credito: total }],
  });
  await sql`update erp.ven_facturas set asiento_id = ${asiento} where id = ${ncId}`.execute(trx);

  const resto = await aplicarACuotasCxc(trx, d.facturaId, total, fecha, { notaCreditoId: ncId });
  if (resto.greaterThan(0)) {
    await sql`
      insert into erp.cxc_documentos (compania_id, tipo_documento_id, numero, cuota, cliente_id, factura_id, fecha, vencimiento, moneda_id, monto, saldo)
      values (${companiaId}, ${tipo.id}, ${secuencial}, 1, ${factura.cliente_id}, ${ncId}, ${fecha}, ${fecha}, ${await monedaDe(trx, companiaId)},
        ${resto.negated().toFixed(2)}, ${resto.negated().toFixed(2)})`.execute(trx);
  }
  return { id: ncId, numero, total: total.toFixed(2), saldoAFavor: resto.toFixed(2) };
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// ---------------------------------------------------------------------------
// Contratos

const MESES: Record<string, number> = { MENSUAL: 1, TRIMESTRAL: 3, ANUAL: 12 };

export async function facturarContratos(trx: Trx, companiaId: string, fecha: string) {
  const lineas = await sql<{ contrato_id: string; numero: string; cliente_id: string; frecuencia: string; linea_id: string; articulo_id: string;
    cantidad: string; precio: string; proxima: string; descripcion: string }>`
    select c.id as contrato_id, c.numero, c.cliente_id, c.frecuencia, l.id as linea_id, l.articulo_id, l.cantidad, l.precio,
           to_char(coalesce(l.proxima_facturacion, c.fecha_inicio), 'YYYY-MM-DD') as proxima, a.descripcion
    from erp.ven_contratos c join erp.ven_contratos_lineas l on l.contrato_id = c.id join erp.mae_articulos a on a.id = l.articulo_id
    where c.compania_id = ${companiaId} and c.estado = 'VIGENTE' and coalesce(l.proxima_facturacion, c.fecha_inicio) <= ${fecha}::date
      and (c.fecha_fin is null or coalesce(l.proxima_facturacion, c.fecha_inicio) <= c.fecha_fin) and l.precio > 0
    order by c.numero, l.linea
    for update of l`.execute(trx);
  const porContrato = new Map<string, typeof lineas.rows>();
  for (const l of lineas.rows) porContrato.set(l.contrato_id, [...(porContrato.get(l.contrato_id) ?? []), l]);
  const facturas: { contrato: string; numero: string; total: string }[] = [];
  for (const grupo of porContrato.values()) {
    const c = grupo[0]!;
    const facturar: LineaFactura[] = [];
    for (const l of grupo) {
      const a = await articulo(trx, l.articulo_id);
      const imp = await impuestoVigente(trx, a.impuesto_id, fecha);
      facturar.push({
        articuloId: a.id, descripcion: `${l.descripcion}, período desde ${l.proxima}`, cantidad: l.cantidad, precio: l.precio, impuestoId: imp.id,
        porcentajeImpuesto: imp.porcentaje, claseContableId: a.clase_contable_id, unidadNegocioId: null, contratoLineaId: l.linea_id,
      });
    }
    const emitida = await emitirFactura(trx, { companiaId, clienteId: c.cliente_id, fecha, glosa: `Contrato ${c.numero}`, lineas: facturar });
    for (const l of grupo) {
      await sql`update erp.ven_contratos_lineas set proxima_facturacion = (${l.proxima}::date + make_interval(months => ${MESES[c.frecuencia] ?? 1}))::date
                where id = ${l.linea_id}`.execute(trx);
    }
    facturas.push({ contrato: c.numero, numero: emitida.numero, total: emitida.total.toFixed(2) });
  }
  return facturas;
}

// ---------------------------------------------------------------------------
// Lecturas

export async function listarVentas(trx: Trx, companiaId: string, q: { tipo?: string; buscar?: string; pendientes?: boolean }) {
  const patron = q.buscar ? `%${q.buscar}%` : null;
  const r = await sql`
    select o.id, o.numero, t.codigo as tipo, o.fecha, o.referencia, d.nombre as cliente, u.codigo as sucursal,
      round(sum(l.cantidad * l.precio - l.descuento), 2) as total,
      min(l.estado_ultimo) filter (where f.fase not in ('CANCELADA')) as estado,
      (select descripcion from erp.sis_flujos_estado where tipo_documento_id = o.tipo_documento_id
        and estado = coalesce(min(l.estado_ultimo) filter (where f.fase not in ('CANCELADA')), max(l.estado_ultimo))) as estado_descripcion,
      bool_or(f.fase = 'RETENIDA') as retenida
    from erp.ven_ordenes o join erp.sis_tipos_documento t on t.id = o.tipo_documento_id
    join erp.mae_unidades_negocio u on u.id = o.unidad_negocio_id join erp.mae_direcciones d on d.id = o.cliente_id
    join erp.ven_ordenes_lineas l on l.orden_id = o.id
    join erp.sis_flujos_estado f on f.tipo_documento_id = o.tipo_documento_id and f.estado = l.estado_ultimo
    where o.compania_id = ${companiaId} and (${q.tipo ?? null}::text is null or t.codigo = ${q.tipo ?? null})
      and (${patron}::text is null or d.nombre ilike ${patron} or o.numero::text = ${q.buscar ?? ''} or o.referencia ilike ${patron})
    group by o.id, t.codigo, d.nombre, u.codigo
    having (${q.pendientes ?? false} = false or bool_or(f.fase not in ('CERRADA','CANCELADA','FACTURADA')))
    order by o.fecha desc, o.numero desc limit 300`.execute(trx);
  return r.rows;
}

export async function detalleVenta(trx: Trx, ordenId: string) {
  const cab = await sql`
    select o.*, t.codigo as tipo, t.descripcion as tipo_descripcion, d.nombre as cliente, u.codigo || ' - ' || u.descripcion as sucursal,
           cp.descripcion as condicion_pago, org.numero as origen_numero
    from erp.ven_ordenes o join erp.sis_tipos_documento t on t.id = o.tipo_documento_id
    join erp.mae_unidades_negocio u on u.id = o.unidad_negocio_id join erp.mae_direcciones d on d.id = o.cliente_id
    left join erp.mae_condiciones_pago cp on cp.id = o.condicion_pago_id left join erp.ven_ordenes org on org.id = o.documento_origen_id
    where o.id = ${ordenId}`.execute(trx);
  const c = cab.rows[0] as { tipo_documento_id: string } | undefined;
  if (!c) throw new ErrorNegocio(404, 'La orden no existe.');
  const estados = await estadosDe(trx, c.tipo_documento_id);
  const lineas = await sql<{ estado_ultimo: number }>`
    select l.*, a.codigo as articulo, a.tipo_existencia, u.codigo as bodega, round(l.cantidad * l.precio - l.descuento, 2) as total,
           coalesce(s.en_mano - s.comprometido, null) as disponible
    from erp.ven_ordenes_lineas l join erp.mae_articulos a on a.id = l.articulo_id join erp.mae_unidades_negocio u on u.id = l.unidad_negocio_id
    left join erp.inv_saldos s on s.articulo_id = l.articulo_id and s.unidad_negocio_id = l.unidad_negocio_id and s.ubicacion_id is null and s.lote_id is null
    where l.orden_id = ${ordenId} order by l.linea`.execute(trx);
  const [facturas, derivadas] = await Promise.all([
    sql`select distinct f.id, f.establecimiento || '-' || f.punto_emision || '-' || lpad(f.secuencial::text, 9, '0') as numero, f.fecha, f.total
        from erp.ven_facturas f join erp.ven_facturas_lineas fl on fl.factura_id = f.id join erp.ven_ordenes_lineas l on l.id = fl.orden_linea_id
        join erp.sis_tipos_documento t on t.id = f.tipo_documento_id
        where l.orden_id = ${ordenId} and t.codigo = 'FA' order by numero`.execute(trx),
    sql`select id, numero from erp.ven_ordenes where documento_origen_id = ${ordenId} order by numero`.execute(trx),
  ]);
  return {
    orden: c,
    estados,
    lineas: lineas.rows.map((l) => {
      const actual = estados.find((x) => x.estado === l.estado_ultimo);
      return {
        ...l,
        fase: faseDe(estados, l.estado_ultimo),
        siguientes: estados.filter((e) => actual && (e.estado === actual.estado_siguiente || (actual.estados_alternos ?? []).includes(e.estado))),
      };
    }),
    facturas: facturas.rows,
    derivadas: derivadas.rows,
  };
}

export async function listarFacturasVenta(trx: Trx, companiaId: string, q: { clienteId?: string; buscar?: string; tipo?: string }) {
  const patron = q.buscar ? `%${q.buscar}%` : null;
  const r = await sql`
    select f.id, t.codigo as tipo, f.establecimiento || '-' || f.punto_emision || '-' || lpad(f.secuencial::text, 9, '0') as numero, f.fecha,
           d.nombre as cliente, f.cliente_id, f.subtotal, f.descuento, f.impuestos, f.total,
           (select coalesce(sum(saldo), 0) from erp.cxc_documentos x where x.factura_id = f.id) as saldo
    from erp.ven_facturas f join erp.sis_tipos_documento t on t.id = f.tipo_documento_id join erp.mae_direcciones d on d.id = f.cliente_id
    where f.compania_id = ${companiaId} and (${q.tipo ?? null}::text is null or t.codigo = ${q.tipo ?? null})
      and (${q.clienteId ?? null}::uuid is null or f.cliente_id = ${q.clienteId ?? null}::uuid)
      and (${patron}::text is null or d.nombre ilike ${patron} or f.secuencial::text = ${q.buscar ?? ''})
    order by f.fecha desc, f.secuencial desc limit 300`.execute(trx);
  return r.rows;
}

export async function detalleFacturaVenta(trx: Trx, id: string) {
  const f = await sql`
    select f.*, t.codigo as tipo, d.nombre as cliente, d.identificacion,
           f.establecimiento || '-' || f.punto_emision || '-' || lpad(f.secuencial::text, 9, '0') as numero,
           m.establecimiento || '-' || m.punto_emision || '-' || lpad(m.secuencial::text, 9, '0') as factura_modificada
    from erp.ven_facturas f join erp.sis_tipos_documento t on t.id = f.tipo_documento_id join erp.mae_direcciones d on d.id = f.cliente_id
    left join erp.ven_facturas m on m.id = f.factura_modificada_id where f.id = ${id}`.execute(trx);
  if (!f.rows[0]) throw new ErrorNegocio(404, 'La factura no existe.');
  const [lineas, cuotas, aplicaciones, notas] = await Promise.all([
    sql`select l.*, a.codigo as articulo from erp.ven_facturas_lineas l join erp.mae_articulos a on a.id = l.articulo_id where l.factura_id = ${id} order by l.linea`.execute(trx),
    sql`select id, cuota, vencimiento, monto, saldo from erp.cxc_documentos where factura_id = ${id} order by cuota`.execute(trx),
    sql`select ap.fecha, ap.monto, case when ap.cobro_id is not null then 'Cobro ' || c.numero when ap.retencion_id is not null then 'Retención ' || r.secuencial
             else 'Nota de crédito ' || n.establecimiento || '-' || n.punto_emision || '-' || lpad(n.secuencial::text, 9, '0') end as origen
        from erp.cxc_aplicaciones ap join erp.cxc_documentos d on d.id = ap.documento_id
        left join erp.cxc_cobros c on c.id = ap.cobro_id left join erp.ec_retenciones r on r.id = ap.retencion_id left join erp.ven_facturas n on n.id = ap.nota_credito_id
        where d.factura_id = ${id} order by ap.creado_en`.execute(trx),
    sql`select id, establecimiento || '-' || punto_emision || '-' || lpad(secuencial::text, 9, '0') as numero, fecha, total
        from erp.ven_facturas where factura_modificada_id = ${id} order by secuencial`.execute(trx),
  ]);
  return { factura: f.rows[0], lineas: lineas.rows, cuotas: cuotas.rows, aplicaciones: aplicaciones.rows, notas: notas.rows };
}
