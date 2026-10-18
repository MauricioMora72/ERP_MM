import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { levantar, type Entorno } from './ayudas.js';
import { herramientas, type Json } from './comercial.js';

let e: Entorno;
beforeAll(async () => {
  e = await levantar();
});
afterAll(async () => {
  await e.app.close();
  await e.db.destroy();
});
const { llamar, ok, idDe, saldo, cuadra, existencia, preparar } = herramientas(() => e);

/** Lleva todas las líneas de una orden hasta la fase indicada usando los cambios manuales del flujo. */
async function llevarA(correo: string, ordenId: string, fase: string) {
  for (let i = 0; i < 5; i++) {
    const d = await ok(correo, 'GET', `/api/com/ordenes/${ordenId}`);
    const linea = d.lineas.find((l: Json) => l.fase !== fase && l.fase !== 'CANCELADA');
    if (!linea) return d;
    const sig = linea.siguientes.find((s: Json) => s.fase !== 'CANCELADA' && s.estado > linea.estado_ultimo);
    await ok(correo, 'POST', `/api/com/ordenes/${ordenId}/estado`, { estado: sig.estado, comentario: 'Conforme' });
  }
  throw new Error('No se llegó a la fase');
}

describe('Compras al pago', () => {
  it('de la requisición al pago: aprueba, recibe en dos partes, factura con variación y retención, y paga', async () => {
    const s = await preparar('com');
    const c = s.correo;

    // Requisición aprobada y convertida en orden de compra.
    const rq = await ok(c, 'POST', '/api/com/ordenes', {
      tipo: 'RQ', unidadNegocioId: s.bodegaId,
      lineas: [{ articuloId: s.filtroId, cantidad: '10', costoUnitario: '12' }, { articuloId: s.servicioId, cantidad: '1', costoUnitario: '100' }],
    });
    await llevarA(c, rq.id, 'APROBADA');
    const oc = await ok(c, 'POST', `/api/com/ordenes/${rq.id}/convertir`, { proveedorId: s.proveedorId });
    const rqDespues = await ok(c, 'GET', `/api/com/ordenes/${rq.id}`);
    expect(rqDespues.lineas.every((l: Json) => l.fase === 'CERRADA')).toBe(true);

    // La orden nace registrada, pasa por aprobación y queda por recibir.
    let d = await ok(c, 'GET', `/api/com/ordenes/${oc.id}`);
    expect(d.orden.documento_origen_id).toBe(rq.id);
    expect(d.lineas.map((l: Json) => l.fase)).toEqual(['REGISTRADA', 'REGISTRADA']);
    d = await llevarA(c, oc.id, 'APROBADA');
    expect(d.aprobaciones).toHaveLength(1);
    const [lFiltro, lServicio] = d.lineas;

    // No se recibe más de lo pedido.
    const exceso = await llamar(c, 'POST', `/api/com/ordenes/${oc.id}/recibir`, { lineas: [{ lineaId: lFiltro.id, cantidad: '11' }] });
    expect(exceso.estado).toBe(400);

    // Recepción parcial: la línea sigue por recibir; la segunda completa la cantidad.
    await ok(c, 'POST', `/api/com/ordenes/${oc.id}/recibir`, { lineas: [{ lineaId: lFiltro.id, cantidad: '6' }] });
    d = await ok(c, 'GET', `/api/com/ordenes/${oc.id}`);
    expect(d.lineas[0].fase).toBe('APROBADA');
    await ok(c, 'POST', `/api/com/ordenes/${oc.id}/recibir`, { lineas: [{ lineaId: lFiltro.id, cantidad: '4' }] });
    d = await ok(c, 'GET', `/api/com/ordenes/${oc.id}`);
    expect(d.lineas[0].fase).toBe('RECIBIDA');
    expect((await existencia(s.suscriptorId, s.filtroId)).enMano).toBe(10);
    expect(await saldo(s.suscriptorId, '1.1.04')).toBe(120);
    expect(await saldo(s.suscriptorId, '2.1.05')).toBe(-120);

    // Factura del proveedor: las 6 primeras llegan a 12,50 (variación de 3,00) y el servicio se cruza sin recepción.
    const pendientes = await ok(c, 'GET', `/api/com/pendientes-factura?proveedorId=${s.proveedorId}`);
    expect(pendientes).toHaveLength(3);
    const [rec1, rec2] = pendientes.filter((p: Json) => p.recepcion_id);
    const servicioPend = pendientes.find((p: Json) => p.orden_linea_id);
    const ret3440 = await idDe(c, 'codigos-retencion', 'codigo=3440');
    const ret70 = await idDe(c, 'codigos-retencion', 'codigo=2');
    const factura = await ok(c, 'POST', '/api/com/facturas', {
      proveedorId: s.proveedorId, numeroFactura: '001-002-000004512', autorizacion: '1234567890', fecha: new Date().toISOString().slice(0, 10),
      lineas: [
        { recepcionId: rec1.recepcion_id, cantidad: '6', costoUnitario: '12.50' },
        { recepcionId: rec2.recepcion_id, cantidad: '4', costoUnitario: '12' },
        { ordenLineaId: servicioPend.orden_linea_id, cantidad: '1', costoUnitario: '100', retRentaId: ret3440, retIvaId: ret70 },
      ],
    });
    // Subtotal 223,00, IVA 33,45. Retención: renta 1,75 % de 123 = 2,15 y 2,75 % de 100 = 2,75; IVA 30 % de 18,45 = 5,54 y 70 % de 15 = 10,50.
    expect(factura.subtotal).toBe('223.00');
    expect(factura.impuestos).toBe('33.45');
    expect(factura.total).toBe('256.45');
    expect(factura.retenido).toBe('20.94');
    expect(factura.aPagar).toBe('235.51');
    expect(factura.retencion).toMatch(/^001-001-\d{9}$/);

    d = await ok(c, 'GET', `/api/com/ordenes/${oc.id}`);
    expect(d.lineas.map((l: Json) => l.fase)).toEqual(['FACTURADA', 'FACTURADA']);
    expect(lServicio.cantidad_recibida).toBe('0.0000');
    expect(await saldo(s.suscriptorId, '2.1.05')).toBe(0);
    expect(await saldo(s.suscriptorId, '5.1.07')).toBe(3);
    expect(await saldo(s.suscriptorId, '5.1.08')).toBe(100);
    expect(await saldo(s.suscriptorId, '1.1.06')).toBe(33.45);
    expect(await saldo(s.suscriptorId, '2.1.06')).toBe(-4.9);
    expect(await saldo(s.suscriptorId, '2.1.07')).toBe(-16.04);
    expect(await saldo(s.suscriptorId, '2.1.01')).toBe(-235.51);

    // El mismo comprobante no se registra dos veces.
    const repetida = await llamar(c, 'POST', '/api/com/facturas', {
      proveedorId: s.proveedorId, numeroFactura: '001-002-000004512', fecha: new Date().toISOString().slice(0, 10),
      lineas: [{ cuentaId: await idDe(c, 'cuentas', 'codigo=5.1.08'), descripcion: 'Otro gasto', cantidad: '1', costoUnitario: '5' }],
    });
    expect(repetida.estado).toBe(409);

    // Cuota a 30 días con la retención aplicada; antigüedad por vencer.
    const detalle = await ok(c, 'GET', `/api/com/facturas/${factura.id}`);
    expect(detalle.cuotas).toHaveLength(1);
    expect(detalle.cuotas[0].saldo).toBe('235.51');
    expect(detalle.retencion.lineas).toHaveLength(4);
    const antig = await ok(c, 'GET', '/api/cxp/antiguedad');
    expect(antig[0].por_vencer).toBe('235.51');

    // Pago en dos partes desde la cuenta bancaria.
    const docs = await ok(c, 'GET', `/api/cxp/documentos?proveedorId=${s.proveedorId}`);
    await ok(c, 'POST', '/api/cxp/pagos', { formaPago: 'TRANSFERENCIA', cuentaBancariaId: s.cuentaBancariaId, aplicaciones: [{ documentoId: docs[0].id, monto: '200' }] });
    const sobrepago = await llamar(c, 'POST', '/api/cxp/pagos', { formaPago: 'TRANSFERENCIA', cuentaBancariaId: s.cuentaBancariaId, aplicaciones: [{ documentoId: docs[0].id, monto: '40' }] });
    expect(sobrepago.estado).toBe(400);
    const pagos = await ok(c, 'POST', '/api/cxp/pagos', { formaPago: 'TRANSFERENCIA', cuentaBancariaId: s.cuentaBancariaId, aplicaciones: [{ documentoId: docs[0].id, monto: '35.51' }] });
    expect(pagos).toHaveLength(1);
    expect(await ok(c, 'GET', '/api/cxp/documentos')).toHaveLength(0);
    expect(await saldo(s.suscriptorId, '2.1.01')).toBe(0);
    expect(await saldo(s.suscriptorId, '1.1.01')).toBe(-235.51);
    expect(await cuadra(s.suscriptorId)).toBe(true);
  });

  it('aprobar exige permiso, una línea sin recepción se cancela y el saldo de una recepción parcial se cierra', async () => {
    const s = await preparar('com2');
    const c = s.correo;
    const oc = await ok(c, 'POST', '/api/com/ordenes', {
      tipo: 'OC', proveedorId: s.proveedorId, unidadNegocioId: s.bodegaId,
      lineas: [{ articuloId: s.filtroId, cantidad: '5', costoUnitario: '10' }, { articuloId: s.filtroId, cantidad: '2', costoUnitario: '10' }],
    });
    // Un comprador sin permiso de aprobación puede enviar a aprobar pero no aprobar.
    const sinPermiso = await ok(c, 'POST', '/api/e/roles', { codigo: 'COMPRADOR', descripcion: 'Comprador' });
    for (const recurso of ['compras']) {
      for (const accion of ['VER', 'CREAR', 'MODIFICAR']) await ok(c, 'POST', '/api/e/permisos', { rol_id: sinPermiso.id, recurso, accion });
    }
    const comprador = 'comprador.' + Date.now() + '@prueba.ec';
    const usuario = await ok(c, 'POST', '/api/e/usuarios', { firebase_uid: comprador, correo: comprador, nombre: 'Comprador', compania_defecto_id: s.companiaId });
    await ok(c, 'POST', '/api/e/usuarios-roles', { usuario_id: usuario.id, rol_id: sinPermiso.id });
    const d = await ok(comprador, 'GET', `/api/com/ordenes/${oc.id}`);
    const enviar = d.lineas[0].siguientes.find((x: Json) => x.fase === 'APROBACION');
    await ok(comprador, 'POST', `/api/com/ordenes/${oc.id}/estado`, { estado: enviar.estado });
    const d2 = await ok(comprador, 'GET', `/api/com/ordenes/${oc.id}`);
    const aprobar = d2.lineas[0].siguientes.find((x: Json) => x.fase === 'APROBADA');
    expect((await llamar(comprador, 'POST', `/api/com/ordenes/${oc.id}/estado`, { estado: aprobar.estado })).estado).toBe(403);
    await ok(c, 'POST', `/api/com/ordenes/${oc.id}/estado`, { estado: aprobar.estado });

    const [l1, l2] = (await ok(c, 'GET', `/api/com/ordenes/${oc.id}`)).lineas;
    await ok(c, 'POST', `/api/com/ordenes/${oc.id}/recibir`, { lineas: [{ lineaId: l1.id, cantidad: '3' }] });
    // Con recepción no se cancela; se cierra el saldo y la línea queda recibida por 3.
    const cancelar = l1.siguientes.find((x: Json) => x.fase === 'CANCELADA');
    expect((await llamar(c, 'POST', `/api/com/ordenes/${oc.id}/estado`, { estado: cancelar.estado, lineas: [l1.id] })).estado).toBe(400);
    await ok(c, 'POST', `/api/com/ordenes/${oc.id}/cerrar-saldo`, { lineaId: l1.id });
    await ok(c, 'POST', `/api/com/ordenes/${oc.id}/estado`, { estado: cancelar.estado, lineas: [l2.id] });
    const fin = await ok(c, 'GET', `/api/com/ordenes/${oc.id}`);
    expect(fin.lineas.map((l: Json) => [l.fase, l.cantidad])).toEqual([['RECIBIDA', '3.0000'], ['CANCELADA', '2.0000']]);
  });
});
