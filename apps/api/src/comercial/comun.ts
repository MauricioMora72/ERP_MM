import Decimal from 'decimal.js';
import { sql, type Trx } from '@erp/db';
import { ErrorNegocio } from '../errores.js';
import { avanzarPorAccion, estadosDe, type Estado, type Fase } from '../nucleo/flujos.js';

export const D = (v: Decimal.Value | null | undefined) => new Decimal(v ?? 0);

export interface Articulo {
  id: string;
  codigo: string;
  descripcion: string;
  tipo_existencia: string;
  unidad_primaria: string;
  impuesto_id: string | null;
  clase_contable_id: string;
}

export async function articulo(trx: Trx, id: string): Promise<Articulo> {
  const r = await sql<Articulo>`
    select id, codigo, descripcion, tipo_existencia, unidad_primaria, impuesto_id, clase_contable_id
    from erp.mae_articulos where id = ${id} and activo`.execute(trx);
  if (!r.rows[0]) throw new ErrorNegocio(400, 'El artículo no existe o está inactivo.');
  return r.rows[0];
}

/** Tarifa vigente a la fecha de un impuesto: si hay una más reciente con el mismo código, manda esa. */
export async function impuestoVigente(trx: Trx, impuestoId: string | null, fecha: string): Promise<{ id: string | null; porcentaje: Decimal }> {
  if (!impuestoId) return { id: null, porcentaje: D(0) };
  const r = await sql<{ id: string; porcentaje: string }>`
    select v.id, v.porcentaje from erp.mae_impuestos i
    join erp.mae_impuestos v on v.codigo = i.codigo
    where i.id = ${impuestoId} and ${fecha}::date >= v.vigente_desde and (v.vigente_hasta is null or ${fecha}::date <= v.vigente_hasta)
    order by v.vigente_desde desc limit 1`.execute(trx);
  if (!r.rows[0]) throw new ErrorNegocio(400, 'El impuesto no tiene una tarifa vigente a la fecha.');
  return { id: r.rows[0].id, porcentaje: D(r.rows[0].porcentaje) };
}

export interface CodigoRetencion {
  id: string;
  tipo: 'RENTA' | 'IVA';
  codigo: string;
  descripcion: string;
  porcentaje: Decimal;
}

/** Código de retención vigente a la fecha, a partir de su id o de su código SRI. */
export async function retencionVigente(
  trx: Trx,
  ref: { id?: string | null; tipo?: 'RENTA' | 'IVA'; codigo?: string | null },
  fecha: string,
): Promise<CodigoRetencion | null> {
  if (!ref.id && !ref.codigo) return null;
  let tipo = ref.tipo ?? null;
  let codigo = ref.codigo ?? null;
  if (ref.id) {
    const base = await sql<{ tipo: 'RENTA' | 'IVA'; codigo: string }>`select tipo, codigo from erp.ec_codigos_retencion where id = ${ref.id}`.execute(trx);
    if (!base.rows[0]) throw new ErrorNegocio(400, 'El código de retención no existe.');
    ({ tipo, codigo } = base.rows[0]);
  }
  const r = await sql<{ id: string; tipo: 'RENTA' | 'IVA'; codigo: string; descripcion: string; porcentaje: string }>`
    select id, tipo, codigo, descripcion, porcentaje from erp.ec_codigos_retencion
    where tipo = ${tipo} and codigo = ${codigo}
      and ${fecha}::date >= vigente_desde and (vigente_hasta is null or ${fecha}::date <= vigente_hasta)
    order by vigente_desde desc limit 1`.execute(trx);
  const c = r.rows[0];
  if (!c) throw new ErrorNegocio(400, `El código de retención ${codigo} no está vigente a la fecha ${fecha}.`);
  return { ...c, porcentaje: D(c.porcentaje) };
}

/** Estado de cada fase de un flujo, para lecturas y validaciones. */
export function porFase(estados: Estado[]): Partial<Record<Fase, number>> {
  const m: Partial<Record<Fase, number>> = {};
  for (const e of estados) if (e.fase) m[e.fase] = e.estado;
  return m;
}

/** Deja una línea en la fase que corresponde por una acción del sistema. */
export async function moverLinea(trx: Trx, tabla: 'com_ordenes_lineas' | 'ven_ordenes_lineas', lineaId: string, estados: Estado[], actual: number, fase: Fase): Promise<void> {
  const e = avanzarPorAccion(estados, actual, fase);
  await sql`update ${sql.table(`erp.${tabla}`)} set estado_ultimo = ${e.ultimo}, estado_siguiente = ${e.siguiente} where id = ${lineaId}`.execute(trx);
}

export { estadosDe };

/** Antigüedad de saldos por tercero a una fecha de corte. */
export async function antiguedad(trx: Trx, tabla: 'cxc_documentos' | 'cxp_documentos', companiaId: string, fecha: string) {
  const tercero = tabla === 'cxc_documentos' ? sql.ref('d.cliente_id') : sql.ref('d.proveedor_id');
  const r = await sql<{ tercero_id: string; tercero: string; por_vencer: string; d30: string; d60: string; d90: string; mas90: string; total: string }>`
    select t.id as tercero_id, t.nombre as tercero,
      sum(case when d.vencimiento >= ${fecha}::date then d.saldo else 0 end) as por_vencer,
      sum(case when ${fecha}::date - d.vencimiento between 1 and 30 then d.saldo else 0 end) as d30,
      sum(case when ${fecha}::date - d.vencimiento between 31 and 60 then d.saldo else 0 end) as d60,
      sum(case when ${fecha}::date - d.vencimiento between 61 and 90 then d.saldo else 0 end) as d90,
      sum(case when ${fecha}::date - d.vencimiento > 90 then d.saldo else 0 end) as mas90,
      sum(d.saldo) as total
    from ${sql.table(`erp.${tabla}`)} d join erp.mae_direcciones t on t.id = ${tercero}
    where d.compania_id = ${companiaId} and d.saldo <> 0 and d.fecha <= ${fecha}::date
    group by t.id, t.nombre order by t.nombre`.execute(trx);
  return r.rows;
}
