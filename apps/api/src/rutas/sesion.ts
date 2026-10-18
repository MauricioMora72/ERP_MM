import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { fijarContexto, sql } from '@erp/db';
import { erroresPorCampo, esquemaAltaSuscriptor } from '@erp/shared';
import type { Servicios } from '../app.js';
import { enSesion, obtenerSesion, resolverUsuario } from '../contexto.js';
import { ErrorNegocio } from '../errores.js';
import { cargarSemillas } from '../semillas.js';
import { cargarSemillasCompania } from '../semillas-compania.js';
import { asegurarConfiguracionComercial } from '../semillas-comercial.js';

export async function rutasSesion(app: FastifyInstance, servicios: Servicios): Promise<void> {
  /** Datos de la sesión: usuario, suscriptor, compañías visibles y permisos. */
  app.get('/api/sesion', async (request, reply) => {
    const identidad = await servicios.verificar(request);
    const usuario = await resolverUsuario(servicios.db, identidad.uid);
    if (!usuario) {
      reply.code(404);
      return { necesitaAlta: true, correo: identidad.correo };
    }
    const sesion = await obtenerSesion(servicios.db, servicios.verificar, request);
    return enSesion(servicios.db, sesion, async (trx) => {
      const suscriptor = await sql<{ codigo: string; nombre: string }>`
        select codigo, nombre from erp.sis_suscriptores where id = ${sesion.suscriptorId}`.execute(trx);
      const companias = await sql<{ id: string; codigo: string; nombre: string }>`
        select c.id, c.codigo, d.nombre from erp.mae_companias c
        join erp.mae_direcciones d on d.id = c.direccion_id where c.activo order by c.codigo`.execute(trx);
      const permisos = await sql<{ recurso: string; accion: string }>`
        select distinct p.recurso, p.accion from erp.sis_usuarios_roles ur
        join erp.sis_roles_permisos p on p.rol_id = ur.rol_id
        where ur.usuario_id = ${sesion.usuarioId}`.execute(trx);
      return {
        usuario: { id: sesion.usuarioId, nombre: sesion.nombre, correo: identidad.correo },
        suscriptor: suscriptor.rows[0],
        companiaId: sesion.companiaId,
        companias: companias.rows,
        permisos: permisos.rows,
      };
    });
  });

  /**
   * Alta de un cliente nuevo del SaaS en un solo proceso:
   * suscriptor, datos base, compañía con su sucursal principal, usuario administrador y su rol.
   */
  app.post('/api/alta', async (request, reply) => {
    const identidad = await servicios.verificar(request);
    const resultado = esquemaAltaSuscriptor.safeParse(request.body ?? {});
    if (!resultado.success) {
      throw new ErrorNegocio(400, 'Revise los datos ingresados.', erroresPorCampo(resultado.error));
    }
    const datos = resultado.data;
    if (await resolverUsuario(servicios.db, identidad.uid)) {
      throw new ErrorNegocio(409, 'Su usuario ya pertenece a un suscriptor.');
    }
    const suscriptorId = randomUUID();
    const salida = await servicios.db.transaction().execute(async (trx) => {
      // Sin RETURNING: la seguridad por fila aún no permite leer el suscriptor recién creado.
      await sql`insert into erp.sis_suscriptores (id, codigo, nombre)
                values (${suscriptorId}, ${datos.suscriptor.codigo}, ${datos.suscriptor.nombre})`.execute(trx);
      await fijarContexto(trx, { suscriptorId, usuario: identidad.correo });
      const { monedaUsdId } = await cargarSemillas(trx);
      const direccion = await sql<{ id: string }>`
        insert into erp.mae_direcciones (numero, nombre, tipo_identificacion, identificacion, tipo_busqueda)
        values (1, ${datos.compania.razonSocial}, 'RUC', ${datos.compania.ruc}, 'CO') returning id`.execute(trx);
      const compania = await sql<{ id: string }>`
        insert into erp.mae_companias (codigo, direccion_id, moneda_id)
        values (${datos.compania.codigo}, ${direccion.rows[0]!.id}, ${monedaUsdId}) returning id`.execute(trx);
      const companiaId = compania.rows[0]!.id;
      const unidad = await sql<{ id: string }>`insert into erp.mae_unidades_negocio (compania_id, codigo, descripcion, tipo)
                values (${companiaId}, ${`${datos.compania.codigo}-01`}, 'Matriz', 'SUCURSAL') returning id`.execute(trx);
      await cargarSemillasCompania(trx, companiaId, unidad.rows[0]!.id);
      await asegurarConfiguracionComercial(trx, companiaId);
      const rol = await sql<{ id: string }>`
        insert into erp.sis_roles (codigo, descripcion) values ('ADMIN', 'Administrador con acceso total')
        returning id`.execute(trx);
      await sql`insert into erp.sis_roles_permisos (rol_id, recurso, accion)
                values (${rol.rows[0]!.id}, '*', '*')`.execute(trx);
      const usuario = await sql<{ id: string }>`
        insert into erp.sis_usuarios (firebase_uid, correo, nombre, compania_defecto_id)
        values (${identidad.uid}, ${datos.administrador.correo.toLowerCase()}, ${datos.administrador.nombre}, ${companiaId})
        returning id`.execute(trx);
      await sql`insert into erp.sis_usuarios_roles (usuario_id, rol_id)
                values (${usuario.rows[0]!.id}, ${rol.rows[0]!.id})`.execute(trx);
      return { suscriptorId, companiaId, usuarioId: usuario.rows[0]!.id };
    });
    reply.code(201);
    return salida;
  });
}
