'use client';

import { useEffect, useState } from 'react';
import { Referencia } from '@/componentes/LineasDocumento';
import { Marco } from '@/componentes/Marco';
import { Seleccion } from '@/componentes/Seleccion';
import { api, ErrorApi } from '@/lib/api';
import { cantidad, fecha } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

interface Linea { articuloId: string | null; cantidad: string; loteId: string | null; lotes: Json[] }

function NuevaTransferencia({ onHecha }: { onHecha: (t: string) => void }) {
  const [origen, setOrigen] = useState<string | null>(null);
  const [destino, setDestino] = useState<string | null>(null);
  const [observacion, setObservacion] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([{ articuloId: null, cantidad: '', loteId: null, lotes: [] }]);
  const [error, setError] = useState<string | null>(null);

  async function setArticulo(i: number, articuloId: string | null) {
    const lotes = articuloId && origen ? await api<Json[]>(`/api/inventario/lotes?articuloId=${articuloId}&unidadNegocioId=${origen}`).catch(() => []) : [];
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, articuloId, loteId: null, lotes } : l)));
  }
  const set = (i: number, c: Partial<Linea>) => setLineas(lineas.map((l, j) => (j === i ? { ...l, ...c } : l)));

  async function grabar() {
    setError(null);
    try {
      const r = await api<Json>('/api/inventario/transferencias', {
        metodo: 'POST',
        cuerpo: { origenId: origen, destinoId: destino, observacion: observacion || null, lineas: lineas.filter((l) => l.articuloId).map((l) => ({ articuloId: l.articuloId, cantidad: l.cantidad, loteId: l.loteId })) },
      });
      onHecha(`Transferencia ${r.numero} registrada con su kardex y su asiento.`);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'Ocurrió un error.');
    }
  }

  return (
    <section className="panel">
      <h2>Nueva transferencia</h2>
      {error && <p className="aviso error">{error}</p>}
      <div className="linea-form" style={{ marginTop: 0 }}>
        <Seleccion id="tr-origen" etiqueta="Bodega de origen *" referencia="unidades-negocio" valor={origen} onCambio={setOrigen} requerido />
        <Seleccion id="tr-destino" etiqueta="Bodega de destino *" referencia="unidades-negocio" valor={destino} onCambio={setDestino} requerido />
        <label style={{ flex: 1 }}>Observación<input type="text" style={{ width: '100%' }} value={observacion} onChange={(e) => setObservacion(e.target.value)} /></label>
      </div>
      <table className="lista edicion compacta" style={{ marginTop: 10 }}>
        <thead><tr><th>Artículo</th><th>Lote (vacío: el que vence primero)</th><th className="numero">Cantidad</th><th></th></tr></thead>
        <tbody>
          {lineas.map((l, i) => (
            <tr key={i}>
              <td><Referencia id={`tr-a-${i}`} entidad="articulos" valor={l.articuloId} onCambio={(v) => void setArticulo(i, v)} /></td>
              <td>
                <select value={l.loteId ?? ''} onChange={(e) => set(i, { loteId: e.target.value || null })} aria-label="Lote" disabled={!l.lotes.length}>
                  <option value="">{l.lotes.length ? 'Automático' : 'Sin lote'}</option>
                  {l.lotes.map((x) => <option key={x.id} value={x.id}>{x.lote} · vence {fecha(x.fecha_vencimiento)} · {cantidad(x.en_mano)}</option>)}
                </select>
              </td>
              <td><input type="text" inputMode="decimal" className="numero" value={l.cantidad} onChange={(e) => set(i, { cantidad: e.target.value })} aria-label={`Cantidad ${i + 1}`} /></td>
              <td>{lineas.length > 1 && <button type="button" className="enlace" onClick={() => setLineas(lineas.filter((_, j) => j !== i))}>Quitar</button>}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={4}><button type="button" className="secundario" onClick={() => setLineas([...lineas, { articuloId: null, cantidad: '', loteId: null, lotes: [] }])}>Agregar línea</button></td></tr></tfoot>
      </table>
      <div className="acciones"><button onClick={grabar}>Registrar transferencia</button></div>
    </section>
  );
}

function Transferencias() {
  const { puede } = useSesion();
  const [filas, setFilas] = useState<Json[] | null>(null);
  const [nueva, setNueva] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<Json | null>(null);
  const cargar = () => api<Json[]>('/api/inventario/documentos?tipo=TR').then(setFilas).catch(() => setFilas([]));
  useEffect(() => {
    void cargar();
  }, []);
  return (
    <>
      <div className="barra">
        <h1>Transferencias entre bodegas</h1>
        {puede('inventario', 'CREAR') && <button onClick={() => setNueva(!nueva)}>{nueva ? 'Cerrar' : 'Nueva transferencia'}</button>}
      </div>
      {aviso && <p className="aviso exito">{aviso}</p>}
      {nueva && <NuevaTransferencia onHecha={(t) => { setAviso(t); setNueva(false); void cargar(); }} />}
      <table className="lista">
        <thead><tr><th>Número</th><th>Fecha</th><th>Origen</th><th>Destino</th><th className="numero">Líneas</th><th>Observación</th></tr></thead>
        <tbody>
          {filas?.map((f) => (
            <tr key={f.id} onClick={() => api<Json>(`/api/inventario/documentos/${f.id}`).then(setAbierta)}>
              <td>{f.numero}</td><td>{fecha(f.fecha)}</td><td>{f.bodega}</td><td>{f.destino}</td><td className="numero">{f.lineas}</td><td>{f.observacion ?? ''}</td>
            </tr>
          ))}
          {filas && filas.length === 0 && <tr><td colSpan={6} className="tenue">No hay transferencias.</td></tr>}
        </tbody>
      </table>
      {abierta && (
        <section className="panel" style={{ marginTop: 16 }}>
          <h2>Transferencia {abierta.documento.numero}: {abierta.documento.bodega} a {abierta.documento.destino}</h2>
          <table className="lista compacta">
            <thead><tr><th>Línea</th><th>Artículo</th><th>Descripción</th><th>Lote</th><th className="numero">Cantidad</th></tr></thead>
            <tbody>{abierta.lineas.map((l: Json) => <tr key={l.id}><td>{l.linea}</td><td>{l.articulo}</td><td>{l.descripcion}</td><td>{l.lote ?? (l.lote_id ? '' : 'Automático')}</td><td className="numero">{cantidad(l.cantidad)}</td></tr>)}</tbody>
          </table>
        </section>
      )}
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <Transferencias />
    </Marco>
  );
}
