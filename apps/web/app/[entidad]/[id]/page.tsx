'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Fragment, Suspense, useEffect, useState, type FormEvent } from 'react';
import { buscarEntidad } from '@erp/shared';
import { Entrada, type Valor } from '@/componentes/Campos';
import { ListaHijos } from '@/componentes/ListaHijos';
import { Marco } from '@/componentes/Marco';
import { api, ErrorApi } from '@/lib/api';
import { invalidarOpciones } from '@/lib/opciones';
import { useSesion } from '@/lib/sesion';

function Ficha() {
  const { entidad: nombre, id } = useParams<{ entidad: string; id: string }>();
  const entidad = buscarEntidad(nombre);
  const esNuevo = id === 'nuevo';
  const router = useRouter();
  const consulta = useSearchParams();
  const { puede } = useSesion();
  const [valores, setValores] = useState<Record<string, Valor>>({});
  const [original, setOriginal] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!entidad) return;
    if (esNuevo) {
      const iniciales: Record<string, Valor> = {};
      for (const c of entidad.campos) if (c.defecto !== undefined) iniciales[c.nombre] = c.defecto;
      // Valores que vienen de la ficha del padre, por ejemplo ?plantilla_id=...
      for (const c of entidad.campos) {
        const v = consulta.get(c.nombre);
        if (v) iniciales[c.nombre] = v;
      }
      setValores(iniciales);
      return;
    }
    api<Record<string, unknown>>(`/api/e/${entidad.nombre}/${id}`)
      .then((fila) => {
        setOriginal(fila);
        setValores(Object.fromEntries(entidad.campos.map((c) => [c.nombre, fila[c.nombre] as Valor])));
      })
      .catch((e: unknown) => setError(e instanceof ErrorApi ? e.message : 'Ocurrió un error.'));
  }, [entidad, id, esNuevo, consulta]);

  if (!entidad) return <p className="aviso error">Esta pantalla no existe.</p>;
  const editable = !entidad.soloLectura && (esNuevo ? puede(entidad.nombre, 'CREAR') : puede(entidad.nombre, 'MODIFICAR'));
  const volver = consulta.get('volver');

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!entidad) return;
    setError(null);
    setExito(null);
    setCampos({});
    setGuardando(true);
    try {
      const cuerpo: Record<string, Valor> = {};
      for (const c of entidad.campos) {
        if (!esNuevo && c.soloAlta) continue;
        const v = valores[c.nombre];
        if (esNuevo && (v === undefined || v === '')) continue;
        if (!esNuevo && original && v === original[c.nombre]) continue;
        cuerpo[c.nombre] = v === '' ? null : v;
      }
      const fila = await api<Record<string, unknown>>(
        esNuevo ? `/api/e/${entidad.nombre}` : `/api/e/${entidad.nombre}/${id}`,
        { metodo: esNuevo ? 'POST' : 'PUT', cuerpo },
      );
      invalidarOpciones(entidad.nombre);
      if (esNuevo) {
        router.replace(volver ?? `/${entidad.nombre}/${String(fila.id)}`);
      } else {
        setOriginal(fila);
        setExito('Cambios guardados.');
      }
    } catch (err) {
      if (err instanceof ErrorApi) {
        setError(err.message);
        setCampos(err.campos ?? {});
      } else setError('Ocurrió un error.');
    } finally {
      setGuardando(false);
    }
  }

  async function anular() {
    if (!entidad) return;
    const verbo = entidad.inactivable ? 'inactivar' : 'borrar';
    if (!window.confirm(`¿Desea ${verbo} este registro?`)) return;
    try {
      await api(`/api/e/${entidad.nombre}/${id}/anular`, { metodo: 'POST' });
      invalidarOpciones(entidad.nombre);
      router.replace(`/${entidad.nombre}`);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'Ocurrió un error.');
    }
  }

  return (
    <>
      <div className="barra">
        <h1>
          {esNuevo ? `Nuevo: ${entidad.tituloSingular}` : entidad.tituloSingular}
        </h1>
        <Link className="boton secundario" href={volver ?? `/${entidad.nombre}`}>
          {volver ? 'Volver' : 'Volver a la lista'}
        </Link>
      </div>
      {error && <p className="aviso error">{error}</p>}
      {exito && <p className="aviso exito">{exito}</p>}
      <form onSubmit={guardar}>
        <div className="formulario">
          {entidad.campos.map((c) => (
            <Fragment key={c.nombre}>
              <label htmlFor={`campo-${c.nombre}`}>
                {c.etiqueta}
                {c.requerido ? ' *' : ''}
              </label>
              <Entrada
                campo={c}
                valor={valores[c.nombre]}
                bloqueado={!editable || (!esNuevo && c.soloAlta)}
                onCambio={(v) => setValores((actual) => ({ ...actual, [c.nombre]: v }))}
              />
              {campos[c.nombre] && <span className="error-campo">{campos[c.nombre]}</span>}
              {c.ayuda && <span className="ayuda">{c.ayuda}</span>}
            </Fragment>
          ))}
        </div>
        <div className="acciones">
          {editable && (
            <button type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          )}
          {!esNuevo && !entidad.soloLectura && puede(entidad.nombre, 'ANULAR') && (
            <button type="button" className="secundario" onClick={anular}>
              {entidad.inactivable ? 'Inactivar' : 'Borrar'}
            </button>
          )}
        </div>
      </form>
      {!esNuevo &&
        entidad.hijos?.map((h) => (
          <ListaHijos key={h.entidad} entidad={h.entidad} campo={h.campo} valor={id} titulo={h.titulo} volver={`/${entidad.nombre}/${id}`} />
        ))}
      {original && (
        <p className="auditoria">
          Creado por {String(original.creado_por)} el {String(original.creado_en).slice(0, 19).replace('T', ' ')}
          {original.modificado_en
            ? ` · modificado por ${String(original.modificado_por)} el ${String(original.modificado_en).slice(0, 19).replace('T', ' ')}`
            : ''}
        </p>
      )}
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <Suspense fallback={<p className="cargando">Cargando…</p>}>
        <Ficha />
      </Suspense>
    </Marco>
  );
}
