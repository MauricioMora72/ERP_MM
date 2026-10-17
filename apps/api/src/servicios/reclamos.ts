import { sql, type Trx } from '@erp/db';
import type { Sesion } from '../contexto.js';
import { ErrorNegocio } from '../errores.js';
import { contabilizar } from '../nucleo/contabilidad.js';
import { hoy, numerar, tipoDocumento } from '../nucleo/documentos.js';
import { estadosDe, faseDe } from '../nucleo/flujos.js';
import { D, existe } from './comun.js';
import { calcularPrefactura, cargarOrden } from './ordenes.js';

export type EstadoReclamo = 'BORRADOR' | 'ENVIADO' | 'APROBADO' | 'RECHAZADO' | 'CERRADO';

const TRANSICIONES: Record<EstadoReclamo, EstadoReclamo[]> = {
  BORRADOR: ['ENVIADO', 'RECHAZADO'],
  ENVIADO: ['APROBADO', 'RECHAZADO'],
  APROBADO: ['CERRADO'],
  RECHAZADO: [],
  CERRADO: [],
};

/** Crea el reclamo al fabricante o proveedor por el costo cubierto de una orden en garantía ya liquidada. */
export async function crearReclamo(trx: Trx, sesion: Sesion, ordenId: string, proveedorId?: string | null): Promise<string> {
  const orden = await cargarOrden(trx, ordenId, true);
  if (orden.cobertura !== 'GARANTIA') throw new ErrorNegocio(400, 'Solo se reclaman órdenes en garantía.');
  const fase = faseDe(await estadosDe(trx, orden.tipo_documento_id), orden.estado);
  if (fase !== 'FACTURADA' && fase !== 'CERRADA') throw new ErrorNegocio(400, 'Liquide la orden antes de generar el reclamo.');
  const previo = await sql`select 1 from erp.srv_reclamos where orden_id = ${ordenId} and estado <> 'RECHAZADO'`.execute(trx);
  if (previo.rows.length) throw new ErrorNegocio(409, 'La orden ya tiene un reclamo vigente.');

  let proveedor = proveedorId ?? null;
  if (!proveedor) {
    const r = await sql<{ fabricante_id: string | null }>`
      select coalesce(g.fabricante_id, ob.fabricante_id) as fabricante_id
      from erp.srv_ordenes o left join erp.srv_garantias_objeto g on g.id = o.garantia_objeto_id
      left join erp.srv_objetos ob on ob.id = o.objeto_id where o.id = ${ordenId}`.execute(trx);
    proveedor = r.rows[0]?.fabricante_id ?? null;
  }
  if (!proveedor) throw new ErrorNegocio(400, 'Indique el fabricante o proveedor al que se reclama.');
  await existe(trx, 'mae_direcciones', proveedor, 'Proveedor');
  const pre = await calcularPrefactura(trx, ordenId);
  const monto = D(pre.totales.costoCubierto);
  if (!monto.greaterThan(0)) throw new ErrorNegocio(400, 'La orden no tiene costo cubierto por la garantía.');
  const tipo = await tipoDocumento(trx, 'SRV', 'RG');
  const numero = await numerar(trx, orden.compania_id, tipo.id);
  const r = await sql<{ id: string }>`
    insert into erp.srv_reclamos (compania_id, numero, orden_id, proveedor_id, fecha, monto_reclamado)
    values (${orden.compania_id}, ${numero}, ${ordenId}, ${proveedor}, ${hoy()}, ${monto.toFixed(2)}) returning id`.execute(trx);
  void sesion;
  return r.rows[0]!.id;
}

/** Avanza el reclamo. Al aprobarse, genera el asiento de recuperación por el monto aprobado. */
export async function cambiarEstadoReclamo(
  trx: Trx,
  reclamoId: string,
  d: { estado: EstadoReclamo; montoAprobado?: string | number | null; referencia?: string | null; observacion?: string | null },
): Promise<void> {
  const r = await sql<{ estado: EstadoReclamo; compania_id: string; numero: string; proveedor_id: string; monto_reclamado: string; orden_id: string }>`
    select estado, compania_id, numero, proveedor_id, monto_reclamado, orden_id from erp.srv_reclamos where id = ${reclamoId} for update`.execute(trx);
  const rec = r.rows[0];
  if (!rec) throw new ErrorNegocio(404, 'El reclamo no existe.');
  if (!TRANSICIONES[rec.estado].includes(d.estado)) {
    throw new ErrorNegocio(400, `No se puede pasar el reclamo de ${rec.estado.toLowerCase()} a ${d.estado.toLowerCase()}.`);
  }
  let asiento: string | null = null;
  let aprobado: string | null = null;
  if (d.estado === 'APROBADO') {
    const monto = d.montoAprobado != null && d.montoAprobado !== '' ? D(d.montoAprobado) : D(rec.monto_reclamado);
    if (!monto.greaterThan(0) || monto.greaterThan(rec.monto_reclamado)) {
      throw new ErrorNegocio(400, 'El monto aprobado debe ser mayor que cero y no superar el monto reclamado.');
    }
    aprobado = monto.toFixed(2);
    const orden = await cargarOrden(trx, rec.orden_id);
    asiento = await contabilizar(trx, {
      companiaId: rec.compania_id,
      fecha: hoy(),
      glosa: `Recuperación de garantía, reclamo ${rec.numero}`,
      origenModulo: 'SRV',
      origenId: reclamoId,
      lineas: [
        { concepto: 'CXC_GARANTIA', terceroId: rec.proveedor_id, debito: monto },
        { concepto: 'GASTO_GARANTIA', claseContableId: orden.tipo_clase_contable_id, unidadNegocioId: orden.unidad_negocio_id, credito: monto },
      ],
    });
  }
  await sql`update erp.srv_reclamos set estado = ${d.estado},
              monto_aprobado = coalesce(${aprobado}::numeric, monto_aprobado),
              referencia_proveedor = coalesce(${d.referencia ?? null}, referencia_proveedor),
              observacion = coalesce(${d.observacion ?? null}, observacion),
              asiento_id = coalesce(${asiento}::uuid, asiento_id)
            where id = ${reclamoId}`.execute(trx);
}

export async function listarReclamos(trx: Trx) {
  const r = await sql`
    select r.id, r.numero, r.fecha, r.estado, r.monto_reclamado, r.monto_aprobado, r.referencia_proveedor,
           d.nombre as proveedor, o.numero as orden_numero, o.id as orden_id
    from erp.srv_reclamos r join erp.mae_direcciones d on d.id = r.proveedor_id join erp.srv_ordenes o on o.id = r.orden_id
    order by r.numero desc limit 200`.execute(trx);
  return r.rows.map((f) => ({ ...(f as Record<string, unknown>), transiciones: TRANSICIONES[(f as { estado: EstadoReclamo }).estado] }));
}
