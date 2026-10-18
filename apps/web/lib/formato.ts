export function dinero(v: unknown): string {
  const n = Number(v ?? 0);
  return n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function cantidad(v: unknown): string {
  const n = Number(v ?? 0);
  return n.toLocaleString('es-EC', { maximumFractionDigits: 4 });
}

export function fechaHora(v: unknown): string {
  if (!v) return '-';
  return new Date(String(v)).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' });
}

export const COBERTURAS: Record<string, string> = {
  FACTURABLE: 'Facturable',
  GARANTIA: 'Garantía',
  CONTRATO: 'Contrato',
  INTERNO: 'Interno',
};

/** Fecha sin hora (AAAA-MM-DD) en formato local corto. */
export function fecha(v: unknown): string {
  if (!v) return '-';
  const [a, m, d] = String(v).slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : String(v);
}

export function hoyIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Color de la etiqueta de una fase de línea. */
export const FASES_LINEA: Record<string, string> = {
  REGISTRADA: 'Registrada',
  APROBACION: 'En aprobación',
  APROBADA: 'Aprobada',
  RETENIDA: 'Retenida por crédito',
  RECIBIDA: 'Recibida',
  DESPACHADA: 'Despachada',
  FACTURADA: 'Facturada',
  CERRADA: 'Cerrada',
  CANCELADA: 'Cancelada',
};
