import { sql, type Trx } from '@erp/db';
import type { Sesion } from '../contexto.js';
import { ErrorNegocio } from '../errores.js';
import { numerar, tipoDocumento } from '../nucleo/documentos.js';
import { companiaDe, existe } from './comun.js';
import { crearOrden } from './ordenes.js';

export type EstadoCaso = 'ABIERTO' | 'EN_PROCESO' | 'ESPERA_CLIENTE' | 'RESUELTO' | 'CERRADO';

const TRANSICIONES: Record<EstadoCaso, EstadoCaso[]> = {
  ABIERTO: ['EN_PROCESO', 'ESPERA_CLIENTE', 'RESUELTO'],
  EN_PROCESO: ['ESPERA_CLIENTE', 'RESUELTO'],
  ESPERA_CLIENTE: ['EN_PROCESO', 'RESUELTO'],
  RESUELTO: ['CERRADO', 'EN_PROCESO'],
  CERRADO: [],
};

async function validarCatalogo(trx: Trx, codigo: string, valor: string | null | undefined, etiqueta: string, requerido = false): Promise<void> {
  if (!valor) {
    if (requerido) throw new ErrorNegocio(400, `${etiqueta} es obligatorio.`, { [etiqueta.toLowerCase()]: 'Este campo es obligatorio' });
    return;
  }
  const r = await sql`select 1 from erp.cat_valores v join erp.cat_catalogos c on c.id = v.catalogo_id
                      where c.modulo = 'SRV' and c.codigo = ${codigo} and v.codigo = ${valor} and v.activo`.execute(trx);
  if (r.rows.length === 0) throw new ErrorNegocio(400, `${etiqueta}: el valor no está en el catálogo.`);
}

export interface DatosCaso {
  clienteId: string;
  contactoId?: string | null;
  objetoId?: string | null;
  canal?: string | null;
  tipo?: string | null;
  prioridad: string;
  asunto: string;
  descripcion?: string | null;
  asignadoId?: string | null;
}

/** Abre un caso y calcula su fecha compromiso con las horas de la prioridad (código especial del catálogo). */
export async function crearCaso(trx: Trx, sesion: Sesion, d: DatosCaso): Promise<string> {
  const companiaId = companiaDe(sesion);
  if (!d.asunto?.trim()) throw new ErrorNegocio(400, 'Revise los datos ingresados.', { asunto: 'Este campo es obligatorio' });
  await existe(trx, 'mae_direcciones', d.clienteId, 'Cliente');
  await existe(trx, 'mae_contactos', d.contactoId, 'Contacto');
  await existe(trx, 'srv_objetos', d.objetoId, 'Objeto atendido');
  await existe(trx, 'srv_recursos', d.asignadoId, 'Responsable');
  await validarCatalogo(trx, 'PRIORIDAD', d.prioridad, 'Prioridad', true);
  await validarCatalogo(trx, 'CANAL', d.canal, 'Canal');
  await validarCatalogo(trx, 'TIPO_CASO', d.tipo, 'Tipo de caso');
  const tipo = await tipoDocumento(trx, 'SRV', 'CS');
  const numero = await numerar(trx, companiaId, tipo.id);
  const r = await sql<{ id: string }>`
    insert into erp.srv_casos (compania_id, numero, cliente_id, contacto_id, objeto_id, canal, tipo, prioridad, asunto,
      descripcion, asignado_id, fecha_compromiso)
    values (${companiaId}, ${numero}, ${d.clienteId}, ${d.contactoId ?? null}, ${d.objetoId ?? null}, ${d.canal ?? null},
      ${d.tipo ?? null}, ${d.prioridad}, ${d.asunto.trim()}, ${d.descripcion ?? null}, ${d.asignadoId ?? null},
      now() + make_interval(hours => coalesce((
        select nullif(v.codigo_especial, '')::int from erp.cat_valores v join erp.cat_catalogos c on c.id = v.catalogo_id
        where c.modulo = 'SRV' and c.codigo = 'PRIORIDAD' and v.codigo = ${d.prioridad}), 24)))
    returning id`.execute(trx);
  return r.rows[0]!.id;
}

export async function cambiarEstadoCaso(trx: Trx, casoId: string, estado: EstadoCaso, solucion?: string | null): Promise<void> {
  const r = await sql<{ estado: EstadoCaso; solucion: string | null }>`select estado, solucion from erp.srv_casos where id = ${casoId} for update`.execute(trx);
  const caso = r.rows[0];
  if (!caso) throw new ErrorNegocio(404, 'El caso no existe.');
  if (!TRANSICIONES[caso.estado].includes(estado)) {
    throw new ErrorNegocio(400, `No se puede pasar el caso de ${caso.estado.toLowerCase()} a ${estado.toLowerCase()}.`);
  }
  const sol = solucion?.trim() || caso.solucion;
  if (estado === 'RESUELTO' && !sol) throw new ErrorNegocio(400, 'Registre la solución antes de resolver el caso.', { solucion: 'Este campo es obligatorio' });
  await sql`update erp.srv_casos set estado = ${estado}, solucion = ${sol ?? null},
              fecha_cierre = case when ${estado} in ('RESUELTO','CERRADO') then coalesce(fecha_cierre, now()) else null end
            where id = ${casoId}`.execute(trx);
}

export async function agregarNota(trx: Trx, casoId: string, nota: string, visibleCliente = false): Promise<string> {
  if (!nota?.trim()) throw new ErrorNegocio(400, 'Escriba la nota.');
  await existe(trx, 'srv_casos', casoId, 'Caso');
  const r = await sql<{ id: string }>`insert into erp.srv_casos_notas (caso_id, nota, visible_cliente)
                                      values (${casoId}, ${nota.trim()}, ${visibleCliente}) returning id`.execute(trx);
  return r.rows[0]!.id;
}

/** Genera una orden de servicio desde el caso y deja ambos ligados. */
export async function ordenDesdeCaso(
  trx: Trx,
  sesion: Sesion,
  casoId: string,
  d: { tipoOrdenId: string; plantillaId?: string | null; unidadNegocioId?: string | null; campos?: Record<string, unknown> | null },
): Promise<string> {
  const r = await sql<{ cliente_id: string; objeto_id: string | null; asunto: string; descripcion: string | null; estado: EstadoCaso }>`
    select cliente_id, objeto_id, asunto, descripcion, estado from erp.srv_casos where id = ${casoId} for update`.execute(trx);
  const caso = r.rows[0];
  if (!caso) throw new ErrorNegocio(404, 'El caso no existe.');
  if (caso.estado === 'RESUELTO' || caso.estado === 'CERRADO') throw new ErrorNegocio(400, 'El caso ya está resuelto o cerrado.');
  const existente = await sql`select 1 from erp.srv_ordenes where caso_id = ${casoId}
                              and estado not in (select estado from erp.sis_flujos_estado f where f.tipo_documento_id = erp.srv_ordenes.tipo_documento_id and f.fase = 'CANCELADA')`.execute(trx);
  if (existente.rows.length) throw new ErrorNegocio(409, 'El caso ya tiene una orden de servicio vigente.');
  const ordenId = await crearOrden(trx, sesion, {
    tipoOrdenId: d.tipoOrdenId,
    clienteId: caso.cliente_id,
    objetoId: caso.objeto_id,
    plantillaId: d.plantillaId ?? null,
    unidadNegocioId: d.unidadNegocioId ?? null,
    descripcion: [caso.asunto, caso.descripcion].filter(Boolean).join('. '),
    campos: d.campos ?? null,
    casoId,
  });
  await sql`update erp.srv_casos set estado = 'EN_PROCESO' where id = ${casoId} and estado in ('ABIERTO','ESPERA_CLIENTE')`.execute(trx);
  return ordenId;
}

export async function listarCasos(trx: Trx, filtros: { estado?: string; buscar?: string }) {
  const patron = filtros.buscar ? `%${filtros.buscar}%` : null;
  const r = await sql`
    select c.id, c.numero, c.asunto, c.estado, c.prioridad, c.canal, c.fecha_apertura, c.fecha_compromiso, c.fecha_cierre,
           d.nombre as cliente, r.descripcion as asignado,
           (c.estado not in ('RESUELTO','CERRADO') and c.fecha_compromiso < now()) as vencido,
           (select o.numero from erp.srv_ordenes o where o.caso_id = c.id order by o.creado_en desc limit 1) as orden_numero
    from erp.srv_casos c join erp.mae_direcciones d on d.id = c.cliente_id
    left join erp.srv_recursos r on r.id = c.asignado_id
    where (${filtros.estado ?? null}::text is null or c.estado = ${filtros.estado ?? null})
      and (${patron}::text is null or c.asunto ilike ${patron} or d.nombre ilike ${patron} or c.numero::text = ${filtros.buscar ?? ''})
    order by (c.estado in ('RESUELTO','CERRADO')), c.fecha_compromiso nulls last limit 200`.execute(trx);
  return r.rows;
}

export async function detalleCaso(trx: Trx, casoId: string) {
  const c = await sql`
    select c.*, d.nombre as cliente, ob.descripcion as objeto, r.descripcion as asignado,
           (c.estado not in ('RESUELTO','CERRADO') and c.fecha_compromiso < now()) as vencido
    from erp.srv_casos c join erp.mae_direcciones d on d.id = c.cliente_id
    left join erp.srv_objetos ob on ob.id = c.objeto_id left join erp.srv_recursos r on r.id = c.asignado_id
    where c.id = ${casoId}`.execute(trx);
  if (!c.rows[0]) throw new ErrorNegocio(404, 'El caso no existe.');
  const notas = await sql`select id, nota, visible_cliente, creado_por, creado_en from erp.srv_casos_notas
                          where caso_id = ${casoId} order by creado_en desc`.execute(trx);
  const ordenes = await sql`select id, numero, estado, cobertura from erp.srv_ordenes where caso_id = ${casoId} order by creado_en`.execute(trx);
  return { caso: c.rows[0], notas: notas.rows, ordenes: ordenes.rows, transiciones: TRANSICIONES[(c.rows[0] as { estado: EstadoCaso }).estado] };
}
