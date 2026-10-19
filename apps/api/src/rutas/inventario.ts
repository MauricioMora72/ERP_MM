import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Servicios } from '../app.js';
import {
  agregarLineaConteo, consultaKardex, contabilizarConteo, crearConteo, detalleDocumento, existencias, listarDocumentos, lotesDisponibles,
  registrarAjuste, registrarConteo, transferir,
} from '../inventario/inventario.js';
import { hoy } from '../nucleo/documentos.js';
import { crearConPermiso, fecha, idValido, leer, monto, opcUuid, uuid } from './compras.js';

const uuidQuery = (v?: string) => (v && uuid.safeParse(v).success ? v : undefined);
const fechaQuery = (v?: string) => (v && fecha.safeParse(v).success ? v : undefined);

/** Inventarios: ajustes, transferencias, conteo físico, existencias por lote y kardex. */
export async function rutasInventario(app: FastifyInstance, servicios: Servicios): Promise<void> {
  const conPermiso = crearConPermiso(servicios);

  app.post('/api/inventario/ajustes', async (request, reply) => {
    const d = leer(z.object({
      unidadNegocioId: uuid, articuloId: uuid, cantidad: monto, costoUnitario: monto.nullish().or(z.literal('')), motivo: z.string().max(500).nullish(),
      lote: z.string().max(30).nullish(), vencimiento: fecha.nullish().or(z.literal('')),
    }), request.body);
    const r = await conPermiso(request, 'inventario', 'CREAR', (trx, cia) => registrarAjuste(trx, cia, { ...d, vencimiento: d.vencimiento || null }));
    reply.code(201);
    return r;
  });

  app.post('/api/inventario/transferencias', async (request, reply) => {
    const d = leer(z.object({
      origenId: uuid, destinoId: uuid, fecha: fecha.nullish(), observacion: z.string().max(500).nullish(),
      lineas: z.array(z.object({ articuloId: uuid, cantidad: monto, loteId: opcUuid })).min(1, 'Agregue al menos una línea'),
    }), request.body);
    const r = await conPermiso(request, 'inventario', 'CREAR', (trx, cia) => transferir(trx, cia, d));
    reply.code(201);
    return r;
  });

  app.post('/api/inventario/conteos', async (request, reply) => {
    const d = leer(z.object({ unidadNegocioId: uuid, categoria: z.string().max(20).nullish(), observacion: z.string().max(500).nullish() }), request.body);
    const r = await conPermiso(request, 'inventario', 'CREAR', (trx, cia) => crearConteo(trx, cia, d));
    reply.code(201);
    return r;
  });

  app.post<{ Params: { id: string } }>('/api/inventario/conteos/:id/lineas', async (request) => {
    const d = leer(z.object({ articuloId: uuid, lote: z.string().max(30).nullish(), vencimiento: fecha.nullish() }), request.body);
    return conPermiso(request, 'inventario', 'MODIFICAR', async (trx) => {
      await agregarLineaConteo(trx, idValido(request.params.id), d);
      return { ok: true };
    });
  });

  app.put<{ Params: { id: string } }>('/api/inventario/conteos/:id', async (request) => {
    const d = leer(z.object({ cantidades: z.array(z.object({ lineaId: uuid, cantidad: monto.nullish().or(z.literal('')) })) }), request.body);
    return conPermiso(request, 'inventario', 'MODIFICAR', async (trx) => {
      await registrarConteo(trx, idValido(request.params.id), d.cantidades.map((c) => ({ lineaId: c.lineaId, cantidad: c.cantidad === '' ? null : c.cantidad ?? null })));
      return { ok: true };
    });
  });

  app.post<{ Params: { id: string } }>('/api/inventario/conteos/:id/contabilizar', async (request) =>
    conPermiso(request, 'inventario', 'CREAR', (trx) => contabilizarConteo(trx, idValido(request.params.id))),
  );

  app.get<{ Querystring: { tipo?: string } }>('/api/inventario/documentos', async (request) =>
    conPermiso(request, 'inventario', 'VER', (trx, cia) => listarDocumentos(trx, cia, request.query.tipo)),
  );

  app.get<{ Params: { id: string } }>('/api/inventario/documentos/:id', async (request) =>
    conPermiso(request, 'inventario', 'VER', (trx) => detalleDocumento(trx, idValido(request.params.id))),
  );

  app.get<{ Querystring: { buscar?: string; unidadNegocioId?: string } }>('/api/inventario/saldos', async (request) =>
    conPermiso(request, 'inventario', 'VER', (trx) => existencias(trx, { buscar: request.query.buscar, unidadNegocioId: uuidQuery(request.query.unidadNegocioId) })),
  );

  app.get<{ Querystring: { articuloId?: string; unidadNegocioId?: string } }>('/api/inventario/lotes', async (request) =>
    conPermiso(request, 'inventario', 'VER', (trx) => lotesDisponibles(trx, idValido(request.query.articuloId ?? ''), idValido(request.query.unidadNegocioId ?? ''))),
  );

  app.get<{ Querystring: { articuloId?: string; unidadNegocioId?: string; desde?: string; hasta?: string } }>('/api/inventario/kardex', async (request) =>
    conPermiso(request, 'inventario', 'VER', (trx) => consultaKardex(trx, {
      articuloId: idValido(request.query.articuloId ?? ''), unidadNegocioId: uuidQuery(request.query.unidadNegocioId),
      desde: fechaQuery(request.query.desde) ?? '2000-01-01', hasta: fechaQuery(request.query.hasta) ?? hoy(),
    })),
  );
}
