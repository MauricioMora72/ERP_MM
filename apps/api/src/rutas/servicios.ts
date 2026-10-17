import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { sql, type Trx } from '@erp/db';
import { erroresPorCampo } from '@erp/shared';
import type { Servicios } from '../app.js';
import { enSesion, exigirPermiso, obtenerSesion, type Accion, type Sesion } from '../contexto.js';
import { ErrorNegocio } from '../errores.js';
import { agregarNota, cambiarEstadoCaso, crearCaso, detalleCaso, listarCasos, ordenDesdeCaso } from '../servicios/casos.js';
import { calcularGarantiaObjeto } from '../servicios/garantias.js';
import { aplicarIndustria, INDUSTRIAS } from '../servicios/industrias.js';
import {
  actualizarOrden, agregarActividad, calcularPrefactura, cambiarCobertura, cambiarEstado, consumir, crearOrden,
  detalleOrden, facturar, registrarHoras, registrarTercero, reversarConsumo,
} from '../servicios/ordenes.js';
import { generarPreventivos } from '../servicios/preventivos.js';
import { cambiarEstadoReclamo, crearReclamo, listarReclamos } from '../servicios/reclamos.js';

const uuid = z.string().uuid();
const opcUuid = uuid.nullish();
const numero = z.union([z.string(), z.number()]).nullish();

function leer<T extends z.ZodTypeAny>(esquema: T, cuerpo: unknown): z.infer<T> {
  const r = esquema.safeParse(cuerpo ?? {});
  if (!r.success) throw new ErrorNegocio(400, 'Revise los datos ingresados.', erroresPorCampo(r.error));
  return r.data;
}

function idValido(id: string): string {
  if (!uuid.safeParse(id).success) throw new ErrorNegocio(404, 'El registro no existe.');
  return id;
}

export async function rutasServicios(app: FastifyInstance, servicios: Servicios): Promise<void> {
  async function conPermiso<T>(request: FastifyRequest, recurso: string, accion: Accion, trabajo: (trx: Trx, sesion: Sesion) => Promise<T>) {
    const sesion = await obtenerSesion(servicios.db, servicios.verificar, request);
    return enSesion(servicios.db, sesion, async (trx) => {
      await exigirPermiso(trx, sesion, recurso, accion);
      return trabajo(trx, sesion);
    });
  }

  // ------------------------------------------------------------------ órdenes
  app.get<{ Querystring: { fase?: string; buscar?: string } }>('/api/srv/ordenes', async (request) =>
    conPermiso(request, 'srv-ordenes', 'VER', async (trx) => {
      const patron = request.query.buscar ? `%${request.query.buscar}%` : null;
      const r = await sql`
        select o.id, o.numero, o.estado, f.descripcion as estado_descripcion, f.fase, o.cobertura, o.fecha_solicitud,
               o.fecha_programada, t.descripcion as tipo_orden, d.nombre as cliente, ob.descripcion as objeto
        from erp.srv_ordenes o join erp.srv_tipos_orden t on t.id = o.tipo_orden_id
        join erp.mae_direcciones d on d.id = o.cliente_id left join erp.srv_objetos ob on ob.id = o.objeto_id
        left join erp.sis_flujos_estado f on f.tipo_documento_id = o.tipo_documento_id and f.estado = o.estado
        where (${request.query.fase ?? null}::text is null or f.fase = ${request.query.fase ?? null})
          and (${patron}::text is null or d.nombre ilike ${patron} or ob.descripcion ilike ${patron} or o.numero::text = ${request.query.buscar ?? ''})
        order by o.numero desc limit 300`.execute(trx);
      return r.rows;
    }),
  );

  app.post('/api/srv/ordenes', async (request, reply) => {
    const d = leer(z.object({
      tipoOrdenId: uuid, clienteId: uuid, objetoId: opcUuid, unidadNegocioId: opcUuid, plantillaId: opcUuid,
      descripcion: z.string().max(1000).nullish(), fechaProgramada: z.string().nullish(), centroCostoId: opcUuid,
      campos: z.record(z.unknown()).nullish(),
    }), request.body);
    const id = await conPermiso(request, 'srv-ordenes', 'CREAR', (trx, sesion) => crearOrden(trx, sesion, d));
    reply.code(201);
    return { id };
  });

  app.get<{ Params: { id: string } }>('/api/srv/ordenes/:id', async (request) =>
    conPermiso(request, 'srv-ordenes', 'VER', (trx, sesion) => detalleOrden(trx, sesion, idValido(request.params.id))));

  app.put<{ Params: { id: string } }>('/api/srv/ordenes/:id', async (request) => {
    const d = leer(z.object({ descripcion: z.string().max(1000).nullish(), fechaProgramada: z.string().nullish(), campos: z.record(z.unknown()).optional() }), request.body);
    await conPermiso(request, 'srv-ordenes', 'MODIFICAR', (trx, sesion) => actualizarOrden(trx, sesion, idValido(request.params.id), d));
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/srv/ordenes/:id/estado', async (request) => {
    const d = leer(z.object({ estado: z.coerce.number().int() }), request.body);
    await conPermiso(request, 'srv-ordenes', 'MODIFICAR', (trx) => cambiarEstado(trx, idValido(request.params.id), d.estado));
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/srv/ordenes/:id/cobertura', async (request) => {
    const d = leer(z.object({ cobertura: z.enum(['FACTURABLE', 'GARANTIA', 'CONTRATO', 'INTERNO']), motivo: z.string().max(500) }), request.body);
    await conPermiso(request, 'srv-ordenes', 'MODIFICAR', (trx, sesion) => cambiarCobertura(trx, sesion, idValido(request.params.id), d.cobertura, d.motivo));
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/srv/ordenes/:id/actividades', async (request, reply) => {
    const d = leer(z.object({
      descripcion: z.string().min(1).max(200), perfilId: opcUuid, articuloId: opcUuid, personas: z.coerce.number().int().min(1).optional(),
      horasPrevistas: numero, recursoId: opcUuid, facturable: z.boolean().optional(), precioCerrado: numero,
    }), request.body);
    const id = await conPermiso(request, 'srv-ordenes', 'MODIFICAR', (trx) => agregarActividad(trx, idValido(request.params.id), {
      ...d, horasPrevistas: d.horasPrevistas ?? 0,
    }));
    reply.code(201);
    return { id };
  });

  app.post<{ Params: { id: string } }>('/api/srv/ordenes/:id/horas', async (request, reply) => {
    const d = leer(z.object({ actividadId: uuid, recursoId: uuid, fecha: z.string().nullish(), inicio: z.string().nullish(), fin: z.string().nullish(), horas: numero }), request.body);
    const id = await conPermiso(request, 'srv-ordenes', 'MODIFICAR', (trx) => registrarHoras(trx, idValido(request.params.id), { ...d, fecha: d.fecha ?? undefined }));
    reply.code(201);
    return { id };
  });

  app.post<{ Params: { id: string } }>('/api/srv/ordenes/:id/consumos', async (request, reply) => {
    const d = leer(z.object({ consumoId: opcUuid, articuloId: opcUuid, unidadNegocioId: opcUuid, cantidad: numero, facturable: z.boolean().optional(), loteId: opcUuid, precio: numero }), request.body);
    const id = await conPermiso(request, 'srv-ordenes', 'MODIFICAR', (trx) => consumir(trx, idValido(request.params.id), d));
    reply.code(201);
    return { id };
  });

  app.post<{ Params: { id: string; consumo: string } }>('/api/srv/ordenes/:id/consumos/:consumo/reversar', async (request) => {
    await conPermiso(request, 'srv-ordenes', 'MODIFICAR', (trx) => reversarConsumo(trx, idValido(request.params.id), idValido(request.params.consumo)));
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/srv/ordenes/:id/terceros', async (request, reply) => {
    const d = leer(z.object({ descripcion: z.string().min(1).max(200), proveedorId: opcUuid, articuloId: opcUuid, costo: z.union([z.string(), z.number()]), precio: numero, facturable: z.boolean().optional() }), request.body);
    const id = await conPermiso(request, 'srv-ordenes', 'MODIFICAR', (trx) => registrarTercero(trx, idValido(request.params.id), d));
    reply.code(201);
    return { id };
  });

  app.get<{ Params: { id: string } }>('/api/srv/ordenes/:id/prefactura', async (request) =>
    conPermiso(request, 'srv-ordenes', 'VER', (trx) => calcularPrefactura(trx, idValido(request.params.id))));

  app.post<{ Params: { id: string } }>('/api/srv/ordenes/:id/facturar', async (request) =>
    conPermiso(request, 'srv-facturar', 'CREAR', (trx, sesion) => facturar(trx, sesion, idValido(request.params.id))));

  app.post<{ Params: { id: string } }>('/api/srv/ordenes/:id/reclamo', async (request, reply) => {
    const d = leer(z.object({ proveedorId: opcUuid }), request.body);
    const id = await conPermiso(request, 'srv-reclamos', 'CREAR', (trx, sesion) => crearReclamo(trx, sesion, idValido(request.params.id), d.proveedorId));
    reply.code(201);
    return { id };
  });

  app.post<{ Querystring: { hasta?: string } }>('/api/srv/preventivos/generar', async (request) =>
    conPermiso(request, 'srv-ordenes', 'CREAR', (trx, sesion) => generarPreventivos(trx, sesion, request.query.hasta)));

  app.post<{ Params: { id: string } }>('/api/srv/objetos/:id/garantia', async (request) =>
    conPermiso(request, 'objetos', 'MODIFICAR', async (trx) => ({ garantiaId: await calcularGarantiaObjeto(trx, idValido(request.params.id)) })));

  // ------------------------------------------------------------------ mesa de ayuda
  app.get<{ Querystring: { estado?: string; buscar?: string } }>('/api/srv/casos', async (request) =>
    conPermiso(request, 'srv-casos', 'VER', (trx) => listarCasos(trx, request.query)));

  app.post('/api/srv/casos', async (request, reply) => {
    const d = leer(z.object({
      clienteId: uuid, contactoId: opcUuid, objetoId: opcUuid, canal: z.string().max(20).nullish(), tipo: z.string().max(20).nullish(),
      prioridad: z.string().min(1).max(20), asunto: z.string().max(200), descripcion: z.string().max(2000).nullish(), asignadoId: opcUuid,
    }), request.body);
    const id = await conPermiso(request, 'srv-casos', 'CREAR', (trx, sesion) => crearCaso(trx, sesion, d));
    reply.code(201);
    return { id };
  });

  app.get<{ Params: { id: string } }>('/api/srv/casos/:id', async (request) =>
    conPermiso(request, 'srv-casos', 'VER', (trx) => detalleCaso(trx, idValido(request.params.id))));

  app.post<{ Params: { id: string } }>('/api/srv/casos/:id/estado', async (request) => {
    const d = leer(z.object({ estado: z.enum(['ABIERTO', 'EN_PROCESO', 'ESPERA_CLIENTE', 'RESUELTO', 'CERRADO']), solucion: z.string().max(2000).nullish() }), request.body);
    await conPermiso(request, 'srv-casos', 'MODIFICAR', (trx) => cambiarEstadoCaso(trx, idValido(request.params.id), d.estado, d.solucion));
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/srv/casos/:id/notas', async (request, reply) => {
    const d = leer(z.object({ nota: z.string().max(2000), visibleCliente: z.boolean().optional() }), request.body);
    const id = await conPermiso(request, 'srv-casos', 'MODIFICAR', (trx) => agregarNota(trx, idValido(request.params.id), d.nota, d.visibleCliente));
    reply.code(201);
    return { id };
  });

  app.post<{ Params: { id: string } }>('/api/srv/casos/:id/orden', async (request, reply) => {
    const d = leer(z.object({ tipoOrdenId: uuid, plantillaId: opcUuid, unidadNegocioId: opcUuid, campos: z.record(z.unknown()).nullish() }), request.body);
    const id = await conPermiso(request, 'srv-ordenes', 'CREAR', (trx, sesion) => ordenDesdeCaso(trx, sesion, idValido(request.params.id), d));
    reply.code(201);
    return { id };
  });

  // ------------------------------------------------------------------ reclamos
  app.get('/api/srv/reclamos', async (request) => conPermiso(request, 'srv-reclamos', 'VER', (trx) => listarReclamos(trx)));

  app.post<{ Params: { id: string } }>('/api/srv/reclamos/:id/estado', async (request) => {
    const d = leer(z.object({
      estado: z.enum(['BORRADOR', 'ENVIADO', 'APROBADO', 'RECHAZADO', 'CERRADO']), montoAprobado: numero,
      referencia: z.string().max(100).nullish(), observacion: z.string().max(1000).nullish(),
    }), request.body);
    await conPermiso(request, 'srv-reclamos', 'MODIFICAR', (trx) => cambiarEstadoReclamo(trx, idValido(request.params.id), d));
    return { ok: true };
  });

  // ------------------------------------------------------------------ industrias
  app.get('/api/srv/industrias', async () =>
    INDUSTRIAS.map((i) => ({ codigo: i.codigo, nombre: i.nombre, descripcion: i.descripcion, tiposOrden: i.tiposOrden.map((t) => t.descripcion), temparios: i.temparios.map((t) => t.descripcion) })));

  app.post<{ Params: { codigo: string } }>('/api/srv/industrias/:codigo/aplicar', async (request) =>
    conPermiso(request, 'srv-config', 'MODIFICAR', (trx) => aplicarIndustria(trx, request.params.codigo)));
}
