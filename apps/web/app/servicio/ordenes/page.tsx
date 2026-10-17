'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Marco } from '@/componentes/Marco';
import { Seleccion } from '@/componentes/Seleccion';
import { api, ErrorApi, type ListaPaginada } from '@/lib/api';
import { COBERTURAS, fechaHora } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';

interface Fila {
  id: string;
  numero: string;
  estado: number;
  estado_descripcion: string;
  fase: string;
  cobertura: string;
  fecha_solicitud: string;
  fecha_programada: string | null;
  tipo_orden: string;
  cliente: string;
  objeto: string | null;
}

interface CampoPropio {
  campo: string;
  etiqueta: string;
  tipo_dato: string;
  obligatorio: boolean;
}

const FASES: [string, string][] = [
  ['', 'Todas'],
  ['REGISTRADA', 'Registradas'],
  ['PROGRAMADA', 'Programadas'],
  ['EJECUCION', 'En ejecución'],
  ['TERMINADA', 'Terminadas'],
  ['REVISADA', 'Revisadas para cobro'],
  ['FACTURADA', 'Facturadas'],
  ['CERRADA', 'Cerradas'],
];

function NuevaOrden({ onCreada }: { onCreada: (id: string) => void }) {
  const [tipo, setTipo] = useState<string | null>(null);
  const [cliente, setCliente] = useState<string | null>(null);
  const [objeto, setObjeto] = useState<string | null>(null);
  const [tempario, setTempario] = useState<string | null>(null);
  const [descripcion, setDescripcion] = useState('');
  const [defs, setDefs] = useState<CampoPropio[]>([]);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});

  useEffect(() => {
    setDefs([]);
    if (!tipo) return;
    api<ListaPaginada>(`/api/e/campos-orden?tipo_orden_id=${tipo}&limite=100`).then((r) => setDefs(r.filas as unknown as CampoPropio[]));
  }, [tipo]);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setErrores({});
    try {
      const r = await api<{ id: string }>('/api/srv/ordenes', {
        metodo: 'POST',
        cuerpo: { tipoOrdenId: tipo, clienteId: cliente, objetoId: objeto, plantillaId: tempario, descripcion: descripcion || null, campos },
      });
      onCreada(r.id);
    } catch (err) {
      if (err instanceof ErrorApi) {
        setError(err.message);
        setErrores(err.campos ?? {});
      }
    }
  }

  return (
    <form className="panel" onSubmit={crear}>
      <h2>Nueva orden de servicio</h2>
      {error && <p className="aviso error">{error}</p>}
      <div className="linea-form">
        <Seleccion id="nueva-tipo" etiqueta="Tipo de orden *" referencia="tipos-orden" valor={tipo} onCambio={setTipo} requerido />
        <Seleccion id="nueva-cliente" etiqueta="Cliente o paciente *" referencia="direcciones" valor={cliente} onCambio={setCliente} requerido />
        <Seleccion id="nueva-objeto" etiqueta="Objeto atendido" referencia="objetos" valor={objeto} onCambio={setObjeto} />
        <Seleccion id="nueva-tempario" etiqueta="Tempario (vacío: el del tipo)" referencia="temparios" valor={tempario} onCambio={setTempario} />
      </div>
      <div className="linea-form">
        <label>
          Descripción
          <input type="text" className="ancho" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </label>
        {defs.map((d) => (
          <label key={d.campo}>
            {d.etiqueta}
            {d.obligatorio ? ' *' : ''}
            <input
              type={d.tipo_dato === 'FECHA' ? 'date' : 'text'}
              value={campos[d.campo] ?? ''}
              onChange={(e) => setCampos({ ...campos, [d.campo]: e.target.value })}
            />
            {errores[`campos.${d.campo}`] && <small className="aviso error">{errores[`campos.${d.campo}`]}</small>}
          </label>
        ))}
        <button type="submit">Crear orden</button>
      </div>
    </form>
  );
}

function Ordenes() {
  const router = useRouter();
  const { puede } = useSesion();
  const [fase, setFase] = useState('');
  const [buscar, setBuscar] = useState('');
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [nueva, setNueva] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const q = new URLSearchParams();
      if (fase) q.set('fase', fase);
      if (buscar) q.set('buscar', buscar);
      api<Fila[]>(`/api/srv/ordenes?${q}`).then(setFilas).catch(() => setFilas([]));
    }, 250);
    return () => clearTimeout(t);
  }, [fase, buscar]);

  return (
    <>
      <div className="barra">
        <h1>Órdenes de servicio</h1>
        <select value={fase} onChange={(e) => setFase(e.target.value)} aria-label="Fase">
          {FASES.map(([v, e]) => (
            <option key={v} value={v}>{e}</option>
          ))}
        </select>
        <input type="text" placeholder="Buscar cliente, objeto o número…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        {puede('srv-ordenes', 'CREAR') && (
          <button onClick={() => setNueva(!nueva)}>{nueva ? 'Cerrar' : 'Nueva orden'}</button>
        )}
      </div>
      {nueva && <NuevaOrden onCreada={(id) => router.push(`/servicio/ordenes/${id}`)} />}
      <table className="lista">
        <thead>
          <tr>
            <th>Número</th>
            <th>Tipo</th>
            <th>Cliente</th>
            <th>Objeto</th>
            <th>Estado</th>
            <th>Cobertura</th>
            <th>Solicitada</th>
          </tr>
        </thead>
        <tbody>
          {filas?.map((f) => (
            <tr key={f.id} onClick={() => router.push(`/servicio/ordenes/${f.id}`)}>
              <td>{f.numero}</td>
              <td>{f.tipo_orden}</td>
              <td>{f.cliente}</td>
              <td>{f.objeto ?? <span className="tenue">-</span>}</td>
              <td>{f.estado} {f.estado_descripcion}</td>
              <td>{COBERTURAS[f.cobertura]}</td>
              <td>{fechaHora(f.fecha_solicitud)}</td>
            </tr>
          ))}
          {filas && filas.length === 0 && (
            <tr>
              <td colSpan={7} className="tenue">No hay órdenes.</td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <Ordenes />
    </Marco>
  );
}
