import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { type Trx } from '@erp/db';
import { erroresPorCampo } from '@erp/shared';
import type { Servicios } from '../app.js';
import { enSesion, exigirPermiso, obtenerSesion, type Accion, type Sesion } from '../contexto.js';
import { ErrorNegocio } from '../errores.js';
import { antiguedad } from '../comercial/comun.js';
import {
  cambiarEstadoCompra, cerrarSaldoCompra, convertirRequisicion, crearOrdenCompra, detalleCompra, detalleFacturaProveedor,
  listarCompras, listarFacturasProveedor, pendientesDeFactura, recibir, registrarFacturaProveedor,
} from '../comercial/compras.js';
import { documentosAbiertosCxp, registrarPagos } from '../comercial/cxp.js';
import { hoy } from '../nucleo/documentos.js';
import { asegurarConfiguracionComercial } from '../semillas-comercial.js';
import { companiaDe } from '../servicios/comun.js';

export const uuid = z.string().uuid();
export const opcUuid = uuid.nullish();
export const monto = z.union([z.string().regex(/^-?\d+(\.\d+)?$/, 'Número no válido'), z.number()]);
export const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida');

export function leer<T extends z.ZodTypeAny>(esquema: T, cuerpo: unknown): z.infer<T> {
  const r = esquema.safeParse(cuerpo ?? {});
  if (!r.success) throw new ErrorNegocio(400, 'Revise los datos ingresados.', erroresPorCampo(r.error));
  return r.data;
}

export function idValido(id: string): string {
  if (!uuid.safeParse(id).success) throw new ErrorNegocio(404, 'El registro no existe.');
  return id;
}

/** Ejecuta el trabajo con permiso, compañía elegida y la configuración comercial asegurada. */
export function crearConPermiso(servicios: Servicios) {
  return async function conPermiso<T>(
    request: FastifyRequest,
    recurso: string,
    accion: Accion,
    trabajo: (trx: Trx, companiaId: string, sesion: Sesion) => Promise<T>,
  ): Promise<T> {
    const sesion = await obtenerSesion(servicios.db, servicios.verificar, request);
    return enSesion(servicios.db, sesion, async (trx) => {
      await exigirPermiso(trx, sesion, recurso, accion);
      const companiaId = companiaDe(sesion);
      await asegurarConfiguracionComercial(trx, companiaId);
      return trabajo(trx, companiaId, sesion);
    });
  };
}

const lineaCompra = z.object({
  articuloId: opcUuid, descripcion: z.string().max(200).nullish(), cuentaId: opcUuid, unidadNegocioId: opcUuid,
  cantidad: monto, costoUnitario: monto.nullish().or(z.literal('')), impuestoId: opcUuid,
});

export async function rutasCompras(app: FastifyInstance, servicios: Servicios): Promise<void> {
  const conPermiso = crearConPermiso(servicios);

  app.get<{ Querystring: { tipo?: string; buscar?: string; pendientes?: string } }>('/api/com/ordenes', async (request) =>
    conPermiso(request, 'compras', 'VER', (trx, cia) =>
      listarCompras(trx, cia, { tipo: request.query.tipo, buscar: request.query.buscar, pendientes: request.query.pendientes === '1' })),
  );

  app.post('/api/com/ordenes', async (request, reply) => {
    const d = leer(z.object({
      tipo: z.enum(['OC', 'RQ']), proveedorId: opcUuid, unidadNegocioId: uuid, fecha: fecha.nullish(), fechaRequerida: fecha.nullish(),
      condicionPagoId: opcUuid, observacion: z.string().max(500).nullish(), lineas: z.array(lineaCompra).min(1, 'Agregue al menos una línea'),
    }), request.body);
    const r = await conPermiso(request, 'compras', 'CREAR', (trx, cia) => crearOrdenCompra(trx, cia, d));
    reply.code(201);
    return r;
  });

  app.get<{ Params: { id: string } }>('/api/com/ordenes/:id', async (request) =>
    conPermiso(request, 'compras', 'VER', (trx) => detalleCompra(trx, idValido(request.params.id))),
  );

  app.post<{ Params: { id: string } }>('/api/com/ordenes/:id/estado', async (request) => {
    const d = leer(z.object({ estado: z.number().int(), lineas: z.array(uuid).nullish(), comentario: z.string().max(500).nullish() }), request.body);
    return conPermiso(request, 'compras', 'MODIFICAR', async (trx, _c, sesion) => ({ cambiadas: await cambiarEstadoCompra(trx, sesion, idValido(request.params.id), d) }));
  });

  app.post<{ Params: { id: string } }>('/api/com/ordenes/:id/cerrar-saldo', async (request) => {
    const d = leer(z.object({ lineaId: uuid }), request.body);
    return conPermiso(request, 'compras', 'MODIFICAR', async (trx) => {
      await cerrarSaldoCompra(trx, idValido(request.params.id), d.lineaId);
      return { ok: true };
    });
  });

  app.post<{ Params: { id: string } }>('/api/com/ordenes/:id/convertir', async (request, reply) => {
    const d = leer(z.object({ proveedorId: uuid, lineas: z.array(uuid).nullish() }), request.body);
    const r = await conPermiso(request, 'compras', 'CREAR', (trx) => convertirRequisicion(trx, idValido(request.params.id), d));
    reply.code(201);
    return r;
  });

  app.post<{ Params: { id: string } }>('/api/com/ordenes/:id/recibir', async (request, reply) => {
    const d = leer(z.object({ fecha: fecha.nullish(), lineas: z.array(z.object({ lineaId: uuid, cantidad: monto })).min(1) }), request.body);
    const r = await conPermiso(request, 'compras', 'CREAR', (trx) => recibir(trx, idValido(request.params.id), d));
    reply.code(201);
    return r;
  });

  app.get<{ Querystring: { proveedorId?: string } }>('/api/com/pendientes-factura', async (request) =>
    conPermiso(request, 'compras', 'VER', (trx, cia) => pendientesDeFactura(trx, cia, idValido(request.query.proveedorId ?? ''))),
  );

  app.get<{ Querystring: { buscar?: string } }>('/api/com/facturas', async (request) =>
    conPermiso(request, 'compras', 'VER', (trx, cia) => listarFacturasProveedor(trx, cia, request.query.buscar)),
  );

  app.get<{ Params: { id: string } }>('/api/com/facturas/:id', async (request) =>
    conPermiso(request, 'compras', 'VER', (trx) => detalleFacturaProveedor(trx, idValido(request.params.id))),
  );

  app.post('/api/com/facturas', async (request, reply) => {
    const d = leer(z.object({
      proveedorId: uuid, tipoComprobante: z.string().max(2).nullish(), numeroFactura: z.string().max(17), autorizacion: z.string().max(49).nullish(),
      fecha, fechaRegistro: fecha.nullish(), retRentaId: opcUuid, retIvaId: opcUuid,
      lineas: z.array(z.object({
        recepcionId: opcUuid, ordenLineaId: opcUuid, cuentaId: opcUuid, descripcion: z.string().max(200).nullish(), unidadNegocioId: opcUuid,
        cantidad: monto, costoUnitario: monto, impuestoId: opcUuid, retRentaId: opcUuid, retIvaId: opcUuid,
      })).min(1, 'Agregue al menos una línea'),
    }), request.body);
    const r = await conPermiso(request, 'compras', 'CREAR', (trx, cia) => registrarFacturaProveedor(trx, cia, d));
    reply.code(201);
    return r;
  });

  // ------------------------------------------------------------------ cuentas por pagar
  app.get<{ Querystring: { hasta?: string; proveedorId?: string } }>('/api/cxp/documentos', async (request) =>
    conPermiso(request, 'cxp', 'VER', (trx, cia) => documentosAbiertosCxp(trx, cia, {
      hasta: request.query.hasta && fecha.safeParse(request.query.hasta).success ? request.query.hasta : undefined,
      proveedorId: request.query.proveedorId && uuid.safeParse(request.query.proveedorId).success ? request.query.proveedorId : undefined,
    })),
  );

  app.post('/api/cxp/pagos', async (request, reply) => {
    const d = leer(z.object({
      fecha: fecha.nullish(), formaPago: z.string().min(1).max(20), cuentaBancariaId: opcUuid, referencia: z.string().max(100).nullish(),
      aplicaciones: z.array(z.object({ documentoId: uuid, monto })).min(1, 'Seleccione al menos una cuota'),
    }), request.body);
    const r = await conPermiso(request, 'cxp', 'CREAR', (trx, cia) => registrarPagos(trx, cia, d));
    reply.code(201);
    return r;
  });

  app.get<{ Querystring: { fecha?: string } }>('/api/cxp/antiguedad', async (request) =>
    conPermiso(request, 'cxp', 'VER', (trx, cia) =>
      antiguedad(trx, 'cxp_documentos', cia, request.query.fecha && fecha.safeParse(request.query.fecha).success ? request.query.fecha : hoy())),
  );
}
