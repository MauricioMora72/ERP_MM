import { sql, type Trx } from '@erp/db';
import { ErrorNegocio } from '../errores.js';

export type Fase =
  | 'REGISTRADA'
  | 'PROGRAMADA'
  | 'EJECUCION'
  | 'TERMINADA'
  | 'REVISADA'
  | 'FACTURADA'
  | 'CERRADA'
  | 'CANCELADA'
  | 'APROBACION'
  | 'APROBADA'
  | 'RECIBIDA'
  | 'RETENIDA'
  | 'DESPACHADA';

export interface Estado {
  estado: number;
  descripcion: string;
  estado_siguiente: number | null;
  estados_alternos: number[] | null;
  fase: Fase | null;
}

/** Estados configurados para un tipo de documento. La lógica trabaja por fase, nunca por número. */
export async function estadosDe(trx: Trx, tipoDocumentoId: string): Promise<Estado[]> {
  const r = await sql<Estado>`
    select estado, descripcion, estado_siguiente, estados_alternos, fase
    from erp.sis_flujos_estado where tipo_documento_id = ${tipoDocumentoId} order by estado`.execute(trx);
  if (r.rows.length === 0) throw new ErrorNegocio(400, 'El tipo de documento no tiene flujo de estados configurado.');
  return r.rows;
}

export function estadoDeFase(estados: Estado[], fase: Fase): Estado {
  const e = estados.find((x) => x.fase === fase);
  if (!e) throw new ErrorNegocio(400, `El flujo de estados no tiene un estado para la fase ${fase}.`);
  return e;
}

export function faseDe(estados: Estado[], estado: number): Fase | null {
  return estados.find((x) => x.estado === estado)?.fase ?? null;
}

/** Estados a los que se puede pasar desde el actual: el siguiente y los alternos configurados. */
export function siguientesPermitidos(estados: Estado[], actual: number): Estado[] {
  const e = estados.find((x) => x.estado === actual);
  if (!e) return [];
  const destinos = new Set<number>([...(e.estado_siguiente != null ? [e.estado_siguiente] : []), ...(e.estados_alternos ?? [])]);
  return estados.filter((x) => destinos.has(x.estado));
}

/** Estado de una línea de documento: el último alcanzado y el siguiente esperado. */
export interface EstadoLinea {
  ultimo: number;
  siguiente: number;
}

/** Arma el par último/siguiente para dejar una línea en el estado indicado. */
export function estadoLinea(estados: Estado[], estado: number): EstadoLinea {
  const e = estados.find((x) => x.estado === estado);
  if (!e) throw new ErrorNegocio(400, `El estado ${estado} no existe en el flujo.`);
  return { ultimo: e.estado, siguiente: e.estado_siguiente ?? e.estado };
}

/**
 * Lleva una línea a la fase que resulta de una acción del sistema (recibir, despachar, facturar).
 * La acción manda, como en los ERP de referencia: basta con que el estado de destino exista y esté adelante.
 */
export function avanzarPorAccion(estados: Estado[], actual: number, fase: Fase): EstadoLinea {
  const destino = estadoDeFase(estados, fase);
  if (destino.estado < actual) throw new ErrorNegocio(400, `La línea ya pasó la fase ${fase.toLowerCase()}.`);
  return estadoLinea(estados, destino.estado);
}

/** Cambio manual de estado: solo al siguiente o a un alterno configurado. */
export function cambioManual(estados: Estado[], actual: number, destino: number): Estado {
  const e = siguientesPermitidos(estados, actual).find((x) => x.estado === destino);
  if (!e) throw new ErrorNegocio(400, `No se puede pasar del estado ${actual} al ${destino}.`);
  return e;
}
