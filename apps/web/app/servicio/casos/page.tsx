'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Marco } from '@/componentes/Marco';
import { Seleccion } from '@/componentes/Seleccion';
import { api, ErrorApi } from '@/lib/api';
import { fechaHora } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ESTADOS_CASO: Record<string, string> = {
  ABIERTO: 'Abierto',
  EN_PROCESO: 'En proceso',
  ESPERA_CLIENTE: 'En espera del cliente',
  RESUELTO: 'Resuelto',
  CERRADO: 'Cerrado',
};

function NuevoCaso({ onCreado }: { onCreado: (id: string) => void }) {
  const [d, setD] = useState<Json>({ prioridad: 'MEDIA' });
  const [error, setError] = useState<string | null>(null);
  const set = (k: string) => (v: string | null) => setD((x) => ({ ...x, [k]: v }));
  async function crear(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await api<{ id: string }>('/api/srv/casos', { metodo: 'POST', cuerpo: d });
      onCreado(r.id);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'Ocurrió un error.');
    }
  }
  return (
    <form className="panel" onSubmit={crear}>
      <h2>Nuevo caso</h2>
      {error && <p className="aviso error">{error}</p>}
      <div className="linea-form">
        <Seleccion id="caso-cliente" etiqueta="Cliente o paciente *" referencia="direcciones" valor={d.clienteId} onCambio={set('clienteId')} requerido />
        <Seleccion id="caso-objeto" etiqueta="Objeto atendido" referencia="objetos" valor={d.objetoId} onCambio={set('objetoId')} />
        <Seleccion id="caso-prioridad" etiqueta="Prioridad *" catalogo={{ modulo: 'SRV', codigo: 'PRIORIDAD' }} valor={d.prioridad} onCambio={set('prioridad')} requerido />
        <Seleccion id="caso-canal" etiqueta="Canal" catalogo={{ modulo: 'SRV', codigo: 'CANAL' }} valor={d.canal} onCambio={set('canal')} />
        <Seleccion id="caso-tipo" etiqueta="Tipo" catalogo={{ modulo: 'SRV', codigo: 'TIPO_CASO' }} valor={d.tipo} onCambio={set('tipo')} />
        <Seleccion id="caso-asignado" etiqueta="Responsable" referencia="recursos" valor={d.asignadoId} onCambio={set('asignadoId')} />
      </div>
      <div className="linea-form">
        <label>Asunto *<input type="text" className="ancho" value={d.asunto ?? ''} onChange={(e) => set('asunto')(e.target.value)} required /></label>
        <label style={{ flex: 1 }}>Descripción<input type="text" style={{ width: '100%' }} value={d.descripcion ?? ''} onChange={(e) => set('descripcion')(e.target.value)} /></label>
        <button type="submit">Abrir caso</button>
      </div>
    </form>
  );
}

function Casos() {
  const router = useRouter();
  const { puede } = useSesion();
  const [estado, setEstado] = useState('');
  const [buscar, setBuscar] = useState('');
  const [filas, setFilas] = useState<Json[] | null>(null);
  const [nuevo, setNuevo] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const q = new URLSearchParams();
      if (estado) q.set('estado', estado);
      if (buscar) q.set('buscar', buscar);
      api<Json[]>(`/api/srv/casos?${q}`).then(setFilas).catch(() => setFilas([]));
    }, 250);
    return () => clearTimeout(t);
  }, [estado, buscar]);

  return (
    <>
      <div className="barra">
        <h1>Mesa de ayuda</h1>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado">
          <option value="">Todos</option>
          {Object.entries(ESTADOS_CASO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        <input type="text" placeholder="Buscar asunto, cliente o número…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        {puede('srv-casos', 'CREAR') && <button onClick={() => setNuevo(!nuevo)}>{nuevo ? 'Cerrar' : 'Nuevo caso'}</button>}
      </div>
      {nuevo && <NuevoCaso onCreado={(id) => router.push(`/servicio/casos/${id}`)} />}
      <table className="lista">
        <thead>
          <tr><th>Número</th><th>Asunto</th><th>Cliente</th><th>Prioridad</th><th>Estado</th><th>Compromiso</th><th>Responsable</th><th>Orden</th></tr>
        </thead>
        <tbody>
          {filas?.map((f) => (
            <tr key={f.id} onClick={() => router.push(`/servicio/casos/${f.id}`)}>
              <td>{f.numero}</td><td>{f.asunto}</td><td>{f.cliente}</td><td>{f.prioridad}</td>
              <td>{ESTADOS_CASO[f.estado]}</td>
              <td>{fechaHora(f.fecha_compromiso)} {f.vencido && <span className="etiqueta alerta">Vencido</span>}</td>
              <td>{f.asignado ?? '-'}</td><td>{f.orden_numero ?? '-'}</td>
            </tr>
          ))}
          {filas && filas.length === 0 && <tr><td colSpan={8} className="tenue">No hay casos.</td></tr>}
        </tbody>
      </table>
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <Casos />
    </Marco>
  );
}
