'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Marco } from '@/componentes/Marco';
import { Seleccion } from '@/componentes/Seleccion';
import { api, ErrorApi } from '@/lib/api';
import { fecha } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function Conteos() {
  const router = useRouter();
  const { puede } = useSesion();
  const [filas, setFilas] = useState<Json[] | null>(null);
  const [bodega, setBodega] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Json[]>('/api/inventario/documentos?tipo=CF').then(setFilas).catch(() => setFilas([]));
  }, []);

  async function crear() {
    setError(null);
    try {
      const r = await api<{ id: string }>('/api/inventario/conteos', { metodo: 'POST', cuerpo: { unidadNegocioId: bodega, categoria } });
      router.push(`/inventario/conteos/${r.id}`);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'Ocurrió un error.');
    }
  }

  return (
    <>
      <h1>Conteo físico</h1>
      <p className="tenue">El conteo toma una foto de las existencias de la bodega al crearlo. Mientras se cuenta, conviene detener los movimientos de esa bodega.</p>
      {error && <p className="aviso error">{error}</p>}
      {puede('inventario', 'CREAR') && (
        <div className="linea-form">
          <Seleccion id="cf-bodega" etiqueta="Bodega *" referencia="unidades-negocio" valor={bodega} onCambio={setBodega} requerido />
          <Seleccion id="cf-categoria" etiqueta="Categoría (vacío: todas)" catalogo={{ modulo: 'MAE', codigo: 'CATEGORIA_ART' }} valor={categoria} onCambio={setCategoria} />
          <button onClick={crear} disabled={!bodega}>Iniciar conteo</button>
        </div>
      )}
      <table className="lista" style={{ marginTop: 14 }}>
        <thead><tr><th>Número</th><th>Fecha</th><th>Bodega</th><th className="numero">Líneas</th><th>Estado</th></tr></thead>
        <tbody>
          {filas?.map((f) => (
            <tr key={f.id} onClick={() => router.push(`/inventario/conteos/${f.id}`)}>
              <td>{f.numero}</td><td>{fecha(f.fecha)}</td><td>{f.bodega}</td><td className="numero">{f.lineas}</td>
              <td>{f.estado === 'ABIERTO' ? <span className="etiqueta alerta">Abierto</span> : 'Contabilizado'}</td>
            </tr>
          ))}
          {filas && filas.length === 0 && <tr><td colSpan={5} className="tenue">No hay conteos.</td></tr>}
        </tbody>
      </table>
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <Conteos />
    </Marco>
  );
}
