'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { BotonesEstado } from '@/componentes/LineasDocumento';
import { Marco } from '@/componentes/Marco';
import { api, ErrorApi } from '@/lib/api';
import { cantidad, dinero, fecha, FASES_LINEA } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function OrdenVenta() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { puede } = useSesion();
  const [d, setD] = useState<Json | null>(null);
  const [despachar, setDespachar] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<{ tipo: string; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await api<Json>(`/api/ven/ordenes/${id}`);
      setD(r);
      setDespachar(Object.fromEntries(r.lineas.filter((l: Json) => l.fase === 'APROBADA').map((l: Json) => [l.id, String(Number(l.cantidad) - Number(l.cantidad_despachada))])));
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ErrorApi ? e.message : 'Ocurrió un error.' });
    }
  }, [id]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function accion(ruta: string, cuerpo: object, exito: (r: Json) => string) {
    setMensaje(null);
    try {
      const r = await api<Json>(ruta, { metodo: 'POST', cuerpo });
      setMensaje({ tipo: 'exito', texto: exito(r) });
      await cargar();
      return r;
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ErrorApi ? e.message : 'Ocurrió un error.' });
      return null;
    }
  }

  if (!d) return mensaje ? <p className={`aviso ${mensaje.tipo}`}>{mensaje.texto}</p> : <p className="cargando">Cargando…</p>;
  const o = d.orden;
  const modificar = puede('ventas', 'MODIFICAR');
  const esOV = o.tipo === 'OV';
  const porDespachar = d.lineas.filter((l: Json) => l.fase === 'APROBADA');
  const porFacturar = d.lineas.some((l: Json) => Number(l.cantidad_despachada) > Number(l.cantidad_facturada));
  const vigentes = d.lineas.filter((l: Json) => l.fase !== 'CANCELADA');
  const subtotal = vigentes.reduce((s: number, l: Json) => s + Number(l.total), 0);

  return (
    <>
      <div className="barra">
        <h1>{o.tipo_descripcion} {o.numero}</h1>
        <Link className="boton secundario" href="/ventas/ordenes">Volver</Link>
      </div>
      {mensaje && <p className={`aviso ${mensaje.tipo}`}>{mensaje.texto}</p>}
      <div className="datos">
        <div><span>Cliente</span>{o.cliente}</div>
        <div><span>Sucursal</span>{o.sucursal}</div>
        <div><span>Fecha</span>{fecha(o.fecha)}</div>
        <div><span>Orden de compra del cliente</span>{o.referencia ?? '-'}</div>
        <div><span>Condición de pago</span>{o.condicion_pago ?? '-'}</div>
        <div><span>Observación</span>{o.observacion ?? '-'}</div>
        {o.origen_numero && <div><span>Origen</span><Link href={`/ventas/ordenes/${o.documento_origen_id}`}>Cotización {o.origen_numero}</Link></div>}
        {d.derivadas.length > 0 && <div><span>Órdenes generadas</span>{d.derivadas.map((x: Json) => <Link key={x.id} href={`/ventas/ordenes/${x.id}`}>{x.numero} </Link>)}</div>}
        <div><span>Total sin IVA</span>{dinero(subtotal)}</div>
        {d.facturas.length > 0 && <div><span>Facturas</span>{d.facturas.map((f: Json) => <Link key={f.id} href={`/ventas/facturas/${f.id}`}>{f.numero} </Link>)}</div>}
      </div>

      <div className="acciones" style={{ marginTop: 0, marginBottom: 16, flexWrap: 'wrap' }}>
        {modificar && (
          <BotonesEstado lineas={d.lineas} excluirFases={['DESPACHADA', 'FACTURADA', 'CERRADA']}
            onCambiar={(estado, desc) => accion(`/api/ven/ordenes/${id}/estado`, { estado }, () => `Líneas en estado ${desc.toLowerCase()}.`)} />
        )}
        {!esOV && d.lineas.some((l: Json) => l.fase === 'REGISTRADA') && puede('ventas', 'CREAR') && (
          <button onClick={async () => {
            const r = await accion(`/api/ven/ordenes/${id}/convertir`, {}, (x) => `Orden de venta ${x.numero} generada.`);
            if (r?.id) router.push(`/ventas/ordenes/${r.id}`);
          }}>Convertir en orden de venta</button>
        )}
        {esOV && porFacturar && puede('ventas', 'CREAR') && (
          <button onClick={() => accion(`/api/ven/ordenes/${id}/facturar`, {}, (x) => `Factura ${x.numero} emitida por ${dinero(x.total)}.`)}>Facturar lo despachado</button>
        )}
      </div>

      <section className="panel">
        <h2>Líneas</h2>
        <table className="lista edicion">
          <thead>
            <tr><th>Línea</th><th>Artículo</th><th>Descripción</th><th>Bodega</th><th className="numero">Cantidad</th>{esOV && <th className="numero">Disponible</th>}
              {esOV && <th className="numero">Despachada</th>}{esOV && <th className="numero">Facturada</th>}<th className="numero">Precio</th>
              <th className="numero">Descuento</th><th className="numero">Total</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {d.lineas.map((l: Json) => (
              <tr key={l.id}>
                <td>{l.linea}</td><td>{l.articulo}</td><td>{l.descripcion}</td><td>{l.bodega}</td><td className="numero">{cantidad(l.cantidad)} {l.unidad}</td>
                {esOV && <td className="numero">{l.tipo_existencia === 'INVENTARIABLE' ? cantidad(l.disponible) : '-'}</td>}
                {esOV && <td className="numero">{cantidad(l.cantidad_despachada)}</td>}{esOV && <td className="numero">{cantidad(l.cantidad_facturada)}</td>}
                <td className="numero">{dinero(l.precio)}</td><td className="numero">{dinero(l.descuento)}</td><td className="numero">{dinero(l.total)}</td>
                <td>{l.estado_ultimo} {FASES_LINEA[l.fase] ?? ''}</td>
                <td>
                  {modificar && esOV && l.fase === 'APROBADA' && Number(l.cantidad_despachada) > 0 && (
                    <button className="enlace" onClick={() => accion(`/api/ven/ordenes/${id}/cerrar-saldo`, { lineaId: l.id }, () => `Saldo de la línea ${l.linea} cerrado.`)}>Cerrar saldo</button>
                  )}
                  {modificar && Number(l.cantidad_despachada) === 0 && l.siguientes.some((s: Json) => s.fase === 'CANCELADA') && (
                    <button className="enlace" onClick={() => accion(`/api/ven/ordenes/${id}/estado`, { estado: l.siguientes.find((s: Json) => s.fase === 'CANCELADA').estado, lineas: [l.id] }, () => `Línea ${l.linea} cancelada.`)}>Cancelar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {esOV && porDespachar.length > 0 && puede('ventas', 'CREAR') && (
        <section className="panel">
          <h2>Despachar</h2>
          <p className="tenue">Los inventariables salen del kardex al costo promedio. Los servicios solo se confirman.</p>
          <table className="lista edicion compacta">
            <thead><tr><th>Línea</th><th>Descripción</th><th className="numero">Pendiente</th><th className="numero">Despachar ahora</th></tr></thead>
            <tbody>
              {porDespachar.map((l: Json) => (
                <tr key={l.id}>
                  <td>{l.linea}</td><td>{l.descripcion}</td><td className="numero">{cantidad(Number(l.cantidad) - Number(l.cantidad_despachada))}</td>
                  <td><input type="text" inputMode="decimal" className="numero corto" value={despachar[l.id] ?? ''} onChange={(e) => setDespachar({ ...despachar, [l.id]: e.target.value })} aria-label={`Despachar línea ${l.linea}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="acciones">
            <button onClick={() => accion(`/api/ven/ordenes/${id}/despachar`, {
              lineas: Object.entries(despachar).filter(([, v]) => Number(v) > 0).map(([lineaId, v]) => ({ lineaId, cantidad: v })),
            }, (x) => `Despacho ${x.numero} registrado.`)}>Confirmar despacho</button>
          </div>
        </section>
      )}
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <OrdenVenta />
    </Marco>
  );
}
