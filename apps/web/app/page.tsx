'use client';

import Link from 'next/link';
import { ENTIDADES, MODULOS_MENU } from '@erp/shared';
import { Marco } from '@/componentes/Marco';
import { useSesion } from '@/lib/sesion';

function Inicio() {
  const { sesion, puede } = useSesion();
  return (
    <>
      <h1>Bienvenido, {sesion?.usuario.nombre}</h1>
      <div className="inicio-modulos">
        {MODULOS_MENU.map((modulo) => {
          const entidades = ENTIDADES.filter((e) => e.modulo === modulo && puede(e.nombre, 'VER'));
          if (!entidades.length) return null;
          return (
            <section key={modulo}>
              <h2>{modulo}</h2>
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
