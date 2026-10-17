import type { FastifyInstance } from 'fastify';
import { crearDb, type Db } from '@erp/db';
import { construirApp } from '../src/app.js';
import { crearVerificador } from '../src/autenticacion.js';
import { urlAppPrueba } from './util.js';

export interface Entorno {
  app: FastifyInstance;
  db: Db;
}

export async function levantar(): Promise<Entorno> {
  const db = crearDb(urlAppPrueba(), 30);
  const verificar = await crearVerificador({
    databaseUrl: '',
    modoAuth: 'desarrollo',
    puerto: 0,
    origenWeb: '',
  });
  const app = await construirApp({ db, verificar });
  return { app, db };
}

export function cabeceras(correo: string, companiaId?: string): Record<string, string> {
  const h: Record<string, string> = { authorization: `Desarrollo ${correo}` };
  if (companiaId) h['x-compania'] = companiaId;
  return h;
}

let contador = 0;
/** Da de alta un suscriptor nuevo con datos únicos y devuelve sus identificadores. */
export async function altaSuscriptor(app: FastifyInstance, prefijo: string) {
  contador += 1;
  const sufijo = `${Date.now().toString(36)}${contador}`;
  const correo = `admin.${prefijo}.${sufijo}@prueba.ec`;
  const r = await app.inject({
    method: 'POST',
    url: '/api/alta',
    headers: cabeceras(correo),
    payload: {
      suscriptor: { codigo: `${prefijo}${sufijo}`.slice(0, 20).toUpperCase(), nombre: `Cliente ${prefijo}` },
      compania: { codigo: 'C01', razonSocial: `Empresa ${prefijo} S.A.`, ruc: '1790012345001' },
      administrador: { nombre: `Admin ${prefijo}`, correo },
    },
  });
  if (r.statusCode !== 201) throw new Error(`Alta falló: ${r.statusCode} ${r.body}`);
  const datos = r.json() as { suscriptorId: string; companiaId: string; usuarioId: string };
  return { ...datos, correo };
}
