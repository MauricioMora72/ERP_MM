'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { BotonesEstado } from '@/componentes/LineasDocumento';
import { Marco } from '@/componentes/Marco';
import { Seleccion } from '@/componentes/Seleccion';
import { api, ErrorApi } from '@/lib/api';
import { cantidad, dinero, fecha, fechaHora, FASES_LINEA } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function OrdenCompra() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { puede } = useSesion();
  const [d, setD] = useState<Json | null>(null);
  const [recibir, setRecibir] = useState<Record<string, string>>({});
  const [proveedor, setProveedor] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: string; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await api<Json>(`/api/com/ordenes/${id}`);
      setD(r);
      setRecibir(Object.fromEntries(r.lineas.filter((l: Json) => l.fase === 'APROBADA').map((l: Json) => [l.id, String(Number(l.cantidad) - Number(l.cantidad_recibida))])));
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ErrorApi ? e.message : 'Ocurrió un error.' });
    }
  }, [id]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function accion(ruta: string, cuerpo: object, exito: string) {
    setMensaje(null);
    try {
      const r = await api<Json>(ruta, { metodo: 'POST', cuerpo });
      setMensaje({ tipo: 'exito', texto: exito });
      await cargar();
      return r;
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ErrorApi ? e.message : 'Ocurrió un error.' });
      return null;
    }
  }

  if (!d) return mensaje ? <p className={`aviso ${mensaje.tipo}`}>{mensaje.texto}</p> : <p className="cargando">Cargando…</p>;
  const o = d.orden;
  const modificar = puede('compras', 'MODIFICAR');
  const esOC = o.tipo === 'OC';
  const porRecibir = d.lineas.filter((l: Json) => l.fase === 'APROBADA');
  const aprobadasRQ = !esOC && d.lineas.some((l: Json) => l.fase === 'APROBADA');
  const total = d.lineas.filter((l: Json) => l.fase !== 'CANCELADA').reduce((s: number, l: Json) => s + Number(l.total), 0);

  return (
    <>
      <div className="barra">
        <h1>{o.tipo_descripcion} {o.numero}</h1>
        <Link className="boton secundario" href="/compras/ordenes">Volver</Link>
      </div>
      {mensaje && <p className={`aviso ${mensaje.tipo}`}>{mensaje.texto}</p>}
      <div className="datos">
        <div><span>Proveedor</span>{o.proveedor ?? '-'}</div>
        <div><span>Sucursal</span>{o.sucursal}</div>
        <div><span>Fecha</span>{fecha(o.fecha)}</div>
        <div><span>Fecha requerida</span>{fecha(o.fecha_requerida)}</div>
        <div><span>Condición de pago</span>{o.condicion_pago ?? '-'}</div>
        <div><span>Observación</span>{o.observacion ?? '-'}</div>
        {o.origen_numero && <div><span>Origen</span><Link href={`/compras/ordenes/${o.documento_origen_id}`}>Requisición {o.origen_numero}</Link></div>}
        {d.derivadas.length > 0 && <div><span>Órdenes generadas</span>{d.derivadas.map((x: Json) => <Link key={x.id} href={`/compras/ordenes/${x.id}`}>{x.numero} </Link>)}</div>}
        <div><span>Total sin IVA</span>{dinero(total)}</div>
      </div>

      {modificar && (
        <div className="acciones" style={{ marginTop: 0, marginBottom: 16, flexWrap: 'wrap' }}>
          <BotonesEstado lineas={d.lineas} excluirFases={['RECIBIDA', 'FACTURADA', 'CERRADA']}
            onCambiar={(estado, desc) => accion(`/api/com/ordenes/${id}/estado`, { estado }, `Líneas en estado ${desc.toLowerCase()}.`)} />
        </div>
      )}

      <section className="panel">
        <h2>Líneas</h2>
        <table className="lista edicion">
          <thead>
            <tr><th>Línea</th><th>Artículo o cuenta</th><th>Descripción</th><th>Destino</th><th className="numero">Cantidad</th><th className="numero">Recibida</th>
              <th className="numero">Facturada</th><th className="numero">Costo</th><th className="numero">Total</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {d.lineas.map((l: Json) => (
              <tr key={l.id}>
                <td>{l.linea}</td><td>{l.articulo ?? l.cuenta}</td><td>{l.descripcion}</td><td>{l.bodega}</td>
                <td className="numero">{cantidad(l.cantidad)} {l.unidad}</td><td className="numero">{cantidad(l.cantidad_recibida)}</td>
                <td className="numero">{cantidad(l.cantidad_facturada)}</td><td className="numero">{dinero(l.costo_unitario)}</td><td className="numero">{dinero(l.total)}</td>
                <td>{l.estado_ultimo} {FASES_LINEA[l.fase] ?? ''}</td>
                <td>
                  {modificar && esOC && l.fase === 'APROBADA' && Number(l.cantidad_recibida) > 0 && (
                    <button className="enlace" onClick={() => accion(`/api/com/ordenes/${id}/cerrar-saldo`, { lineaId: l.id }, `Saldo de la línea ${l.linea} cerrado.`)}>Cerrar saldo</button>
                  )}
                  {modificar && Number(l.cantidad_recibida) === 0 && l.siguientes.some((s: Json) => s.fase === 'CANCELADA') && (
                    <button className="enlace" onClick={() => accion(`/api/com/ordenes/${id}/estado`, { estado: l.siguientes.find((s: Json) => s.fase === 'CANCELADA').estado, lineas: [l.id] }, `Línea ${l.linea} cancelada.`)}>Cancelar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {esOC && porRecibir.length > 0 && puede('compras', 'CREAR') && (
        <section className="panel">
          <h2>Recibir</h2>
          <p className="tenue">Los inventariables entran al kardex al costo de la orden. Los servicios se pueden recibir aquí o facturar directamente.</p>
          <table className="lista edicion compacta">
            <thead><tr><th>Línea</th><th>Descripción</th><th className="numero">Pendiente</th><th className="numero">Recibir ahora</th></tr></thead>
            <tbody>
              {porRecibir.map((l: Json) => (
                <tr key={l.id}>
                  <td>{l.linea}</td><td>{l.descripcion}</td><td className="numero">{cantidad(Number(l.cantidad) - Number(l.cantidad_recibida))}</td>
                  <td><input type="text" inputMode="decimal" className="numero corto" value={recibir[l.id] ?? ''} onChange={(e) => setRecibir({ ...recibir, [l.id]: e.target.value })} aria-label={`Recibir línea ${l.linea}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="acciones">
            <button onClick={() => accion(`/api/com/ordenes/${id}/recibir`, {
              lineas: Object.entries(recibir).filter(([, v]) => Number(v) > 0).map(([lineaId, v]) => ({ lineaId, cantidad: v })),
            }, 'Recepción registrada con su kardex y su asiento.')}>Registrar recepción</button>
          </div>
        </section>
      )}

      {aprobadasRQ && puede('compras', 'CREAR') && (
        <section className="panel">
          <h2>Convertir en orden de compra</h2>
          <div className="linea-form" style={{ marginTop: 0 }}>
            <Seleccion id="rq-proveedor" etiqueta="Proveedor *" referencia="direcciones" valor={proveedor ?? o.proveedor_id} onCambio={setProveedor} requerido />
            <button onClick={async () => {
              const r = await accion(`/api/com/ordenes/${id}/convertir`, { proveedorId: proveedor ?? o.proveedor_id }, 'Orden de compra generada.');
              if (r?.id) router.push(`/compras/ordenes/${r.id}`);
            }}>Generar orden de compra</button>
          </div>
        </section>
      )}

      {d.recepciones.length > 0 && (
        <section className="panel">
          <h2>Recepciones</h2>
          <table className="lista compacta">
            <thead><tr><th>Fecha</th><th>Línea</th><th>Descripción</th><th className="numero">Cantidad</th><th className="numero">Costo</th><th className="numero">Facturada</th></tr></thead>
            <tbody>
              {d.recepciones.map((r: Json) => (
                <tr key={r.id}><td>{fecha(r.fecha)}</td><td>{r.linea}</td><td>{r.descripcion}</td><td className="numero">{cantidad(r.cantidad)}</td>
                  <td className="numero">{dinero(r.costo_unitario)}</td><td className="numero">{cantidad(r.cantidad_facturada)}</td></tr>
              ))}
            </tbody>
          </table>
          {esOC && o.proveedor_id && <p><Link href={`/compras/facturas?proveedor=${o.proveedor_id}`}>Registrar la factura del proveedor</Link></p>}
        </section>
      )}

      {d.aprobaciones.length > 0 && (
        <section className="panel">
          <h2>Aprobaciones</h2>
          {d.aprobaciones.map((a: Json) => (
            <p key={a.nivel}>Nivel {a.nivel}: {String(a.resultado).toLowerCase()} por {a.aprobador} el {fechaHora(a.fecha)}{a.comentario ? `. ${a.comentario}` : ''}</p>
          ))}
        </section>
      )}
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <OrdenCompra />
    </Marco>
  );
}
