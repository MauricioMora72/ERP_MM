import { cargarEntorno, requerida } from '@erp/db';

export type ModoAutenticacion = 'desarrollo' | 'firebase';

export interface Configuracion {
  databaseUrl: string;
  modoAuth: ModoAutenticacion;
  firebaseProjectId?: string;
  puerto: number;
  origenWeb: string;
}

export function leerConfiguracion(): Configuracion {
  cargarEntorno();
  const modoAuth = (process.env.AUTH_MODE ?? 'desarrollo') as ModoAutenticacion;
  if (modoAuth !== 'desarrollo' && modoAuth !== 'firebase') {
    throw new Error('AUTH_MODE debe ser "desarrollo" o "firebase".');
  }
  if (modoAuth === 'desarrollo' && process.env.NODE_ENV === 'production') {
    throw new Error('El modo de autenticación de desarrollo no puede usarse en producción.');
  }
  if (modoAuth === 'firebase' && !process.env.FIREBASE_PROJECT_ID) {
    throw new Error('Con AUTH_MODE=firebase debe definir FIREBASE_PROJECT_ID.');
  }
  return {
    databaseUrl: requerida('DATABASE_URL'),
    modoAuth,
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
    puerto: Number(process.env.API_PORT ?? process.env.PORT ?? 4000),
    origenWeb: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  };
}
