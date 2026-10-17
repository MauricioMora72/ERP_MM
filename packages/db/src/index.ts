import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import pg from 'pg';

export { sql };
export type { Transaction };
export { cargarEntorno, requerida } from './entorno.js';

/**
 * El esquema completo tiene más de 80 tablas y se recorre de forma genérica por metadatos,
 * por eso el tipo de la base es abierto. Las consultas se escriben con SQL explícito.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BaseErp = any;
export type Db = Kysely<BaseErp>;
export type Trx = Transaction<BaseErp>;

/** pg devuelve numeric e int8 como texto: así nunca se pierden decimales ni dígitos. */
export function crearDb(connectionString: string, max = 10): Db {
  const pool = new pg.Pool({ connectionString, max });
  return new Kysely<BaseErp>({ dialect: new PostgresDialect({ pool }) });
}

export interface ContextoSesion {
  suscriptorId: string;
  usuario: string;
}

/**
 * Abre una transacción y fija el suscriptor y el usuario de la sesión antes de cualquier consulta.
 * set_config(..., true) equivale a SET LOCAL: el valor muere al terminar la transacción.
 */
export async function conTransaccion<T>(
  db: Db,
  contexto: ContextoSesion | null,
  trabajo: (trx: Trx) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (trx) => {
    if (contexto) await fijarContexto(trx, contexto);
    return trabajo(trx);
  });
}

export async function fijarContexto(trx: Trx, contexto: ContextoSesion): Promise<void> {
  await sql`select set_config('app.suscriptor_id', ${contexto.suscriptorId}, true),
                   set_config('app.usuario', ${contexto.usuario}, true)`.execute(trx);
}

/**
 * Toma el siguiente número de un documento con bloqueo de fila.
 * Dos transacciones simultáneas nunca reciben el mismo número: la segunda espera a que la primera termine.
 */
export async function siguienteNumero(
  trx: Trx,
  companiaId: string,
  tipoDocumentoId: string,
  anio = 0,
): Promise<string> {
  await sql`insert into erp.sis_numeradores (compania_id, tipo_documento_id, anio, siguiente)
            values (${companiaId}, ${tipoDocumentoId}, ${anio}, 1)
            on conflict on constraint uq_sis_numeradores_1 do nothing`.execute(trx);
  const fila = await sql<{ id: string; siguiente: string }>`
    select id, siguiente from erp.sis_numeradores
    where compania_id = ${companiaId} and tipo_documento_id = ${tipoDocumentoId} and anio = ${anio}
    for update`.execute(trx);
  const actual = fila.rows[0];
  if (!actual) throw new Error('No se pudo obtener el numerador.');
  await sql`update erp.sis_numeradores set siguiente = siguiente + 1 where id = ${actual.id}`.execute(trx);
  return actual.siguiente;
}
