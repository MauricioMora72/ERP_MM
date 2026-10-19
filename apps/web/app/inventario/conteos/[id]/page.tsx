'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Marco } from '@/componentes/Marco';
import { Seleccion } from '@/componentes/Seleccion';
import { api, ErrorApi } from '@/lib/api';
import { cantidad, fecha } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function Conteo() {
  const { id } = useParams<{ id: string }>();
  const { puede } = useSesion();
  const [d, setD] = useState<Json | null>(null);
  const [contado, setContado] = useState<Record<string, string>>({});
  const [nuevo, setNuevo] = useState<{ articuloId: string | null; lote: string; vencimiento: string }>({ articuloId: null, lote: '', vencimiento: '' });
  const [mensaje, setMensaje] = useState<{ tipo: string; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    const r = await api<Json>(`/api/inventario/documentos/${id}`);
    setD(r);
    setContado(Object.fromEntries(r.lineas.map((l: Json) => [l.id, l.cantidad_contada == null ? '' : String(Number(l.cantidad_contada))])));
  }, [id]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function ejecutar(fn: () => Promise<unknown>, exito: string) {
    setMensaje(null);
    try {
      const r = await fn();
      setMensaje({ tipo: 'exito', texto: typeof r === 'string' ? r : exito });
      await cargar();
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ErrorApi ? e.message : 'Ocurrió un error.' });
    }
  }
  const guardar = () => api(`/api/inventario/conteos/${id}`, { metodo: 'PUT', cuerpo: { cantidades: Object.entries(contado).map(([lineaId, c]) => ({ lineaId, cantidad: c })) } });

  if (!d) return <p className="cargando">Cargando…</p>;
  const doc = d.documento;
  const abierto = doc.estado === 'ABIERTO' && puede('inventario', 'MODIFICAR');
  const diferencias = d.lineas.filter((l: Json) => contado[l.id] !== '' && contado[l.id] != null && Number(contado[l.id]) !== Number(l.cantidad_sistema)).length;

  return (
    <>
      <div className="barra">
        <h1>Conteo físico {doc.numero}</h1>
        <span className="etiqueta">{doc.estado === 'ABIERTO' ? 'Abierto' : 'Contabilizado'}</span>
        <Link className="boton secundario" href="/inventario/conteos">Volver</Link>
      </div>
      {mensaje && <p className={`aviso ${mensaje.tipo}`}>{mensaje.texto}</p>}
      <div className="datos">
        <div><span>Bodega</span>{doc.bodega}</div>
        <div><span>Fecha</span>{fecha(doc.fecha)}</div>
        <div><span>Líneas</span>{d.lineas.length}</div>
        {abierto && <div><span>Diferencias por ajustar</span>{diferencias}</div>}
      </div>
      <table className="lista edicion">
        <thead><tr><th>Línea</th><th>Artículo</th><th>Descripción</th><th>Lote</th><th className="numero">Sistema</th><th className="numero">Contado</th><th className="numero">{abierto ? 'Diferencia' : 'Ajuste'}</th></tr></thead>
        <tbody>
          {d.lineas.map((l: Json) => {
            const dif = contado[l.id] === '' ? null : Number(contado[l.id]) - Number(l.cantidad_sistema);
            return (
              <tr key={l.id}>
                <td>{l.linea}</td><td>{l.articulo}</td><td>{l.descripcion}</td><td>{l.lote ?? ''}</td><td className="numero">{cantidad(l.cantidad_sistema)}</td>
                <td>{abierto
                  ? <input type="text" inputMode="decimal" className="numero corto" value={contado[l.id] ?? ''} onChange={(e) => setContado({ ...contado, [l.id]: e.target.value })} aria-label={`Contado ${l.articulo}`} />
                  : <span className="numero">{l.cantidad_contada == null ? '-' : cantidad(l.cantidad_contada)}</span>}</td>
                <td className="numero">{abierto ? (dif == null ? '' : cantidad(dif)) : cantidad(l.cantidad)}</td>
              </tr>
            );
          })}
          {d.lineas.length === 0 && <tr><td colSpan={7} className="tenue">La bodega no tiene existencias; agregue los artículos que encuentre.</td></tr>}
        </tbody>
      </table>
      {abierto && (
        <>
          <div className="linea-form">
            <Seleccion id="cf-art" etiqueta="Agregar artículo encontrado" referencia="articulos" valor={nuevo.articuloId} onCambio={(v) => setNuevo({ ...nuevo, articuloId: v })} />
            <label>Lote<input type="text" className="corto" value={nuevo.lote} onChange={(e) => setNuevo({ ...nuevo, lote: e.target.value })} /></label>
            <label>Vencimiento<input type="date" value={nuevo.vencimiento} onChange={(e) => setNuevo({ ...nuevo, vencimiento: e.target.value })} /></label>
            <button className="secundario" disabled={!nuevo.articuloId} onClick={() => ejecutar(async () => {
              await guardar();
              await api(`/api/inventario/conteos/${id}/lineas`, { metodo: 'POST', cuerpo: { articuloId: nuevo.articuloId, lote: nuevo.lote || null, vencimiento: nuevo.vencimiento || null } });
              setNuevo({ articuloId: null, lote: '', vencimiento: '' });
            }, 'Artículo agregado al conteo.')}>Agregar</button>
          </div>
          <div className="acciones">
            <button className="secundario" onClick={() => ejecutar(guardar, 'Cantidades guardadas.')}>Guardar cantidades</button>
            <button onClick={() => ejecutar(async () => {
              await guardar();
              const r = await api<{ ajustadas: number }>(`/api/inventario/conteos/${id}/contabilizar`, { metodo: 'POST', cuerpo: {} });
              return `Conteo contabilizado: ${r.ajustadas} ajuste(s) con su kardex y su asiento.`;
            }, 'Conteo contabilizado.')}>Contabilizar conteo</button>
          </div>
        </>
      )}
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <Conteo />
    </Marco>
  );
}
