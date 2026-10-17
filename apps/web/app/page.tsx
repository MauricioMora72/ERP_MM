'use client';

import Link from 'next/link';
import { ENLACES_MENU, ENTIDADES, MODULOS_MENU } from '@erp/shared';
import { Marco } from '@/componentes/Marco';
import { useSesion } from '@/lib/sesion';

function Inicio() {
  const { sesion, puede } = useSesion();
  return (
    <>
      <h1>Bienvenido, {sesion?.usuario.nombre}</h1>
      <div className="inicio-modulos">
        {MODULOS_MENU.map((modulo) => {
          const entidades = ENTIDADES.filter((e) => e.modulo === modulo && !e.oculta && puede(e.nombre, 'VER'));
          const enlaces = ENLACES_MENU.filter((l) => l.modulo === modulo && puede(l.recurso, 'VER'));
          if (!entidades.length && !enlaces.length) return null;
          return (
            <section key={modulo}>
              <h2>{modulo}</h2>
              {enlaces.map((l) => (
                <Link key={l.ruta} href={l.ruta}>
                  <strong>{l.titulo}</strong>
                </Link>
              ))}
              {entidades.map((e) => (
                <Link key={e.nombre} href={`/${e.nombre}`}>
                  {e.titulo}
                </Link>
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}

export default function Pagina() {
  return (
    <Marco>
      <Inicio />
    </Marco>
  );
}
