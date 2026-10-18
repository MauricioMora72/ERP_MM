'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Marco } from '@/componentes/Marco';
import { api, ErrorApi } from '@/lib/api';
import { dinero, hoyIso } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function FacturarContratos() {
  const { puede } = useSesion();
  const [corte, setCorte] = useState(hoyIso());
  const [resultado, setResultado] = useState<Json[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function ejecutar() {
    setError(null);
    try {
      setResultado(await api<Json[]>('/api/ven/contratos/facturar', { metodo: 'POST', cuerpo: { fecha: corte } }));
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'Ocurrió un error.');
    }
  }
  return (
    <>
      <h1>Facturar contratos</h1>
      <p className="tenue">
        Factura las líneas de los contratos vigentes cuya próxima fecha de facturación llegó a la fecha de corte: una factura por contrato y un período por
        ejecución. La próxima fecha avanza según la frecuencia. Los contratos se mantienen en <Link href="/contratos">Contratos de servicio</Link>.
      </p>
      {error && <p className="aviso error">{error}</p>}
      <div className="linea-form">
        <label>Fecha de corte<input type="date" value={corte} onChange={(e) => setCorte(e.target.value)} /></label>
        {puede('ventas', 'CREAR') && <button onClick={ejecutar}>Facturar</button>}
      </div>
      {resultado && (
        resultado.length === 0
          ? <p className="aviso exito">No había contratos por facturar a esa fecha.</p>
          : (
            <table className="lista compacta" style={{ marginTop: 14 }}>
              <thead><tr><th>Contrato</th><th>Factura</th><th className="numero">Total</th></tr></thead>
              <tbody>{resultado.map((r, i) => <tr key={i}><td>{r.contrato}</td><td>{r.numero}</td><td className="numero">{dinero(r.total)}</td></tr>)}</tbody>
            </table>
          )
      )}
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <FacturarContratos />
    </Marco>
  );
}
