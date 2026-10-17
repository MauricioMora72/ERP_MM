import type { FastifyInstance } from 'fastify';
import { sql, type Trx } from '@erp/db';
import { buscarEntidad, erroresPorCampo, esquemaAlta, esquemaCambio, ENTIDADES, type Entidad } from '@erp/shared';
import type { Servicios } from '../app.js';
import { enSesion, exigirPermiso, obtenerSesion, type Sesion } from '../contexto.js';
import { ErrorNegocio } from '../errores.js';
import { calcularGarantiaObjeto } from '../servicios/garantias.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tabla(entidad: Entidad) {
  return sql.table(`erp.${entidad.tabla}`);
}

function columnas(entidad: Entidad) {
  const nombres = ['id', ...entidad.campos.map((c) => c.nombre), 'creado_por', 'creado_en', 'modificado_por', 'modificado_en'];
  return sql.join(nombres.map((n) => sql.ref(n)));
}

function entidadDe(nombre: string): Entidad {
  const entidad = buscarEntidad(nombre);
  if (!entidad) throw new ErrorNegocio(404, `No existe la entidad ${nombre}.`);
  return entidad;
}

function editable(entidad: Entidad): Entidad {
  if (entidad.soloLectura) throw new ErrorNegocio(405, `${entidad.titulo} se generan desde sus procesos y no se editan a mano.`);
  return entidad;
}

/** Reglas propias de algunas entidades, antes y después de guardar. */
async function antesDeGuardar(trx: Trx, entidad: Entidad, datos: Record<string, unknown>, id?: string): Promise<void> {
  if (entidad.nombre === 'agenda') {
    let actual: Record<string, unknown> = {};
    if (id) actual = (await sql<Record<string, unknown>>`select recurso_id, inicio, fin, estado from erp.srv_agenda where id = ${id}`.execute(trx)).rows[0] ?? {};
    const f = { ...actual, ...datos };
    if (f.estado === 'CANCELADA') return;
    if (f.inicio && f.fin && new Date(String(f.fin)) <= new Date(String(f.inicio))) {
      throw new ErrorNegocio(400, 'Revise los datos ingresados.', { fin: 'El fin debe ser posterior al inicio' });
    }
    const choque = await sql`
      select 1 from erp.srv_agenda where recurso_id = ${f.recurso_id as string} and estado <> 'CANCELADA'
        and id is distinct from ${id ?? null}::uuid
        and tstzrange(inicio, fin) && tstzrange(${f.inicio as string}::timestamptz, ${f.fin as string}::timestamptz)`.execute(trx);
    if (choque.rows.length) throw new ErrorNegocio(409, 'El recurso ya tiene una reserva en ese horario.');
  }
}

async function despuesDeGuardar(trx: Trx, entidad: Entidad, fila: Record<string, unknown>): Promise<void> {
  if (entidad.nombre === 'objetos') await calcularGarantiaObjeto(trx, String(fila.id));
}

/**
 * Comprueba referencias y valores de catálogo dentro de la sesión.
 * Las llaves foráneas de PostgreSQL no miran la seguridad por fila; esta consulta sí,
 * así un suscriptor nunca puede apuntar a un registro de otro.
 */
async function validarRelaciones(trx: Trx, entidad: Entidad, datos: Record<string, unknown>): Promise<void> {
  const errores: Record<string, string> = {};
  for (const campo of entidad.campos) {
    const valor = datos[campo.nombre];
    if (valor === null || valor === undefined) continue;
    if (campo.tipo === 'referencia' && campo.referencia) {
      const destino = entidadDe(campo.referencia);
      const r = await sql`select 1 from ${tabla(destino)} where id = ${valor as string}`.execute(trx);
      if (r.rows.length === 0) errores[campo.nombre] = `${campo.etiqueta}: el registro no existe.`;
    }
    if (campo.tipo === 'catalogo' && campo.catalogo) {
      const r = await sql`
        select 1 from erp.cat_valores v join erp.cat_catalogos c on c.id = v.catalogo_id
        where c.modulo = ${campo.catalogo.modulo} and c.codigo = ${campo.catalogo.codigo}
          and v.codigo = ${valor as string} and v.activo`.execute(trx);
      if (r.rows.length === 0) errores[campo.nombre] = `${campo.etiqueta}: el valor no está en el catálogo.`;
    }
  }
  if (Object.keys(errores).length) throw new ErrorNegocio(400, 'Revise los datos ingresados.', errores);
}

export async function listar(
  trx: Trx,
  entidad: Entidad,
  opciones: { buscar?: string; pagina?: number; limite?: number; filtros?: Record<string, string> },
) {
  const limite = Math.min(Math.max(opciones.limite ?? 50, 1), 500);
  const pagina = Math.max(opciones.pagina ?? 1, 1);
  const condiciones = [sql`true`];
  if (opciones.buscar && entidad.busqueda.length) {
    const patron = `%${opciones.buscar}%`;
    condiciones.push(
      sql`(${sql.join(
        entidad.busqueda.map((c) => sql`${sql.ref(c)}::text ilike ${patron}`),
        sql` or `,
      )})`,
    );
  }
  for (const [campo, valor] of Object.entries(opciones.filtros ?? {})) {
    const def = entidad.campos.find((c) => c.nombre === campo);
    if (!def) throw new ErrorNegocio(400, `No se puede filtrar por ${campo}.`);
    if (def.tipo === 'referencia' && !UUID.test(valor)) throw new ErrorNegocio(400, `Filtro no válido: ${campo}.`);
    condiciones.push(sql`${sql.ref(campo)}::text = ${valor}`);
  }
  const donde = sql.join(condiciones, sql` and `);
  const filas = await sql<Record<string, unknown>>`
    select ${columnas(entidad)} from ${tabla(entidad)} where ${donde}
    order by ${sql.ref(entidad.orden)} ${entidad.ordenDescendente ? sql`desc` : sql`asc`}, id limit ${limite} offset ${(pagina - 1) * limite}`.execute(trx);
  const total = await sql<{ total: string }>`select count(*) as total from ${tabla(entidad)} where ${donde}`.execute(trx);
  return { filas: filas.rows, total: Number(total.rows[0]?.total ?? 0), pagina, limite };
}

export async function crear(trx: Trx, entidad: Entidad, cuerpo: unknown) {
  const resultado = esquemaAlta(entidad).safeParse(cuerpo ?? {});
  if (!resultado.success) {
    throw new ErrorNegocio(400, 'Revise los datos ingresados.', erroresPorCampo(resultado.error));
  }
  const datos = Object.fromEntries(Object.entries(resultado.data).filter(([, v]) => v !== undefined));
  await validarRelaciones(trx, entidad, datos);
  if (entidad.nombre === 'direcciones' && (datos.numero === null || datos.numero === undefined)) {
    // Número de dirección consecutivo por suscriptor; el bloqueo evita duplicados en altas simultáneas.
    await sql`select pg_advisory_xact_lock(hashtext('mae_direcciones:' || erp.fn_suscriptor_actual()::text))`.execute(trx);
    const r = await sql<{ n: string }>`select coalesce(max(numero), 0) + 1 as n from erp.mae_direcciones`.execute(trx);
    datos.numero = r.rows[0]?.n;
  }
  await antesDeGuardar(trx, entidad, datos);
  const nombres = Object.keys(datos);
  const fila = await sql<Record<string, unknown>>`
    insert into ${tabla(entidad)} (${sql.join(nombres.map((n) => sql.ref(n)))})
    values (${sql.join(nombres.map((n) => sql`${datos[n]}`))})
    returning ${columnas(entidad)}`.execute(trx);
  await despuesDeGuardar(trx, entidad, fila.rows[0]!);
  return fila.rows[0];
}

export async function modificar(trx: Trx, entidad: Entidad, id: string, cuerpo: unknown) {
  const resultado = esquemaCambio(entidad).safeParse(cuerpo ?? {});
  if (!resultado.success) {
    throw new ErrorNegocio(400, 'Revise los datos ingresados.', erroresPorCampo(resultado.error));
  }
  const datos = Object.fromEntries(Object.entries(resultado.data).filter(([, v]) => v !== undefined));
  if (Object.keys(datos).length === 0) throw new ErrorNegocio(400, 'No hay cambios que guardar.');
  await validarRelaciones(trx, entidad, datos);
  await antesDeGuardar(trx, entidad, datos, id);
  const asignaciones = sql.join(Object.entries(datos).map(([n, v]) => sql`${sql.ref(n)} = ${v}`));
  const fila = await sql<Record<string, unknown>>`
    update ${tabla(entidad)} set ${asignaciones} where id = ${id} returning ${columnas(entidad)}`.execute(trx);
  if (!fila.rows[0]) throw new ErrorNegocio(404, 'El registro no existe.');
  await despuesDeGuardar(trx, entidad, fila.rows[0]);
  return fila.rows[0];
}

async function conSesion<T>(servicios: Servicios, request: Parameters<typeof obtenerSesion>[2], trabajo: (trx: Trx, sesion: Sesion) => Promise<T>) {
  const sesion = await obtenerSesion(servicios.db, servicios.verificar, request);
  return enSesion(servicios.db, sesion, (trx) => trabajo(trx, sesion));
}

export async function rutasEntidades(app: FastifyInstance, servicios: Servicios): Promise<void> {
  app.get('/api/meta/entidades', async () => ENTIDADES);

  app.get<{ Params: { entidad: string }; Querystring: Record<string, string> }>(
    '/api/e/:entidad',
    async (request) => {
      const entidad = entidadDe(request.params.entidad);
      const { buscar, pagina, limite, ...filtros } = request.query;
      return conSesion(servicios, request, async (trx, sesion) => {
        await exigirPermiso(trx, sesion, entidad.nombre, 'VER');
        return listar(trx, entidad, {
          buscar,
          pagina: pagina ? Number(pagina) : undefined,
          limite: limite ? Number(limite) : undefined,
          filtros,
        });
      });
    },
  );

  app.get<{ Params: { entidad: string; id: string } }>('/api/e/:entidad/:id', async (request) => {
    const entidad = entidadDe(request.params.entidad);
    if (!UUID.test(request.params.id)) throw new ErrorNegocio(404, 'El registro no existe.');
    return conSesion(servicios, request, async (trx, sesion) => {
      await exigirPermiso(trx, sesion, entidad.nombre, 'VER');
      const r = await sql<Record<string, unknown>>`
        select ${columnas(entidad)} from ${tabla(entidad)} where id = ${request.params.id}`.execute(trx);
      if (!r.rows[0]) throw new ErrorNegocio(404, 'El registro no existe.');
      return r.rows[0];
    });
  });

  app.post<{ Params: { entidad: string } }>('/api/e/:entidad', async (request, reply) => {
    const entidad = editable(entidadDe(request.params.entidad));
    const fila = await conSesion(servicios, request, async (trx, sesion) => {
      await exigirPermiso(trx, sesion, entidad.nombre, 'CREAR');
      return crear(trx, entidad, request.body);
    });
    reply.code(201);
    return fila;
  });

  app.put<{ Params: { entidad: string; id: string } }>('/api/e/:entidad/:id', async (request) => {
    const entidad = editable(entidadDe(request.params.entidad));
    if (!UUID.test(request.params.id)) throw new ErrorNegocio(404, 'El registro no existe.');
    return conSesion(servicios, request, async (trx, sesion) => {
      await exigirPermiso(trx, sesion, entidad.nombre, 'MODIFICAR');
      return modificar(trx, entidad, request.params.id, request.body);
    });
  });

  /** Inactiva si la tabla tiene columna activo; si no, borra (solo si nada lo referencia). */
  app.post<{ Params: { entidad: string; id: string } }>('/api/e/:entidad/:id/anular', async (request) => {
    const entidad = editable(entidadDe(request.params.entidad));
    if (!UUID.test(request.params.id)) throw new ErrorNegocio(404, 'El registro no existe.');
    return conSesion(servicios, request, async (trx, sesion) => {
      await exigirPermiso(trx, sesion, entidad.nombre, 'ANULAR');
      const r = entidad.inactivable
        ? await sql`update ${tabla(entidad)} set activo = false where id = ${request.params.id} returning id`.execute(trx)
        : await sql`delete from ${tabla(entidad)} where id = ${request.params.id} returning id`.execute(trx);
      if (!r.rows[0]) throw new ErrorNegocio(404, 'El registro no existe.');
      return { ok: true, accion: entidad.inactivable ? 'inactivado' : 'borrado' };
    });
  });

  /** Valores activos de un catálogo, para las listas desplegables de la interfaz. */
  app.get<{ Params: { modulo: string; codigo: string } }>('/api/catalogos/:modulo/:codigo', async (request) =>
    conSesion(servicios, request, async (trx) => {
      const r = await sql<{ codigo: string; descripcion: string }>`
        select v.codigo, v.descripcion from erp.cat_valores v join erp.cat_catalogos c on c.id = v.catalogo_id
        where c.modulo = ${request.params.modulo} and c.codigo = ${request.params.codigo} and v.activo
        order by v.orden nulls last, v.codigo`.execute(trx);
      return r.rows;
    }),
  );
}
