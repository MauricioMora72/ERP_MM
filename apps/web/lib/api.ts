'use client';

import { cabeceraAutorizacion, leerLocal } from './auth';

// Vacío: se llama al mismo origen y Next.js reenvía /api a la API (ver next.config.mjs).
export const URL_API = process.env.NEXT_PUBLIC_API_URL ?? '';

export class ErrorApi extends Error {
  constructor(
    public readonly estado: number,
    mensaje: string,
    public readonly campos?: Record<string, string>,
    public readonly datos?: unknown,
  ) {
    super(mensaje);
  }
}

export async function api<T>(ruta: string, opciones: { metodo?: string; cuerpo?: unknown } = {}): Promise<T> {
  const cabeceras: Record<string, string> = {};
  const autorizacion = await cabeceraAutorizacion();
  if (autorizacion) cabeceras.authorization = autorizacion;
  const compania = leerLocal('erp.compania');
  if (compania) cabeceras['x-compania'] = compania;
  if (opciones.cuerpo !== undefined) cabeceras['content-type'] = 'application/json';
  let respuesta: Response;
  try {
    respuesta = await fetch(`${URL_API}${ruta}`, {
      method: opciones.metodo ?? 'GET',
      headers: cabeceras,
      body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
    });
  } catch {
    throw new ErrorApi(0, 'No se pudo conectar con la API. Verifique que esté en ejecución.');
  }
  const texto = await respuesta.text();
  const datos = texto ? JSON.parse(texto) : null;
  if (!respuesta.ok) {
    throw new ErrorApi(respuesta.status, datos?.error ?? 'Ocurrió un error.', datos?.campos, datos);
  }
  return datos as T;
}

export interface ListaPaginada {
  filas: Record<string, unknown>[];
  total: number;
  pagina: number;
  limite: number;
}
