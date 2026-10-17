import { cargarEntorno } from '@erp/db';

cargarEntorno();

export const CLAVE_APP_PRUEBA = 'erp_app_prueba';
export const BASE_PRUEBA = 'erp_prueba';

/** Conexión de administración al servidor de pruebas (por defecto, el PostgreSQL de docker compose). */
export function urlAdminServidor(): URL {
  return new URL(
    process.env.TEST_DATABASE_URL_ADMIN ?? 'postgres://erp_admin:erp_admin_local@localhost:5432/postgres',
  );
}

export function urlAdminPrueba(): string {
  const u = urlAdminServidor();
  u.pathname = `/${BASE_PRUEBA}`;
  return u.toString();
}

export function urlAppPrueba(): string {
  const u = urlAdminServidor();
  u.username = 'erp_app';
  u.password = CLAVE_APP_PRUEBA;
  u.pathname = `/${BASE_PRUEBA}`;
  return u.toString();
}
