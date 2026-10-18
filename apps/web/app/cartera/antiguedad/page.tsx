'use client';

import { useEffect, useState } from 'react';
import { Marco } from '@/componentes/Marco';
import { api } from '@/lib/api';
import { dinero, hoyIso } from '@/lib/formato';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const COLUMNAS: [string, string][] = [['por_vencer', 'Por vencer'], ['d30', '1 a 30'], ['d60', '31 a 60'], ['d90', '61 a 90'], ['mas90', 'Más de 90'], ['total', 'Total']];

function Antiguedad() {
  const [tipo, setTipo] = useState<'cxc' | 'cxp'>('cxc');
  const [corte, setCorte] = useState(hoyIso());
  const [filas, setFilas] = useState<Json[] | null>(null);
  useEffect(() => {
    setFilas(null);
    api<Json[]>(`/api/${tipo}/antiguedad?fecha=${corte}`).then(setFilas).catch(() => setFilas([]));
  }, [tipo, corte]);
  const suma = (k: string) => (filas ?? []).reduce((s, f) => s + Number(f[k]), 0);
  return (
    <>
      <div className="barra">
        <h1>Antigüedad de saldos</h1>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as 'cxc' | 'cxp')} aria-label="Cartera">
          <option value="cxc">Cuentas por cobrar</option>
          <option value="cxp">Cuentas por pagar</option>
        </select>
        <label className="tenue">Fecha de corte <input type="date" value={corte} onChange={(e) => setCorte(e.target.value)} /></label>
      </div>
      <table className="lista">
        <thead>
          <tr><th>{tipo === 'cxc' ? 'Cliente' : 'Proveedor'}</th>{COLUMNAS.map(([k, t]) => <th key={k} className="numero">{t}</th>)}</tr>
        </thead>
        <tbody>
          {filas?.map((f) => (
            <tr key={f.tercero_id}><td>{f.tercero}</td>{COLUMNAS.map(([k]) => <td key={k} className="numero">{dinero(f[k])}</td>)}</tr>
          ))}
          {filas && filas.length === 0 && <tr><td colSpan={7} className="tenue">No hay saldos pendientes.</td></tr>}
        </tbody>
        {filas && filas.length > 0 && (
          <tfoot><tr><td>Total</td>{COLUMNAS.map(([k]) => <td key={k} className="numero">{dinero(suma(k))}</td>)}</tr></tfoot>
        )}
      </table>
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <Antiguedad />
    </Marco>
  );
}
