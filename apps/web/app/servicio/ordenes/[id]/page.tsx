'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Marco } from '@/componentes/Marco';
import { Seleccion } from '@/componentes/Seleccion';
import { api, ErrorApi } from '@/lib/api';
import { cantidad, COBERTURAS, dinero, fechaHora } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

interface Detalle {
  orden: Json;
  fase: string;
  estados: { estado: number; descripcion: string; fase: string }[];
  siguientes: { estado: number; descripcion: string; fase: string }[];
  actividades: Json[];
  horas: Json[];
  consumos: Json[];
  terceros: Json[];
  camposDefinicion: { campo: string; etiqueta: string; tipo_dato: string; obligatorio: boolean; sensible: boolean }[];
  reclamo: Json | null;
  resumen: { horasPrevistas: string; horasReales: string; costoReal: string };
}

const ABIERTAS = ['REGISTRADA', 'PROGRAMADA', 'EJECUCION', 'TERMINADA'];

function Panel({ titulo, children, accion }: { titulo: string; children: ReactNode; accion?: ReactNode }) {
  return (
    <section className="panel">
      <div className="barra">
        <h2 style={{ margin: '0 auto 0 0' }}>{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  );
}

function OrdenServicio() {
  const { id } = useParams<{ id: string }>();
  const { puede } = useSesion();
  const [d, setD] = useState<Detalle | null>(null);
  const [pre, setPre] = useState<Json | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const det = await api<Detalle>(`/api/srv/ordenes/${id}`);
      setD(det);
      if (['TERMINADA', 'REVISADA', 'FACTURADA', 'CERRADA'].includes(det.fase)) {
        setPre(await api<Json>(`/api/srv/ordenes/${id}/prefactura`));
      } else setPre(null);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'Ocurrió un error.');
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Ejecuta una acción, muestra el resultado y recarga la orden. */
  async function accion(ruta: string, cuerpo: object = {}, mensaje = 'Listo.') {
    setError(null);
    setExito(null);
    try {
      await api(ruta, { metodo: 'POST', cuerpo });
      setExito(mensaje);
      await cargar();
      return true;
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message + (e.campos ? ' ' + Object.values(e.campos).join(' ') : '') : 'Ocurrió un error.');
      return false;
    }
  }

  if (!d) return error ? <p className="aviso error">{error}</p> : <p className="cargando">Cargando…</p>;
  const o = d.orden;
  const abierta = ABIERTAS.includes(d.fase);
  const modificar = puede('srv-ordenes', 'MODIFICAR');
  const estadoActual = d.estados.find((e) => e.estado === o.estado);

  return (
    <>
      <div className="barra">
        <h1>Orden de servicio {o.numero}</h1>
        <span className="etiqueta">{o.estado} {estadoActual?.descripcion}</span>
        <span className={`etiqueta ${o.cobertura !== 'FACTURABLE' ? 'alerta' : ''}`}>{COBERTURAS[o.cobertura]}</span>
        <Link className="boton secundario" href="/servicio/ordenes">Volver</Link>
      </div>
      {error && <p className="aviso error">{error}</p>}
      {exito && <p className="aviso exito">{exito}</p>}

      <div className="datos">
        <div><span>Tipo de orden</span>{o.tipo_orden}</div>
        <div><span>Cliente o paciente</span>{o.cliente}</div>
        <div><span>Objeto atendido</span>{o.objeto ? `${o.objeto}${o.objeto_serie ? ` (${o.objeto_serie})` : ''}` : '-'}</div>
        <div><span>Tempario</span>{o.plantilla ?? '-'}</div>
        <div><span>Solicitada</span>{fechaHora(o.fecha_solicitud)}</div>
        <div><span>Motivo de la cobertura</span>{o.motivo_cobertura ?? '-'}</div>
        {o.caso_id && <div><span>Caso de origen</span><Link href={`/servicio/casos/${o.caso_id}`}>Caso {o.caso_numero}</Link></div>}
        {o.factura && <div><span>Factura</span><Link href={`/facturas/${o.factura_id}`}>{o.factura}</Link></div>}
        <div><span>Descripción</span>{o.descripcion ?? '-'}</div>
      </div>

      <div className="acciones" style={{ marginTop: 0, marginBottom: 16, flexWrap: 'wrap' }}>
        {modificar &&
          d.siguientes
            .filter((s) => s.fase !== 'FACTURADA')
            .sort((a, b) => Number(b.estado > o.estado && b.fase !== 'CANCELADA') - Number(a.estado > o.estado && a.fase !== 'CANCELADA') || a.estado - b.estado)
            .map((s) => {
              const adelante = s.estado > o.estado && s.fase !== 'CANCELADA';
              return (
                <button key={s.estado} className={adelante ? '' : 'secundario'}
                  onClick={() => accion(`/api/srv/ordenes/${id}/estado`, { estado: s.estado }, `Orden en estado ${s.descripcion.toLowerCase()}.`)}>
                  {adelante ? 'Pasar a' : s.fase === 'CANCELADA' ? 'Anular' : 'Regresar a'}: {s.descripcion}
                </button>
              );
            })}
        {d.fase === 'REVISADA' && puede('srv-facturar', 'CREAR') && (
          <button onClick={() => accion(`/api/srv/ordenes/${id}/facturar`, {}, 'Orden facturada y costos cerrados.')}>
            {pre && Number(pre.totales.totalCliente) > 0 ? `Facturar ${dinero(pre.totales.totalCliente)}` : 'Liquidar sin factura'}
          </button>
        )}
        {o.cobertura === 'GARANTIA' && ['FACTURADA', 'CERRADA'].includes(d.fase) && !d.reclamo && puede('srv-reclamos', 'CREAR') && (
          <button className="secundario" onClick={() => accion(`/api/srv/ordenes/${id}/reclamo`, {}, 'Reclamo de garantía generado.')}>
            Generar reclamo al fabricante
          </button>
        )}
        {d.reclamo && <Link className="boton secundario" href="/servicio/reclamos">Reclamo {d.reclamo.numero}: {String(d.reclamo.estado).toLowerCase()}</Link>}
      </div>

      {!o.cobertura_fijada && modificar && <CambioCobertura actual={o.cobertura} onCambiar={(c, m) => accion(`/api/srv/ordenes/${id}/cobertura`, { cobertura: c, motivo: m }, 'Cobertura actualizada.')} />}

      {d.camposDefinicion.length > 0 && <CamposPropios d={d} editable={modificar && abierta} onGuardado={cargar} id={id} />}

      <Panel titulo={`Actividades (horas previstas ${cantidad(d.resumen.horasPrevistas)}, reales ${cantidad(d.resumen.horasReales)})`}>
        <table className="lista compacta">
          <thead>
            <tr><th>Línea</th><th>Actividad</th><th>Perfil</th><th className="numero">Personas</th><th className="numero">Previstas</th><th className="numero">Reales</th><th>Recurso</th><th></th></tr>
          </thead>
          <tbody>
            {d.actividades.map((a) => (
              <FilaActividad key={a.id} a={a} abierta={abierta && modificar}
                onHoras={(datos) => accion(`/api/srv/ordenes/${id}/horas`, { actividadId: a.id, ...datos }, 'Horas registradas.')} />
            ))}
            {d.actividades.length === 0 && <tr><td colSpan={8} className="tenue">Sin actividades.</td></tr>}
          </tbody>
        </table>
        {abierta && modificar && <NuevaActividad onAgregar={(datos) => accion(`/api/srv/ordenes/${id}/actividades`, datos, 'Actividad agregada.')} />}
        {d.horas.length > 0 && (
          <>
            <h3>Horas registradas</h3>
            <table className="lista compacta">
              <thead><tr><th>Fecha</th><th>Recurso</th><th>Inicio</th><th>Fin</th><th className="numero">Horas</th><th className="numero">Costo</th></tr></thead>
              <tbody>
                {d.horas.map((h) => (
                  <tr key={h.id}>
                    <td>{String(h.fecha).slice(0, 10)}</td><td>{h.recurso}</td><td>{h.inicio ? fechaHora(h.inicio) : '-'}</td>
                    <td>{h.fin ? fechaHora(h.fin) : '-'}</td><td className="numero">{cantidad(h.horas)}</td><td className="numero">{dinero(h.costo_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Panel>

      <Panel titulo="Materiales">
        <table className="lista compacta">
          <thead>
            <tr><th>Línea</th><th>Artículo</th><th className="numero">Previsto</th><th className="numero">Consumido</th><th className="numero">Costo unitario</th><th>Facturable</th><th></th></tr>
          </thead>
          <tbody>
            {d.consumos.map((c) => (
              <tr key={c.id} className={c.reversado ? 'tachado' : ''}>
                <td>{c.linea}</td>
                <td>{c.codigo} - {c.descripcion}</td>
                <td className="numero">{cantidad(c.cantidad_prevista)} {c.unidad}</td>
                <td className="numero">{cantidad(c.cantidad)}</td>
                <td className="numero">{c.costo_unitario ? dinero(c.costo_unitario) : '-'}</td>
                <td>{c.facturable ? 'Sí' : 'No'}</td>
                <td>
                  {abierta && modificar && Number(c.cantidad) === 0 && (
                    <button className="secundario" onClick={() => accion(`/api/srv/ordenes/${id}/consumos`, { consumoId: c.id }, 'Material consumido.')}>Consumir</button>
                  )}
                  {abierta && modificar && Number(c.cantidad) > 0 && !c.reversado && (
                    <button className="secundario" onClick={() => accion(`/api/srv/ordenes/${id}/consumos/${c.id}/reversar`, {}, 'Consumo reversado.')}>Reversar</button>
                  )}
                </td>
              </tr>
            ))}
            {d.consumos.length === 0 && <tr><td colSpan={7} className="tenue">Sin materiales.</td></tr>}
          </tbody>
        </table>
        {abierta && modificar && <NuevoConsumo onAgregar={(datos) => accion(`/api/srv/ordenes/${id}/consumos`, datos, 'Material consumido.')} />}
      </Panel>

      <Panel titulo="Servicios de terceros">
        <table className="lista compacta">
          <thead><tr><th>Línea</th><th>Descripción</th><th>Proveedor</th><th className="numero">Costo</th><th className="numero">Precio</th><th>Facturable</th></tr></thead>
          <tbody>
            {d.terceros.map((t) => (
              <tr key={t.id}>
                <td>{t.linea}</td><td>{t.descripcion}</td><td>{t.proveedor ?? '-'}</td>
                <td className="numero">{dinero(t.costo)}</td><td className="numero">{dinero(t.precio)}</td><td>{t.facturable ? 'Sí' : 'No'}</td>
              </tr>
            ))}
            {d.terceros.length === 0 && <tr><td colSpan={6} className="tenue">Sin servicios de terceros.</td></tr>}
          </tbody>
        </table>
        {abierta && modificar && <NuevoTercero onAgregar={(datos) => accion(`/api/srv/ordenes/${id}/terceros`, datos, 'Servicio de tercero registrado.')} />}
      </Panel>

      <p className="tenue">Costo real acumulado: {dinero(d.resumen.costoReal)}</p>

      {pre && <Prefactura pre={pre} />}
      {!pre && abierta && <p className="tenue">La prefactura aparece cuando la orden está terminada técnicamente.</p>}
    </>
  );
}

function FilaActividad({ a, abierta, onHoras }: { a: Json; abierta: boolean; onHoras: (d: Json) => Promise<boolean> }) {
  const [abrir, setAbrir] = useState(false);
  const [recurso, setRecurso] = useState<string | null>(a.recurso_id ?? null);
  const [horas, setHoras] = useState('');
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  async function enviar(e: FormEvent) {
    e.preventDefault();
    const datos: Json = { recursoId: recurso };
    if (inicio && fin) Object.assign(datos, { inicio: new Date(inicio).toISOString(), fin: new Date(fin).toISOString() });
    else datos.horas = horas;
    if (await onHoras(datos)) {
      setAbrir(false);
      setHoras('');
      setInicio('');
      setFin('');
    }
  }
  return (
    <>
      <tr>
        <td>{a.linea}</td><td>{a.descripcion}</td><td>{a.perfil ?? '-'}</td><td className="numero">{a.personas}</td>
        <td className="numero">{cantidad(a.horas_previstas)}</td><td className="numero">{cantidad(a.horas_reales)}</td><td>{a.recurso ?? '-'}</td>
        <td>{abierta && <button className="secundario" onClick={() => setAbrir(!abrir)}>Registrar horas</button>}</td>
      </tr>
      {abrir && (
        <tr>
          <td colSpan={8}>
            <form className="linea-form" onSubmit={enviar}>
              <Seleccion id={`rec-${a.id}`} etiqueta="Recurso" referencia="recursos" valor={recurso} onCambio={setRecurso} requerido />
              <label>Total de horas<input type="text" inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} /></label>
              <span className="tenue">o bien</span>
              <label>Inicio<input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} /></label>
              <label>Fin<input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} /></label>
              <button type="submit">Guardar horas</button>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

function NuevaActividad({ onAgregar }: { onAgregar: (d: Json) => Promise<boolean> }) {
  const [descripcion, setDescripcion] = useState('');
  const [perfil, setPerfil] = useState<string | null>(null);
  const [horas, setHoras] = useState('');
  const [personas, setPersonas] = useState('1');
  return (
    <form className="linea-form" onSubmit={async (e) => {
      e.preventDefault();
      if (await onAgregar({ descripcion, perfilId: perfil, horasPrevistas: horas || 0, personas: Number(personas) || 1 })) {
        setDescripcion('');
        setHoras('');
      }
    }}>
      <label>Nueva actividad<input type="text" className="ancho" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required /></label>
      <Seleccion id="act-perfil" etiqueta="Perfil" referencia="perfiles" valor={perfil} onCambio={setPerfil} />
      <label>Horas previstas<input type="text" inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} /></label>
      <label>Personas<input type="text" inputMode="numeric" value={personas} onChange={(e) => setPersonas(e.target.value)} /></label>
      <button type="submit" className="secundario">Agregar actividad</button>
    </form>
  );
}

function NuevoConsumo({ onAgregar }: { onAgregar: (d: Json) => Promise<boolean> }) {
  const [articulo, setArticulo] = useState<string | null>(null);
  const [bodega, setBodega] = useState<string | null>(null);
  const [cant, setCant] = useState('');
  return (
    <form className="linea-form" onSubmit={async (e) => {
      e.preventDefault();
      if (await onAgregar({ articuloId: articulo, unidadNegocioId: bodega, cantidad: cant })) setCant('');
    }}>
      <Seleccion id="con-articulo" etiqueta="Material" referencia="articulos" valor={articulo} onCambio={setArticulo} requerido />
      <Seleccion id="con-bodega" etiqueta="Bodega (vacío: la de la orden)" referencia="unidades-negocio" valor={bodega} onCambio={setBodega} />
      <label>Cantidad<input type="text" inputMode="decimal" value={cant} onChange={(e) => setCant(e.target.value)} required /></label>
      <button type="submit" className="secundario">Consumir material</button>
    </form>
  );
}

function NuevoTercero({ onAgregar }: { onAgregar: (d: Json) => Promise<boolean> }) {
  const [descripcion, setDescripcion] = useState('');
  const [proveedor, setProveedor] = useState<string | null>(null);
  const [costo, setCosto] = useState('');
  const [precio, setPrecio] = useState('');
  return (
    <form className="linea-form" onSubmit={async (e) => {
      e.preventDefault();
      if (await onAgregar({ descripcion, proveedorId: proveedor, costo, precio: precio || null })) {
        setDescripcion('');
        setCosto('');
        setPrecio('');
      }
    }}>
      <label>Servicio de tercero<input type="text" className="ancho" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required /></label>
      <Seleccion id="ter-proveedor" etiqueta="Proveedor" referencia="direcciones" valor={proveedor} onCambio={setProveedor} />
      <label>Costo<input type="text" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} required /></label>
      <label>Precio (vacío: costo más margen)<input type="text" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} /></label>
      <button type="submit" className="secundario">Registrar</button>
    </form>
  );
}

function CambioCobertura({ actual, onCambiar }: { actual: string; onCambiar: (c: string, m: string) => Promise<boolean> }) {
  const [abrir, setAbrir] = useState(false);
  const [cobertura, setCobertura] = useState(actual);
  const [motivo, setMotivo] = useState('');
  if (!abrir) return <p><button className="enlace" onClick={() => setAbrir(true)}>Cambiar la cobertura</button></p>;
  return (
    <form className="panel linea-form" onSubmit={async (e) => {
      e.preventDefault();
      if (await onCambiar(cobertura, motivo)) setAbrir(false);
    }}>
      <label>Nueva cobertura
        <select value={cobertura} onChange={(e) => setCobertura(e.target.value)}>
          {Object.entries(COBERTURAS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </label>
      <label>Motivo (queda en la auditoría)<input type="text" className="ancho" value={motivo} onChange={(e) => setMotivo(e.target.value)} required /></label>
      <button type="submit">Cambiar</button>
      <button type="button" className="secundario" onClick={() => setAbrir(false)}>Cancelar</button>
    </form>
  );
}

function CamposPropios({ d, editable, onGuardado, id }: { d: Detalle; editable: boolean; onGuardado: () => Promise<void>; id: string }) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<string | null>(null);
  useEffect(() => {
    const v: Record<string, string> = {};
    for (const c of d.camposDefinicion) v[c.campo] = String(d.orden.campos?.[c.campo] ?? '');
    setValores(v);
  }, [d]);
  return (
    <Panel titulo="Datos propios del tipo de orden">
      <form className="formulario" onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api(`/api/srv/ordenes/${id}`, { metodo: 'PUT', cuerpo: { campos: valores } });
          setMensaje('Datos guardados.');
          await onGuardado();
        } catch (err) {
          setMensaje(err instanceof ErrorApi ? err.message : 'Ocurrió un error.');
        }
      }}>
        {d.camposDefinicion.map((c) => (
          <FragmentoCampo key={c.campo} etiqueta={`${c.etiqueta}${c.obligatorio ? ' *' : ''}${c.sensible ? ' (sensible)' : ''}`}>
            <input type={c.tipo_dato === 'FECHA' ? 'date' : 'text'} disabled={!editable} value={valores[c.campo] ?? ''}
              onChange={(e) => setValores({ ...valores, [c.campo]: e.target.value })} />
          </FragmentoCampo>
        ))}
        {editable && <div><button type="submit" className="secundario">Guardar datos</button></div>}
        {mensaje && <span className="tenue">{mensaje}</span>}
      </form>
    </Panel>
  );
}

function FragmentoCampo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <>
      <label>{etiqueta}</label>
      {children}
    </>
  );
}

function Prefactura({ pre }: { pre: Json }) {
  const ORIGEN: Record<string, string> = { MO: 'Mano de obra', MAT: 'Material', TER: 'Tercero', CERRADO: 'Precio cerrado' };
  return (
    <Panel titulo={`Prefactura (${COBERTURAS[pre.cobertura]})`}>
      {pre.advertencias.map((a: string) => <p key={a} className="aviso error">{a}</p>)}
      <table className="lista compacta">
        <thead>
          <tr><th>Origen</th><th>Descripción</th><th className="numero">Cantidad</th><th className="numero">Precio</th><th className="numero">Subtotal</th><th className="numero">Cubierto</th><th className="numero">Cliente</th><th className="numero">IVA</th><th className="numero">Costo</th></tr>
        </thead>
        <tbody>
          {pre.lineas.map((l: Json, i: number) => (
            <tr key={i}>
              <td>{ORIGEN[l.origen]}</td><td>{l.descripcion}</td><td className="numero">{cantidad(l.cantidad)}</td>
              <td className="numero">{dinero(l.precioUnitario)}</td><td className="numero">{dinero(l.subtotal)}</td>
              <td className="numero">{dinero(l.cubierto)}</td><td className="numero">{dinero(l.montoCliente)}</td>
              <td className="numero">{dinero(l.valorImpuesto)}</td><td className="numero">{dinero(l.costo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="totales">
        <div><span>Subtotal</span><span>{dinero(pre.totales.subtotal)}</span></div>
        {pre.cobertura !== 'FACTURABLE' && <div><span>Cubierto por {(COBERTURAS[pre.cobertura] ?? pre.cobertura).toLowerCase()}</span><span>{dinero(pre.totales.cubierto)}</span></div>}
        <div><span>Base para el cliente</span><span>{dinero(pre.totales.baseCliente)}</span></div>
        <div><span>IVA</span><span>{dinero(pre.totales.impuestos)}</span></div>
        <div className="total"><span>Total a facturar</span><span>{dinero(pre.totales.totalCliente)}</span></div>
        <div><span>Costo de la orden</span><span>{dinero(pre.totales.costo)}</span></div>
      </div>
    </Panel>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <OrdenServicio />
    </Marco>
  );
}
