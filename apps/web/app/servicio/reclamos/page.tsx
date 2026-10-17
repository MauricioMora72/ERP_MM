'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Marco } from '@/componentes/Marco';
import { api, ErrorApi } from '@/lib/api';
import { dinero } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ESTADOS: Record<string, string> = { BORRADOR: 'Borrador', ENVIADO: 'Enviado', APROBADO: 'Aprobado', RECHAZADO: 'Rechazado', CERRADO: 'Cerrado' };

function FilaReclamo({ r, onCambio }: { r: Json; onCambio: (id: string, cuerpo: object) => Promise<void> }) {
  const { puede } = useSesion();
  const [monto, setMonto] = useState('');
  const [referencia, setReferencia] = useState(r.referencia_proveedor ?? '');
  const modificar = puede('srv-reclamos', 'MODIFICAR');
  return (
    <tr>
      <td>{r.numero}</td>
      <td><Link href={`/servicio/ordenes/${r.orden_id}`}>Orden {r.orden_numero}</Link></td>
      <td>{r.proveedor}</td>
      <td>{String(r.fecha).slice(0, 10)}</td>
      <td className="numero">{dinero(r.monto_reclamado)}</td>
      <td className="numero">{r.monto_aprobado ? dinero(r.monto_aprobado) : '-'}</td>
      <td>{ESTADOS[r.estado]}</td>
      <td>
        {modificar && r.transiciones.length > 0 && (
          <div className="linea-form" style={{ marginTop: 0 }}>
            {r.transiciones.includes('APROBADO') && (
              <>
                <input type="text" placeholder="Referencia" value={referencia} onChange={(e) => setReferencia(e.target.value)} />
                <input type="text" inputMode="decimal" placeholder={`Aprobado (máx. ${r.monto_reclamado})`} value={monto} onChange={(e) => setMonto(e.target.value)} />
              </>
            )}
            {r.transiciones.map((t: string) => (
              <button key={t} className={t === 'RECHAZADO' ? 'secundario' : ''}
                onClick={() => onCambio(r.id, { estado: t, montoAprobado: t === 'APROBADO' ? monto || null : null, referencia: referencia || null })}>
                {t === 'ENVIADO' ? 'Marcar enviado' : t === 'APROBADO' ? 'Aprobar' : t === 'RECHAZADO' ? 'Rechazar' : 'Cerrar'}
              </button>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}

function Reclamos() {
  const [filas, setFilas] = useState<Json[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cargar = useCallback(() => api<Json[]>('/api/srv/reclamos').then(setFilas).catch(() => setFilas([])), []);
  useEffect(() => {
    void cargar();
  }, [cargar]);
  return (
    <>
      <h1>Reclamos de garantía al fabricante</h1>
      <p className="tenue">Se generan desde una orden en garantía ya liquidada. Al aprobarse, el monto aprobado se registra como cuenta por cobrar al proveedor y reduce el gasto de garantías.</p>
      {error && <p className="aviso error">{error}</p>}
      <table className="lista">
        <thead>
          <tr><th>Número</th><th>Orden</th><th>Proveedor</th><th>Fecha</th><th className="numero">Reclamado</th><th className="numero">Aprobado</th><th>Estado</th><th></th></tr>
        </thead>
        <tbody>
          {filas?.map((r) => (
            <FilaReclamo key={r.id} r={r} onCambio={async (id, cuerpo) => {
              setError(null);
              try {
                await api(`/api/srv/reclamos/${id}/estado`, { metodo: 'POST', cuerpo });
                await cargar();
              } catch (e) {
                setError(e instanceof ErrorApi ? e.message : 'Ocurrió un error.');
              }
            }} />
          ))}
          {filas && filas.length === 0 && <tr><td colSpan={8} className="tenue">No hay reclamos.</td></tr>}
        </tbody>
      </table>
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <Reclamos />
    </Marco>
  );
}
