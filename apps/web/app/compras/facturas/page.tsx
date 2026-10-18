'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Referencia } from '@/componentes/LineasDocumento';
import { Marco } from '@/componentes/Marco';
import { Seleccion } from '@/componentes/Seleccion';
import { api, ErrorApi } from '@/lib/api';
import { cantidad, dinero, fecha, hoyIso } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

interface Pendiente {
  clave: string;
  recepcion_id: string | null;
  orden_linea_id: string | null;
  orden: string;
  linea: number;
  descripcion: string;
  fecha: string;
  pendiente: string;
  costo_unitario: string;
  marcada: boolean;
  cantidad: string;
  costo: string;
  retRentaId: string | null;
  retIvaId: string | null;
}

interface Directa {
  cuentaId: string | null;
  descripcion: string;
  valor: string;
  impuestoId: string | null;
}

function RegistrarFactura({ proveedorInicial, onRegistrada }: { proveedorInicial: string | null; onRegistrada: (id: string, texto: string) => void }) {
  const [proveedor, setProveedor] = useState<string | null>(proveedorInicial);
  const [numero, setNumero] = useState('');
  const [autorizacion, setAutorizacion] = useState('');
  const [fechaEmision, setFechaEmision] = useState(hoyIso());
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [directas, setDirectas] = useState<Directa[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});

  useEffect(() => {
    setPendientes([]);
    if (!proveedor) return;
    api<Json[]>(`/api/com/pendientes-factura?proveedorId=${proveedor}`)
      .then((r) => setPendientes(r.map((p, i) => ({
        ...(p as Pendiente), clave: `${p.recepcion_id ?? p.orden_linea_id}-${i}`, marcada: true, cantidad: String(Number(p.pendiente)),
        costo: String(Number(p.costo_unitario)), retRentaId: null, retIvaId: null,
      }))))
      .catch(() => setPendientes([]));
  }, [proveedor]);

  const setP = (i: number, cambio: Partial<Pendiente>) => setPendientes(pendientes.map((p, j) => (j === i ? { ...p, ...cambio } : p)));
  const setDir = (i: number, cambio: Partial<Directa>) => setDirectas(directas.map((p, j) => (j === i ? { ...p, ...cambio } : p)));
  const subtotal = pendientes.filter((p) => p.marcada).reduce((s, p) => s + Number(p.cantidad) * Number(p.costo), 0) + directas.reduce((s, x) => s + Number(x.valor || 0), 0);

  async function registrar() {
    setError(null);
    setCampos({});
    try {
      const r = await api<Json>('/api/com/facturas', {
        metodo: 'POST',
        cuerpo: {
          proveedorId: proveedor, numeroFactura: numero, autorizacion: autorizacion || null, fecha: fechaEmision,
          lineas: [
            ...pendientes.filter((p) => p.marcada && Number(p.cantidad) > 0).map((p) => ({
              recepcionId: p.recepcion_id, ordenLineaId: p.orden_linea_id, cantidad: p.cantidad, costoUnitario: p.costo, retRentaId: p.retRentaId, retIvaId: p.retIvaId,
            })),
            ...directas.filter((x) => x.cuentaId && Number(x.valor) > 0).map((x) => ({
              cuentaId: x.cuentaId, descripcion: x.descripcion || null, cantidad: '1', costoUnitario: x.valor, impuestoId: x.impuestoId,
            })),
          ],
        },
      });
      onRegistrada(r.id, `Factura registrada con el número interno ${r.numero}: total ${dinero(r.total)}, retenido ${dinero(r.retenido)}${r.retencion ? ` con la retención ${r.retencion}` : ''}, por pagar ${dinero(r.aPagar)}.`);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'Ocurrió un error.');
      if (e instanceof ErrorApi) setCampos(e.campos ?? {});
    }
  }

  return (
    <section className="panel">
      <h2>Registrar factura de proveedor</h2>
      {error && <p className="aviso error">{error}</p>}
      <div className="linea-form" style={{ marginTop: 0 }}>
        <Seleccion id="fp-proveedor" etiqueta="Proveedor *" referencia="direcciones" valor={proveedor} onCambio={setProveedor} requerido />
        <label>Número del comprobante *<input type="text" placeholder="001-001-000000123" value={numero} onChange={(e) => setNumero(e.target.value)} />
          {campos.numeroFactura && <small className="aviso error">{campos.numeroFactura}</small>}</label>
        <label>Autorización<input type="text" value={autorizacion} onChange={(e) => setAutorizacion(e.target.value)} /></label>
        <label>Fecha de emisión *<input type="date" value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)} /></label>
      </div>
      {proveedor && (
        <>
          <h3>Recibido pendiente y servicios por facturar</h3>
          <p className="tenue">La retención usa los códigos del proveedor; cambie el código en una línea si es distinto (por ejemplo, servicios).</p>
          <table className="lista edicion compacta">
            <thead>
              <tr><th></th><th>Orden</th><th>Línea</th><th>Descripción</th><th>Origen</th><th className="numero">Pendiente</th><th className="numero">Cantidad</th>
                <th className="numero">Costo facturado</th><th>Retención renta (vacío: la del proveedor)</th><th>Retención IVA (vacío: la del proveedor)</th></tr>
            </thead>
            <tbody>
              {pendientes.map((p, i) => (
                <tr key={p.clave}>
                  <td><input type="checkbox" checked={p.marcada} onChange={(e) => setP(i, { marcada: e.target.checked })} aria-label="Incluir" /></td>
                  <td>{p.orden}</td><td>{p.linea}</td><td>{p.descripcion}</td>
                  <td>{p.recepcion_id ? `Recepción del ${fecha(p.fecha)}` : 'Sin recepción'}</td>
                  <td className="numero">{cantidad(p.pendiente)}</td>
                  <td><input type="text" inputMode="decimal" className="numero corto" value={p.cantidad} onChange={(e) => setP(i, { cantidad: e.target.value })} aria-label="Cantidad" /></td>
                  <td><input type="text" inputMode="decimal" className="numero corto" value={p.costo} onChange={(e) => setP(i, { costo: e.target.value })} aria-label="Costo" /></td>
                  <td><Referencia id={`ret-r-${i}`} entidad="codigos-retencion" valor={p.retRentaId} onCambio={(v) => setP(i, { retRentaId: v })} /></td>
                  <td><Referencia id={`ret-i-${i}`} entidad="codigos-retencion" valor={p.retIvaId} onCambio={(v) => setP(i, { retIvaId: v })} /></td>
                </tr>
              ))}
              {pendientes.length === 0 && <tr><td colSpan={10} className="tenue">El proveedor no tiene recepciones ni servicios pendientes de facturar.</td></tr>}
            </tbody>
          </table>
          <h3>Gastos directos sin orden</h3>
          <table className="lista edicion compacta">
            <thead><tr><th>Cuenta de gasto</th><th>Descripción</th><th>Impuesto</th><th className="numero">Valor sin IVA</th><th></th></tr></thead>
            <tbody>
              {directas.map((x, i) => (
                <tr key={i}>
                  <td><Referencia id={`dir-c-${i}`} entidad="cuentas" valor={x.cuentaId} onCambio={(v) => setDir(i, { cuentaId: v })} /></td>
                  <td><input type="text" value={x.descripcion} onChange={(e) => setDir(i, { descripcion: e.target.value })} aria-label="Descripción" /></td>
                  <td><Referencia id={`dir-i-${i}`} entidad="impuestos" valor={x.impuestoId} onCambio={(v) => setDir(i, { impuestoId: v })} /></td>
                  <td><input type="text" inputMode="decimal" className="numero corto" value={x.valor} onChange={(e) => setDir(i, { valor: e.target.value })} aria-label="Valor" /></td>
                  <td><button type="button" className="enlace" onClick={() => setDirectas(directas.filter((_, j) => j !== i))}>Quitar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="acciones">
            <button type="button" className="secundario" onClick={() => setDirectas([...directas, { cuentaId: null, descripcion: '', valor: '', impuestoId: null }])}>Agregar gasto directo</button>
            <span className="resumen">Subtotal sin IVA: <strong>{dinero(subtotal)}</strong></span>
            <button onClick={registrar}>Registrar factura y retención</button>
          </div>
        </>
      )}
    </section>
  );
}

function Facturas() {
  const router = useRouter();
  const params = useSearchParams();
  const { puede } = useSesion();
  const proveedorInicial = params.get('proveedor');
  const [nueva, setNueva] = useState(!!proveedorInicial);
  const [buscar, setBuscar] = useState('');
  const [filas, setFilas] = useState<Json[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = (b: string) => api<Json[]>(`/api/com/facturas${b ? `?buscar=${encodeURIComponent(b)}` : ''}`).then(setFilas).catch(() => setFilas([]));
  useEffect(() => {
    const t = setTimeout(() => void cargar(buscar), 250);
    return () => clearTimeout(t);
  }, [buscar]);

  return (
    <>
      <div className="barra">
        <h1>Facturas de proveedor</h1>
        <input type="text" placeholder="Buscar proveedor o número…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        {puede('compras', 'CREAR') && <button onClick={() => setNueva(!nueva)}>{nueva ? 'Cerrar' : 'Registrar factura'}</button>}
      </div>
      {aviso && <p className="aviso exito">{aviso}</p>}
      {nueva && <RegistrarFactura proveedorInicial={proveedorInicial} onRegistrada={(_id, texto) => { setAviso(texto); setNueva(false); void cargar(buscar); }} />}
      <table className="lista">
        <thead>
          <tr><th>Registro</th><th>Comprobante</th><th>Fecha</th><th>Proveedor</th><th className="numero">Subtotal</th><th className="numero">IVA</th>
            <th className="numero">Total</th><th className="numero">Retenido</th><th className="numero">Saldo</th></tr>
        </thead>
        <tbody>
          {filas?.map((f) => (
            <tr key={f.id} onClick={() => router.push(`/compras/facturas/${f.id}`)}>
              <td>{f.numero}</td><td>{f.numero_factura}</td><td>{fecha(f.fecha)}</td><td>{f.proveedor}</td><td className="numero">{dinero(f.subtotal)}</td>
              <td className="numero">{dinero(f.impuestos)}</td><td className="numero">{dinero(f.total)}</td><td className="numero">{dinero(f.retenciones)}</td>
              <td className="numero">{dinero(f.saldo)}</td>
            </tr>
          ))}
          {filas && filas.length === 0 && <tr><td colSpan={9} className="tenue">No hay facturas registradas.</td></tr>}
        </tbody>
      </table>
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <Suspense fallback={<p className="cargando">Cargando…</p>}>
        <Facturas />
      </Suspense>
    </Marco>
  );
}
