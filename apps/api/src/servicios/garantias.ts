import { sql, type Trx } from '@erp/db';

/**
 * Calcula la garantía de un objeto a partir de su artículo de origen y su fecha de venta o instalación.
 * Busca primero una regla del artículo y luego una de su categoría. Reemplaza la garantía calculada antes.
 */
export async function calcularGarantiaObjeto(trx: Trx, objetoId: string): Promise<string | null> {
  const o = await sql<{ articulo_origen_id: string | null; fecha_venta: string | null; fabricante_id: string | null; categoria: string | null }>`
    select ob.articulo_origen_id, ob.fecha_venta::text as fecha_venta, ob.fabricante_id, a.categoria
    from erp.srv_objetos ob left join erp.mae_articulos a on a.id = ob.articulo_origen_id where ob.id = ${objetoId}`.execute(trx);
  const obj = o.rows[0];
  if (!obj?.articulo_origen_id || !obj.fecha_venta) return null;
  const def = await sql<{ id: string; meses: number; pct_mano_obra: string; pct_materiales: string; respaldo_fabricante: boolean }>`
    select id, meses, pct_mano_obra, pct_materiales, respaldo_fabricante from erp.srv_garantias_definicion
    where activo and (articulo_id = ${obj.articulo_origen_id} or (articulo_id is null and categoria = ${obj.categoria}))
    order by (articulo_id is not null) desc limit 1`.execute(trx);
  const g = def.rows[0];
  // Al recalcular se reemplaza la garantía anterior, salvo que ya la use alguna orden (se conserva como historia).
  await sql`delete from erp.srv_garantias_objeto
            where objeto_id = ${objetoId} and not exists (select 1 from erp.srv_ordenes o where o.garantia_objeto_id = erp.srv_garantias_objeto.id)`.execute(trx);
  if (!g) return null;
  const r = await sql<{ id: string }>`
    insert into erp.srv_garantias_objeto (objeto_id, definicion_id, fecha_inicio, fecha_fin, pct_mano_obra, pct_materiales, fabricante_id)
    values (${objetoId}, ${g.id}, ${obj.fecha_venta}::date, (${obj.fecha_venta}::date + make_interval(months => ${g.meses}) - interval '1 day')::date,
            ${g.pct_mano_obra}, ${g.pct_materiales}, ${g.respaldo_fabricante ? obj.fabricante_id : null})
    returning id`.execute(trx);
  return r.rows[0]!.id;
}
