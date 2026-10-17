'use client';

import type { Campo } from '@erp/shared';
import { useCatalogo, useReferencias } from '@/lib/opciones';

export type Valor = string | number | boolean | null | undefined;

/** Control de entrada según el tipo del campo. */
export function Entrada({
  campo,
  valor,
  onCambio,
  bloqueado,
}: {
  campo: Campo;
  valor: Valor;
  onCambio: (v: Valor) => void;
  bloqueado?: boolean;
}) {
  const referencias = useReferencias(campo.tipo === 'referencia' ? campo.referencia : undefined);
  const catalogo = useCatalogo(campo.tipo === 'catalogo' ? campo.catalogo : undefined);
  const id = `campo-${campo.nombre}`;

  if (campo.tipo === 'booleano') {
    return (
      <input id={id} type="checkbox" checked={!!valor} disabled={bloqueado} onChange={(e) => onCambio(e.target.checked)} />
    );
  }
  const opciones =
    campo.tipo === 'referencia'
      ? referencias
      : campo.tipo === 'catalogo'
        ? catalogo
        : campo.tipo === 'opcion'
          ? (campo.opciones ?? []).map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }))
          : null;
  if (opciones) {
    return (
      <select id={id} value={valor == null ? '' : String(valor)} disabled={bloqueado} onChange={(e) => onCambio(e.target.value || null)}>
        <option value="">{campo.requerido ? 'Seleccione…' : '(ninguno)'}</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      id={id}
      type={campo.tipo === 'fecha' ? 'date' : campo.tipo === 'fechaHora' ? 'datetime-local' : 'text'}
      inputMode={campo.tipo === 'entero' || campo.tipo === 'decimal' ? 'decimal' : undefined}
      maxLength={campo.max}
      value={valor == null ? '' : campo.tipo === 'fechaHora' ? aLocal(String(valor)) : String(valor)}
      disabled={bloqueado}
      onChange={(e) => onCambio(e.target.value)}
    />
  );
}

/** Convierte una marca de tiempo a la hora local del navegador para un campo datetime-local. */
function aLocal(v: string): string {
  if (!v.includes('Z') && !/[+-]\d{2}:?\d{2}$/.test(v)) return v.slice(0, 16);
  const d = new Date(v);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Muestra un valor en la lista, resolviendo referencias y opciones a su texto. */
export function Celda({ campo, valor }: { campo: Campo; valor: unknown }) {
  const referencias = useReferencias(campo.tipo === 'referencia' ? campo.referencia : undefined);
  if (valor === null || valor === undefined || valor === '') return <span className="tenue">-</span>;
  if (campo.tipo === 'booleano') return <>{valor ? 'Sí' : 'No'}</>;
  if (campo.tipo === 'referencia') {
    return <>{referencias.find((o) => o.valor === valor)?.etiqueta ?? '…'}</>;
  }
  if (campo.tipo === 'opcion') {
    return <>{campo.opciones?.find((o) => o.valor === valor)?.etiqueta ?? String(valor)}</>;
  }
  if (campo.tipo === 'fecha') return <>{String(valor).slice(0, 10)}</>;
  if (campo.tipo === 'fechaHora') return <>{new Date(String(valor)).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' })}</>;
  return <>{String(valor)}</>;
}
