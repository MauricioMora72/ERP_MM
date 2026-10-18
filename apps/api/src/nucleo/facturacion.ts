import Decimal from 'decimal.js';
import { sql, type Trx } from '@erp/db';
import { ErrorNegocio } from '../errores.js';
import { contabilizar } from './contabilidad.js';
import { numerar, tipoDocumento } from './documentos.js';

const D = (v: Decimal.Value | null | undefined) => new Decimal(v ?? 0);

export interface Establecimiento {
  establecimiento: string;
  punto_emision: string;
}

export async function establecimientoDe(trx: Trx, companiaId: string): Promise<Establecimiento> {
  const r = await sql<Establecimiento>`
    select establecimiento, punto_emision from erp.ec_establecimientos
    where compania_id = ${companiaId} and activo order by establecimiento, punto_emision limit 1`.execute(trx);
  if (!r.rows[0]) throw new ErrorNegocio(400, 'Configure un establecimiento y punto de emisión del SRI en Localización.');
  return r.rows[0];
}

export async function monedaDe(trx: Trx, companiaId: string): Promise<string> {
  const r = await sql<{ moneda_id: string }>`select moneda_id from erp.mae_companias where id = ${companiaId}`.execute(trx);
  return r.rows[0]!.moneda_id;
}

export function numeroSri(e: Establecimiento, secuencial: string | number): string {
  return `${e.establecimiento}-${e.punto_emision}-${String(secuencial).padStart(9, '0')}`;
}

/** Fechas y montos de las cuotas según la condición de pago; la última cuota absorbe el redondeo. */
export async function cuotasSegunCondicion(
  trx: Trx,
  condicionPagoId: string | null,
  fecha: string,
  monto: Decimal.Value,
): Promise<{ cuota: number; vencimiento: string; monto: Decimal }[]> {
  let cuotas = 1;
  let primera = 0;
  let entre = 30;
  if (condicionPagoId) {
    const c = await sql<{ cuotas: number; dias_primera: number; dias_entre_cuotas: number }>`
      select cuotas, dias_primera, dias_entre_cuotas from erp.mae_condiciones_pago where id = ${condicionPagoId}`.execute(trx);
    if (c.rows[0]) ({ cuotas, dias_primera: primera, dias_entre_cuotas: entre } = c.rows[0]);
  }
  cuotas = Math.max(1, cuotas);
  const total = D(monto);
  const parte = total.dividedBy(cuotas).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  const base = new Date(`${fecha}T00:00:00Z`);
  return Array.from({ length: cuotas }, (_, i) => {
    const v = new Date(base);
    v.setUTCDate(v.getUTCDate() + primera + i * entre);
    return { cuota: i + 1, vencimiento: v.toISOString().slice(0, 10), monto: i === cuotas - 1 ? total.minus(parte.times(cuotas - 1)) : parte };
  });
}

export interface LineaFactura {
  articuloId: string;
  descripcion: string;
  cantidad: Decimal.Value;
  precio: Decimal.Value;
  /** Valor del descuento de la línea. */
  descuento?: Decimal.Value;
  impuestoId: string | null;
  porcentajeImpuesto: Decimal.Value;
  claseContableId: string | null;
  unidadNegocioId: string | null;
  /** Si se omiten, se calculan: subtotal = cantidad × precio; IVA = (subtotal − descuento) × porcentaje. */
  subtotal?: Decimal.Value;
  valorImpuesto?: Decimal.Value;
  ordenLineaId?: string | null;
  consumoId?: string | null;
  contratoLineaId?: string | null;
  ordenServicioId?: string | null;
  actividadId?: string | null;
  terceroId?: string | null;
}

export interface Emision {
  companiaId: string;
  clienteId: string;
  fecha: string;
  glosa: string;
  lineas: LineaFactura[];
  /** Asientos adicionales del mismo hecho, por ejemplo el costo de lo facturado. */
  lineasCosto?: { claseContableId: string | null; unidadNegocioId: string | null; costo: Decimal }[];
}

export interface Emitida {
  facturaId: string;
  numero: string;
  total: Decimal;
  lineasIds: string[];
}

function calcular(l: LineaFactura) {
  const subtotal = D(l.subtotal ?? D(l.cantidad).times(l.precio)).toDecimalPlaces(2);
  const descuento = D(l.descuento).toDecimalPlaces(2);
  const base = subtotal.minus(descuento);
  const iva = D(l.valorImpuesto ?? base.times(l.porcentajeImpuesto).dividedBy(100)).toDecimalPlaces(2);
  return { subtotal, descuento, base, iva };
}

/**
 * Emite una factura de venta: cabecera con numeración del SRI, líneas con su origen, asiento de venta por reglas
 * y cuotas por cobrar según la condición de pago del cliente. La usan ventas, servicios y contratos.
 */
export async function emitirFactura(trx: Trx, e: Emision): Promise<Emitida> {
  if (e.lineas.length === 0) throw new ErrorNegocio(400, 'No hay líneas para facturar.');
  const tipo = await tipoDocumento(trx, 'VEN', 'FA');
  const est = await establecimientoDe(trx, e.companiaId);
  const moneda = await monedaDe(trx, e.companiaId);
  const calc = e.lineas.map(calcular);
  const subtotal = calc.reduce((s, c) => s.plus(c.subtotal), D(0));
  const descuento = calc.reduce((s, c) => s.plus(c.descuento), D(0));
  const impuestos = calc.reduce((s, c) => s.plus(c.iva), D(0));
  const total = subtotal.minus(descuento).plus(impuestos);
  if (total.lessThanOrEqualTo(0)) throw new ErrorNegocio(400, 'El total de la factura debe ser mayor que cero.');

  const secuencial = await numerar(trx, e.companiaId, tipo.id);
  const f = await sql<{ id: string }>`
    insert into erp.ven_facturas (compania_id, tipo_documento_id, establecimiento, punto_emision, secuencial, fecha, cliente_id,
      moneda_id, subtotal, descuento, impuestos, total)
    values (${e.companiaId}, ${tipo.id}, ${est.establecimiento}, ${est.punto_emision}, ${secuencial}, ${e.fecha}, ${e.clienteId},
      ${moneda}, ${subtotal.toFixed(2)}, ${descuento.toFixed(2)}, ${impuestos.toFixed(2)}, ${total.toFixed(2)})
    returning id`.execute(trx);
  const facturaId = f.rows[0]!.id;
  const numero = numeroSri(est, secuencial);

  const lineasIds: string[] = [];
  for (const [i, l] of e.lineas.entries()) {
    const c = calc[i]!;
    const r = await sql<{ id: string }>`
      insert into erp.ven_facturas_lineas (factura_id, linea, articulo_id, descripcion, cantidad, precio, descuento, impuesto_id,
        valor_impuesto, total, orden_linea_id, consumo_id, contrato_linea_id, orden_servicio_id, actividad_id, tercero_id)
      values (${facturaId}, ${i + 1}, ${l.articuloId}, ${l.descripcion.slice(0, 200)}, ${D(l.cantidad).toFixed(4)}, ${D(l.precio).toFixed(6)},
        ${c.descuento.toFixed(2)}, ${l.impuestoId}, ${c.iva.toFixed(2)}, ${c.base.plus(c.iva).toFixed(2)}, ${l.ordenLineaId ?? null},
        ${l.consumoId ?? null}, ${l.contratoLineaId ?? null}, ${l.ordenServicioId ?? null}, ${l.actividadId ?? null}, ${l.terceroId ?? null})
      returning id`.execute(trx);
    lineasIds.push(r.rows[0]!.id);
  }

  const asiento = await contabilizar(trx, {
    companiaId: e.companiaId,
    fecha: e.fecha,
    glosa: `Factura ${numero}. ${e.glosa}`.slice(0, 500),
    origenModulo: 'VEN',
    origenId: facturaId,
    lineas: [
      { concepto: 'CLIENTES', terceroId: e.clienteId, debito: total },
      ...e.lineas.map((l, i) => ({ concepto: 'INGRESO', claseContableId: l.claseContableId, unidadNegocioId: l.unidadNegocioId, credito: calc[i]!.base })),
      { concepto: 'IVA_VENTAS', credito: impuestos },
      ...(e.lineasCosto ?? []).flatMap((c) => [
        { concepto: 'COSTO_VENTA', claseContableId: c.claseContableId, unidadNegocioId: c.unidadNegocioId, debito: c.costo },
        { concepto: 'DESP_POR_FACTURAR', claseContableId: c.claseContableId, unidadNegocioId: c.unidadNegocioId, credito: c.costo },
      ]),
    ],
  });
  await sql`update erp.ven_facturas set asiento_id = ${asiento} where id = ${facturaId}`.execute(trx);

  const cliente = await sql<{ condicion_pago_id: string | null }>`
    select condicion_pago_id from erp.mae_clientes where direccion_id = ${e.clienteId} and compania_id = ${e.companiaId}`.execute(trx);
  for (const q of await cuotasSegunCondicion(trx, cliente.rows[0]?.condicion_pago_id ?? null, e.fecha, total)) {
    await sql`
      insert into erp.cxc_documentos (compania_id, tipo_documento_id, numero, cuota, cliente_id, factura_id, fecha, vencimiento, moneda_id, monto, saldo)
      values (${e.companiaId}, ${tipo.id}, ${secuencial}, ${q.cuota}, ${e.clienteId}, ${facturaId}, ${e.fecha}, ${q.vencimiento}, ${moneda},
              ${q.monto.toFixed(2)}, ${q.monto.toFixed(2)})`.execute(trx);
  }
  return { facturaId, numero, total, lineasIds };
}

/** Aplica un valor a las cuotas abiertas de una factura de venta, de la más antigua a la más nueva. Devuelve lo que sobró. */
export async function aplicarACuotasCxc(
  trx: Trx,
  facturaId: string,
  monto: Decimal,
  fecha: string,
  origen: { cobroId?: string; retencionId?: string; notaCreditoId?: string },
): Promise<Decimal> {
  let resto = monto;
  const cuotas = await sql<{ id: string; saldo: string }>`
    select id, saldo from erp.cxc_documentos where factura_id = ${facturaId} and saldo > 0 order by cuota for update`.execute(trx);
  for (const c of cuotas.rows) {
    if (resto.lessThanOrEqualTo(0)) break;
    const aplica = Decimal.min(resto, D(c.saldo));
    await sql`insert into erp.cxc_aplicaciones (documento_id, cobro_id, retencion_id, nota_credito_id, monto, fecha)
              values (${c.id}, ${origen.cobroId ?? null}, ${origen.retencionId ?? null}, ${origen.notaCreditoId ?? null}, ${aplica.toFixed(2)}, ${fecha})`.execute(trx);
    await sql`update erp.cxc_documentos set saldo = saldo - ${aplica.toFixed(2)} where id = ${c.id}`.execute(trx);
    resto = resto.minus(aplica);
  }
  return resto;
}
