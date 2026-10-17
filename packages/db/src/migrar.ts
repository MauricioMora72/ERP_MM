/**
 * Aplica en orden las migraciones de packages/db/migraciones que aún no se hayan aplicado.
 * Se ejecuta con la conexión de administración (DATABASE_URL_ADMIN), dueña de las tablas.
 * Nunca edite una migración ya aplicada: cree una nueva con el siguiente número.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { cargarEntorno, requerida } from './entorno.js';

const carpeta = join(dirname(fileURLToPath(import.meta.url)), '..', 'migraciones');

export async function migrar(urlAdmin: string, claveApp?: string): Promise<string[]> {
  const cliente = new pg.Client({ connectionString: urlAdmin });
  await cliente.connect();
  const aplicadas: string[] = [];
  try {
    await cliente.query(`create table if not exists public.erp_migraciones (
      nombre varchar(200) primary key, aplicada_en timestamptz not null default now())`);
    const hechas = new Set(
      (await cliente.query<{ nombre: string }>('select nombre from public.erp_migraciones')).rows.map(
        (r) => r.nombre,
      ),
    );
    const archivos = readdirSync(carpeta)
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .sort();
    for (const archivo of archivos) {
      if (hechas.has(archivo)) continue;
      const contenido = readFileSync(join(carpeta, archivo), 'utf8');
      await cliente.query('begin');
      try {
        await cliente.query(contenido);
        await cliente.query('insert into public.erp_migraciones (nombre) values ($1)', [archivo]);
        await cliente.query('commit');
        aplicadas.push(archivo);
      } catch (error) {
        await cliente.query('rollback');
        throw new Error(`Falló la migración ${archivo}: ${(error as Error).message}`);
      }
    }
    if (claveApp) {
      await cliente.query(`alter role erp_app with login password ${cliente.escapeLiteral(claveApp)}`);
    }
  } finally {
    await cliente.end();
  }
  return aplicadas;
}

const esPrincipal = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (esPrincipal) {
  cargarEntorno();
  migrar(requerida('DATABASE_URL_ADMIN'), process.env.APP_DB_PASSWORD)
    .then((aplicadas) => {
      console.log(
        aplicadas.length ? `Migraciones aplicadas: ${aplicadas.join(', ')}` : 'La base ya está al día.',
      );
    })
    .catch((error: Error) => {
      console.error(error.message);
      process.exit(1);
    });
}
