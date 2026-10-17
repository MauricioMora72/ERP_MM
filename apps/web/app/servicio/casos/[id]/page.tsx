'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Marco } from '@/componentes/Marco';
import { Seleccion } from '@/componentes/Seleccion';
import { api, ErrorApi, type ListaPaginada } from '@/lib/api';
import { COBERTURAS, fechaHora } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ESTADOS: Record<string, string> = {
  ABIERTO: 'Abierto', EN_PROCESO: 'En proceso', ESPERA_CLIENTE: 'En espera del cliente', RESUELTO: 'Resuelto', CERRADO: 'Cerrado',
};

function Caso() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { puede } = useSesion();
  const [d, setD] = useState<Json | null>(null);
  const [nota, setNota] = useState('');
  const [solucion, setSolucion] = useState('');
  const [tipoOrden, setTipoOrden] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [defs, setDefs] = useState<Json[]>([]);
  const [campos, setCampos] = useState<Record<string, string>>({});

  useEffect(() => {
    setDefs([]);
    if (!tipoOrden) return;
    api<ListaPaginada>(`/api/e/campos-orden?tipo_orden_id=${tipoOrden}&limite=100`).then((r) => setDefs(r.filas));
  }, [tipoOrden]);

  const cargar = useCallback(() => api<Json>(`/api/srv/casos/${id}`).then(setD).catch((e) => setError(e instanceof ErrorApi ? e.message : 'Ocurrió un error.')), [id]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function enviar(ruta: string, cuerpo: object) {
    setError(null);
    setErrores({});
    try {
      const r = await api<Json>(ruta, { metodo: 'POST', cuerpo });
      await cargar();
      return r;
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'Ocurrió un error.');
      if (e instanceof ErrorApi) setErrores(e.campos ?? {});
      return null;
    }
  }

  if (!d) return error ? <p className="aviso error">{error}</p> : <p className="cargando">Cargando…</p>;
  const c = d.caso;
  const modificar = puede('srv-casos', 'MODIFICAR');
  const activo = !['RESUELTO', 'CERRADO'].includes(c.estado);

  return (
    <>
      <div className="barra">
        <h1>Caso {c.numero}: {c.asunto}</h1>
        <span className="etiqueta">{ESTADOS[c.estado]}</span>
        {c.vencido && <span className="etiqueta alerta">Vencido</span>}
        <Link className="boton secundario" href="/servicio/casos">Volver</Link>
      </div>
      {error && <p className="aviso error">{error}</p>}
      <div className="datos">
        <div><span>Cliente o paciente</span>{c.cliente}</div>
        <div><span>Objeto atendido</span>{c.objeto ?? '-'}</div>
        <div><span>Prioridad</span>{c.prioridad}</div>
        <div><span>Canal</span>{c.canal ?? '-'}</div>
        <div><span>Tipo</span>{c.tipo ?? '-'}</div>
        <div><span>Responsable</span>{c.asignado ?? '-'}</div>
        <div><span>Abierto</span>{fechaHora(c.fecha_apertura)}</div>
        <div><span>Compromiso de respuesta</span>{fechaHora(c.fecha_compromiso)}</div>
        <div><span>Descripción</span>{c.descripcion ?? '-'}</div>
        {c.solucion && <div><span>Solución</span>{c.solucion}</div>}
      </div>

      {modificar && d.transiciones.length > 0 && (
        <section className="panel">
          <h2>Avanzar el caso</h2>
          {d.transiciones.includes('RESUELTO') && (
            <label style={{ display: 'grid', gap: 4, marginBottom: 10 }}>
              Solución (obligatoria para resolver)
              <textarea value={solucion} onChange={(e) => setSolucion(e.target.value)} />
            </label>
          )}
          <div className="acciones" style={{ marginTop: 0 }}>
            {d.transiciones.map((t: string) => (
              <button key={t} className={t === 'RESUELTO' ? '' : 'secundario'} onClick={() => enviar(`/api/srv/casos/${id}/estado`, { estado: t, solucion: solucion || null })}>
                Pasar a: {ESTADOS[t]}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Órdenes de servicio</h2>
        {d.ordenes.map((o: Json) => (
          <p key={o.id}><Link href={`/servicio/ordenes/${o.id}`}>Orden {o.numero}</Link> · estado {o.estado} · {COBERTURAS[o.cobertura]}</p>
        ))}
        {d.ordenes.length === 0 && <p className="tenue">El caso aún no tiene orden de servicio.</p>}
        {activo && d.ordenes.length === 0 && puede('srv-ordenes', 'CREAR') && (
          <div className="linea-form">
            <Seleccion id="caso-tipo-orden" etiqueta="Tipo de orden" referencia="tipos-orden" valor={tipoOrden} onCambio={setTipoOrden} requerido />
            {defs.map((f) => (
              <label key={f.campo}>
                {f.etiqueta}{f.obligatorio ? ' *' : ''}
                <input type={f.tipo_dato === 'FECHA' ? 'date' : 'text'} value={campos[f.campo] ?? ''} onChange={(e) => setCampos({ ...campos, [f.campo]: e.target.value })} />
                {errores[`campos.${f.campo}`] && <small className="aviso error">{errores[`campos.${f.campo}`]}</small>}
              </label>
            ))}
            <button onClick={async () => {
              const r = await enviar(`/api/srv/casos/${id}/orden`, { tipoOrdenId: tipoOrden, campos });
              if (r?.id) router.push(`/servicio/ordenes/${r.id}`);
            }}>Generar orden de servicio</button>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Bitácora</h2>
        {modificar && (
          <div className="linea-form" style={{ marginTop: 0, marginBottom: 10 }}>
            <label style={{ flex: 1 }}>Nueva nota<input type="text" style={{ width: '100%' }} value={nota} onChange={(e) => setNota(e.target.value)} /></label>
            <button className="secundario" onClick={async () => {
              if (await enviar(`/api/srv/casos/${id}/notas`, { nota })) setNota('');
            }}>Agregar nota</button>
          </div>
        )}
        {d.notas.map((n: Json) => (
          <div key={n.id} className="nota">
            {n.nota}
            <small>{n.creado_por} · {fechaHora(n.creado_en)}{n.visible_cliente ? ' · visible para el cliente' : ''}</small>
          </div>
        ))}
        {d.notas.length === 0 && <p className="tenue">Sin notas.</p>}
      </section>
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <Caso />
    </Marco>
  );
}
