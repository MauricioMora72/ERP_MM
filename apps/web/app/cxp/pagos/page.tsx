'use client';

import { useCallback, useEffect, useState } from 'react';
import { Marco } from '@/componentes/Marco';
import { Seleccion } from '@/componentes/Seleccion';
import { api, ErrorApi } from '@/lib/api';
import { dinero, fecha, hoyIso } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function Pagos() {
  const { puede } = useSesion();
  const [hasta, setHasta] = useState('');
  const [proveedor, setProveedor] = useState<string | null>(null);
  const [docs, setDocs] = useState<Json[]>([]);
  const [montos, setMontos] = useState<Record<string, string>>({});
  const [forma, setForma] = useState<string | null>('TRANSFERENCIA');
  const [cuenta, setCuenta] = useState<string | null>(null);
  const [fechaPago, setFechaPago] = useState(hoyIso());
  const [referencia, setReferencia] = useState('');
  const [mensaje, setMensaje] = useState<{ tipo: string; texto: string } | null>(null);

  const cargar = useCallback(() => {
    const q = new URLSearchParams();
    if (hasta) q.set('hasta', hasta);
    if (proveedor) q.set('proveedorId', proveedor);
    api<Json[]>(`/api/cxp/documentos?${q}`).then((r) => { setDocs(r); setMontos({}); }).catch(() => setDocs([]));
  }, [hasta, proveedor]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const total = Object.values(montos).reduce((s, v) => s + Number(v || 0), 0);

  async function pagar() {
    setMensaje(null);
    try {
      const r = await api<Json[]>('/api/cxp/pagos', {
        metodo: 'POST',
        cuerpo: {
          fecha: fechaPago, formaPago: forma, cuentaBancariaId: cuenta, referencia: referencia || null,
          aplicaciones: Object.entries(montos).filter(([, v]) => Number(v) > 0).map(([documentoId, monto]) => ({ documentoId, monto })),
        },
      });
      setMensaje({ tipo: 'exito', texto: `Se registraron ${r.length} pago(s): ${r.map((p) => `${p.numero} por ${dinero(p.monto)}`).join(', ')}.` });
      cargar();
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ErrorApi ? e.message : 'Ocurrió un error.' });
    }
  }

  return (
    <>
      <h1>Pagos a proveedores</h1>
      <p className="tenue">Marque las cuotas a pagar; se genera un pago por proveedor. Use la fecha de vencimiento para armar la programación de pagos.</p>
      {mensaje && <p className={`aviso ${mensaje.tipo}`}>{mensaje.texto}</p>}
      <div className="linea-form">
        <label>Vence hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
        <Seleccion id="pg-proveedor" etiqueta="Proveedor" referencia="direcciones" valor={proveedor} onCambio={setProveedor} />
      </div>
      <table className="lista edicion" style={{ marginTop: 12 }}>
        <thead>
          <tr><th></th><th>Proveedor</th><th>Comprobante</th><th>Cuota</th><th>Vencimiento</th><th className="numero">Días vencido</th><th className="numero">Saldo</th><th className="numero">A pagar</th></tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id}>
              <td><input type="checkbox" checked={montos[d.id] != null} aria-label="Pagar"
                onChange={(e) => { const m = { ...montos }; if (e.target.checked) m[d.id] = String(Number(d.saldo)); else delete m[d.id]; setMontos(m); }} /></td>
              <td>{d.proveedor}</td><td>{d.numero_factura ?? d.numero}</td><td>{d.cuota}</td><td>{fecha(d.vencimiento)}</td>
              <td className="numero">{Number(d.dias_vencido) > 0 ? d.dias_vencido : '-'}</td><td className="numero">{dinero(d.saldo)}</td>
              <td>{montos[d.id] != null && <input type="text" inputMode="decimal" className="numero corto" value={montos[d.id]} onChange={(e) => setMontos({ ...montos, [d.id]: e.target.value })} aria-label="Monto" />}</td>
            </tr>
          ))}
          {docs.length === 0 && <tr><td colSpan={8} className="tenue">No hay cuotas pendientes.</td></tr>}
        </tbody>
      </table>
      {puede('cxp', 'CREAR') && docs.length > 0 && (
        <section className="panel">
          <h2>Datos del pago</h2>
          <div className="linea-form" style={{ marginTop: 0 }}>
            <label>Fecha<input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} /></label>
            <Seleccion id="pg-forma" etiqueta="Forma de pago *" catalogo={{ modulo: 'MAE', codigo: 'FORMA_PAGO' }} valor={forma} onCambio={setForma} requerido />
            <Seleccion id="pg-cuenta" etiqueta="Cuenta bancaria" referencia="cuentas-bancarias" valor={cuenta} onCambio={setCuenta} />
            <label>Referencia<input type="text" value={referencia} onChange={(e) => setReferencia(e.target.value)} /></label>
            <span className="resumen">Total: <strong>{dinero(total)}</strong></span>
            <button onClick={pagar} disabled={total <= 0}>Registrar pago</button>
          </div>
        </section>
      )}
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <Pagos />
    </Marco>
  );
}
