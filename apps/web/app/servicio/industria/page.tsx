'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Marco } from '@/componentes/Marco';
import { api, ErrorApi } from '@/lib/api';
import { invalidarOpciones } from '@/lib/opciones';
import { useSesion } from '@/lib/sesion';

interface Industria {
  codigo: string;
  nombre: string;
  descripcion: string;
  tiposOrden: string[];
  temparios: string[];
}

function ConfigurarIndustria() {
  const { puede } = useSesion();
  const [lista, setLista] = useState<Industria[]>([]);
  const [resultado, setResultado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Industria[]>('/api/srv/industrias').then(setLista).catch(() => setLista([]));
  }, []);

  async function aplicar(i: Industria) {
    setError(null);
    setResultado(null);
    try {
      const r = await api<Record<string, number>>(`/api/srv/industrias/${i.codigo}/aplicar`, { metodo: 'POST' });
      for (const e of ['tipos-orden', 'temparios', 'perfiles', 'articulos']) invalidarOpciones(e);
      setResultado(
        `${i.nombre}: se crearon ${r.tiposOrden} tipos de orden, ${r.campos} campos propios, ${r.perfiles} perfiles con tarifa, ${r.articulos} artículos y ${r.temparios} temparios. Lo que ya existía no se tocó.`,
      );
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'Ocurrió un error.');
    }
  }

  return (
    <>
      <h1>Configurar industria</h1>
      <p className="tenue">
        Cada plantilla deja configurados tipos de orden, flujo, campos propios, perfiles con tarifas de ejemplo y temparios para un tipo de empresa
        de servicios. Todo es de ejemplo: después ajústelo en Tipos de orden, Temparios y Tarifas. Puede aplicar más de una plantilla.
      </p>
      {resultado && <p className="aviso exito">{resultado}</p>}
      {error && <p className="aviso error">{error}</p>}
      <div className="tarjetas">
        {lista.map((i) => (
          <section key={i.codigo}>
            <h2>{i.nombre}</h2>
            <span className="tenue">{i.descripcion}</span>
            <span><strong>Tipos de orden:</strong> {i.tiposOrden.join(', ')}</span>
            <span><strong>Temparios:</strong> {i.temparios.join(', ')}</span>
            {puede('srv-config', 'MODIFICAR') && <button onClick={() => aplicar(i)}>Aplicar plantilla</button>}
          </section>
        ))}
      </div>
      <p className="tenue" style={{ marginTop: 20 }}>
        En las plantillas de salud, el diagnóstico, las alergias y los antecedentes son datos sensibles: solo los ven los usuarios con el permiso
        srv-datos-sensibles. Revise también <Link href="/tipos-orden">los tipos de orden</Link> y <Link href="/temparios">los temparios</Link>.
      </p>
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <ConfigurarIndustria />
    </Marco>
  );
}
