'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Marco } from '@/componentes/Marco';
import { api, ErrorApi } from '@/lib/api';
import { dinero, fecha, hoyIso } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function Asiento() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { puede } = useSesion();
  const [d, setD] = useState<Json | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fechaRev, setFechaRev] = useState(hoyIso());
  useEffect(() => {
    api<Json>(`/api/con/asientos/${id}`).then(setD).catch((e) => setError(e instanceof ErrorApi ? e.message : 'Ocurrió un error.'));
  }, [id]);
  if (!d) return error ? <p className="aviso error">{error}</p> : <p className="cargando">Cargando…</p>;
  const a = d.asiento;
  const reversable = ['CON', 'CIERRE'].includes(a.origen_modulo) && a.estado === 'CONTABILIZADO' && !a.reversa_de_id;
  const deb = d.lineas.reduce((s: number, l: Json) => s + Number(l.debito), 0);
  const cre = d.lineas.reduce((s: number, l: Json) => s + Number(l.credito), 0);

  async function reversar() {
    setError(null);
    try {
      const r = await api<{ id: string }>(`/api/con/asientos/${id}/reversar`, { metodo: 'POST', cuerpo: { fecha: fechaRev } });
      router.push(`/contabilidad/asientos/${r.id}`);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'Ocurrió un error.');
    }
  }

  return (
    <>
      <div className="barra">
        <h1>Asiento {a.numero}</h1>
        {a.estado === 'REVERSADO' && <span className="etiqueta">Reversado</span>}
        <Link className="boton secundario" href="/contabilidad/asientos">Volver</Link>
      </div>
      {error && <p className="aviso error">{error}</p>}
      <div className="datos">
        <div><span>Fecha</span>{fecha(a.fecha)}</div>
        <div><span>Período</span>{a.anio}-{String(a.periodo).padStart(2, '0')}</div>
        <div><span>Origen</span>{a.origen_modulo}</div>
        <div><span>Glosa</span>{a.glosa}</div>
        {a.reversa_numero && <div><span>Reversado con</span><Link href={`/contabilidad/asientos/${a.asiento_reversa_id}`}>Asiento {a.reversa_numero}</Link></div>}
        {a.reversa_de_numero && <div><span>Reversa del</span><Link href={`/contabilidad/asientos/${a.reversa_de_id}`}>Asiento {a.reversa_de_numero}</Link></div>}
      </div>
      <table className="lista compacta">
        <thead><tr><th>Línea</th><th>Cuenta</th><th>Descripción</th><th>Centro</th><th>Tercero</th><th>Glosa</th><th className="numero">Débito</th><th className="numero">Crédito</th></tr></thead>
        <tbody>
          {d.lineas.map((l: Json) => (
            <tr key={l.linea}><td>{l.linea}</td><td>{l.cuenta}</td><td>{l.cuenta_descripcion}</td><td>{l.centro ?? '-'}</td><td>{l.tercero ?? '-'}</td>
              <td>{l.glosa ?? ''}</td><td className="numero">{Number(l.debito) ? dinero(l.debito) : ''}</td><td className="numero">{Number(l.credito) ? dinero(l.credito) : ''}</td></tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={6}>Totales</td><td className="numero">{dinero(deb)}</td><td className="numero">{dinero(cre)}</td></tr></tfoot>
      </table>
      {reversable && puede('contabilidad', 'CREAR') && (
        <section className="panel">
          <h2>Reversar</h2>
          <p className="tenue">Un asiento contabilizado no se edita: se genera un asiento espejo en la fecha indicada.</p>
          <div className="linea-form" style={{ marginTop: 0 }}>
            <label>Fecha de la reversa<input type="date" value={fechaRev} onChange={(e) => setFechaRev(e.target.value)} /></label>
            <button onClick={reversar}>Reversar asiento</button>
          </div>
        </section>
      )}
      {!['CON', 'CIERRE'].includes(a.origen_modulo) && <p className="tenue">Este asiento lo generó un módulo; se corrige con su documento de origen.</p>}
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <Asiento />
    </Marco>
  );
}
