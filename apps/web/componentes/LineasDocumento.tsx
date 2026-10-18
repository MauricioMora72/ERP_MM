'use client';

import type { Campo } from '@erp/shared';
import { Entrada } from './Campos';

/** Lista desplegable sin etiqueta, para usar dentro de una tabla. */
export function Referencia({
  id, entidad, catalogo, valor, onCambio, requerido,
}: {
  id: string;
  entidad?: string;
  catalogo?: { modulo: string; codigo: string };
  valor: string | null | undefined;
  onCambio: (v: string | null) => void;
  requerido?: boolean;
}) {
  const campo: Campo = { nombre: id, etiqueta: id, tipo: entidad ? 'referencia' : 'catalogo', referencia: entidad, catalogo, requerido };
  return <Entrada campo={campo} valor={valor} onCambio={(v) => onCambio(v == null || v === '' ? null : String(v))} />;
}

export interface LineaEditable {
  articuloId: string | null;
  descripcion: string;
  cuentaId: string | null;
  cantidad: string;
  valor: string;
  descuento: string;
}

export const lineaVacia = (): LineaEditable => ({ articuloId: null, descripcion: '', cuentaId: null, cantidad: '1', valor: '', descuento: '' });

/**
 * Líneas de un documento nuevo. En compras se ingresa costo y se permite una cuenta de gasto en lugar de artículo;
 * en ventas se ingresa precio (vacío: el de lista) y descuento en porcentaje.
 */
export function LineasDocumento({
  modo, lineas, onCambio,
}: {
  modo: 'compra' | 'venta';
  lineas: LineaEditable[];
  onCambio: (l: LineaEditable[]) => void;
}) {
  const set = (i: number, k: keyof LineaEditable, v: string | null) => onCambio(lineas.map((l, j) => (j === i ? { ...l, [k]: v ?? (k === 'articuloId' || k === 'cuentaId' ? null : '') } : l)));
  return (
    <table className="lista edicion compacta">
      <thead>
        <tr>
          <th>Artículo o servicio</th>
          {modo === 'compra' && <th>O cuenta de gasto</th>}
          <th>Descripción (vacío: la del artículo)</th>
          <th className="numero">Cantidad</th>
          <th className="numero">{modo === 'compra' ? 'Costo unitario' : 'Precio (vacío: lista)'}</th>
          {modo === 'venta' && <th className="numero">Descuento %</th>}
          <th></th>
        </tr>
      </thead>
      <tbody>
        {lineas.map((l, i) => (
          <tr key={i}>
            <td><Referencia id={`l${i}-articulo`} entidad="articulos" valor={l.articuloId} onCambio={(v) => set(i, 'articuloId', v)} /></td>
            {modo === 'compra' && <td><Referencia id={`l${i}-cuenta`} entidad="cuentas" valor={l.cuentaId} onCambio={(v) => set(i, 'cuentaId', v)} /></td>}
            <td><input type="text" value={l.descripcion} onChange={(e) => set(i, 'descripcion', e.target.value)} aria-label="Descripción" /></td>
            <td><input type="text" inputMode="decimal" className="numero" value={l.cantidad} onChange={(e) => set(i, 'cantidad', e.target.value)} aria-label="Cantidad" /></td>
            <td><input type="text" inputMode="decimal" className="numero" value={l.valor} onChange={(e) => set(i, 'valor', e.target.value)} aria-label={modo === 'compra' ? 'Costo' : 'Precio'} /></td>
            {modo === 'venta' && <td><input type="text" inputMode="decimal" className="numero" value={l.descuento} onChange={(e) => set(i, 'descuento', e.target.value)} aria-label="Descuento" /></td>}
            <td>{lineas.length > 1 && <button type="button" className="enlace" onClick={() => onCambio(lineas.filter((_, j) => j !== i))}>Quitar</button>}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={modo === 'compra' ? 6 : 6}>
            <button type="button" className="secundario" onClick={() => onCambio([...lineas, lineaVacia()])}>Agregar línea</button>
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

/** Botones de cambio de estado: une los estados permitidos de todas las líneas. */
export function BotonesEstado({
  lineas, onCambiar, excluirFases,
}: {
  lineas: { estado_ultimo: number; siguientes: { estado: number; descripcion: string; fase: string | null }[] }[];
  onCambiar: (estado: number, descripcion: string) => void;
  excluirFases: string[];
}) {
  const mapa = new Map<number, { descripcion: string; fase: string | null; adelante: boolean }>();
  for (const l of lineas) {
    for (const s of l.siguientes) {
      if (excluirFases.includes(s.fase ?? '')) continue;
      mapa.set(s.estado, { descripcion: s.descripcion, fase: s.fase, adelante: s.estado > l.estado_ultimo && s.fase !== 'CANCELADA' });
    }
  }
  const lista = [...mapa.entries()].sort((a, b) => Number(b[1].adelante) - Number(a[1].adelante) || a[0] - b[0]);
  if (lista.length === 0) return null;
  return (
    <>
      {lista.map(([estado, s]) => (
        <button key={estado} className={s.adelante ? '' : 'secundario'} onClick={() => onCambiar(estado, s.descripcion)}>
          {s.adelante ? `Pasar a: ${s.descripcion}` : s.fase === 'CANCELADA' ? 'Cancelar las líneas pendientes' : `Regresar a: ${s.descripcion}`}
        </button>
      ))}
    </>
  );
}
