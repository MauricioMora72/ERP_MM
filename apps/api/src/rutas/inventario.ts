import type { FastifyInstance } from 'fastify';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { sql } from '@erp/db';
import { erroresPorCampo } from '@erp/shared';
import type { Servicios } from '../app.js';
import { enSesion, exigirPermiso, obtenerSesion } from '../contexto.js';
import { ErrorNegocio } from '../errores.js';
import { contabilizar } from '../nucleo/contabilidad.js';
import { hoy, numerar, tipoDocumento } from '../nucleo/documentos.js';
import { ligarAsientoKardex, moverInventario } from '../nucleo/inventario.js';
import { companiaDe } from '../servicios/comun.js';

/** Ajustes de inventario (entradas y salidas) y consulta de existencias. */
export async function rutasInventario(app: FastifyInstance, servicios: Servicios): Promise<void> {
  app.post('/api/inventario/ajustes', async (request, reply) => {
    const r = z.object({
      unidadNegocioId: z.string().uuid(),
      articuloId: z.string().uuid(),
      cantidad: z.union([z.string(), z.number()]),
      costoUnitario: z.union([z.string(), z.number()]).nullish(),
      motivo: z.string().max(500).nullish(),
    }).safeParse(request.body ?? {});
    if (!r.success) throw new ErrorNegocio(400, 'Revise los datos ingresados.', erroresPorCampo(r.error));
    const d = r.data;
    const sesion = await obtenerSesion(servicios.db, servicios.verificar, request);
    const salida = await enSesion(servicios.db, sesion, async (trx) => {
      await exigirPermiso(trx, sesion, 'inventario', 'CREAR');
      const companiaId = companiaDe(sesion);
      const cantidad = new Decimal(d.cantidad);
      if (cantidad.isZero()) throw new ErrorNegocio(400, 'La cantidad no puede ser cero.');
      if (cantidad.greaterThan(0) && (d.costoUnitario == null || d.costoUnitario === '')) {
        throw new ErrorNegocio(400, 'Indique el costo unitario de la entrada.', { costoUnitario: 'Este campo es obligatorio' });
      }
      const tipo = await tipoDocumento(trx, 'INV', 'AJ');
      const numero = await numerar(trx, companiaId, tipo.id);
      const fecha = hoy();
      const doc = await sql<{ id: string }>`
        insert into erp.inv_documentos (compania_id, tipo_documento_id, numero, fecha, unidad_negocio_id, observacion)
        values (${companiaId}, ${tipo.id}, ${numero}, ${fecha}, ${d.unidadNegocioId}, ${d.motivo ?? null}) returning id`.execute(trx);
      const art = await sql<{ unidad_primaria: string }>`select unidad_primaria from erp.mae_articulos where id = ${d.articuloId}`.execute(trx);
      if (!art.rows[0]) throw new ErrorNegocio(400, 'Artículo: el registro no existe.');
      const linea = await sql<{ id: string }>`
        insert into erp.inv_documentos_lineas (documento_id, linea, articulo_id, cantidad, unidad, costo_unitario)
        values (${doc.rows[0]!.id}, 1, ${d.articuloId}, ${cantidad.toFixed(4)}, ${art.rows[0].unidad_primaria}, ${d.costoUnitario ?? null})
        returning id`.execute(trx);
      const mov = await moverInventario(trx, {
        companiaId, fecha, articuloId: d.articuloId, unidadNegocioId: d.unidadNegocioId, cantidad,
        costoUnitario: d.costoUnitario ?? undefined, tipoDocumentoId: tipo.id, numeroDocumento: numero,
        origenModulo: 'INV', origenLineaId: linea.rows[0]!.id,
      });
      if (!mov.inventariable) throw new ErrorNegocio(400, 'Solo los artículos inventariables tienen existencias.');
      const entrada = cantidad.greaterThan(0);
      const asiento = await contabilizar(trx, {
        companiaId, fecha, glosa: `Ajuste de inventario ${numero}`, origenModulo: 'INV', origenId: doc.rows[0]!.id,
        lineas: [
          { concepto: 'INVENTARIO', claseContableId: mov.claseContableId, unidadNegocioId: d.unidadNegocioId, ...(entrada ? { debito: mov.costoTotal } : { credito: mov.costoTotal }) },
          { concepto: 'AJUSTE_INV', claseContableId: mov.claseContableId, unidadNegocioId: d.unidadNegocioId, ...(entrada ? { credito: mov.costoTotal } : { debito: mov.costoTotal }) },
        ],
      });
      if (mov.kardexId) await ligarAsientoKardex(trx, mov.kardexId, asiento);
      await sql`update erp.inv_documentos_lineas set kardex_id = ${mov.kardexId} where id = ${linea.rows[0]!.id}`.execute(trx);
      return { documentoId: doc.rows[0]!.id, numero };
    });
    reply.code(201);
    return salida;
  });

  app.get<{ Querystring: { buscar?: string } }>('/api/inventario/saldos', async (request) => {
    const sesion = await obtenerSesion(servicios.db, servicios.verificar, request);
    return enSesion(servicios.db, sesion, async (trx) => {
      await exigirPermiso(trx, sesion, 'inventario', 'VER');
      const patron = request.query.buscar ? `%${request.query.buscar}%` : null;
      const r = await sql`
        select a.codigo, a.descripcion, a.unidad_primaria as unidad, u.codigo as bodega, s.en_mano, s.comprometido,
               coalesce(c.costo_unitario, 0) as costo_unitario, round(s.en_mano * coalesce(c.costo_unitario, 0), 2) as valor
        from erp.inv_saldos s join erp.mae_articulos a on a.id = s.articulo_id
        join erp.mae_unidades_negocio u on u.id = s.unidad_negocio_id
        left join erp.inv_costos c on c.articulo_id = s.articulo_id and c.unidad_negocio_id = s.unidad_negocio_id and c.metodo = 'PROMEDIO'
        where (${patron}::text is null or a.codigo ilike ${patron} or a.descripcion ilike ${patron})
        order by a.codigo, u.codigo limit 500`.execute(trx);
      return r.rows;
    });
  });
}
