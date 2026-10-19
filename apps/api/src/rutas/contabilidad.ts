import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Servicios } from '../app.js';
import { conciliar, conciliarAutomatico, estadoConciliacion, importarMovimientos, registrarDesdeBanco } from '../contabilidad/bancos.js';
import {
  balanceComprobacion, balanceGeneral, cambiarPeriodo, cierreAnual, crearAsientoManual, detalleAsiento, estadoResultados, generarPeriodos,
  libroMayor, listarAsientos, listarPeriodos, reversarAsiento,
} from '../contabilidad/general.js';
import { hoy } from '../nucleo/documentos.js';
import { crearConPermiso, fecha, idValido, leer, monto, opcUuid, uuid } from './compras.js';

const fechaQuery = (v?: string) => (v && fecha.safeParse(v).success ? v : undefined);
const inicioAnio = () => `${hoy().slice(0, 4)}-01-01`;

export async function rutasContabilidad(app: FastifyInstance, servicios: Servicios): Promise<void> {
  const conPermiso = crearConPermiso(servicios);

  // ------------------------------------------------------------------ asientos
  app.get<{ Querystring: { desde?: string; hasta?: string; modulo?: string; buscar?: string } }>('/api/con/asientos', async (request) =>
    conPermiso(request, 'contabilidad', 'VER', (trx, cia) => listarAsientos(trx, cia, {
      desde: fechaQuery(request.query.desde), hasta: fechaQuery(request.query.hasta), modulo: request.query.modulo || undefined, buscar: request.query.buscar,
    })),
  );

  app.post('/api/con/asientos', async (request, reply) => {
    const d = leer(z.object({
      fecha, glosa: z.string().max(500),
      lineas: z.array(z.object({
        cuentaId: uuid, centroCostoId: opcUuid, terceroId: opcUuid, debito: monto.nullish().or(z.literal('')), credito: monto.nullish().or(z.literal('')),
        glosa: z.string().max(500).nullish(),
      })).min(2, 'El asiento necesita al menos dos líneas'),
    }), request.body);
    const r = await conPermiso(request, 'contabilidad', 'CREAR', (trx, cia) => crearAsientoManual(trx, cia, d));
    reply.code(201);
    return r;
  });

  app.get<{ Params: { id: string } }>('/api/con/asientos/:id', async (request) =>
    conPermiso(request, 'contabilidad', 'VER', (trx, cia) => detalleAsiento(trx, cia, idValido(request.params.id))),
  );

  app.post<{ Params: { id: string } }>('/api/con/asientos/:id/reversar', async (request, reply) => {
    const d = leer(z.object({ fecha: fecha.nullish() }), request.body);
    const r = await conPermiso(request, 'contabilidad', 'CREAR', (trx, cia) => reversarAsiento(trx, cia, idValido(request.params.id), d.fecha));
    reply.code(201);
    return r;
  });

  // ------------------------------------------------------------------ períodos y cierre
  app.get<{ Querystring: { anio?: string } }>('/api/con/periodos', async (request) =>
    conPermiso(request, 'contabilidad', 'VER', (trx, cia) => listarPeriodos(trx, cia, request.query.anio ? Number(request.query.anio) : undefined)),
  );

  app.post<{ Params: { id: string } }>('/api/con/periodos/:id', async (request) => {
    const d = leer(z.object({ modulo: z.enum(['ventas', 'compras', 'inventario', 'contabilidad']), estado: z.enum(['ABIERTO', 'CERRADO']) }), request.body);
    return conPermiso(request, 'con-cierre', 'MODIFICAR', async (trx, cia) => {
      await cambiarPeriodo(trx, cia, idValido(request.params.id), d.modulo, d.estado);
      return { ok: true };
    });
  });

  app.post('/api/con/periodos/generar', async (request, reply) => {
    const d = leer(z.object({ anio: z.number().int().min(2000).max(2100) }), request.body);
    const r = await conPermiso(request, 'con-cierre', 'MODIFICAR', (trx, cia) => generarPeriodos(trx, cia, d.anio));
    reply.code(201);
    return r;
  });

  app.post('/api/con/cierre-anual', async (request, reply) => {
    const d = leer(z.object({ anio: z.number().int().min(2000).max(2100) }), request.body);
    const r = await conPermiso(request, 'con-cierre', 'MODIFICAR', (trx, cia) => cierreAnual(trx, cia, d.anio));
    reply.code(201);
    return r;
  });

  // ------------------------------------------------------------------ reportes
  app.get<{ Querystring: { desde?: string; hasta?: string } }>('/api/con/reportes/comprobacion', async (request) =>
    conPermiso(request, 'contabilidad', 'VER', (trx, cia) =>
      balanceComprobacion(trx, cia, fechaQuery(request.query.desde) ?? inicioAnio(), fechaQuery(request.query.hasta) ?? hoy())),
  );

  app.get<{ Querystring: { fecha?: string } }>('/api/con/reportes/balance', async (request) =>
    conPermiso(request, 'contabilidad', 'VER', (trx, cia) => balanceGeneral(trx, cia, fechaQuery(request.query.fecha) ?? hoy())),
  );

  app.get<{ Querystring: { desde?: string; hasta?: string } }>('/api/con/reportes/resultados', async (request) =>
    conPermiso(request, 'contabilidad', 'VER', (trx, cia) =>
      estadoResultados(trx, cia, fechaQuery(request.query.desde) ?? inicioAnio(), fechaQuery(request.query.hasta) ?? hoy())),
  );

  app.get<{ Querystring: { cuentaId?: string; desde?: string; hasta?: string } }>('/api/con/reportes/mayor', async (request) =>
    conPermiso(request, 'contabilidad', 'VER', (trx, cia) =>
      libroMayor(trx, cia, idValido(request.query.cuentaId ?? ''), fechaQuery(request.query.desde) ?? inicioAnio(), fechaQuery(request.query.hasta) ?? hoy())),
  );

  // ------------------------------------------------------------------ bancos
  app.get<{ Params: { id: string }; Querystring: { pendientes?: string; hasta?: string } }>('/api/con/bancos/:id', async (request) =>
    conPermiso(request, 'contabilidad', 'VER', (trx, cia) =>
      estadoConciliacion(trx, cia, idValido(request.params.id), { pendientes: request.query.pendientes === '1', hasta: fechaQuery(request.query.hasta) })),
  );

  app.post<{ Params: { id: string } }>('/api/con/bancos/:id/movimientos', async (request, reply) => {
    const d = leer(z.object({
      lineas: z.array(z.object({ fecha, referencia: z.string().max(100).nullish(), descripcion: z.string().max(300).nullish(), monto })).min(1),
    }), request.body);
    const r = await conPermiso(request, 'contabilidad', 'CREAR', (trx, cia) => importarMovimientos(trx, cia, idValido(request.params.id), d.lineas));
    reply.code(201);
    return r;
  });

  app.post<{ Params: { id: string } }>('/api/con/bancos/:id/conciliar', async (request) => {
    const d = leer(z.object({ movimientos: z.array(uuid).min(1), lineas: z.array(uuid).min(1) }), request.body);
    return conPermiso(request, 'contabilidad', 'MODIFICAR', async (trx, cia) => {
      await conciliar(trx, cia, idValido(request.params.id), d.movimientos, d.lineas);
      return { ok: true };
    });
  });

  app.post<{ Params: { id: string } }>('/api/con/bancos/:id/conciliar-automatico', async (request) =>
    conPermiso(request, 'contabilidad', 'MODIFICAR', (trx, cia) => conciliarAutomatico(trx, cia, idValido(request.params.id))),
  );

  app.post<{ Params: { id: string } }>('/api/con/bancos/movimientos/:id/registrar', async (request, reply) => {
    const d = leer(z.object({ cuentaId: uuid, glosa: z.string().max(500).nullish(), centroCostoId: opcUuid }), request.body);
    const r = await conPermiso(request, 'contabilidad', 'CREAR', (trx, cia) => registrarDesdeBanco(trx, cia, idValido(request.params.id), d));
    reply.code(201);
    return r;
  });
}
