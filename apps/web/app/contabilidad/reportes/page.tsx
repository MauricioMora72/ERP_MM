'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Referencia } from '@/componentes/LineasDocumento';
import { Marco } from '@/componentes/Marco';
import { api, ErrorApi } from '@/lib/api';
import { descargarCsv } from '@/lib/csv';
import { dinero, fecha, hoyIso } from '@/lib/formato';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Reporte = 'comprobacion' | 'balance' | 'resultados' | 'mayor';

const TITULOS: Record<Reporte, string> = {
  comprobacion: 'Balance de comprobación',
  balance: 'Balance general',
  resultados: 'Estado de resultados',
  mayor: 'Mayor por cuenta',
};

const sangria = (nivel: number) => ({ paddingLeft: 10 + (Number(nivel) - 1) * 16 });
const csvNum = (v: unknown) => String(v ?? '').replace('.', ',');

function Comprobacion({ d }: { d: Json }) {
  return (
    <table className="lista compacta">
      <thead><tr><th>Cuenta</th><th>Descripción</th><th className="numero">Saldo inicial</th><th className="numero">Débitos</th><th className="numero">Créditos</th><th className="numero">Saldo final</th></tr></thead>
      <tbody>
        {d.filas.map((f: Json) => (
          <tr key={f.id} style={{ fontWeight: f.movimiento ? 400 : 600 }}>
            <td style={sangria(f.nivel)}>{f.codigo}</td><td>{f.descripcion}</td><td className="numero">{dinero(f.inicial)}</td>
            <td className="numero">{dinero(f.debitos)}</td><td className="numero">{dinero(f.creditos)}</td><td className="numero">{dinero(f.final)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot><tr><td colSpan={3}>Totales de cuentas de movimiento</td><td className="numero">{dinero(d.totales.debitos)}</td><td className="numero">{dinero(d.totales.creditos)}</td><td></td></tr></tfoot>
    </table>
  );
}

function Secciones({ d, campo }: { d: Json; campo: 'saldo' | 'valor' }) {
  return (
    <>
      {d.secciones.map((s: Json) => (
        <table key={s.codigo} className="lista compacta" style={{ marginBottom: 18 }}>
          <thead><tr><th>{s.codigo} {s.descripcion}</th><th></th><th className="numero">Valor</th></tr></thead>
          <tbody>
            {s.filas.filter((f: Json) => f.codigo !== s.codigo).map((f: Json) => (
              <tr key={f.id}><td style={sangria(f.nivel - 1)}>{f.codigo}</td><td>{f.descripcion}</td><td className="numero">{dinero(f[campo])}</td></tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={2}>Total {s.descripcion.toLowerCase()}</td><td className="numero">{dinero(s.total)}</td></tr></tfoot>
        </table>
      ))}
    </>
  );
}

function Mayor({ d }: { d: Json }) {
  return (
    <table className="lista compacta">
      <thead><tr><th>Fecha</th><th>Asiento</th><th>Glosa</th><th>Cuenta</th><th>Tercero</th><th className="numero">Débito</th><th className="numero">Crédito</th><th className="numero">Saldo</th></tr></thead>
      <tbody>
        <tr><td colSpan={7}>Saldo inicial</td><td className="numero">{dinero(d.inicial)}</td></tr>
        {d.filas.map((f: Json, i: number) => (
          <tr key={i}>
            <td>{fecha(f.fecha)}</td><td><Link href={`/contabilidad/asientos/${f.asiento_id}`}>{f.numero}</Link></td><td>{f.glosa}</td><td>{f.cuenta}</td><td>{f.tercero ?? ''}</td>
            <td className="numero">{Number(f.debito) ? dinero(f.debito) : ''}</td><td className="numero">{Number(f.credito) ? dinero(f.credito) : ''}</td><td className="numero">{dinero(f.saldo)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot><tr><td colSpan={7}>Saldo final</td><td className="numero">{dinero(d.final)}</td></tr></tfoot>
    </table>
  );
}

function Reportes() {
  const [tipo, setTipo] = useState<Reporte>('comprobacion');
  const [desde, setDesde] = useState(`${new Date().getFullYear()}-01-01`);
  const [hasta, setHasta] = useState(hoyIso());
  const [cuenta, setCuenta] = useState<string | null>(null);
  const [datos, setDatos] = useState<{ tipo: Reporte; d: Json } | null>(null);
  // Los datos se muestran solo si corresponden al reporte elegido (evita mezclar formatos al cambiar de reporte).
  const d = datos?.tipo === tipo ? datos.d : null;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDatos(null);
    setError(null);
    if (tipo === 'mayor' && !cuenta) return;
    const ruta = tipo === 'balance' ? `/api/con/reportes/balance?fecha=${hasta}`
      : tipo === 'mayor' ? `/api/con/reportes/mayor?cuentaId=${cuenta}&desde=${desde}&hasta=${hasta}`
        : `/api/con/reportes/${tipo}?desde=${desde}&hasta=${hasta}`;
    api<Json>(ruta).then((r) => setDatos({ tipo, d: r })).catch((e) => setError(e instanceof ErrorApi ? e.message : 'Ocurrió un error.'));
  }, [tipo, desde, hasta, cuenta]);

  function exportar() {
    if (!d) return;
    if (tipo === 'comprobacion') {
      descargarCsv(`comprobacion-${desde}-${hasta}.csv`, ['Cuenta', 'Descripción', 'Nivel', 'Saldo inicial', 'Débitos', 'Créditos', 'Saldo final'],
        d.filas.map((f: Json) => [f.codigo, f.descripcion, f.nivel, csvNum(f.inicial), csvNum(f.debitos), csvNum(f.creditos), csvNum(f.final)]));
    } else if (tipo === 'mayor') {
      descargarCsv(`mayor-${d.cuenta.codigo}-${desde}-${hasta}.csv`, ['Fecha', 'Asiento', 'Glosa', 'Cuenta', 'Tercero', 'Débito', 'Crédito', 'Saldo'],
        d.filas.map((f: Json) => [f.fecha, f.numero, f.glosa, f.cuenta, f.tercero ?? '', csvNum(f.debito), csvNum(f.credito), csvNum(f.saldo)]));
    } else {
      const campo = tipo === 'balance' ? 'saldo' : 'valor';
      descargarCsv(`${tipo}-${tipo === 'balance' ? hasta : `${desde}-${hasta}`}.csv`, ['Sección', 'Cuenta', 'Descripción', 'Valor'],
        d.secciones.flatMap((s: Json) => [...s.filas.map((f: Json) => [s.descripcion, f.codigo, f.descripcion, csvNum(f[campo])]), [s.descripcion, '', 'Total', csvNum(s.total)]]));
    }
  }

  return (
    <>
      <div className="barra">
        <h1>Reportes contables</h1>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as Reporte)} aria-label="Reporte">
          {Object.entries(TITULOS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        {d && <button className="secundario" onClick={exportar}>Descargar CSV</button>}
      </div>
      <div className="linea-form" style={{ marginBottom: 14 }}>
        {tipo !== 'balance' && <label>Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>}
        <label>{tipo === 'balance' ? 'Fecha de corte' : 'Hasta'}<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
        {tipo === 'mayor' && <label>Cuenta<Referencia id="mayor-cuenta" entidad="cuentas" valor={cuenta} onCambio={setCuenta} /></label>}
      </div>
      {error && <p className="aviso error">{error}</p>}
      {tipo === 'mayor' && !cuenta && <p className="tenue">Elija una cuenta. Si elige una cuenta de grupo se incluyen todas sus subcuentas.</p>}
      {d && tipo === 'comprobacion' && <Comprobacion d={d} />}
      {d && tipo === 'balance' && (
        <>
          <Secciones d={d} campo="saldo" />
          <div className="resumen">
            <span>Total activo: <strong>{dinero(d.totalDeudoras)}</strong></span>
            <span>Total pasivo y patrimonio: <strong>{dinero(d.totalAcreedoras)}</strong></span>
            <span>{d.cuadra ? 'El balance cuadra.' : 'El balance no cuadra: revise cuentas sin grupo de balance.'}</span>
          </div>
        </>
      )}
      {d && tipo === 'resultados' && (
        <>
          <Secciones d={d} campo="valor" />
          <div className="resumen"><span>{Number(d.utilidad) >= 0 ? 'Utilidad' : 'Pérdida'} del período: <strong>{dinero(Math.abs(Number(d.utilidad)))}</strong></span></div>
        </>
      )}
      {d && tipo === 'mayor' && <><h2>{d.cuenta.codigo} {d.cuenta.descripcion}</h2><Mayor d={d} /></>}
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <Reportes />
    </Marco>
  );
}
