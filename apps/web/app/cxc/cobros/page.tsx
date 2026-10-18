'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Marco } from '@/componentes/Marco';
import { Seleccion } from '@/componentes/Seleccion';
import { api, ErrorApi } from '@/lib/api';
import { dinero, fecha, hoyIso } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function Cobros() {
  const { puede } = useSesion();
  const [cliente, setCliente] = useState<string | null>(null);
  const [docs, setDocs] = useState<Json[]>([]);
  const [montos, setMontos] = useState<Record<string, string>>({});
  const [forma, setForma] = useState<string | null>('TRANSFERENCIA');
  const [cuenta, setCuenta] = useState<string | null>(null);
  const [fechaCobro, setFechaCobro] = useState(hoyIso());
  const [referencia, setReferencia] = useState('');
  const [mensaje, setMensaje] = useState<{ tipo: string; texto: string } | null>(null);

  const cargar = useCallback(() => {
    api<Json[]>(`/api/cxc/documentos${cliente ? `?clienteId=${cliente}` : ''}`).then((r) => { setDocs(r); setMontos({}); }).catch(() => setDocs([]));
  }, [cliente]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const total = Object.values(montos).reduce((s, v) => s + Number(v || 0), 0);

  async function cobrar() {
    setMensaje(null);
    try {
      const r = await api<Json>('/api/cxc/cobros', {
        metodo: 'POST',
        cuerpo: {
          clienteId: cliente, fecha: fechaCobro, formaPago: forma, cuentaBancariaId: cuenta, monto: total.toFixed(2), referencia: referencia || null,
          aplicaciones: Object.entries(montos).filter(([, v]) => Number(v) > 0).map(([documentoId, monto]) => ({ documentoId, monto })),
        },
      });
      setMensaje({ tipo: 'exito', texto: `Recibo de cobro ${r.numero} registrado por ${dinero(total)}.` });
      cargar();
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ErrorApi ? e.message : 'Ocurrió un error.' });
    }
  }

  return (
    <>
      <h1>Cobros a clientes</h1>
      <p className="tenue">Elija el cliente y marque las cuotas que cancela el dinero recibido. Las retenciones del cliente se registran desde la factura.</p>
      {mensaje && <p className={`aviso ${mensaje.tipo}`}>{mensaje.texto}</p>}
      <div className="linea-form">
        <Seleccion id="cb-cliente" etiqueta="Cliente" referencia="direcciones" valor={cliente} onCambio={setCliente} />
      </div>
      <table className="lista edicion" style={{ marginTop: 12 }}>
        <thead>
          <tr><th></th><th>Cliente</th><th>Documento</th><th>Cuota</th><th>Vencimiento</th><th className="numero">Días vencido</th><th className="numero">Saldo</th><th className="numero">A cobrar</th></tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id}>
              <td>{cliente && Number(d.saldo) > 0 && <input type="checkbox" checked={montos[d.id] != null} aria-label="Cobrar"
                onChange={(e) => { const m = { ...montos }; if (e.target.checked) m[d.id] = String(Number(d.saldo)); else delete m[d.id]; setMontos(m); }} />}</td>
              <td>{d.cliente}</td>
              <td>{d.factura_id ? <Link href={`/ventas/facturas/${d.factura_id}`}>{d.tipo === 'NC' ? 'Saldo a favor, NC ' : 'Factura '}{d.factura}</Link> : d.numero}</td>
              <td>{d.cuota}</td><td>{fecha(d.vencimiento)}</td>
              <td className="numero">{Number(d.dias_vencido) > 0 ? d.dias_vencido : '-'}</td><td className="numero">{dinero(d.saldo)}</td>
              <td>{montos[d.id] != null && <input type="text" inputMode="decimal" className="numero corto" value={montos[d.id]} onChange={(e) => setMontos({ ...montos, [d.id]: e.target.value })} aria-label="Monto" />}</td>
            </tr>
          ))}
          {docs.length === 0 && <tr><td colSpan={8} className="tenue">No hay cuotas pendientes.</td></tr>}
        </tbody>
      </table>
      {puede('cxc', 'CREAR') && cliente && docs.length > 0 && (
        <section className="panel">
          <h2>Datos del cobro</h2>
          <div className="linea-form" style={{ marginTop: 0 }}>
            <label>Fecha<input type="date" value={fechaCobro} onChange={(e) => setFechaCobro(e.target.value)} /></label>
            <Seleccion id="cb-forma" etiqueta="Forma de cobro *" catalogo={{ modulo: 'MAE', codigo: 'FORMA_PAGO' }} valor={forma} onCambio={setForma} requerido />
            <Seleccion id="cb-cuenta" etiqueta="Cuenta bancaria" referencia="cuentas-bancarias" valor={cuenta} onCambio={setCuenta} />
            <label>Referencia<input type="text" value={referencia} onChange={(e) => setReferencia(e.target.value)} /></label>
            <span className="resumen">Valor recibido: <strong>{dinero(total)}</strong></span>
            <button onClick={cobrar} disabled={total <= 0}>Registrar cobro</button>
          </div>
        </section>
      )}
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <Cobros />
    </Marco>
  );
}
