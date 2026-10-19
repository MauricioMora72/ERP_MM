import Decimal from 'decimal.js';
import { sql, type Trx } from '@erp/db';
import { tienePermiso, type Sesion } from '../contexto.js';
import { ErrorNegocio } from '../errores.js';
import { contabilizar, type LineaContable } from '../nucleo/contabilidad.js';
import { hoy, numerar, tipoDocumento, tipoDocumentoPorId } from '../nucleo/documentos.js';
import { establecimientoDe, monedaDe, cuotasSegunCondicion } from '../nucleo/facturacion.js';
import { cambioManual, estadoLinea, faseDe, type Estado } from '../nucleo/flujos.js';
import { ligarAsientoKardex, moverInventario } from '../nucleo/inventario.js';
import { articulo, D, estadosDe, impuestoVigente, moverLinea, retencionVigente } from './comun.js';

/** Ciclo de compras: requisición, orden de compra, aprobación, recepción y factura de proveedor con retención. */

export type TipoCompra = 'OC' | 'RQ';

interface Proveedor {
  clase_contable_id: string;
  condicion_pago_id: string | null;
  codigo_ret_renta: string | null;
  codigo_ret_iva: string | null;
}

async function proveedor(trx: Trx, companiaId: string, direccionId: string): Promise<Proveedor> {
  const r = await sql<Proveedor>`
    select clase_contable_id, condicion_pago_id, codigo_ret_renta, codigo_ret_iva
    from erp.mae_proveedores where direccion_id = ${direccionId} and compania_id = ${companiaId}`.execute(trx);
  if (!r.rows[0]) throw new ErrorNegocio(400, 'El tercero no está registrado como proveedor de esta compañía. Regístrelo en Ventas y compras, Proveedores.');
  return r.rows[0];
}

// ---------------------------------------------------------------------------
// Órdenes y requisiciones

export interface LineaCompraEntrada {
  articuloId?: string | null;
  descripcion?: string | null;
  cuentaId?: string | null;
  unidadNegocioId?: string | null;
  cantidad: Decimal.Value;
  costoUnitario?: Decimal.Value | null;
  impuestoId?: string | null;
}

export interface OrdenCompraEntrada {
  tipo: TipoCompra;
  proveedorId?: string | null;
  unidadNegocioId: string;
  fecha?: string | null;
  fechaRequerida?: string | null;
  condicionPagoId?: string | null;
  observacion?: string | null;
  documentoOrigenId?: string | null;
  lineas: LineaCompraEntrada[];
}

export async function crearOrdenCompra(trx: Trx, companiaId: string, d: OrdenCompraEntrada): Promise<{ id: string; numero: string }> {
  if (d.lineas.length === 0) throw new ErrorNegocio(400, 'Agregue al menos una línea.');
  const tipo = await tipoDocumento(trx, 'COM', d.tipo);
  const estados = await estadosDe(trx, tipo.id);
  const inicial = estadoLinea(estados, tipo.estado_inicial ?? estados[0]!.estado);
  const fecha = d.fecha ?? hoy();
  let condicion = d.condicionPagoId ?? null;
  if (d.tipo === 'OC') {
    if (!d.proveedorId) throw new ErrorNegocio(400, 'La orden de compra necesita un proveedor.', { proveedorId: 'Este campo es obligatorio' });
    const p = await proveedor(trx, companiaId, d.proveedorId);
    condicion ??= p.condicion_pago_id;
  }
  const numero = await numerar(trx, companiaId, tipo.id);
  const cab = await sql<{ id: string }>`
    insert into erp.com_ordenes (compania_id, tipo_documento_id, numero, unidad_negocio_id, proveedor_id, fecha, fecha_requerida,
      condicion_pago_id, moneda_id, documento_origen_id, observacion)
    values (${companiaId}, ${tipo.id}, ${numero}, ${d.unidadNegocioId}, ${d.proveedorId ?? null}, ${fecha}, ${d.fechaRequerida ?? null},
      ${condicion}, ${await monedaDe(trx, companiaId)}, ${d.documentoOrigenId ?? null}, ${d.observacion ?? null})
    returning id`.execute(trx);
  const id = cab.rows[0]!.id;
  let n = 1;
  for (const l of d.lineas) {
    const cantidad = D(l.cantidad);
    if (cantidad.lessThanOrEqualTo(0)) throw new ErrorNegocio(400, `Línea ${n}: la cantidad debe ser mayor que cero.`);
    let descripcion = l.descripcion?.trim() || null;
    let unidad = 'UN';
    let impuestoId = l.impuestoId ?? null;
    let costo = l.costoUnitario == null || l.costoUnitario === '' ? null : D(l.costoUnitario);
    if (l.articuloId) {
      const a = await articulo(trx, l.articuloId);
      descripcion ??= a.descripcion;
      unidad = a.unidad_primaria;
      impuestoId ??= a.impuesto_id;
      if (costo == null) {
        const c = await sql<{ costo_unitario: string }>`
          select costo_unitario from erp.inv_costos where articulo_id = ${a.id} and unidad_negocio_id = ${l.unidadNegocioId ?? d.unidadNegocioId}
            and metodo = 'PROMEDIO'`.execute(trx);
        costo = c.rows[0] ? D(c.rows[0].costo_unitario) : null;
      }
    } else if (!l.cuentaId) {
      throw new ErrorNegocio(400, `Línea ${n}: indique un artículo o una cuenta contable.`);
    }
    if (!descripcion) throw new ErrorNegocio(400, `Línea ${n}: indique la descripción.`);
    if (costo == null || costo.isNegative()) throw new ErrorNegocio(400, `Línea ${n}: indique el costo unitario.`);
    await sql`
      insert into erp.com_ordenes_lineas (orden_id, linea, articulo_id, descripcion, cuenta_id, unidad_negocio_id, cantidad, unidad,
        costo_unitario, impuesto_id, estado_siguiente, estado_ultimo)
      values (${id}, ${n}, ${l.articuloId ?? null}, ${descripcion.slice(0, 200)}, ${l.cuentaId ?? null}, ${l.unidadNegocioId ?? d.unidadNegocioId},
        ${cantidad.toFixed(4)}, ${unidad}, ${costo.toFixed(6)}, ${impuestoId}, ${inicial.siguiente}, ${inicial.ultimo})`.execute(trx);
    n++;
  }
  return { id, numero };
}

interface LineaOC {
  id: string;
  orden_id: string;
  linea: number;
  articulo_id: string | null;
  descripcion: string;
  cuenta_id: string | null;
  unidad_negocio_id: string;
  cantidad: string;
  cantidad_recibida: string;
  cantidad_facturada: string;
  costo_unitario: string;
  impuesto_id: string | null;
  estado_ultimo: number;
  tipo_existencia: string | null;
  clase_contable_id: string | null;
}

async function lineasDe(trx: Trx, ordenId: string, bloquear = false): Promise<LineaOC[]> {
  const r = await sql<LineaOC>`
    select l.id, l.orden_id, l.linea, l.articulo_id, l.descripcion, l.cuenta_id, l.unidad_negocio_id, l.cantidad, l.cantidad_recibida,
           l.cantidad_facturada, l.costo_unitario, l.impuesto_id, l.estado_ultimo, a.tipo_existencia, a.clase_contable_id
    from erp.com_ordenes_lineas l left join erp.mae_articulos a on a.id = l.articulo_id
    where l.orden_id = ${ordenId} order by l.linea ${bloquear ? sql`for update of l` : sql``}`.execute(trx);
  return r.rows;
}

interface CabeceraOC {
  id: string;
  compania_id: string;
  tipo_documento_id: string;
  numero: string;
  proveedor_id: string | null;
  unidad_negocio_id: string;
}

async function cabecera(trx: Trx, ordenId: string): Promise<CabeceraOC & { codigo: string }> {
  const r = await sql<CabeceraOC & { codigo: string }>`
    select o.id, o.compania_id, o.tipo_documento_id, o.numero, o.proveedor_id, o.unidad_negocio_id, t.codigo
    from erp.com_ordenes o join erp.sis_tipos_documento t on t.id = o.tipo_documento_id where o.id = ${ordenId}`.execute(trx);
  if (!r.rows[0]) throw new ErrorNegocio(404, 'La orden no existe.');
  return r.rows[0];
}

/** Cambio manual de estado de líneas: enviar a aprobación, aprobar, regresar o cancelar. */
export async function cambiarEstadoCompra(
  trx: Trx,
  sesion: Sesion,
  ordenId: string,
  d: { estado: number; lineas?: string[] | null; comentario?: string | null },
): Promise<number> {
  const cab = await cabecera(trx, ordenId);
  const estados = await estadosDe(trx, cab.tipo_documento_id);
  const lineas = (await lineasDe(trx, ordenId, true)).filter((l) => !d.lineas?.length || d.lineas.includes(l.id));
  let cambiadas = 0;
  let aprobo = false;
  for (const l of lineas) {
    const permitido = estados.find((e) => e.estado === d.estado);
    if (!permitido) throw new ErrorNegocio(400, `El estado ${d.estado} no existe en el flujo.`);
    // Sin lista explícita, solo se mueven las líneas para las que el cambio está permitido.
    let destino: Estado;
    try {
      destino = cambioManual(estados, l.estado_ultimo, d.estado);
    } catch (e) {
      if (d.lineas?.length) throw e;
      continue;
    }
    const origen = faseDe(estados, l.estado_ultimo);
    if (destino.fase === 'APROBADA' && origen === 'APROBACION') {
      if (!(await tienePermiso(trx, sesion, 'com-aprobar', 'MODIFICAR'))) throw new ErrorNegocio(403, 'No tiene permiso para aprobar compras.');
      aprobo = true;
    }
    if (destino.fase === 'CANCELADA' && (D(l.cantidad_recibida).greaterThan(0) || D(l.cantidad_facturada).greaterThan(0))) {
      throw new ErrorNegocio(400, `La línea ${l.linea} ya tiene recepciones o facturas; cierre su saldo en lugar de cancelarla.`);
    }
    if (destino.fase === 'RECIBIDA' || destino.fase === 'FACTURADA' || destino.fase === 'CERRADA') {
      throw new ErrorNegocio(400, 'Para recibir, facturar o convertir use la acción correspondiente.');
    }
    const e = estadoLinea(estados, destino.estado);
    await sql`update erp.com_ordenes_lineas set estado_ultimo = ${e.ultimo}, estado_siguiente = ${e.siguiente} where id = ${l.id}`.execute(trx);
    cambiadas++;
  }
  if (cambiadas === 0) throw new ErrorNegocio(400, 'Ninguna línea admite ese cambio de estado.');
  if (aprobo) {
    await sql`
      insert into erp.com_aprobaciones (orden_id, nivel, aprobador_id, resultado, fecha, comentario)
      values (${ordenId}, 1, ${sesion.usuarioId}, 'APROBADA', now(), ${d.comentario ?? null})
      on conflict on constraint uq_com_aprobaciones_1
      do update set aprobador_id = excluded.aprobador_id, resultado = 'APROBADA', fecha = now(), comentario = excluded.comentario`.execute(trx);
  }
  return cambiadas;
}

/** Cierra el saldo no recibido de una línea: la cantidad queda en lo recibido. */
export async function cerrarSaldoCompra(trx: Trx, ordenId: string, lineaId: string): Promise<void> {
  const cab = await cabecera(trx, ordenId);
  const estados = await estadosDe(trx, cab.tipo_documento_id);
  const l = (await lineasDe(trx, ordenId, true)).find((x) => x.id === lineaId);
  if (!l) throw new ErrorNegocio(404, 'La línea no existe.');
  const fase = faseDe(estados, l.estado_ultimo);
  if (fase !== 'APROBADA' && fase !== 'REGISTRADA' && fase !== 'APROBACION') throw new ErrorNegocio(400, 'La línea no tiene saldo por recibir.');
  const recibida = D(l.cantidad_recibida);
  const destino = recibida.isZero() ? 'CANCELADA' : D(l.cantidad_facturada).greaterThanOrEqualTo(recibida) ? 'FACTURADA' : 'RECIBIDA';
  await sql`update erp.com_ordenes_lineas set cantidad = ${recibida.isZero() ? l.cantidad : recibida.toFixed(4)} where id = ${l.id}`.execute(trx);
  const e = estados.find((x) => x.fase === destino)!;
  const par = estadoLinea(estados, e.estado);
  await sql`update erp.com_ordenes_lineas set estado_ultimo = ${par.ultimo}, estado_siguiente = ${par.siguiente} where id = ${l.id}`.execute(trx);
}

/** Convierte líneas aprobadas de una requisición en una orden de compra al proveedor indicado. */
export async function convertirRequisicion(
  trx: Trx,
  ordenId: string,
  d: { proveedorId: string; lineas?: string[] | null },
): Promise<{ id: string; numero: string }> {
  const cab = await cabecera(trx, ordenId);
  if (cab.codigo !== 'RQ') throw new ErrorNegocio(400, 'Solo se convierten requisiciones.');
  const estados = await estadosDe(trx, cab.tipo_documento_id);
  const lineas = (await lineasDe(trx, ordenId, true)).filter(
    (l) => faseDe(estados, l.estado_ultimo) === 'APROBADA' && (!d.lineas?.length || d.lineas.includes(l.id)),
  );
  if (lineas.length === 0) throw new ErrorNegocio(400, 'La requisición no tiene líneas aprobadas para convertir.');
  const oc = await crearOrdenCompra(trx, cab.compania_id, {
    tipo: 'OC',
    proveedorId: d.proveedorId,
    unidadNegocioId: cab.unidad_negocio_id,
    documentoOrigenId: ordenId,
    observacion: `Desde la requisición ${cab.numero}`,
    lineas: lineas.map((l) => ({
      articuloId: l.articulo_id, descripcion: l.descripcion, cuentaId: l.cuenta_id, unidadNegocioId: l.unidad_negocio_id,
      cantidad: l.cantidad, costoUnitario: l.costo_unitario, impuestoId: l.impuesto_id,
    })),
  });
  for (const l of lineas) await moverLinea(trx, 'com_ordenes_lineas', l.id, estados, l.estado_ultimo, 'CERRADA');
  return oc;
}

// ---------------------------------------------------------------------------
// Recepción

export async function recibir(
  trx: Trx,
  ordenId: string,
  d: { fecha?: string | null; lineas: { lineaId: string; cantidad: Decimal.Value; lote?: string | null; vencimiento?: string | null }[] },
): Promise<{ numero: string; recepciones: string[] }> {
  const cab = await cabecera(trx, ordenId);
  if (cab.codigo !== 'OC') throw new ErrorNegocio(400, 'Solo se recibe contra órdenes de compra.');
  const estados = await estadosDe(trx, cab.tipo_documento_id);
  const todas = await lineasDe(trx, ordenId, true);
  const pedidas = d.lineas.filter((x) => D(x.cantidad).greaterThan(0));
  if (pedidas.length === 0) throw new ErrorNegocio(400, 'Indique la cantidad recibida de al menos una línea.');
  const tipo = await tipoDocumento(trx, 'COM', 'RC');
  const numero = await numerar(trx, cab.compania_id, tipo.id);
  const fecha = d.fecha ?? hoy();
  const recepciones: string[] = [];
  for (const p of pedidas) {
    const l = todas.find((x) => x.id === p.lineaId);
    if (!l) throw new ErrorNegocio(400, 'Una de las líneas no pertenece a la orden.');
    if (faseDe(estados, l.estado_ultimo) !== 'APROBADA') throw new ErrorNegocio(400, `La línea ${l.linea} no está aprobada por recibir.`);
    const cantidad = D(p.cantidad);
    const pendiente = D(l.cantidad).minus(l.cantidad_recibida);
    if (cantidad.greaterThan(pendiente)) throw new ErrorNegocio(400, `La línea ${l.linea} tiene pendiente ${pendiente} y se intenta recibir ${cantidad}.`);
    const r = await sql<{ id: string }>`
      insert into erp.com_recepciones (orden_linea_id, fecha, cantidad, costo_unitario)
      values (${l.id}, ${fecha}, ${cantidad.toFixed(4)}, ${l.costo_unitario}) returning id`.execute(trx);
    const recepcionId = r.rows[0]!.id;
    const costo = cantidad.times(l.costo_unitario).toDecimalPlaces(2);
    let kardexId: string | null = null;
    let kardexIds: string[] = [];
    let loteId: string | null = null;
    let debito: LineaContable;
    if (l.articulo_id && l.tipo_existencia === 'INVENTARIABLE') {
      const mov = await moverInventario(trx, {
        companiaId: cab.compania_id, fecha, articuloId: l.articulo_id, unidadNegocioId: l.unidad_negocio_id, cantidad,
        lote: p.lote ? { codigo: p.lote, vencimiento: p.vencimiento ?? null } : null,
        costoUnitario: l.costo_unitario, tipoDocumentoId: tipo.id, numeroDocumento: numero, origenModulo: 'COM', origenLineaId: recepcionId,
      });
      kardexId = mov.kardexId;
      kardexIds = mov.kardexIds;
      loteId = mov.porLote[0]?.loteId ?? null;
      debito = { concepto: 'INVENTARIO', claseContableId: mov.claseContableId, unidadNegocioId: l.unidad_negocio_id, debito: mov.costoTotal };
    } else {
      debito = { concepto: 'GASTO_COMPRA', cuentaId: l.cuenta_id, claseContableId: l.clase_contable_id, unidadNegocioId: l.unidad_negocio_id, debito: costo };
    }
    const asiento = await contabilizar(trx, {
      companiaId: cab.compania_id, fecha, glosa: `Recepción ${numero}, orden de compra ${cab.numero}, línea ${l.linea}`,
      origenModulo: 'COM', origenId: recepcionId,
      lineas: [
        debito,
        { concepto: 'REC_POR_FACTURAR', claseContableId: l.clase_contable_id, terceroId: cab.proveedor_id, credito: debito.debito },
      ],
    });
    await ligarAsientoKardex(trx, kardexIds, asiento);
    await sql`update erp.com_recepciones set kardex_id = ${kardexId}, lote_id = ${loteId}, asiento_id = ${asiento} where id = ${recepcionId}`.execute(trx);
    await sql`update erp.com_ordenes_lineas set cantidad_recibida = cantidad_recibida + ${cantidad.toFixed(4)} where id = ${l.id}`.execute(trx);
    if (cantidad.equals(pendiente)) await moverLinea(trx, 'com_ordenes_lineas', l.id, estados, l.estado_ultimo, 'RECIBIDA');
    recepciones.push(recepcionId);
  }
  return { numero, recepciones };
}

// ---------------------------------------------------------------------------
// Factura de proveedor

export async function pendientesDeFactura(trx: Trx, companiaId: string, proveedorId: string) {
  const recepciones = await sql`
    select r.id as recepcion_id, null::uuid as orden_linea_id, o.numero as orden, l.linea, l.descripcion, r.fecha,
           r.cantidad - r.cantidad_facturada as pendiente, r.costo_unitario, l.impuesto_id, a.codigo as articulo
    from erp.com_recepciones r join erp.com_ordenes_lineas l on l.id = r.orden_linea_id
    join erp.com_ordenes o on o.id = l.orden_id left join erp.mae_articulos a on a.id = l.articulo_id
    where o.compania_id = ${companiaId} and o.proveedor_id = ${proveedorId} and r.cantidad > r.cantidad_facturada
    order by o.numero, l.linea, r.fecha`.execute(trx);
  // Servicios y líneas por cuenta aprobadas que se facturan sin recepción.
  const directas = await sql`
    select null::uuid as recepcion_id, l.id as orden_linea_id, o.numero as orden, l.linea, l.descripcion, o.fecha,
           l.cantidad - l.cantidad_facturada as pendiente, l.costo_unitario, l.impuesto_id, a.codigo as articulo
    from erp.com_ordenes_lineas l join erp.com_ordenes o on o.id = l.orden_id
    join erp.sis_tipos_documento t on t.id = o.tipo_documento_id
    join erp.sis_flujos_estado f on f.tipo_documento_id = o.tipo_documento_id and f.estado = l.estado_ultimo
    left join erp.mae_articulos a on a.id = l.articulo_id
    where o.compania_id = ${companiaId} and o.proveedor_id = ${proveedorId} and t.codigo = 'OC' and f.fase = 'APROBADA'
      and l.cantidad_recibida = 0 and l.cantidad > l.cantidad_facturada and coalesce(a.tipo_existencia, 'CUENTA') <> 'INVENTARIABLE'
    order by o.numero, l.linea`.execute(trx);
  return [...recepciones.rows, ...directas.rows];
}

export interface LineaFacturaProveedor {
  recepcionId?: string | null;
  ordenLineaId?: string | null;
  cuentaId?: string | null;
  descripcion?: string | null;
  unidadNegocioId?: string | null;
  cantidad: Decimal.Value;
  costoUnitario: Decimal.Value;
  impuestoId?: string | null;
  retRentaId?: string | null;
  retIvaId?: string | null;
}

export interface FacturaProveedorEntrada {
  proveedorId: string;
  tipoComprobante?: string | null;
  numeroFactura: string;
  autorizacion?: string | null;
  fecha: string;
  fechaRegistro?: string | null;
  retRentaId?: string | null;
  retIvaId?: string | null;
  lineas: LineaFacturaProveedor[];
}

export async function registrarFacturaProveedor(trx: Trx, companiaId: string, d: FacturaProveedorEntrada) {
  if (!/^\d{3}-\d{3}-\d{9}$/.test(d.numeroFactura)) {
    throw new ErrorNegocio(400, 'El número de la factura debe tener la forma 001-001-000000123.', { numeroFactura: 'Formato 001-001-000000123' });
  }
  if (d.autorizacion && !/^(\d{10}|\d{37}|\d{49})$/.test(d.autorizacion)) {
    throw new ErrorNegocio(400, 'La autorización debe tener 10, 37 o 49 dígitos.', { autorizacion: 'Debe tener 10, 37 o 49 dígitos' });
  }
  if (d.lineas.length === 0) throw new ErrorNegocio(400, 'Agregue al menos una línea a la factura.');
  const prov = await proveedor(trx, companiaId, d.proveedorId);
  const fechaRegistro = d.fechaRegistro ?? hoy();
  const defRenta = d.retRentaId ? await retencionVigente(trx, { id: d.retRentaId }, d.fecha) : await retencionVigente(trx, { tipo: 'RENTA', codigo: prov.codigo_ret_renta }, d.fecha);
  const defIva = d.retIvaId ? await retencionVigente(trx, { id: d.retIvaId }, d.fecha) : await retencionVigente(trx, { tipo: 'IVA', codigo: prov.codigo_ret_iva }, d.fecha);

  interface Calculada {
    entrada: LineaFacturaProveedor;
    descripcion: string;
    cantidad: Decimal;
    subtotal: Decimal;
    iva: Decimal;
    impuestoId: string | null;
    renta: Awaited<ReturnType<typeof retencionVigente>>;
    retIva: Awaited<ReturnType<typeof retencionVigente>>;
    contable: LineaContable[];
    ordenLinea?: LineaOC & { tipo_documento_id: string };
    recepcion?: { id: string; cantidad: string; cantidad_facturada: string; costo_unitario: string };
  }
  const calculadas: Calculada[] = [];
  for (const [i, l] of d.lineas.entries()) {
    const cantidad = D(l.cantidad);
    const costo = D(l.costoUnitario);
    if (cantidad.lessThanOrEqualTo(0) || costo.isNegative()) throw new ErrorNegocio(400, `Línea ${i + 1}: revise la cantidad y el costo.`);
    const subtotal = cantidad.times(costo).toDecimalPlaces(2);
    let ordenLinea: Calculada['ordenLinea'];
    let recepcion: Calculada['recepcion'];
    const contable: LineaContable[] = [];
    if (l.recepcionId) {
      const r = await sql<{ id: string; orden_linea_id: string; cantidad: string; cantidad_facturada: string; costo_unitario: string }>`
        select id, orden_linea_id, cantidad, cantidad_facturada, costo_unitario from erp.com_recepciones where id = ${l.recepcionId} for update`.execute(trx);
      recepcion = r.rows[0];
      if (!recepcion) throw new ErrorNegocio(400, `Línea ${i + 1}: la recepción no existe.`);
      if (cantidad.greaterThan(D(recepcion.cantidad).minus(recepcion.cantidad_facturada))) {
        throw new ErrorNegocio(400, `Línea ${i + 1}: se factura más de lo recibido pendiente.`);
      }
      ordenLinea = await lineaConOrden(trx, r.rows[0]!.orden_linea_id);
    } else if (l.ordenLineaId) {
      ordenLinea = await lineaConOrden(trx, l.ordenLineaId);
      if (ordenLinea.tipo_existencia === 'INVENTARIABLE') throw new ErrorNegocio(400, `Línea ${i + 1}: un artículo inventariable se factura contra su recepción.`);
      if (cantidad.greaterThan(D(ordenLinea.cantidad).minus(ordenLinea.cantidad_facturada))) {
        throw new ErrorNegocio(400, `Línea ${i + 1}: se factura más de lo pedido.`);
      }
    } else if (!l.cuentaId) {
      throw new ErrorNegocio(400, `Línea ${i + 1}: indique la recepción, la línea de orden o la cuenta de gasto.`);
    }
    if (ordenLinea) {
      const prov2 = await sql<{ proveedor_id: string }>`select proveedor_id from erp.com_ordenes where id = ${ordenLinea.orden_id}`.execute(trx);
      if (prov2.rows[0]!.proveedor_id !== d.proveedorId) throw new ErrorNegocio(400, `Línea ${i + 1}: la orden es de otro proveedor.`);
    }
    const centro = l.unidadNegocioId ?? ordenLinea?.unidad_negocio_id ?? null;
    const clase = ordenLinea?.clase_contable_id ?? null;
    const gasto = { concepto: 'GASTO_COMPRA', cuentaId: ordenLinea ? ordenLinea.cuenta_id : l.cuentaId, claseContableId: clase, unidadNegocioId: centro };
    if (recepcion) {
      const alCostoRecibido = cantidad.times(recepcion.costo_unitario).toDecimalPlaces(2);
      contable.push({ concepto: 'REC_POR_FACTURAR', claseContableId: clase, terceroId: d.proveedorId, debito: alCostoRecibido });
      const diferencia = subtotal.minus(alCostoRecibido);
      if (ordenLinea?.tipo_existencia === 'INVENTARIABLE') {
        contable.push({ concepto: 'VARIACION_COMPRA', claseContableId: clase, unidadNegocioId: centro, debito: diferencia });
      } else {
        contable.push({ ...gasto, debito: diferencia });
      }
    } else {
      contable.push({ ...gasto, debito: subtotal });
    }
    const imp = await impuestoVigente(trx, l.impuestoId ?? ordenLinea?.impuesto_id ?? null, d.fecha);
    const iva = subtotal.times(imp.porcentaje).dividedBy(100).toDecimalPlaces(2);
    const renta = l.retRentaId ? await retencionVigente(trx, { id: l.retRentaId }, d.fecha) : defRenta;
    const retIva = l.retIvaId ? await retencionVigente(trx, { id: l.retIvaId }, d.fecha) : defIva;
    calculadas.push({
      entrada: l, descripcion: (l.descripcion?.trim() || ordenLinea?.descripcion || 'Gasto').slice(0, 200), cantidad, subtotal, iva,
      impuestoId: imp.id, renta, retIva: iva.isZero() ? null : retIva, contable, ordenLinea, recepcion,
    });
  }

  const subtotal = calculadas.reduce((s, c) => s.plus(c.subtotal), D(0));
  const impuestos = calculadas.reduce((s, c) => s.plus(c.iva), D(0));
  const total = subtotal.plus(impuestos);

  // Retención agrupada por código.
  const ret = new Map<string, { codigo: NonNullable<Calculada['renta']>; base: Decimal }>();
  for (const c of calculadas) {
    for (const [codigo, base] of [[c.renta, c.subtotal], [c.retIva, c.iva]] as const) {
      if (!codigo || base.isZero()) continue;
      const acc = ret.get(codigo.id) ?? { codigo, base: D(0) };
      acc.base = acc.base.plus(base);
      ret.set(codigo.id, acc);
    }
  }
  const retLineas = [...ret.values()].map((r) => ({ ...r, valor: r.base.times(r.codigo.porcentaje).dividedBy(100).toDecimalPlaces(2) }));
  const retRenta = retLineas.filter((r) => r.codigo.tipo === 'RENTA').reduce((s, r) => s.plus(r.valor), D(0));
  const retIvaTotal = retLineas.filter((r) => r.codigo.tipo === 'IVA').reduce((s, r) => s.plus(r.valor), D(0));
  const totalRet = retRenta.plus(retIvaTotal);

  const tipoFp = await tipoDocumento(trx, 'COM', 'FP');
  const numero = await numerar(trx, companiaId, tipoFp.id);
  const moneda = await monedaDe(trx, companiaId);
  const f = await sql<{ id: string }>`
    insert into erp.com_facturas (compania_id, proveedor_id, tipo_comprobante, numero_factura, autorizacion, fecha, fecha_registro, moneda_id,
      subtotal, impuestos, total, estado, numero, condicion_pago_id, retenciones)
    values (${companiaId}, ${d.proveedorId}, ${d.tipoComprobante ?? '01'}, ${d.numeroFactura}, ${d.autorizacion ?? null}, ${d.fecha}, ${fechaRegistro},
      ${moneda}, ${subtotal.toFixed(2)}, ${impuestos.toFixed(2)}, ${total.toFixed(2)}, 'CONTABILIZADA', ${numero}, ${prov.condicion_pago_id}, ${totalRet.toFixed(2)})
    returning id`.execute(trx);
  const facturaId = f.rows[0]!.id;

  for (const [i, c] of calculadas.entries()) {
    await sql`
      insert into erp.com_facturas_lineas (factura_id, linea, recepcion_id, orden_linea_id, cuenta_id, articulo_id, unidad_negocio_id, descripcion,
        cantidad, costo_unitario, impuesto_id, valor_impuesto, total, ret_renta_id, ret_iva_id)
      values (${facturaId}, ${i + 1}, ${c.entrada.recepcionId ?? null}, ${c.ordenLinea?.id ?? null}, ${c.ordenLinea?.cuenta_id ?? c.entrada.cuentaId ?? null},
        ${c.ordenLinea?.articulo_id ?? null}, ${c.entrada.unidadNegocioId ?? c.ordenLinea?.unidad_negocio_id ?? null}, ${c.descripcion},
        ${c.cantidad.toFixed(4)}, ${D(c.entrada.costoUnitario).toFixed(6)}, ${c.impuestoId}, ${c.iva.toFixed(2)}, ${c.subtotal.plus(c.iva).toFixed(2)},
        ${c.renta?.id ?? null}, ${c.retIva?.id ?? null})`.execute(trx);
    if (c.recepcion) {
      await sql`update erp.com_recepciones set cantidad_facturada = cantidad_facturada + ${c.cantidad.toFixed(4)} where id = ${c.recepcion.id}`.execute(trx);
    }
    if (c.ordenLinea) {
      const ol = c.ordenLinea;
      // Se relee la línea: la misma línea de orden puede venir en varias líneas de la factura.
      const act = await sql<{ cantidad: string; cantidad_recibida: string; cantidad_facturada: string; estado_ultimo: number }>`
        update erp.com_ordenes_lineas set cantidad_facturada = cantidad_facturada + ${c.cantidad.toFixed(4)} where id = ${ol.id}
        returning cantidad, cantidad_recibida, cantidad_facturada, estado_ultimo`.execute(trx);
      const fila = act.rows[0]!;
      const estados = await estadosDe(trx, ol.tipo_documento_id);
      const fase = faseDe(estados, fila.estado_ultimo);
      const facturada = D(fila.cantidad_facturada);
      const completa = c.recepcion
        ? fase === 'RECIBIDA' && facturada.greaterThanOrEqualTo(fila.cantidad_recibida)
        : facturada.greaterThanOrEqualTo(fila.cantidad);
      if (completa && fase !== 'FACTURADA') await moverLinea(trx, 'com_ordenes_lineas', ol.id, estados, fila.estado_ultimo, 'FACTURADA');
    }
  }

  // Retención emitida
  let retencionId: string | null = null;
  let retencionNumero: string | null = null;
  if (totalRet.greaterThan(0)) {
    const est = await establecimientoDe(trx, companiaId);
    const tipoRt = await tipoDocumento(trx, 'COM', 'RT');
    const sec = await numerar(trx, companiaId, tipoRt.id);
    retencionNumero = `${est.establecimiento}-${est.punto_emision}-${String(sec).padStart(9, '0')}`;
    const r = await sql<{ id: string }>`
      insert into erp.ec_retenciones (compania_id, sentido, establecimiento, punto_emision, secuencial, fecha, tercero_id, compra_id, total, estado)
      values (${companiaId}, 'EMITIDA', ${est.establecimiento}, ${est.punto_emision}, ${String(sec).padStart(9, '0')}, ${fechaRegistro},
        ${d.proveedorId}, ${facturaId}, ${totalRet.toFixed(2)}, 'EMITIDA') returning id`.execute(trx);
    retencionId = r.rows[0]!.id;
    let n = 1;
    for (const rl of retLineas) {
      if (rl.valor.isZero() && rl.codigo.porcentaje.isZero()) continue;
      await sql`insert into erp.ec_retenciones_lineas (retencion_id, linea, codigo_retencion_id, base, porcentaje, valor)
                values (${retencionId}, ${n++}, ${rl.codigo.id}, ${rl.base.toFixed(2)}, ${rl.codigo.porcentaje.toFixed(4)}, ${rl.valor.toFixed(2)})`.execute(trx);
    }
  }

  const asiento = await contabilizar(trx, {
    companiaId, fecha: fechaRegistro,
    glosa: `Factura de proveedor ${d.numeroFactura}, registro ${numero}${retencionNumero ? `, retención ${retencionNumero}` : ''}`,
    origenModulo: 'COM', origenId: facturaId,
    lineas: [
      ...calculadas.flatMap((c) => c.contable),
      { concepto: 'IVA_COMPRAS', debito: impuestos },
      { concepto: 'PROVEEDORES', claseContableId: prov.clase_contable_id, terceroId: d.proveedorId, credito: total },
      { concepto: 'PROVEEDORES', claseContableId: prov.clase_contable_id, terceroId: d.proveedorId, debito: totalRet, glosa: `Retención ${retencionNumero ?? ''}` },
      { concepto: 'RET_RENTA_POR_PAGAR', terceroId: d.proveedorId, credito: retRenta },
      { concepto: 'RET_IVA_POR_PAGAR', terceroId: d.proveedorId, credito: retIvaTotal },
    ],
  });
  await sql`update erp.com_facturas set asiento_id = ${asiento} where id = ${facturaId}`.execute(trx);
  if (retencionId) await sql`update erp.ec_retenciones set asiento_id = ${asiento} where id = ${retencionId}`.execute(trx);

  // Cuotas por pagar; la retención cancela primero la primera cuota.
  const docIds: string[] = [];
  for (const q of await cuotasSegunCondicion(trx, prov.condicion_pago_id, d.fecha, total)) {
    const r = await sql<{ id: string }>`
      insert into erp.cxp_documentos (compania_id, tipo_documento_id, numero, cuota, proveedor_id, factura_id, fecha, vencimiento, moneda_id, monto, saldo)
      values (${companiaId}, ${tipoFp.id}, ${numero}, ${q.cuota}, ${d.proveedorId}, ${facturaId}, ${d.fecha}, ${q.vencimiento}, ${moneda},
        ${q.monto.toFixed(2)}, ${q.monto.toFixed(2)}) returning id`.execute(trx);
    docIds.push(r.rows[0]!.id);
  }
  let resto = totalRet;
  for (const id of docIds) {
    if (resto.lessThanOrEqualTo(0) || !retencionId) break;
    const s = await sql<{ saldo: string }>`select saldo from erp.cxp_documentos where id = ${id}`.execute(trx);
    const aplica = Decimal.min(resto, D(s.rows[0]!.saldo));
    await sql`insert into erp.cxp_aplicaciones (documento_id, retencion_id, monto, fecha) values (${id}, ${retencionId}, ${aplica.toFixed(2)}, ${fechaRegistro})`.execute(trx);
    await sql`update erp.cxp_documentos set saldo = saldo - ${aplica.toFixed(2)} where id = ${id}`.execute(trx);
    resto = resto.minus(aplica);
  }

  return {
    id: facturaId, numero, subtotal: subtotal.toFixed(2), impuestos: impuestos.toFixed(2), total: total.toFixed(2),
    retencion: retencionNumero, retenido: totalRet.toFixed(2), aPagar: total.minus(totalRet).toFixed(2),
  };
}

async function lineaConOrden(trx: Trx, lineaId: string): Promise<LineaOC & { tipo_documento_id: string }> {
  const r = await sql<LineaOC & { tipo_documento_id: string }>`
    select l.id, l.orden_id, l.linea, l.articulo_id, l.descripcion, l.cuenta_id, l.unidad_negocio_id, l.cantidad, l.cantidad_recibida,
           l.cantidad_facturada, l.costo_unitario, l.impuesto_id, l.estado_ultimo, a.tipo_existencia, a.clase_contable_id, o.tipo_documento_id
    from erp.com_ordenes_lineas l join erp.com_ordenes o on o.id = l.orden_id left join erp.mae_articulos a on a.id = l.articulo_id
    where l.id = ${lineaId} for update of l`.execute(trx);
  if (!r.rows[0]) throw new ErrorNegocio(400, 'La línea de orden no existe.');
  return r.rows[0];
}

// ---------------------------------------------------------------------------
// Lecturas

export async function listarCompras(trx: Trx, companiaId: string, q: { tipo?: string; buscar?: string; pendientes?: boolean }) {
  const patron = q.buscar ? `%${q.buscar}%` : null;
  const r = await sql`
    select o.id, o.numero, t.codigo as tipo, o.fecha, o.fecha_requerida, d.nombre as proveedor, u.codigo as sucursal,
      round(sum(l.cantidad * l.costo_unitario), 2) as total,
      min(l.estado_ultimo) filter (where f.fase not in ('CANCELADA')) as estado,
      (select descripcion from erp.sis_flujos_estado where tipo_documento_id = o.tipo_documento_id
        and estado = coalesce(min(l.estado_ultimo) filter (where f.fase not in ('CANCELADA')), max(l.estado_ultimo))) as estado_descripcion
    from erp.com_ordenes o join erp.sis_tipos_documento t on t.id = o.tipo_documento_id
    join erp.mae_unidades_negocio u on u.id = o.unidad_negocio_id
    left join erp.mae_direcciones d on d.id = o.proveedor_id
    join erp.com_ordenes_lineas l on l.orden_id = o.id
    join erp.sis_flujos_estado f on f.tipo_documento_id = o.tipo_documento_id and f.estado = l.estado_ultimo
    where o.compania_id = ${companiaId} and (${q.tipo ?? null}::text is null or t.codigo = ${q.tipo ?? null})
      and (${patron}::text is null or d.nombre ilike ${patron} or o.numero::text = ${q.buscar ?? ''})
    group by o.id, t.codigo, d.nombre, u.codigo
    having (${q.pendientes ?? false} = false or bool_or(f.fase not in ('CERRADA','CANCELADA','FACTURADA')))
    order by o.fecha desc, o.numero desc limit 300`.execute(trx);
  return r.rows;
}

export async function detalleCompra(trx: Trx, ordenId: string) {
  const cab = await sql`
    select o.*, t.codigo as tipo, t.descripcion as tipo_descripcion, d.nombre as proveedor, u.codigo || ' - ' || u.descripcion as sucursal,
           cp.descripcion as condicion_pago, org.numero as origen_numero
    from erp.com_ordenes o join erp.sis_tipos_documento t on t.id = o.tipo_documento_id
    join erp.mae_unidades_negocio u on u.id = o.unidad_negocio_id left join erp.mae_direcciones d on d.id = o.proveedor_id
    left join erp.mae_condiciones_pago cp on cp.id = o.condicion_pago_id left join erp.com_ordenes org on org.id = o.documento_origen_id
    where o.id = ${ordenId}`.execute(trx);
  const c = cab.rows[0] as { tipo_documento_id: string } | undefined;
  if (!c) throw new ErrorNegocio(404, 'La orden no existe.');
  const estados = await estadosDe(trx, c.tipo_documento_id);
  const lineas = await sql<{ estado_ultimo: number }>`
    select l.*, a.codigo as articulo, a.tipo_existencia, a.controla_lote, cu.codigo as cuenta, u.codigo as bodega,
           round(l.cantidad * l.costo_unitario, 2) as total
    from erp.com_ordenes_lineas l left join erp.mae_articulos a on a.id = l.articulo_id
    left join erp.con_cuentas cu on cu.id = l.cuenta_id join erp.mae_unidades_negocio u on u.id = l.unidad_negocio_id
    where l.orden_id = ${ordenId} order by l.linea`.execute(trx);
  const [recepciones, aprobaciones, derivadas] = await Promise.all([
    sql`select r.id, r.fecha, r.cantidad, r.costo_unitario, r.cantidad_facturada, l.linea, l.descripcion
        from erp.com_recepciones r join erp.com_ordenes_lineas l on l.id = r.orden_linea_id where l.orden_id = ${ordenId} order by r.creado_en`.execute(trx),
    sql`select a.nivel, a.resultado, a.fecha, a.comentario, u.nombre as aprobador
        from erp.com_aprobaciones a join erp.sis_usuarios u on u.id = a.aprobador_id where a.orden_id = ${ordenId}`.execute(trx),
    sql`select id, numero from erp.com_ordenes where documento_origen_id = ${ordenId} order by numero`.execute(trx),
  ]);
  return {
    orden: c,
    estados,
    lineas: lineas.rows.map((l) => ({
      ...l,
      fase: faseDe(estados, l.estado_ultimo),
      siguientes: estados.filter((e) => {
        const actual = estados.find((x) => x.estado === l.estado_ultimo);
        return actual && (e.estado === actual.estado_siguiente || (actual.estados_alternos ?? []).includes(e.estado));
      }),
    })),
    recepciones: recepciones.rows,
    aprobaciones: aprobaciones.rows,
    derivadas: derivadas.rows,
  };
}

export async function detalleFacturaProveedor(trx: Trx, id: string) {
  const f = await sql`
    select f.*, d.nombre as proveedor, d.identificacion from erp.com_facturas f join erp.mae_direcciones d on d.id = f.proveedor_id
    where f.id = ${id}`.execute(trx);
  if (!f.rows[0]) throw new ErrorNegocio(404, 'La factura no existe.');
  const [lineas, retencion, cuotas] = await Promise.all([
    sql`select l.*, rr.codigo as ret_renta, ri.codigo as ret_iva from erp.com_facturas_lineas l
        left join erp.ec_codigos_retencion rr on rr.id = l.ret_renta_id left join erp.ec_codigos_retencion ri on ri.id = l.ret_iva_id
        where l.factura_id = ${id} order by l.linea`.execute(trx),
    sql`select r.establecimiento || '-' || r.punto_emision || '-' || r.secuencial as numero, r.fecha, r.total,
               coalesce(json_agg(json_build_object('tipo', c.tipo, 'codigo', c.codigo, 'descripcion', c.descripcion, 'base', rl.base,
                 'porcentaje', rl.porcentaje, 'valor', rl.valor) order by rl.linea) filter (where rl.id is not null), '[]') as lineas
        from erp.ec_retenciones r left join erp.ec_retenciones_lineas rl on rl.retencion_id = r.id
        left join erp.ec_codigos_retencion c on c.id = rl.codigo_retencion_id
        where r.compra_id = ${id} group by r.id`.execute(trx),
    sql`select id, cuota, vencimiento, monto, saldo from erp.cxp_documentos where factura_id = ${id} order by cuota`.execute(trx),
  ]);
  return { factura: f.rows[0], lineas: lineas.rows, retencion: retencion.rows[0] ?? null, cuotas: cuotas.rows };
}

export async function listarFacturasProveedor(trx: Trx, companiaId: string, buscar?: string) {
  const patron = buscar ? `%${buscar}%` : null;
  const r = await sql`
    select f.id, f.numero, f.numero_factura, f.fecha, d.nombre as proveedor, f.subtotal, f.impuestos, f.total, f.retenciones,
           (select coalesce(sum(saldo), 0) from erp.cxp_documentos x where x.factura_id = f.id) as saldo
    from erp.com_facturas f join erp.mae_direcciones d on d.id = f.proveedor_id
    where f.compania_id = ${companiaId} and (${patron}::text is null or d.nombre ilike ${patron} or f.numero_factura ilike ${patron})
    order by f.fecha_registro desc, f.numero desc limit 300`.execute(trx);
  return r.rows;
}

export { tipoDocumentoPorId };
