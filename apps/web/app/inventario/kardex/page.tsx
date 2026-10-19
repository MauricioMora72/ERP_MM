'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Marco } from '@/componentes/Marco';
import { Seleccion } from '@/componentes/Seleccion';
import { api, ErrorApi } from '@/lib/api';
import { descargarCsv } from '@/lib/csv';
import { cantidad, dinero, fecha, hoyIso } from '@/lib/formato';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function Kardex() {
  const params = useSearchParams();
  const [articulo, setArticulo] = useState<string | null>(params.get('articulo'));
  const [bodega, setBodega] = useState<string | null>(params.get('bodega'));
  const [desde, setDesde] = useState(`${new Date().getFullYear()}-01-01`);
  const [hasta, setHasta] = useState(hoyIso());
  const [d, setD] = useState<Json | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setD(null);
    setError(null);
    if (!articulo) return;
    const q = new URLSearchParams({ articuloId: articulo, desde, hasta });
    if (bodega) q.set('unidadNegocioId', bodega);
    api<Json>(`/api/inventario/kardex?${q}`).then(setD).catch((e) => setError(e instanceof ErrorApi ? e.message : 'Ocurrió un error.'));
  }, [articulo, bodega, desde, hasta]);

  return (
    <>
      <div className="barra">
        <h1>Consulta de kardex</h1>
        {d && <button className="secundario" onClick={() => descargarCsv(`kardex-${desde}-${hasta}.csv`,
          ['Fecha', 'Documento', 'Número', 'Bodega', 'Lote', 'Cantidad', 'Costo unitario', 'Costo total', 'Saldo cantidad', 'Saldo valor'],
          d.movimientos.map((m: Json) => [m.fecha, m.tipo_descripcion, m.numero_documento, m.bodega, m.lote ?? '', m.cantidad, m.costo_unitario, m.costo_total, m.saldo_cantidad, m.saldo_valor]))}>Descargar CSV</button>}
      </div>
      <div className="linea-form" style={{ marginBottom: 14 }}>
        <Seleccion id="kx-articulo" etiqueta="Artículo *" referencia="articulos" valor={articulo} onCambio={setArticulo} requerido />
        <Seleccion id="kx-bodega" etiqueta="Bodega (vacío: todas)" referencia="unidades-negocio" valor={bodega} onCambio={setBodega} />
        <label>Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
        <label>Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
      </div>
      {error && <p className="aviso error">{error}</p>}
      {d && (
        <table className="lista compacta">
          <thead><tr><th>Fecha</th><th>Documento</th><th>Número</th><th>Bodega</th><th>Lote</th><th className="numero">Cantidad</th><th className="numero">Costo unitario</th>
            <th className="numero">Costo total</th><th className="numero">Saldo</th><th className="numero">Valor</th><th>Asiento</th></tr></thead>
          <tbody>
            <tr><td colSpan={8}>Saldo inicial</td><td className="numero">{cantidad(d.saldoInicial.cantidad)}</td><td className="numero">{dinero(d.saldoInicial.valor)}</td><td></td></tr>
            {d.movimientos.map((m: Json) => (
              <tr key={m.id}>
                <td>{fecha(m.fecha)}</td><td>{m.tipo_descripcion}</td><td>{m.numero_documento}</td><td>{m.bodega}</td><td>{m.lote ?? ''}</td>
                <td className="numero">{cantidad(m.cantidad)}</td><td className="numero">{dinero(m.costo_unitario)}</td><td className="numero">{dinero(m.costo_total)}</td>
                <td className="numero">{cantidad(m.saldo_cantidad)}</td><td className="numero">{dinero(m.saldo_valor)}</td><td>{m.asiento ?? ''}</td>
              </tr>
            ))}
            {d.movimientos.length === 0 && <tr><td colSpan={11} className="tenue">Sin movimientos en el rango.</td></tr>}
          </tbody>
          <tfoot><tr><td colSpan={8}>Saldo final</td><td className="numero">{cantidad(d.saldoFinal.cantidad)}</td><td className="numero">{dinero(d.saldoFinal.valor)}</td><td></td></tr></tfoot>
        </table>
      )}
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <Suspense fallback={<p className="cargando">Cargando…</p>}>
        <Kardex />
      </Suspense>
    </Marco>
  );
}
