import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Db } from '@erp/db';
import type { Verificador } from './autenticacion.js';
import { ErrorNegocio, traducirErrorBase } from './errores.js';
import { rutasEntidades } from './rutas/entidades.js';
import { rutasSesion } from './rutas/sesion.js';

export interface Servicios {
  db: Db;
  verificar: Verificador;
}

export async function construirApp(
  servicios: Servicios,
  opciones: { origenWeb?: string; registro?: boolean } = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: opciones.registro ?? false });
  await app.register(cors, {
    origin: opciones.origenWeb ?? true,
    allowedHeaders: ['authorization', 'content-type', 'x-compania'],
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  });

  app.setErrorHandler((error, request, reply) => {
    const negocio = error instanceof ErrorNegocio ? error : traducirErrorBase(error);
    if (negocio) {
      reply.code(negocio.estado).send({ error: negocio.message, campos: negocio.campos });
      return;
    }
    if ((error as { statusCode?: number }).statusCode === 400) {
      reply.code(400).send({ error: 'La solicitud no es válida.' });
      return;
    }
    request.log.error(error);
    reply.code(500).send({ error: 'Ocurrió un error inesperado. Intente de nuevo.' });
  });

  app.get('/api/salud', async () => ({ ok: true }));
  await rutasSesion(app, servicios);
  await rutasEntidades(app, servicios);
  return app;
}
