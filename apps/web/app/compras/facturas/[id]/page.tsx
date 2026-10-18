'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Marco } from '@/componentes/Marco';
import { api, ErrorApi } from '@/lib/api';
import { cantidad, dinero, fecha } from '@/lib/formato';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function FacturaProveedor() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Json | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Json>(`/api/com/facturas/${id}`).then(setD).catch((e) => setError(e instanceof ErrorApi ? e.message : 'Ocurrió un error.'));
  }, [id]);
  if (!d) return error ? <p className="aviso error">{error}</p> : <p className="cargando">Cargando…</p>;
  const f = d.factura;
  return (
    <>
      <div className="barra">
        <h1>Factura de proveedor {f.numero_factura}</h1>
        <Link className="boton secundario" href="/compras/facturas">Volver</Link>
      </div>
      <div className="datos">
        <div><span>Proveedor</span>{f.proveedor} ({f.identificacion})</div>
        <div><span>Registro interno</span>{f.numero}</div>
        <div><span>Emisión</span>{fecha(f.fecha)}</div>
        <div><span>Registro contable</span>{fecha(f.fecha_registro)}</div>
        <div><span>Autorización</span>{f.autorizacion ?? '-'}</div>
        <div><span>Subtotal</span>{dinero(f.subtotal)}</div>
        <div><span>IVA</span>{dinero(f.impuestos)}</div>
        <div><span>Total</span>{dinero(f.total)}</div>
        <div><span>Retenido</span>{dinero(f.retenciones)}</div>
        {f.asiento_id && <div><span>Asiento</span><Link href={`/asientos/${f.asiento_id}`}>Ver asiento</Link></div>}
      </div>
      <section className="panel">
        <h2>Detalle</h2>
        <table className="lista compacta">
          <thead><tr><th>Línea</th><th>Descripción</th><th className="numero">Cantidad</th><th className="numero">Costo</th><th className="numero">IVA</th><th className="numero">Total</th><th>Ret. renta</th><th>Ret. IVA</th></tr></thead>
          <tbody>
            {d.lineas.map((l: Json) => (
              <tr key={l.id}><td>{l.linea}</td><td>{l.descripcion}</td><td className="numero">{cantidad(l.cantidad)}</td><td className="numero">{dinero(l.costo_unitario)}</td>
                <td className="numero">{dinero(l.valor_impuesto)}</td><td className="numero">{dinero(l.total)}</td><td>{l.ret_renta ?? '-'}</td><td>{l.ret_iva ?? '-'}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
      {d.retencion && (
        <section className="panel">
          <h2>Retención emitida {d.retencion.numero}</h2>
          <table className="lista compacta">
            <thead><tr><th>Tipo</th><th>Código</th><th>Concepto</th><th className="numero">Base</th><th className="numero">%</th><th className="numero">Valor</th></tr></thead>
            <tbody>
              {d.retencion.lineas.map((l: Json, i: number) => (
                <tr key={i}><td>{l.tipo}</td><td>{l.codigo}</td><td>{l.descripcion}</td><td className="numero">{dinero(l.base)}</td><td className="numero">{cantidad(l.porcentaje)}</td><td className="numero">{dinero(l.valor)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <section className="panel">
        <h2>Cuotas por pagar</h2>
        <table className="lista compacta">
          <thead><tr><th>Cuota</th><th>Vencimiento</th><th className="numero">Monto</th><th className="numero">Saldo</th></tr></thead>
          <tbody>
            {d.cuotas.map((q: Json) => <tr key={q.id}><td>{q.cuota}</td><td>{fecha(q.vencimiento)}</td><td className="numero">{dinero(q.monto)}</td><td className="numero">{dinero(q.saldo)}</td></tr>)}
          </tbody>
        </table>
        <p><Link href="/cxp/pagos">Ir a pagos</Link></p>
      </section>
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <FacturaProveedor />
    </Marco>
  );
}
