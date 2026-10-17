import type { FastifyRequest } from 'fastify';
import { conTransaccion, sql, type Db, type Trx } from '@erp/db';
import type { Identidad, Verificador } from './autenticacion.js';
import { ErrorNegocio } from './errores.js';

export interface Sesion {
  identidad: Identidad;
  usuarioId: string;
  suscriptorId: string;
  nombre: string;
  /** Compañía elegida en la interfaz (cabecera X-Compania), si la hay. */
  companiaId: string | null;
}

interface FilaUsuario {
  usuario_id: string;
  suscriptor_id: string;
  nombre: string;
  correo: string;
  activo: boolean;
  compania_defecto_id: string | null;
}

export async function resolverUsuario(db: Db, uid: string): Promise<FilaUsuario | null> {
  const r = await sql<FilaUsuario>`select * from erp.fn_resolver_usuario(${uid})`.execute(db);
  return r.rows[0] ?? null;
}

/** Autentica la petición y arma la sesión con el usuario y su suscriptor. */
export async function obtenerSesion(db: Db, verificar: Verificador, request: FastifyRequest): Promise<Sesion> {
  const identidad = await verificar(request);
  const usuario = await resolverUsuario(db, identidad.uid);
  if (!usuario) throw new ErrorNegocio(403, 'Su usuario no está registrado en ningún suscriptor.');
  if (!usuario.activo) throw new ErrorNegocio(403, 'Su usuario o su suscripción están inactivos.');
  const cabecera = request.headers['x-compania'];
  const companiaId = typeof cabecera === 'string' && /^[0-9a-f-]{36}$/i.test(cabecera) ? cabecera : null;
  return {
    identidad,
    usuarioId: usuario.usuario_id,
    suscriptorId: usuario.suscriptor_id,
    nombre: usuario.nombre,
    companiaId: companiaId ?? usuario.compania_defecto_id,
  };
}

/** Ejecuta el trabajo dentro de una transacción con el suscriptor y el usuario fijados (SET LOCAL). */
export function enSesion<T>(db: Db, sesion: Sesion, trabajo: (trx: Trx) => Promise<T>): Promise<T> {
  return conTransaccion(db, { suscriptorId: sesion.suscriptorId, usuario: sesion.identidad.correo }, trabajo);
}

export type Accion = 'VER' | 'CREAR' | 'MODIFICAR' | 'ANULAR';

/**
 * Un usuario puede hacer una acción si alguno de sus roles tiene el permiso para ese recurso
 * (o para "*"), ya sea en todas las compañías o en la compañía de la sesión.
 */
export async function tienePermiso(trx: Trx, sesion: Sesion, recurso: string, accion: Accion): Promise<boolean> {
  const r = await sql<{ ok: number }>`
    select 1 as ok
    from erp.sis_usuarios_roles ur
    join erp.sis_roles_permisos p on p.rol_id = ur.rol_id
    where ur.usuario_id = ${sesion.usuarioId}
      and (ur.compania_id is null or ur.compania_id = ${sesion.companiaId})
      and (p.recurso = ${recurso} or p.recurso = '*')
      and (p.accion = ${accion} or p.accion = '*')
    limit 1`.execute(trx);
  return r.rows.length > 0;
}

export async function exigirPermiso(trx: Trx, sesion: Sesion, recurso: string, accion: Accion): Promise<void> {
  if (!(await tienePermiso(trx, sesion, recurso, accion))) {
    const verbo = { VER: 'ver', CREAR: 'crear', MODIFICAR: 'modificar', ANULAR: 'inactivar o borrar' }[accion];
    throw new ErrorNegocio(403, `No tiene permiso para ${verbo} en ${recurso}.`);
  }
}
