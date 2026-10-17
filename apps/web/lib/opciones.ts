'use client';

import { useEffect, useState } from 'react';
import { buscarEntidad } from '@erp/shared';
import { api, type ListaPaginada } from './api';

export interface Opcion {
  valor: string;
  etiqueta: string;
}

const cache = new Map<string, Promise<Opcion[]>>();

function cargar(clave: string, cargador: () => Promise<Opcion[]>): Promise<Opcion[]> {
  let p = cache.get(clave);
  if (!p) {
    p = cargador().catch((e) => {
      cache.delete(clave);
      throw e;
    });
    cache.set(clave, p);
  }
  return p;
}

/** Olvida las opciones guardadas de una entidad, para que se lean de nuevo tras crear o modificar. */
export function invalidarOpciones(entidad: string): void {
  cache.delete(`ref:${entidad}`);
}

export function textoDe(entidadNombre: string, fila: Record<string, unknown>): string {
  const entidad = buscarEntidad(entidadNombre);
  if (!entidad) return String(fila.id);
  return entidad.etiqueta.map((c) => String(fila[c] ?? '')).filter(Boolean).join(' - ');
}

/** Registros de otra entidad para listas desplegables y para mostrar referencias. */
export function useReferencias(entidad: string | undefined): Opcion[] {
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  useEffect(() => {
    if (!entidad) return;
    cargar(`ref:${entidad}`, async () => {
      const r = await api<ListaPaginada>(`/api/e/${entidad}?limite=500`);
      return r.filas.map((f) => ({ valor: String(f.id), etiqueta: textoDe(entidad, f) }));
    })
      .then(setOpciones)
      .catch(() => setOpciones([]));
  }, [entidad]);
  return opciones;
}

/** Valores activos de un catálogo configurable. */
export function useCatalogo(catalogo: { modulo: string; codigo: string } | undefined): Opcion[] {
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  const clave = catalogo ? `cat:${catalogo.modulo}/${catalogo.codigo}` : '';
  useEffect(() => {
    if (!catalogo) return;
    cargar(clave, async () => {
      const r = await api<{ codigo: string; descripcion: string }[]>(
        `/api/catalogos/${catalogo.modulo}/${catalogo.codigo}`,
      );
      return r.map((v) => ({ valor: v.codigo, etiqueta: `${v.codigo} - ${v.descripcion}` }));
    })
      .then(setOpciones)
      .catch(() => setOpciones([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  return opciones;
}
