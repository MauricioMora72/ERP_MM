'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { ENLACES_MENU, ENTIDADES, MODULOS_MENU } from '@erp/shared';
import { salir } from '@/lib/auth';
import { ProveedorSesion, useSesion } from '@/lib/sesion';

function Contenido({ children }: { children: ReactNode }) {
  const { sesion, elegirCompania, puede } = useSesion();
  const ruta = usePathname();
  const router = useRouter();

  if (!sesion) return <p className="cargando">Cargando…</p>;

  return (
    <div className="marco">
      <header className="cabecera">
        <Link href="/" className="marca">
          {sesion.suscriptor.nombre}
        </Link>
        <label className="selector-compania">
          Compañía
          <select value={sesion.companiaId ?? ''} onChange={(e) => elegirCompania(e.target.value)}>
            {sesion.companias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} - {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <span className="usuario">{sesion.usuario.nombre}</span>
        <button
          className="enlace"
          onClick={async () => {
            await salir();
            router.replace('/ingresar');
          }}
        >
          Salir
        </button>
      </header>
      <nav className="menu">
        {MODULOS_MENU.map((modulo) => {
          const entidades = ENTIDADES.filter((e) => e.modulo === modulo && !e.oculta && puede(e.nombre, 'VER'));
          const enlaces = ENLACES_MENU.filter((l) => l.modulo === modulo && puede(l.recurso, 'VER'));
          if (!entidades.length && !enlaces.length) return null;
          return (
            <section key={modulo}>
              <h3>{modulo}</h3>
              {enlaces.map((l) => (
                <Link key={l.ruta} href={l.ruta} className={ruta.startsWith(l.ruta) ? 'activo' : ''}>
                  {l.titulo}
                </Link>
              ))}
              {entidades.map((e) => (
                <Link key={e.nombre} href={`/${e.nombre}`} className={ruta.startsWith(`/${e.nombre}`) ? 'activo' : ''}>
                  {e.titulo}
                </Link>
              ))}
            </section>
          );
        })}
      </nav>
      <main className="contenido">{children}</main>
    </div>
  );
}

/** Estructura de las pantallas internas: cabecera con compañía, menú por módulo y contenido. */
export function Marco({ children }: { children: ReactNode }) {
  return (
    <ProveedorSesion>
      <Contenido>{children}</Contenido>
    </ProveedorSesion>
  );
}
