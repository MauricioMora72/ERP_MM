'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Referencia } from '@/componentes/LineasDocumento';
import { Marco } from '@/componentes/Marco';
import { api, ErrorApi } from '@/lib/api';
import { dinero, fecha, hoyIso } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const MODULOS: Record<string, string> = { CON: 'Manual', CIERRE: 'Cierre', VEN: 'Ventas', COM: 'Compras', CXC: 'Cobros', CXP: 'Pagos', INV: 'Inventario', SRV: 'Servicios' };

interface Linea { cuentaId: string | null; centroCostoId: string | null; terceroId: string | null; debito: string; credito: string; glosa: string }
const vacia = (): Linea => ({ cuentaId: null, centroCostoId: null, terceroId: null, debito: '', credito: '', glosa: '' });

function NuevoAsiento({ onCreado }: { onCreado: (id: string) => void }) {
  const [fechaAs, setFechaAs] = useState(hoyIso());
  const [glosa, setGlosa] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([vacia(), vacia()]);
  const [error, setError] = useState<string | null>(null);
  const set = (i: number, c: Partial<Linea>) => setLineas(lineas.map((l, j) => (j === i ? { ...l, ...c } : l)));
  const deb = lineas.reduce((s, l) => s + Number(l.debito || 0), 0);
  const cre = lineas.reduce((s, l) => s + Number(l.credito || 0), 0);
  const diferencia = Math.round((deb - cre) * 100) / 100;

  async function grabar() {
    setError(null);
    try {
      const r = await api<{ id: string }>('/api/con/asientos', {
        metodo: 'POST',
        cuerpo: { fecha: fechaAs, glosa, lineas: lineas.filter((l) => l.cuentaId).map((l) => ({ ...l, glosa: l.glosa || null })) },
      });
      onCreado(r.id);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'Ocurrió un error.');
    }
  }

  return (
    <section className="panel">
      <h2>Nuevo asiento manual</h2>
      {error && <p className="aviso error">{error}</p>}
      <div className="linea-form" style={{ marginTop: 0 }}>
        <label>Fecha *<input type="date" value={fechaAs} onChange={(e) => setFechaAs(e.target.value)} /></label>
        <label style={{ flex: 1 }}>Glosa *<input type="text" style={{ width: '100%' }} value={glosa} onChange={(e) => setGlosa(e.target.value)} /></label>
      </div>
      <table className="lista edicion compacta" style={{ marginTop: 10 }}>
        <thead><tr><th>Cuenta</th><th>Centro de costo</th><th>Tercero</th><th>Glosa de la línea</th><th className="numero">Débito</th><th className="numero">Crédito</th><th></th></tr></thead>
        <tbody>
          {lineas.map((l, i) => (
            <tr key={i}>
              <td><Referencia id={`as-c-${i}`} entidad="cuentas" valor={l.cuentaId} onCambio={(v) => set(i, { cuentaId: v })} /></td>
              <td><Referencia id={`as-u-${i}`} entidad="unidades-negocio" valor={l.centroCostoId} onCambio={(v) => set(i, { centroCostoId: v })} /></td>
              <td><Referencia id={`as-t-${i}`} entidad="direcciones" valor={l.terceroId} onCambio={(v) => set(i, { terceroId: v })} /></td>
              <td><input type="text" value={l.glosa} onChange={(e) => set(i, { glosa: e.target.value })} aria-label="Glosa de la línea" /></td>
              <td><input type="text" inputMode="decimal" className="numero" value={l.debito} onChange={(e) => set(i, { debito: e.target.value, credito: e.target.value ? '' : l.credito })} aria-label={`Débito ${i + 1}`} /></td>
              <td><input type="text" inputMode="decimal" className="numero" value={l.credito} onChange={(e) => set(i, { credito: e.target.value, debito: e.target.value ? '' : l.debito })} aria-label={`Crédito ${i + 1}`} /></td>
              <td>{lineas.length > 2 && <button type="button" className="enlace" onClick={() => setLineas(lineas.filter((_, j) => j !== i))}>Quitar</button>}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}><button type="button" className="secundario" onClick={() => setLineas([...lineas, vacia()])}>Agregar línea</button>
              {diferencia !== 0 && <span className="tenue" style={{ marginLeft: 12 }}>Diferencia: {dinero(diferencia)}</span>}</td>
            <td className="numero">{dinero(deb)}</td><td className="numero">{dinero(cre)}</td><td></td>
          </tr>
        </tfoot>
      </table>
      <div className="acciones"><button onClick={grabar} disabled={diferencia !== 0 || deb === 0}>Contabilizar asiento</button></div>
    </section>
  );
}

function Asientos() {
  const router = useRouter();
  const { puede } = useSesion();
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [modulo, setModulo] = useState('');
  const [buscar, setBuscar] = useState('');
  const [filas, setFilas] = useState<Json[] | null>(null);
  const [nuevo, setNuevo] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const q = new URLSearchParams();
      if (desde) q.set('desde', desde);
      if (hasta) q.set('hasta', hasta);
      if (modulo) q.set('modulo', modulo);
      if (buscar) q.set('buscar', buscar);
      api<Json[]>(`/api/con/asientos?${q}`).then(setFilas).catch(() => setFilas([]));
    }, 250);
    return () => clearTimeout(t);
  }, [desde, hasta, modulo, buscar]);

  return (
    <>
      <div className="barra">
        <h1>Asientos contables</h1>
        <label className="tenue">Desde <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
        <label className="tenue">Hasta <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
        <select value={modulo} onChange={(e) => setModulo(e.target.value)} aria-label="Origen">
          <option value="">Todos los orígenes</option>
          {Object.entries(MODULOS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        <input type="text" placeholder="Buscar glosa o número…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        {puede('contabilidad', 'CREAR') && <button onClick={() => setNuevo(!nuevo)}>{nuevo ? 'Cerrar' : 'Asiento manual'}</button>}
      </div>
      {nuevo && <NuevoAsiento onCreado={(id) => router.push(`/contabilidad/asientos/${id}`)} />}
      <table className="lista">
        <thead><tr><th>Número</th><th>Fecha</th><th>Período</th><th>Glosa</th><th>Origen</th><th>Estado</th><th className="numero">Total</th></tr></thead>
        <tbody>
          {filas?.map((f) => (
            <tr key={f.id} onClick={() => router.push(`/contabilidad/asientos/${f.id}`)}>
              <td>{f.numero}</td><td>{fecha(f.fecha)}</td><td>{f.anio}-{String(f.periodo).padStart(2, '0')}</td><td>{f.glosa}</td>
              <td>{MODULOS[f.origen_modulo] ?? f.origen_modulo}</td><td>{f.estado === 'REVERSADO' ? <span className="etiqueta">Reversado</span> : 'Contabilizado'}</td>
              <td className="numero">{dinero(f.total)}</td>
            </tr>
          ))}
          {filas && filas.length === 0 && <tr><td colSpan={7} className="tenue">No hay asientos.</td></tr>}
        </tbody>
      </table>
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <Asientos />
    </Marco>
  );
}
