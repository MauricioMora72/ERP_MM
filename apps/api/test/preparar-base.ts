/** Crea desde cero la base de pruebas y le aplica todas las migraciones antes de correr las pruebas. */
import pg from 'pg';
import { migrar } from '../../../packages/db/src/migrar.js';
import { BASE_PRUEBA, CLAVE_APP_PRUEBA, urlAdminPrueba, urlAdminServidor } from './util.js';

export default async function preparar(): Promise<void> {
  const cliente = new pg.Client({ connectionString: urlAdminServidor().toString() });
  await cliente.connect();
  await cliente.query(`drop database if exists ${BASE_PRUEBA} with (force)`);
  await cliente.query(`create database ${BASE_PRUEBA}`);
  await cliente.end();
  await migrar(urlAdminPrueba(), CLAVE_APP_PRUEBA);
}
