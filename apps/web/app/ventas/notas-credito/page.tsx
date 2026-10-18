'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Marco } from '@/componentes/Marco';
import { Seleccion } from '@/componentes/Seleccion';
import { api, ErrorApi } from '@/lib/api';
import { cantidad, dinero, fecha } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function NuevaNota({ facturaInicial, onEmitida }: { facturaInicial: string | null; onEmitida: (texto: string) => void }) {
  const [cliente, setCliente] = useState<string | null>(null);
  const [facturas, setFacturas] = useState<Json[]>([]);
  const [factura, setFactura] = useState<string | null>(facturaInicial);
  const [detalle, setDetalle] = useState<Json | null>(null);
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState('');
  const [devolver, setDevolver] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cliente) return;
    api<Json[]>(`/api/ven/facturas?tipo=FA&clienteId=${cliente}`).then(setFacturas).catch(() => setFacturas([]));
  }, [cliente]);
  useEffect(() => {
    setDetalle(null);
    setCantidades({});
    if (!factura) return;
    api<Json>(`/api/ven/facturas/${factura}`).then(setDetalle).catch(() => setDetalle(null));
  }, [factura]);

  async function emitir() {
    setError(null);
    try {
      const r = await api<Json>('/api/ven/notas-credito', {
        metodo: 'POST',
        cuerpo: {
          facturaId: factura, motivo, devolverInventario: devolver,
          lineas: Object.entries(cantidades).filter(([, v]) => Number(v) > 0).map(([facturaLineaId, c]) => ({ facturaLineaId, cantidad: c })),
        },
      });
      onEmitida(`Nota de crédito ${r.numero} emitida por ${dinero(r.total)}${Number(r.saldoAFavor) > 0 ? `; quedan ${dinero(r.saldoAFavor)} a favor del cliente` : ''}.`);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'Ocurrió un error.');
    }
  }

  return (
    <section className="panel">
      <h2>Emitir nota de crédito</h2>
      {error && <p className="aviso error">{error}</p>}
      {!facturaInicial && (
        <div className="linea-form" style={{ marginTop: 0 }}>
          <Seleccion id="nc-cliente" etiqueta="Cliente" referencia="direcciones" valor={cliente} onCambio={setCliente} />
          <label>Factura
            <select value={factura ?? ''} onChange={(e) => setFactura(e.target.value || null)}>
              <option value="">Seleccione…</option>
              {facturas.map((f) => <option key={f.id} value={f.id}>{f.numero} del {fecha(f.fecha)} por {dinero(f.total)}</option>)}
            </select>
          </label>
        </div>
      )}
      {detalle && (
        <>
          <p>Factura {detalle.factura.numero} de {detalle.factura.cliente}, total {dinero(detalle.factura.total)}.</p>
          <table className="lista edicion compacta">
            <thead><tr><th>Línea</th><th>Descripción</th><th className="numero">Facturado</th><th className="numero">Ya devuelto</th><th className="numero">Devolver</th></tr></thead>
            <tbody>
              {detalle.lineas.map((l: Json) => (
                <tr key={l.id}>
                  <td>{l.linea}</td><td>{l.descripcion}</td><td className="numero">{cantidad(l.cantidad)}</td><td className="numero">{cantidad(l.cantidad_devuelta)}</td>
                  <td><input type="text" inputMode="decimal" className="numero corto" value={cantidades[l.id] ?? ''} onChange={(e) => setCantidades({ ...cantidades, [l.id]: e.target.value })} aria-label={`Devolver línea ${l.linea}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="linea-form">
            <label style={{ flex: 1 }}>Motivo *<input type="text" style={{ width: '100%' }} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>
            <label className="tenue"><input type="checkbox" checked={devolver} onChange={(e) => setDevolver(e.target.checked)} /> La mercadería regresa a bodega</label>
            <button onClick={emitir}>Emitir nota de crédito</button>
          </div>
        </>
      )}
    </section>
  );
}

function Notas() {
  const router = useRouter();
  const params = useSearchParams();
  const { puede } = useSesion();
  const facturaInicial = params.get('factura');
  const [nueva, setNueva] = useState(!!facturaInicial);
  const [filas, setFilas] = useState<Json[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const cargar = () => api<Json[]>('/api/ven/facturas?tipo=NC').then(setFilas).catch(() => setFilas([]));
  useEffect(() => {
    void cargar();
  }, []);
  return (
    <>
      <div className="barra">
        <h1>Notas de crédito</h1>
        {puede('ventas', 'CREAR') && <button onClick={() => setNueva(!nueva)}>{nueva ? 'Cerrar' : 'Nueva nota de crédito'}</button>}
      </div>
      {aviso && <p className="aviso exito">{aviso}</p>}
      {nueva && <NuevaNota facturaInicial={facturaInicial} onEmitida={(t) => { setAviso(t); setNueva(false); void cargar(); }} />}
      <table className="lista">
        <thead><tr><th>Número</th><th>Fecha</th><th>Cliente</th><th className="numero">Subtotal</th><th className="numero">IVA</th><th className="numero">Total</th></tr></thead>
        <tbody>
          {filas?.map((f) => (
            <tr key={f.id} onClick={() => router.push(`/ventas/facturas/${f.id}`)}>
              <td>{f.numero}</td><td>{fecha(f.fecha)}</td><td>{f.cliente}</td><td className="numero">{dinero(Number(f.subtotal) - Number(f.descuento))}</td>
              <td className="numero">{dinero(f.impuestos)}</td><td className="numero">{dinero(f.total)}</td>
            </tr>
          ))}
          {filas && filas.length === 0 && <tr><td colSpan={6} className="tenue">No hay notas de crédito.</td></tr>}
        </tbody>
      </table>
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <Suspense fallback={<p className="cargando">Cargando…</p>}>
        <Notas />
      </Suspense>
    </Marco>
  );
}
