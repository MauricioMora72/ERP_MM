'use client';

import { useCallback, useEffect, useState } from 'react';
import { Referencia } from '@/componentes/LineasDocumento';
import { Marco } from '@/componentes/Marco';
import { Seleccion } from '@/componentes/Seleccion';
import { api, ErrorApi } from '@/lib/api';
import { dinero, fecha, hoyIso } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Convierte las líneas pegadas del extracto: fecha; referencia; descripción; valor (separadas por punto y coma o tabulación). */
function leerExtracto(texto: string) {
  return texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const p = l.split(/\t|;/).map((x) => x.trim());
    const [f = '', referencia = '', descripcion = '', valor = ''] = p;
    const iso = /^\d{2}\/\d{2}\/\d{4}$/.test(f) ? `${f.slice(6, 10)}-${f.slice(3, 5)}-${f.slice(0, 2)}` : f;
    const monto = valor.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    return { fecha: iso, referencia, descripcion, monto };
  });
}

function Bancos() {
  const { puede } = useSesion();
  const [cuenta, setCuenta] = useState<string | null>(null);
  const [hasta, setHasta] = useState(hoyIso());
  const [d, setD] = useState<Json | null>(null);
  const [selBanco, setSelBanco] = useState<string[]>([]);
  const [selLibros, setSelLibros] = useState<string[]>([]);
  const [extracto, setExtracto] = useState('');
  const [registrar, setRegistrar] = useState<{ id: string; cuentaId: string | null } | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: string; texto: string } | null>(null);
  const modificar = puede('contabilidad', 'MODIFICAR');

  const cargar = useCallback(() => {
    if (!cuenta) return;
    api<Json>(`/api/con/bancos/${cuenta}?pendientes=1&hasta=${hasta}`).then((r) => { setD(r); setSelBanco([]); setSelLibros([]); }).catch(() => setD(null));
  }, [cuenta, hasta]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  async function accion(ruta: string, cuerpo: object, exito: (r: Json) => string) {
    setMensaje(null);
    try {
      const r = await api<Json>(ruta, { metodo: 'POST', cuerpo });
      setMensaje({ tipo: 'exito', texto: exito(r) });
      cargar();
      return true;
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ErrorApi ? e.message : 'Ocurrió un error.' });
      return false;
    }
  }

  const alternar = (lista: string[], set: (l: string[]) => void, id: string) => set(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  const sumaBanco = d ? d.banco.filter((b: Json) => selBanco.includes(b.id)).reduce((s: number, b: Json) => s + Number(b.monto), 0) : 0;
  const sumaLibros = d ? d.libros.filter((b: Json) => selLibros.includes(b.id)).reduce((s: number, b: Json) => s + Number(b.monto), 0) : 0;

  return (
    <>
      <h1>Conciliación bancaria</h1>
      {mensaje && <p className={`aviso ${mensaje.tipo}`}>{mensaje.texto}</p>}
      <div className="linea-form">
        <Seleccion id="cb-cuenta" etiqueta="Cuenta bancaria" referencia="cuentas-bancarias" valor={cuenta} onCambio={setCuenta} />
        <label>Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
        {d && modificar && <button className="secundario" onClick={() => accion(`/api/con/bancos/${cuenta}/conciliar-automatico`, {}, (r) => `Conciliación automática: ${r.conciliados} movimiento(s) cruzado(s).`)}>Conciliar automático</button>}
      </div>
      {d && (
        <>
          <div className="resumen">
            <span>Saldo en libros: <strong>{dinero(d.resumen.saldoLibros)}</strong></span>
            <span>Partidas de libros pendientes: <strong>{dinero(d.resumen.librosPendientes)}</strong></span>
            <span>Movimientos del banco sin registrar: <strong>{dinero(d.resumen.bancoPendientes)}</strong></span>
            <span>Saldo del banco: <strong>{dinero(d.resumen.saldoBanco)}</strong></span>
          </div>
          <section className="panel">
            <h2>Movimientos del banco pendientes</h2>
            <table className="lista edicion compacta">
              <thead><tr><th></th><th>Fecha</th><th>Referencia</th><th>Descripción</th><th className="numero">Valor</th><th></th></tr></thead>
              <tbody>
                {d.banco.map((b: Json) => (
                  <tr key={b.id}>
                    <td><input type="checkbox" aria-label={`Banco ${b.referencia ?? ''}`} checked={selBanco.includes(b.id)} onChange={() => alternar(selBanco, setSelBanco, b.id)} /></td>
                    <td>{fecha(b.fecha)}</td><td>{b.referencia}</td><td>{b.descripcion}</td><td className="numero">{dinero(b.monto)}</td>
                    <td>{modificar && <button className="enlace" onClick={() => setRegistrar({ id: b.id, cuentaId: null })}>Registrar en libros</button>}</td>
                  </tr>
                ))}
                {d.banco.length === 0 && <tr><td colSpan={6} className="tenue">Sin movimientos pendientes.</td></tr>}
              </tbody>
            </table>
            {registrar && (
              <div className="linea-form">
                <label>Cuenta de contrapartida<Referencia id="reg-cuenta" entidad="cuentas" valor={registrar.cuentaId} onCambio={(v) => setRegistrar({ ...registrar, cuentaId: v })} /></label>
                <button onClick={async () => {
                  if (await accion(`/api/con/bancos/movimientos/${registrar.id}/registrar`, { cuentaId: registrar.cuentaId }, () => 'Movimiento registrado en libros y conciliado.')) setRegistrar(null);
                }}>Registrar y conciliar</button>
                <button className="secundario" onClick={() => setRegistrar(null)}>Cancelar</button>
              </div>
            )}
          </section>
          <section className="panel">
            <h2>Partidas de libros pendientes</h2>
            <table className="lista edicion compacta">
              <thead><tr><th></th><th>Fecha</th><th>Asiento</th><th>Glosa</th><th>Tercero</th><th className="numero">Valor</th></tr></thead>
              <tbody>
                {d.libros.map((l: Json) => (
                  <tr key={l.id}>
                    <td><input type="checkbox" aria-label={`Libros ${l.numero}`} checked={selLibros.includes(l.id)} onChange={() => alternar(selLibros, setSelLibros, l.id)} /></td>
                    <td>{fecha(l.fecha)}</td><td>{l.numero}</td><td>{l.glosa}</td><td>{l.tercero ?? ''}</td><td className="numero">{dinero(l.monto)}</td>
                  </tr>
                ))}
                {d.libros.length === 0 && <tr><td colSpan={6} className="tenue">Sin partidas pendientes.</td></tr>}
              </tbody>
            </table>
          </section>
          {modificar && (
            <div className="acciones">
              <span className="resumen">Seleccionado: banco <strong>{dinero(sumaBanco)}</strong>, libros <strong>{dinero(sumaLibros)}</strong></span>
              <button disabled={!selBanco.length || !selLibros.length || Math.round((sumaBanco - sumaLibros) * 100) !== 0}
                onClick={() => accion(`/api/con/bancos/${cuenta}/conciliar`, { movimientos: selBanco, lineas: selLibros }, () => 'Partidas conciliadas.')}>Conciliar seleccionados</button>
            </div>
          )}
          {puede('contabilidad', 'CREAR') && (
            <section className="panel">
              <h2>Cargar movimientos del extracto</h2>
              <p className="tenue">Pegue una línea por movimiento: fecha; referencia; descripción; valor. Valor positivo para depósitos y negativo para retiros. Acepta columnas copiadas desde Excel.</p>
              <textarea rows={5} style={{ width: '100%' }} value={extracto} onChange={(e) => setExtracto(e.target.value)} placeholder="18/10/2026;DEP-1;Depósito cliente;500,00" />
              <div className="acciones">
                <button onClick={async () => {
                  if (await accion(`/api/con/bancos/${cuenta}/movimientos`, { lineas: leerExtracto(extracto) }, (r) => `Se cargaron ${r.importados} movimiento(s).`)) setExtracto('');
                }} disabled={!extracto.trim()}>Cargar movimientos</button>
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <Bancos />
    </Marco>
  );
}
