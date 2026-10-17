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
  | 'CANCELADA';

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
