'use client';

import type { Campo } from '@erp/shared';
import { Entrada, type Valor } from './Campos';

/** Lista desplegable de otra entidad o de un catálogo, para formularios propios. */
export function Seleccion({
  etiqueta, referencia, catalogo, valor, onCambio, requerido, id,
}: {
  etiqueta: string;
  referencia?: string;
  catalogo?: { modulo: string; codigo: string };
  valor: Valor;
  onCambio: (v: string | null) => void;
  requerido?: boolean;
  id: string;
}) {
  const campo: Campo = {
    nombre: id,
    etiqueta,
    tipo: referencia ? 'referencia' : 'catalogo',
    referencia,
    catalogo,
    requerido,
  };
  return (
    <label>
      {etiqueta}
      <Entrada campo={campo} valor={valor} onCambio={(v) => onCambio(v == null || v === '' ? null : String(v))} />
    </label>
  );
}
