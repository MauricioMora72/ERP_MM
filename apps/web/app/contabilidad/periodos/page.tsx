'use client';

import { useCallback, useEffect, useState } from 'react';
import { Marco } from '@/componentes/Marco';
import { api, ErrorApi } from '@/lib/api';
import { dinero, fecha } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const MODULOS: [string, string][] = [['ventas', 'Ventas'], ['compras', 'Compras'], ['inventario', 'Inventario'], ['contabilidad', 'Contabilidad']];
const mes = (n: number) => MESES[n - 1] ?? String(n);
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function Periodos() {
  const { puede } = useSesion();
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [filas, setFilas] = useState<Json[]>([]);
  const [mensaje, setMensaje] = useState<{ tipo: string; texto: string } | null>(null);
  const cierre = puede('con-cierre', 'MODIFICAR');

  const cargar = useCallback(() => api<Json[]>(`/api/con/periodos?anio=${anio}`).then(setFilas).catch(() => setFilas([])), [anio]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function accion(ruta: string, cuerpo: object, exito: (r: Json) => string) {
    setMensaje(null);
    try {
      const r = await api<Json>(ruta, { metodo: 'POST', cuerpo });
      setMensaje({ tipo: 'exito', texto: exito(r) });
      await cargar();
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ErrorApi ? e.message : 'Ocurrió un error.' });
    }
  }

  return (
    <>
      <div className="barra">
        <h1>Períodos y cierre</h1>
        <label className="tenue">Año <input type="text" inputMode="numeric" className="corto" value={anio} onChange={(e) => setAnio(Number(e.target.value) || anio)} /></label>
      </div>
      <p className="tenue">Cada módulo cierra su mes por separado. Un período con contabilidad cerrada no recibe asientos de ningún módulo.</p>
      {mensaje && <p className={`aviso ${mensaje.tipo}`}>{mensaje.texto}</p>}
      {filas.length === 0 ? (
        <p>No hay períodos para {anio}.{cierre && <> <button className="secundario" onClick={() => accion('/api/con/periodos/generar', { anio }, (r) => `Se crearon ${r.creados} períodos.`)}>Generar los períodos de {anio}</button></>}</p>
      ) : (
        <table className="lista edicion">
          <thead><tr><th>Mes</th><th>Desde</th><th>Hasta</th>{MODULOS.map(([, t]) => <th key={t}>{t}</th>)}</tr></thead>
          <tbody>
            {filas.map((p) => (
              <tr key={p.id}>
                <td>{mes(p.periodo)}</td><td>{fecha(p.fecha_desde)}</td><td>{fecha(p.fecha_hasta)}</td>
                {MODULOS.map(([m, t]) => {
                  const abierto = p[`estado_${m}`] === 'ABIERTO';
                  return (
                    <td key={m}>
                      {cierre ? (
                        <button className={abierto ? 'secundario' : ''} aria-label={`${t} ${mes(p.periodo)}`}
                          onClick={() => accion(`/api/con/periodos/${p.id}`, { modulo: m, estado: abierto ? 'CERRADO' : 'ABIERTO' }, () => `${t}: ${mes(p.periodo).toLowerCase()} ${abierto ? 'cerrado' : 'abierto'}.`)}>
                          {abierto ? 'Abierto' : 'Cerrado'}
                        </button>
                      ) : (abierto ? 'Abierto' : 'Cerrado')}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {cierre && filas.length > 0 && (
        <section className="panel">
          <h2>Cierre del ejercicio {anio}</h2>
          <p className="tenue">Genera, con fecha 31 de diciembre, el asiento que deja en cero las cuentas de resultados contra la cuenta de resultado del ejercicio. Diciembre debe tener contabilidad abierta. Si necesita repetirlo, reverse antes el asiento de cierre.</p>
          <button onClick={() => accion('/api/con/cierre-anual', { anio }, (r) => `Asiento de cierre generado. Resultado del ejercicio: ${dinero(r.utilidad)}.`)}>Cerrar el ejercicio {anio}</button>
        </section>
      )}
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <Periodos />
    </Marco>
  );
}
