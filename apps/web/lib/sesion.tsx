'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api, ErrorApi } from './api';
import { guardarLocal } from './auth';

export interface DatosSesion {
  usuario: { id: string; nombre: string; correo: string };
  suscriptor: { codigo: string; nombre: string };
  companiaId: string | null;
  companias: { id: string; codigo: string; nombre: string }[];
  permisos: { recurso: string; accion: string }[];
}

interface ValorContexto {
  sesion: DatosSesion | null;
  recargar: () => Promise<void>;
  elegirCompania: (id: string) => void;
  puede: (recurso: string, accion: 'VER' | 'CREAR' | 'MODIFICAR' | 'ANULAR') => boolean;
}

const Contexto = createContext<ValorContexto | null>(null);

/** Carga la sesión; sin sesión manda a ingresar y sin suscriptor manda al alta. */
export function ProveedorSesion({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [sesion, setSesion] = useState<DatosSesion | null>(null);

  const recargar = useCallback(async () => {
    try {
      const datos = await api<DatosSesion>('/api/sesion');
      if (datos.companiaId) guardarLocal('erp.compania', datos.companiaId);
      setSesion(datos);
    } catch (error) {
      if (error instanceof ErrorApi && error.estado === 401) router.replace('/ingresar');
      else if (error instanceof ErrorApi && error.estado === 404) router.replace('/alta');
      else throw error;
    }
  }, [router]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const elegirCompania = (id: string) => {
    guardarLocal('erp.compania', id);
    void recargar();
  };

  const puede: ValorContexto['puede'] = (recurso, accion) =>
    !!sesion?.permisos.some((p) => (p.recurso === recurso || p.recurso === '*') && (p.accion === accion || p.accion === '*'));

  return <Contexto.Provider value={{ sesion, recargar, elegirCompania, puede }}>{children}</Contexto.Provider>;
}

export function useSesion(): ValorContexto {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useSesion debe usarse dentro de ProveedorSesion');
  return valor;
}
