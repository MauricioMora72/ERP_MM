/** Descarga filas como CSV (separado por punto y coma, como lo abre Excel en español). */
export function descargarCsv(nombre: string, encabezados: string[], filas: (string | number | null | undefined)[][]): void {
  const celda = (v: string | number | null | undefined) => {
    const t = v == null ? '' : String(v);
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const texto = [encabezados, ...filas].map((f) => f.map(celda).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
