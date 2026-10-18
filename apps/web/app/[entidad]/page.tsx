'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { buscarEntidad } from '@erp/shared';
import { Celda } from '@/componentes/Campos';
import { Marco } from '@/componentes/Marco';
import { api, ErrorApi, type ListaPaginada } from '@/lib/api';
import { useSesion } from '@/lib/sesion';

function Lista() {
  const { entidad: nombre } = useParams<{ entidad: string }>();
  const entidad = buscarEntidad(nombre);
  const router = useRouter();
  const { puede } = useSesion();
  const [buscar, setBuscar] = useState('');
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<ListaPaginada | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entidad) return;
    const t = setTimeout(() => {
      const q = new URLSearchParams({ pagina: String(pagina), limite: '50' });
      if (buscar) q.set('buscar', buscar);
      api<ListaPaginada>(`/api/e/${entidad.nombre}?${q}`)
        .then((d) => {
          setDatos(d);
          setError(null);
        })
        .catch((e: unknown) => setError(e instanceof ErrorApi ? e.message : 'Ocurrió un error.'));
    }, 250);
    return () => clearTimeout(t);
  }, [entidad, buscar, pagina]);

  if (!entidad) return <p className="aviso error">Esta pantalla no existe.</p>;
  const columnas = entidad.listado.map((c) => entidad.campos.find((f) => f.nombre === c)!).filter(Boolean);
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.limite)) : 1;

  return (
    <>
      <div className="barra">
        <h1>{entidad.titulo}</h1>
        {entidad.busqueda.length > 0 && (
          <input
            type="text"
            placeholder="Buscar…"
            value={buscar}
            onChange={(e) => {
              setBuscar(e.target.value);
              setPagina(1);
            }}
          />
        )}
        {!entidad.soloLectura && puede(entidad.nombre, 'CREAR') && (
          <Link className="boton" href={`/${entidad.nombre}/nuevo`}>
            Nuevo
          </Link>
        )}
      </div>
      {error && <p className="aviso error">{error}</p>}
      <table className="lista">
        <thead>
          <tr>
            {columnas.map((c) => (
              <th key={c.nombre}>{c.etiqueta}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {datos?.filas.map((fila) => (
            <tr key={String(fila.id)} onClick={() => router.push(`${entidad.rutaDetalle ?? `/${entidad.nombre}`}/${String(fila.id)}`)}>
              {columnas.map((c) => (
                <td key={c.nombre}>
                  <Celda campo={c} valor={fila[c.nombre]} />
                </td>
              ))}
            </tr>
          ))}
          {datos && datos.filas.length === 0 && (
            <tr>
              <td colSpan={columnas.length} className="tenue">
                No hay registros.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {datos && (
        <div className="paginacion">
          <span>
            {datos.total} {datos.total === 1 ? 'registro' : 'registros'} · página {pagina} de {paginas}
          </span>
          <button className="secundario" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
            Anterior
          </button>
          <button className="secundario" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>
            Siguiente
          </button>
        </div>
      )}
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <Lista />
    </Marco>
  );
}
