import { siguienteNumero, sql, type Trx } from '@erp/db';
import { ErrorNegocio } from '../errores.js';

export interface TipoDocumento {
  id: string;
  modulo: string;
  codigo: string;
  estado_inicial: number | null;
}

/** Busca un tipo de documento por módulo y código; falla con un mensaje claro si no está configurado. */
export async function tipoDocumento(trx: Trx, modulo: string, codigo: string): Promise<TipoDocumento> {
  const r = await sql<TipoDocumento>`
    select id, modulo, codigo, estado_inicial from erp.sis_tipos_documento
    where modulo = ${modulo} and codigo = ${codigo} and activo`.execute(trx);
  const t = r.rows[0];
  if (!t) throw new ErrorNegocio(400, `Falta configurar el tipo de documento ${modulo}/${codigo}.`);
  return t;
}

export async function tipoDocumentoPorId(trx: Trx, id: string): Promise<TipoDocumento> {
  const r = await sql<TipoDocumento>`
    select id, modulo, codigo, estado_inicial from erp.sis_tipos_documento where id = ${id}`.execute(trx);
  if (!r.rows[0]) throw new ErrorNegocio(400, 'El tipo de documento no existe.');
  return r.rows[0];
}

/** Siguiente número de un documento, con bloqueo de fila. */
export async function numerar(trx: Trx, companiaId: string, tipoDocumentoId: string, anio = 0): Promise<string> {
  return siguienteNumero(trx, companiaId, tipoDocumentoId, anio);
}

export function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}
