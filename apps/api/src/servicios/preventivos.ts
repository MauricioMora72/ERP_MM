import { sql, type Trx } from '@erp/db';
import type { Sesion } from '../contexto.js';
import { hoy } from '../nucleo/documentos.js';
import { crearOrden } from './ordenes.js';

/**
 * Genera las órdenes de los mantenimientos preventivos vencidos hasta una fecha.
 * Nunca duplica: la orden lleva el preventivo y su fecha, con una llave única en la base.
 * Pensado para correr una vez al día (Cloud Scheduler) o a pedido.
 */
export async function generarPreventivos(trx: Trx, sesion: Sesion, hasta: string = hoy()): Promise<{ generadas: number }> {
  const prev = await sql<{ id: string; tipo_orden_id: string; plantilla_id: string | null; objeto_id: string | null;
    frecuencia_meses: number; proxima_fecha: string; cliente_id: string; compania_id: string }>`
    select p.id, p.tipo_orden_id, p.plantilla_id, p.objeto_id, p.frecuencia_meses, p.proxima_fecha::text as proxima_fecha,
           c.cliente_id, c.compania_id
    from erp.ven_contratos_preventivos p join erp.ven_contratos c on c.id = p.contrato_id
    where p.activo and c.estado = 'VIGENTE' and p.proxima_fecha <= ${hasta}::date
      and (c.fecha_fin is null or p.proxima_fecha <= c.fecha_fin)
    for update of p`.execute(trx);
  let generadas = 0;
  for (const p of prev.rows) {
    let fecha = p.proxima_fecha;
    while (fecha <= hasta) {
      const ya = await sql`select 1 from erp.srv_ordenes where preventivo_id = ${p.id} and fecha_preventivo = ${fecha}`.execute(trx);
      if (ya.rows.length === 0) {
        await crearOrden(trx, { ...sesion, companiaId: p.compania_id }, {
          tipoOrdenId: p.tipo_orden_id,
          clienteId: p.cliente_id,
          objetoId: p.objeto_id,
          plantillaId: p.plantilla_id,
          descripcion: 'Mantenimiento preventivo programado',
          fechaProgramada: fecha,
          preventivoId: p.id,
          fechaPreventivo: fecha,
        });
        generadas++;
      }
      const sig = await sql<{ f: string }>`select (${fecha}::date + make_interval(months => ${p.frecuencia_meses}))::date::text as f`.execute(trx);
      fecha = sig.rows[0]!.f;
    }
    await sql`update erp.ven_contratos_preventivos set proxima_fecha = ${fecha} where id = ${p.id}`.execute(trx);
  }
  return { generadas };
}
