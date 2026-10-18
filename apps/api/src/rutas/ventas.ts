import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Servicios } from '../app.js';
import { antiguedad } from '../comercial/comun.js';
import { documentosAbiertosCxc, registrarCobro, registrarRetencionRecibida } from '../comercial/cxc.js';
import {
  cambiarEstadoVenta, cerrarSaldoVenta, convertirCotizacion, crearOrdenVenta, despachar, detalleFacturaVenta, detalleVenta, emitirNotaCredito,
  facturarContratos, facturarOrdenVenta, listarFacturasVenta, listarVentas,
} from '../comercial/ventas.js';
import { hoy } from '../nucleo/documentos.js';
import { crearConPermiso, fecha, idValido, leer, monto, opcUuid, uuid } from './compras.js';

const lineaVenta = z.object({
  articuloId: uuid, descripcion: z.string().max(200).nullish(), unidadNegocioId: opcUuid, cantidad: monto,
  precio: monto.nullish().or(z.literal('')), descuentoPorcentaje: monto.nullish().or(z.literal('')),
});

const fechaQuery = (v?: string) => (v && fecha.safeParse(v).success ? v : undefined);
const uuidQuery = (v?: string) => (v && uuid.safeParse(v).success ? v : undefined);

export async function rutasVentas(app: FastifyInstance, servicios: Servicios): Promise<void> {
  const conPermiso = crearConPermiso(servicios);

  app.get<{ Querystring: { tipo?: string; buscar?: string; pendientes?: string } }>('/api/ven/ordenes', async (request) =>
    conPermiso(request, 'ventas', 'VER', (trx, cia) =>
      listarVentas(trx, cia, { tipo: request.query.tipo, buscar: request.query.buscar, pendientes: request.query.pendientes === '1' })),
  );

  app.post('/api/ven/ordenes', async (request, reply) => {
    const d = leer(z.object({
      tipo: z.enum(['OV', 'CO']), clienteId: uuid, unidadNegocioId: uuid, fecha: fecha.nullish(), fechaRequerida: fecha.nullish(),
      referencia: z.string().max(100).nullish(), observacion: z.string().max(500).nullish(), lineas: z.array(lineaVenta).min(1, 'Agregue al menos una línea'),
    }), request.body);
    const r = await conPermiso(request, 'ventas', 'CREAR', (trx, cia) => crearOrdenVenta(trx, cia, d));
    reply.code(201);
    return r;
  });

  app.get<{ Params: { id: string } }>('/api/ven/ordenes/:id', async (request) =>
    conPermiso(request, 'ventas', 'VER', (trx) => detalleVenta(trx, idValido(request.params.id))),
  );

  app.post<{ Params: { id: string } }>('/api/ven/ordenes/:id/estado', async (request) => {
    const d = leer(z.object({ estado: z.number().int(), lineas: z.array(uuid).nullish() }), request.body);
    return conPermiso(request, 'ventas', 'MODIFICAR', async (trx, _c, sesion) => ({ cambiadas: await cambiarEstadoVenta(trx, sesion, idValido(request.params.id), d) }));
  });

  app.post<{ Params: { id: string } }>('/api/ven/ordenes/:id/cerrar-saldo', async (request) => {
    const d = leer(z.object({ lineaId: uuid }), request.body);
    return conPermiso(request, 'ventas', 'MODIFICAR', async (trx) => {
      await cerrarSaldoVenta(trx, idValido(request.params.id), d.lineaId);
      return { ok: true };
    });
  });

  app.post<{ Params: { id: string } }>('/api/ven/ordenes/:id/convertir', async (request, reply) => {
    const d = leer(z.object({ lineas: z.array(uuid).nullish() }), request.body);
    const r = await conPermiso(request, 'ventas', 'CREAR', (trx) => convertirCotizacion(trx, idValido(request.params.id), d.lineas));
    reply.code(201);
    return r;
  });

  app.post<{ Params: { id: string } }>('/api/ven/ordenes/:id/despachar', async (request, reply) => {
    const d = leer(z.object({ fecha: fecha.nullish(), lineas: z.array(z.object({ lineaId: uuid, cantidad: monto })).min(1) }), request.body);
    const r = await conPermiso(request, 'ventas', 'CREAR', (trx) => despachar(trx, idValido(request.params.id), d));
    reply.code(201);
    return r;
  });

  app.post<{ Params: { id: string } }>('/api/ven/ordenes/:id/facturar', async (request, reply) => {
    const d = leer(z.object({ fecha: fecha.nullish() }), request.body);
    const r = await conPermiso(request, 'ventas', 'CREAR', (trx) => facturarOrdenVenta(trx, idValido(request.params.id), d.fecha));
    reply.code(201);
    return r;
  });

  app.get<{ Querystring: { clienteId?: string; buscar?: string; tipo?: string } }>('/api/ven/facturas', async (request) =>
    conPermiso(request, 'ventas', 'VER', (trx, cia) =>
      listarFacturasVenta(trx, cia, { clienteId: uuidQuery(request.query.clienteId), buscar: request.query.buscar, tipo: request.query.tipo })),
  );

  app.get<{ Params: { id: string } }>('/api/ven/facturas/:id', async (request) =>
    conPermiso(request, 'ventas', 'VER', (trx) => detalleFacturaVenta(trx, idValido(request.params.id))),
  );

  app.post('/api/ven/notas-credito', async (request, reply) => {
    const d = leer(z.object({
      facturaId: uuid, fecha: fecha.nullish(), motivo: z.string().min(1, 'Este campo es obligatorio').max(300), devolverInventario: z.boolean().default(false),
      lineas: z.array(z.object({ facturaLineaId: uuid, cantidad: monto })).min(1),
    }), request.body);
    const r = await conPermiso(request, 'ventas', 'CREAR', (trx, cia) => emitirNotaCredito(trx, cia, d));
    reply.code(201);
    return r;
  });

  app.post('/api/ven/contratos/facturar', async (request, reply) => {
    const d = leer(z.object({ fecha: fecha.nullish() }), request.body);
    const r = await conPermiso(request, 'ventas', 'CREAR', (trx, cia) => facturarContratos(trx, cia, d.fecha ?? hoy()));
    reply.code(201);
    return r;
  });

  // ------------------------------------------------------------------ cuentas por cobrar
  app.get<{ Querystring: { clienteId?: string; hasta?: string } }>('/api/cxc/documentos', async (request) =>
    conPermiso(request, 'cxc', 'VER', (trx, cia) =>
      documentosAbiertosCxc(trx, cia, { clienteId: uuidQuery(request.query.clienteId), hasta: fechaQuery(request.query.hasta) })),
  );

  app.post('/api/cxc/cobros', async (request, reply) => {
    const d = leer(z.object({
      clienteId: uuid, fecha: fecha.nullish(), formaPago: z.string().min(1).max(20), cuentaBancariaId: opcUuid, monto, referencia: z.string().max(100).nullish(),
      aplicaciones: z.array(z.object({ documentoId: uuid, monto })).min(1, 'Seleccione al menos una cuota'),
    }), request.body);
    const r = await conPermiso(request, 'cxc', 'CREAR', (trx, cia) => registrarCobro(trx, cia, d));
    reply.code(201);
    return r;
  });

  app.post('/api/cxc/retenciones', async (request, reply) => {
    const d = leer(z.object({
      facturaId: uuid, secuencial: z.string().max(17), fecha, autorizacion: z.string().max(49).nullish(),
      lineas: z.array(z.object({ codigoRetencionId: uuid, base: monto })).min(1),
    }), request.body);
    const r = await conPermiso(request, 'cxc', 'CREAR', (trx, cia) => registrarRetencionRecibida(trx, cia, d));
    reply.code(201);
    return r;
  });

  app.get<{ Querystring: { fecha?: string } }>('/api/cxc/antiguedad', async (request) =>
    conPermiso(request, 'cxc', 'VER', (trx, cia) => antiguedad(trx, 'cxc_documentos', cia, fechaQuery(request.query.fecha) ?? hoy())),
  );
}
