'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Marco } from '@/componentes/Marco';
import { Seleccion } from '@/componentes/Seleccion';
import { api, ErrorApi } from '@/lib/api';
import { cantidad, dinero } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function Ajustes() {
  const { puede } = useSesion();
  const [bodega, setBodega] = useState<string | null>(null);
  const [articulo, setArticulo] = useState<string | null>(null);
  const [cant, setCant] = useState('');
  const [costo, setCosto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [buscar, setBuscar] = useState('');
  const [saldos, setSaldos] = useState<Json[]>([]);
  const [mensaje, setMensaje] = useState<{ tipo: string; texto: string } | null>(null);

  const cargar = useCallback(() => {
    api<Json[]>(`/api/inventario/saldos${buscar ? `?buscar=${encodeURIComponent(buscar)}` : ''}`).then(setSaldos).catch(() => setSaldos([]));
  }, [buscar]);
  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  async function registrar(e: FormEvent) {
    e.preventDefault();
    setMensaje(null);
    try {
      const r = await api<{ numero: string }>('/api/inventario/ajustes', {
        metodo: 'POST',
        cuerpo: { unidadNegocioId: bodega, articuloId: articulo, cantidad: cant, costoUnitario: costo || null, motivo: motivo || null },
      });
      setMensaje({ tipo: 'exito', texto: `Ajuste ${r.numero} registrado con su movimiento de kardex y su asiento.` });
      setCant('');
      setCosto('');
      cargar();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof ErrorApi ? err.message : 'Ocurrió un error.' });
    }
  }

  return (
    <>
      <h1>Ajustes y existencias</h1>
      {mensaje && <p className={`aviso ${mensaje.tipo}`}>{mensaje.texto}</p>}
      {puede('inventario', 'CREAR') && (
        <form className="panel" onSubmit={registrar}>
          <h2>Nuevo ajuste</h2>
          <p className="tenue">Cantidad positiva para una entrada (con su costo unitario) o negativa para una salida (al costo promedio).</p>
          <div className="linea-form">
            <Seleccion id="aj-bodega" etiqueta="Bodega *" referencia="unidades-negocio" valor={bodega} onCambio={setBodega} requerido />
            <Seleccion id="aj-articulo" etiqueta="Artículo *" referencia="articulos" valor={articulo} onCambio={setArticulo} requerido />
            <label>Cantidad *<input type="text" inputMode="decimal" value={cant} onChange={(e) => setCant(e.target.value)} required /></label>
            <label>Costo unitario<input type="text" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} /></label>
            <label>Motivo<input type="text" className="ancho" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>
            <button type="submit">Registrar ajuste</button>
          </div>
        </form>
      )}
      <div className="barra">
        <h2 style={{ margin: '0 auto 0 0' }}>Existencias</h2>
        <input type="text" placeholder="Buscar artículo…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
      </div>
      <table className="lista">
        <thead>
          <tr><th>Código</th><th>Artículo</th><th>Bodega</th><th className="numero">En mano</th><th className="numero">Costo promedio</th><th className="numero">Valor</th></tr>
        </thead>
        <tbody>
          {saldos.map((s, i) => (
            <tr key={i}>
              <td>{s.codigo}</td><td>{s.descripcion}</td><td>{s.bodega}</td>
              <td className="numero">{cantidad(s.en_mano)} {s.unidad}</td><td className="numero">{dinero(s.costo_unitario)}</td><td className="numero">{dinero(s.valor)}</td>
            </tr>
          ))}
          {saldos.length === 0 && <tr><td colSpan={6} className="tenue">Sin existencias registradas.</td></tr>}
        </tbody>
      </table>
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <Ajustes />
    </Marco>
  );
}
