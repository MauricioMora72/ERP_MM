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
