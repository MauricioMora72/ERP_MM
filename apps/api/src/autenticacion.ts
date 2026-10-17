import type { FastifyRequest } from 'fastify';
import { ErrorNegocio } from './errores.js';
import type { Configuracion } from './config.js';

export interface Identidad {
  uid: string;
  correo: string;
}

export type Verificador = (request: FastifyRequest) => Promise<Identidad>;

/**
 * Modo desarrollo: el navegador envía "Authorization: Desarrollo correo@ejemplo.com".
 * Solo existe para trabajar en local sin Firebase; la configuración impide usarlo en producción.
 */
function verificadorDesarrollo(): Verificador {
  return async (request) => {
    const cabecera = request.headers.authorization ?? '';
    const [esquema, valor] = cabecera.split(' ');
    if (esquema !== 'Desarrollo' || !valor || !/^[^@\s]+@[^@\s]+$/.test(valor)) {
      throw new ErrorNegocio(401, 'Debe iniciar sesión.');
    }
    const correo = valor.toLowerCase();
    return { uid: correo, correo };
  };
}

/** Modo Firebase: verifica el token de Firebase Authentication con firebase-admin. */
async function verificadorFirebase(projectId: string): Promise<Verificador> {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const app = getApps()[0] ?? initializeApp({ projectId });
  const auth = getAuth(app);
  return async (request) => {
    const cabecera = request.headers.authorization ?? '';
    const [esquema, token] = cabecera.split(' ');
    if (esquema !== 'Bearer' || !token) throw new ErrorNegocio(401, 'Debe iniciar sesión.');
    try {
      const decodificado = await auth.verifyIdToken(token);
      if (!decodificado.email) throw new ErrorNegocio(401, 'La cuenta no tiene correo.');
      return { uid: decodificado.uid, correo: decodificado.email.toLowerCase() };
    } catch (error) {
      if (error instanceof ErrorNegocio) throw error;
      throw new ErrorNegocio(401, 'La sesión no es válida o expiró.');
    }
  };
}

export async function crearVerificador(config: Configuracion): Promise<Verificador> {
  return config.modoAuth === 'firebase'
    ? verificadorFirebase(config.firebaseProjectId as string)
    : verificadorDesarrollo();
}
