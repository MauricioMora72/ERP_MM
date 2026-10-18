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

const TIPOS: Record<string, string> = { OV: 'Orden de venta', CO: 'Cotización' };

function NuevaVenta({ onCreada }: { onCreada: (id: string) => void }) {
  const [tipo, setTipo] = useState('OV');
  const [cliente, setCliente] = useState<string | null>(null);
  const [sucursal, setSucursal] = useState<string | null>(null);
  const [referencia, setReferencia] = useState('');
  const [observacion, setObservacion] = useState('');
  const [lineas, setLineas] = useState<LineaEditable[]>([lineaVacia()]);
  const [error, setError] = useState<string | null>(null);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await api<{ id: string }>('/api/ven/ordenes', {
        metodo: 'POST',
        cuerpo: {
          tipo, clienteId: cliente, unidadNegocioId: sucursal, referencia: referencia || null, observacion: observacion || null,
          lineas: lineas.filter((l) => l.articuloId).map((l) => ({
            articuloId: l.articuloId, descripcion: l.descripcion || null, cantidad: l.cantidad, precio: l.valor || null, descuentoPorcentaje: l.descuento || null,
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
      <h2>Nueva cotización u orden de venta</h2>
      {error && <p className="aviso error">{error}</p>}
      <div className="linea-form" style={{ marginTop: 0 }}>
        <label>Documento
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {Object.entries(TIPOS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        <Seleccion id="ov-cliente" etiqueta="Cliente *" referencia="direcciones" valor={cliente} onCambio={setCliente} requerido />
        <Seleccion id="ov-sucursal" etiqueta="Sucursal y bodega *" referencia="unidades-negocio" valor={sucursal} onCambio={setSucursal} requerido />
        <label>Orden de compra del cliente<input type="text" value={referencia} onChange={(e) => setReferencia(e.target.value)} /></label>
        <label style={{ flex: 1 }}>Observación<input type="text" style={{ width: '100%' }} value={observacion} onChange={(e) => setObservacion(e.target.value)} /></label>
      </div>
      <p className="tenue">El precio vacío se toma de la lista de precios del cliente. La orden revisa el crédito y compromete las existencias al grabar.</p>
      <LineasDocumento modo="venta" lineas={lineas} onCambio={setLineas} />
      <div className="acciones"><button type="submit">Grabar {TIPOS[tipo]?.toLowerCase()}</button></div>
    </form>
  );
}

function Ventas() {
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
      api<Json[]>(`/api/ven/ordenes?${q}`).then(setFilas).catch(() => setFilas([]));
    }, 250);
    return () => clearTimeout(t);
  }, [tipo, buscar, pendientes]);

  return (
    <>
      <div className="barra">
        <h1>Cotizaciones y órdenes de venta</h1>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Documento">
          <option value="">Todos</option>
          {Object.entries(TIPOS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        <label className="tenue"><input type="checkbox" checked={pendientes} onChange={(e) => setPendientes(e.target.checked)} /> Solo pendientes</label>
        <input type="text" placeholder="Buscar cliente, número o referencia…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        {puede('ventas', 'CREAR') && <button onClick={() => setNueva(!nueva)}>{nueva ? 'Cerrar' : 'Nueva'}</button>}
      </div>
      {nueva && <NuevaVenta onCreada={(id) => router.push(`/ventas/ordenes/${id}`)} />}
      <table className="lista">
        <thead>
          <tr><th>Documento</th><th>Número</th><th>Fecha</th><th>Cliente</th><th>Referencia</th><th>Estado más atrasado</th><th className="numero">Total sin IVA</th></tr>
        </thead>
        <tbody>
          {filas?.map((f) => (
            <tr key={f.id} onClick={() => router.push(`/ventas/ordenes/${f.id}`)}>
              <td>{TIPOS[f.tipo]}</td><td>{f.numero}</td><td>{fecha(f.fecha)}</td><td>{f.cliente}</td><td>{f.referencia ?? '-'}</td>
              <td>{f.estado} {f.estado_descripcion} {f.retenida && <span className="etiqueta alerta">Crédito</span>}</td><td className="numero">{dinero(f.total)}</td>
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
      <Ventas />
    </Marco>
  );
}
