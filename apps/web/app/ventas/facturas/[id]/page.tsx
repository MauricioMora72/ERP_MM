'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Referencia } from '@/componentes/LineasDocumento';
import { Marco } from '@/componentes/Marco';
import { api, ErrorApi } from '@/lib/api';
import { cantidad, dinero, fecha, hoyIso } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function RetencionRecibida({ facturaId, onRegistrada }: { facturaId: string; onRegistrada: (texto: string) => void }) {
  const [secuencial, setSecuencial] = useState('');
  const [autorizacion, setAutorizacion] = useState('');
  const [fechaRet, setFechaRet] = useState(hoyIso());
  const [lineas, setLineas] = useState<{ codigo: string | null; base: string }[]>([{ codigo: null, base: '' }, { codigo: null, base: '' }]);
  const [error, setError] = useState<string | null>(null);
  async function registrar() {
    setError(null);
    try {
      const r = await api<Json>('/api/cxc/retenciones', {
        metodo: 'POST',
        cuerpo: {
          facturaId, secuencial, fecha: fechaRet, autorizacion: autorizacion || null,
          lineas: lineas.filter((l) => l.codigo && Number(l.base) > 0).map((l) => ({ codigoRetencionId: l.codigo, base: l.base })),
        },
      });
      onRegistrada(`Retención ${secuencial} registrada por ${dinero(r.total)}.`);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'Ocurrió un error.');
    }
  }
  return (
    <section className="panel">
      <h2>Registrar retención del cliente</h2>
      {error && <p className="aviso error">{error}</p>}
      <div className="linea-form" style={{ marginTop: 0 }}>
        <label>Número *<input type="text" placeholder="001-001-000000123" value={secuencial} onChange={(e) => setSecuencial(e.target.value)} /></label>
        <label>Autorización<input type="text" value={autorizacion} onChange={(e) => setAutorizacion(e.target.value)} /></label>
        <label>Fecha *<input type="date" value={fechaRet} onChange={(e) => setFechaRet(e.target.value)} /></label>
      </div>
      <table className="lista edicion compacta" style={{ marginTop: 10 }}>
        <thead><tr><th>Código de retención</th><th className="numero">Base</th></tr></thead>
        <tbody>
          {lineas.map((l, i) => (
            <tr key={i}>
              <td><Referencia id={`rr-${i}`} entidad="codigos-retencion" valor={l.codigo} onCambio={(v) => setLineas(lineas.map((x, j) => (j === i ? { ...x, codigo: v } : x)))} /></td>
              <td><input type="text" inputMode="decimal" className="numero corto" value={l.base} onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, base: e.target.value } : x)))} aria-label="Base" /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tenue">La base de renta es el subtotal sin IVA; la base de IVA es el IVA de la factura.</p>
      <div className="acciones"><button onClick={registrar}>Registrar retención</button></div>
    </section>
  );
}

function FacturaVenta() {
  const { id } = useParams<{ id: string }>();
  const { puede } = useSesion();
  const [d, setD] = useState<Json | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [retencion, setRetencion] = useState(false);
  const cargar = useCallback(() => api<Json>(`/api/ven/facturas/${id}`).then(setD).catch((e) => setError(e instanceof ErrorApi ? e.message : 'Ocurrió un error.')), [id]);
  useEffect(() => {
    void cargar();
  }, [cargar]);
  if (!d) return error ? <p className="aviso error">{error}</p> : <p className="cargando">Cargando…</p>;
  const f = d.factura;
  const esFactura = f.tipo === 'FA';
  const saldo = d.cuotas.reduce((s: number, q: Json) => s + Number(q.saldo), 0);
  return (
    <>
      <div className="barra">
        <h1>{esFactura ? 'Factura' : 'Nota de crédito'} {f.numero}</h1>
        {esFactura && puede('ventas', 'CREAR') && <Link className="boton secundario" href={`/ventas/notas-credito?factura=${f.id}`}>Emitir nota de crédito</Link>}
        {esFactura && saldo > 0 && puede('cxc', 'CREAR') && <button className="secundario" onClick={() => setRetencion(!retencion)}>Retención del cliente</button>}
        <Link className="boton secundario" href={esFactura ? '/facturas' : '/ventas/notas-credito'}>Volver</Link>
      </div>
      {aviso && <p className="aviso exito">{aviso}</p>}
      <div className="datos">
        <div><span>Cliente</span>{f.cliente} ({f.identificacion})</div>
        <div><span>Fecha</span>{fecha(f.fecha)}</div>
        {f.factura_modificada && <div><span>Factura que modifica</span><Link href={`/ventas/facturas/${f.factura_modificada_id}`}>{f.factura_modificada}</Link></div>}
        <div><span>Subtotal</span>{dinero(f.subtotal)}</div>
        <div><span>Descuento</span>{dinero(f.descuento)}</div>
        <div><span>IVA</span>{dinero(f.impuestos)}</div>
        <div><span>Total</span>{dinero(f.total)}</div>
        {esFactura && <div><span>Saldo por cobrar</span>{dinero(saldo)}</div>}
        {f.asiento_id && <div><span>Asiento</span><Link href={`/asientos/${f.asiento_id}`}>Ver asiento</Link></div>}
      </div>
      {retencion && <RetencionRecibida facturaId={f.id} onRegistrada={(t) => { setAviso(t); setRetencion(false); void cargar(); }} />}
      <section className="panel">
        <h2>Detalle</h2>
        <table className="lista compacta">
          <thead><tr><th>Línea</th><th>Artículo</th><th>Descripción</th><th className="numero">Cantidad</th><th className="numero">Precio</th><th className="numero">Descuento</th>
            <th className="numero">IVA</th><th className="numero">Total</th>{esFactura && <th className="numero">Devuelto</th>}</tr></thead>
          <tbody>
            {d.lineas.map((l: Json) => (
              <tr key={l.id}><td>{l.linea}</td><td>{l.articulo}</td><td>{l.descripcion}</td><td className="numero">{cantidad(l.cantidad)}</td><td className="numero">{dinero(l.precio)}</td>
                <td className="numero">{dinero(l.descuento)}</td><td className="numero">{dinero(l.valor_impuesto)}</td><td className="numero">{dinero(l.total)}</td>
                {esFactura && <td className="numero">{cantidad(l.cantidad_devuelta)}</td>}</tr>
            ))}
          </tbody>
        </table>
      </section>
      {d.cuotas.length > 0 && (
        <section className="panel">
          <h2>{esFactura ? 'Cuotas por cobrar' : 'Saldo a favor del cliente'}</h2>
          <table className="lista compacta">
            <thead><tr><th>Cuota</th><th>Vencimiento</th><th className="numero">Monto</th><th className="numero">Saldo</th></tr></thead>
            <tbody>{d.cuotas.map((q: Json) => <tr key={q.id}><td>{q.cuota}</td><td>{fecha(q.vencimiento)}</td><td className="numero">{dinero(q.monto)}</td><td className="numero">{dinero(q.saldo)}</td></tr>)}</tbody>
          </table>
        </section>
      )}
      {d.aplicaciones.length > 0 && (
        <section className="panel">
          <h2>Cobros y aplicaciones</h2>
          <table className="lista compacta">
            <thead><tr><th>Fecha</th><th>Origen</th><th className="numero">Monto</th></tr></thead>
            <tbody>{d.aplicaciones.map((a: Json, i: number) => <tr key={i}><td>{fecha(a.fecha)}</td><td>{a.origen}</td><td className="numero">{dinero(a.monto)}</td></tr>)}</tbody>
          </table>
        </section>
      )}
      {d.notas.length > 0 && (
        <section className="panel">
          <h2>Notas de crédito</h2>
          {d.notas.map((n: Json) => <p key={n.id}><Link href={`/ventas/facturas/${n.id}`}>{n.numero}</Link> del {fecha(n.fecha)} por {dinero(n.total)}</p>)}
        </section>
      )}
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <FacturaVenta />
    </Marco>
  );
}
