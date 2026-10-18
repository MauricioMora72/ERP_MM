'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { LineasDocumento, lineaVacia, type LineaEditable } from '@/componentes/LineasDocumento';
import { Marco } from '@/componentes/Marco';
import { Seleccion } from '@/componentes/Seleccion';
import { api, ErrorApi } from '@/lib/api';
import { dinero, fecha } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TIPOS: Record<string, string> = { OC: 'Orden de compra', RQ: 'Requisición' };

function NuevaCompra({ onCreada }: { onCreada: (id: string) => void }) {
  const [tipo, setTipo] = useState('OC');
  const [proveedor, setProveedor] = useState<string | null>(null);
  const [sucursal, setSucursal] = useState<string | null>(null);
  const [requerida, setRequerida] = useState('');
  const [observacion, setObservacion] = useState('');
  const [lineas, setLineas] = useState<LineaEditable[]>([lineaVacia()]);
  const [error, setError] = useState<string | null>(null);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await api<{ id: string }>('/api/com/ordenes', {
        metodo: 'POST',
        cuerpo: {
          tipo, proveedorId: proveedor, unidadNegocioId: sucursal, fechaRequerida: requerida || null, observacion: observacion || null,
          lineas: lineas.filter((l) => l.articuloId || l.cuentaId).map((l) => ({
            articuloId: l.articuloId, cuentaId: l.cuentaId, descripcion: l.descripcion || null, cantidad: l.cantidad, costoUnitario: l.valor || null,
          })),
        },
      });
      onCreada(r.id);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'Ocurrió un error.');
    }
  }

  return (
    <form className="panel" onSubmit={crear}>
      <h2>Nueva requisición u orden de compra</h2>
      {error && <p className="aviso error">{error}</p>}
      <div className="linea-form" style={{ marginTop: 0 }}>
        <label>Documento
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {Object.entries(TIPOS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        <Seleccion id="oc-proveedor" etiqueta={tipo === 'OC' ? 'Proveedor *' : 'Proveedor sugerido'} referencia="direcciones" valor={proveedor} onCambio={setProveedor} requerido={tipo === 'OC'} />
        <Seleccion id="oc-sucursal" etiqueta="Sucursal o bodega *" referencia="unidades-negocio" valor={sucursal} onCambio={setSucursal} requerido />
        <label>Fecha requerida<input type="date" value={requerida} onChange={(e) => setRequerida(e.target.value)} /></label>
        <label style={{ flex: 1 }}>Observación<input type="text" style={{ width: '100%' }} value={observacion} onChange={(e) => setObservacion(e.target.value)} /></label>
      </div>
      <p className="tenue">Si deja el costo vacío se usa el costo promedio del artículo en la bodega. Una línea sin artículo necesita una cuenta de gasto y una descripción.</p>
      <LineasDocumento modo="compra" lineas={lineas} onCambio={setLineas} />
      <div className="acciones"><button type="submit">Grabar {TIPOS[tipo]?.toLowerCase()}</button></div>
    </form>
  );
}

function Compras() {
  const router = useRouter();
  const { puede } = useSesion();
  const [tipo, setTipo] = useState('');
  const [pendientes, setPendientes] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [filas, setFilas] = useState<Json[] | null>(null);
  const [nueva, setNueva] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const q = new URLSearchParams();
      if (tipo) q.set('tipo', tipo);
      if (buscar) q.set('buscar', buscar);
      if (pendientes) q.set('pendientes', '1');
      api<Json[]>(`/api/com/ordenes?${q}`).then(setFilas).catch(() => setFilas([]));
    }, 250);
    return () => clearTimeout(t);
  }, [tipo, buscar, pendientes]);

  return (
    <>
      <div className="barra">
        <h1>Requisiciones y órdenes de compra</h1>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Documento">
          <option value="">Todos</option>
          {Object.entries(TIPOS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        <label className="tenue"><input type="checkbox" checked={pendientes} onChange={(e) => setPendientes(e.target.checked)} /> Solo pendientes</label>
        <input type="text" placeholder="Buscar proveedor o número…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        {puede('compras', 'CREAR') && <button onClick={() => setNueva(!nueva)}>{nueva ? 'Cerrar' : 'Nueva'}</button>}
      </div>
      {nueva && <NuevaCompra onCreada={(id) => router.push(`/compras/ordenes/${id}`)} />}
      <table className="lista">
        <thead>
          <tr><th>Documento</th><th>Número</th><th>Fecha</th><th>Proveedor</th><th>Sucursal</th><th>Estado más atrasado</th><th className="numero">Total sin IVA</th></tr>
        </thead>
        <tbody>
          {filas?.map((f) => (
            <tr key={f.id} onClick={() => router.push(`/compras/ordenes/${f.id}`)}>
              <td>{TIPOS[f.tipo]}</td><td>{f.numero}</td><td>{fecha(f.fecha)}</td><td>{f.proveedor ?? '-'}</td><td>{f.sucursal}</td>
              <td>{f.estado} {f.estado_descripcion}</td><td className="numero">{dinero(f.total)}</td>
            </tr>
          ))}
          {filas && filas.length === 0 && <tr><td colSpan={7} className="tenue">No hay documentos.</td></tr>}
        </tbody>
      </table>
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <Compras />
    </Marco>
  );
}
