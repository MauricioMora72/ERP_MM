import Decimal from 'decimal.js';
import { sql, type Trx } from '@erp/db';
import type { Sesion } from '../contexto.js';
import { ErrorNegocio } from '../errores.js';

export const D = (v: Decimal.Value | null | undefined) => new Decimal(v ?? 0);

export function companiaDe(sesion: Sesion): string {
  if (!sesion.companiaId) throw new ErrorNegocio(400, 'Seleccione una compañía para trabajar.');
  return sesion.companiaId;
}

export async function existe(trx: Trx, tabla: string, id: string | null | undefined, etiqueta: string): Promise<void> {
  if (!id) return;
  const r = await sql`select 1 from ${sql.table(`erp.${tabla}`)} where id = ${id}`.execute(trx);
  if (r.rows.length === 0) throw new ErrorNegocio(400, `${etiqueta}: el registro no existe.`);
}

export interface Tarifa {
  costo: Decimal;
  venta: Decimal;
}

/** Tarifa vigente a una fecha: primero la del recurso, luego la del perfil con lista de precios, luego la del perfil. */
export async function tarifaVigente(
  trx: Trx,
  datos: { recursoId?: string | null; perfilId?: string | null; listaPreciosId?: string | null; fecha: string },
): Promise<Tarifa | null> {
  const r = await sql<{ costo_hora: string; venta_hora: string }>`
    select costo_hora, venta_hora from erp.srv_tarifas
    where ${datos.fecha}::date >= vigente_desde and (vigente_hasta is null or ${datos.fecha}::date <= vigente_hasta)
      and ((recurso_id is not null and recurso_id = ${datos.recursoId ?? null})
           or (recurso_id is null and perfil_id = ${datos.perfilId ?? null}
               and (lista_precios_id is null or lista_precios_id = ${datos.listaPreciosId ?? null})))
    order by (recurso_id is not null) desc, (lista_precios_id is not null) desc, vigente_desde desc
    limit 1`.execute(trx);
  const t = r.rows[0];
  return t ? { costo: D(t.costo_hora), venta: D(t.venta_hora) } : null;
}

/** Precio de lista vigente de un artículo para un cliente. */
export async function precioLista(
  trx: Trx,
  datos: { articuloId: string; listaPreciosId: string | null; fecha: string },
): Promise<Decimal | null> {
  if (!datos.listaPreciosId) return null;
  const r = await sql<{ precio: string }>`
    select p.precio from erp.mae_precios p join erp.mae_articulos a on a.id = p.articulo_id
    where p.lista_precios_id = ${datos.listaPreciosId} and p.articulo_id = ${datos.articuloId}
      and p.unidad = a.unidad_primaria and ${datos.fecha}::date >= p.vigente_desde
      and (p.vigente_hasta is null or ${datos.fecha}::date <= p.vigente_hasta)
    order by p.vigente_desde desc limit 1`.execute(trx);
  return r.rows[0] ? D(r.rows[0].precio) : null;
}

/** Porcentaje vigente del impuesto de un artículo. */
export async function impuestoArticulo(
  trx: Trx,
  articuloId: string,
  fecha: string,
): Promise<{ impuestoId: string | null; porcentaje: Decimal; claseContableId: string | null }> {
  const r = await sql<{ id: string | null; porcentaje: string | null; codigo: string | null; clase: string }>`
    select i.id, i.porcentaje, i.codigo, a.clase_contable_id as clase
    from erp.mae_articulos a left join erp.mae_impuestos i on i.id = a.impuesto_id
    where a.id = ${articuloId}`.execute(trx);
  const fila = r.rows[0];
  if (!fila) throw new ErrorNegocio(400, 'El artículo no existe.');
  if (!fila.id || !fila.codigo) return { impuestoId: null, porcentaje: D(0), claseContableId: fila.clase };
  // Si hay una tarifa más reciente con el mismo código, vigente a la fecha, se usa esa.
  const vig = await sql<{ id: string; porcentaje: string }>`
    select id, porcentaje from erp.mae_impuestos
    where codigo = ${fila.codigo} and ${fecha}::date >= vigente_desde and (vigente_hasta is null or ${fecha}::date <= vigente_hasta)
    order by vigente_desde desc limit 1`.execute(trx);
  const v = vig.rows[0] ?? { id: fila.id, porcentaje: fila.porcentaje ?? '0' };
  return { impuestoId: v.id, porcentaje: D(v.porcentaje), claseContableId: fila.clase };
}
