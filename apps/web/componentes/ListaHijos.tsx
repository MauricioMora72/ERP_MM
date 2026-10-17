'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { buscarEntidad } from '@erp/shared';
import { Celda } from '@/componentes/Campos';
import { api, type ListaPaginada } from '@/lib/api';
import { useSesion } from '@/lib/sesion';

/** Registros dependientes dentro de la ficha del padre, con enlace para agregar uno nuevo ya ligado. */
export function ListaHijos({ entidad: nombre, campo, valor, titulo, volver }: { entidad: string; campo: string; valor: string; titulo: string; volver: string }) {
  const entidad = buscarEntidad(nombre);
  const { puede } = useSesion();
  const [datos, setDatos] = useState<ListaPaginada | null>(null);

  useEffect(() => {
    if (!entidad) return;
    api<ListaPaginada>(`/api/e/${entidad.nombre}?${campo}=${valor}&limite=200`).then(setDatos).catch(() => setDatos(null));
  }, [entidad, campo, valor]);

  if (!entidad || !puede(entidad.nombre, 'VER')) return null;
  const columnas = entidad.listado.filter((c) => c !== campo).map((c) => entidad.campos.find((f) => f.nombre === c)!).filter(Boolean);
  const q = new URLSearchParams({ [campo]: valor, volver });
  return (
    <section className="hijos">
      <div className="barra">
        <h2>{titulo}</h2>
        {!entidad.soloLectura && puede(entidad.nombre, 'CREAR') && (
          <Link className="boton secundario" href={`/${entidad.nombre}/nuevo?${q}`}>
            Agregar
          </Link>
        )}
      </div>
      <table className="lista">
        <thead>
          <tr>{columnas.map((c) => <th key={c.nombre}>{c.etiqueta}</th>)}</tr>
        </thead>
        <tbody>
          {datos?.filas.map((f) => (
            <tr key={String(f.id)} onClick={() => (window.location.href = `/${entidad.nombre}/${String(f.id)}?${new URLSearchParams({ volver })}`)}>
              {columnas.map((c) => (
                <td key={c.nombre}>
                  <Celda campo={c} valor={f[c.nombre]} />
                </td>
              ))}
            </tr>
          ))}
          {datos && datos.filas.length === 0 && (
            <tr>
              <td colSpan={columnas.length} className="tenue">Sin registros.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
