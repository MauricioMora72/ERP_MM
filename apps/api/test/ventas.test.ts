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
const hoy = () => new Date().toISOString().slice(0, 10);

async function conExistencias(prefijo: string) {
  const s = await preparar(prefijo);
  await ok(s.correo, 'POST', '/api/inventario/ajustes', { unidadNegocioId: s.bodegaId, articuloId: s.filtroId, cantidad: '10', costoUnitario: '12' });
  return s;
}

describe('Ventas al cobro', () => {
  it('de la cotización al cobro: compromete, despacha en partes, factura con costo, nota de crédito, retención y cobro', async () => {
    const s = await conExistencias('ven');
    const c = s.correo;

    // Cotización con precio de lista y 10 % de descuento en el servicio; se convierte en orden.
    const co = await ok(c, 'POST', '/api/ven/ordenes', {
      tipo: 'CO', clienteId: s.clienteId, unidadNegocioId: s.bodegaId,
      lineas: [{ articuloId: s.filtroId, cantidad: '4' }, { articuloId: s.servicioId, cantidad: '1', descuentoPorcentaje: '10' }],
    });
    expect((await existencia(s.suscriptorId, s.filtroId)).comprometido).toBe(0);
    const ov = await ok(c, 'POST', `/api/ven/ordenes/${co.id}/convertir`, {});
    expect(ov.retenida).toBe(false);
    expect((await ok(c, 'GET', `/api/ven/ordenes/${co.id}`)).lineas.every((l: Json) => l.fase === 'CERRADA')).toBe(true);
    let d = await ok(c, 'GET', `/api/ven/ordenes/${ov.id}`);
    expect(d.lineas.map((l: Json) => [l.fase, l.precio, l.descuento])).toEqual([['APROBADA', '25.000000', '0.00'], ['APROBADA', '80.000000', '8.00']]);
    expect(await existencia(s.suscriptorId, s.filtroId)).toEqual({ enMano: 10, comprometido: 4 });
    const [lFiltro, lServicio] = d.lineas;

    // Despacho parcial: 3 filtros salen al costo promedio y el servicio se confirma.
    expect((await llamar(c, 'POST', `/api/ven/ordenes/${ov.id}/despachar`, { lineas: [{ lineaId: lFiltro.id, cantidad: '5' }] })).estado).toBe(400);
    await ok(c, 'POST', `/api/ven/ordenes/${ov.id}/despachar`, { lineas: [{ lineaId: lFiltro.id, cantidad: '3' }, { lineaId: lServicio.id, cantidad: '1' }] });
    expect(await existencia(s.suscriptorId, s.filtroId)).toEqual({ enMano: 7, comprometido: 1 });
    expect(await saldo(s.suscriptorId, '1.1.09')).toBe(36);

    // Facturación de lo despachado: base 75 + 72 = 147, IVA 22,05, total 169,05; el costo pasa a costo de ventas.
    const f1 = await ok(c, 'POST', `/api/ven/ordenes/${ov.id}/facturar`, {});
    expect(f1.total).toBe('169.05');
    expect(await saldo(s.suscriptorId, '1.1.09')).toBe(0);
    expect(await saldo(s.suscriptorId, '5.1.06')).toBe(36);
    expect(await saldo(s.suscriptorId, '4.1.02')).toBe(-75);
    expect(await saldo(s.suscriptorId, '4.1.01')).toBe(-72);
    d = await ok(c, 'GET', `/api/ven/ordenes/${ov.id}`);
    expect(d.lineas.map((l: Json) => l.fase)).toEqual(['APROBADA', 'FACTURADA']);
    expect((await llamar(c, 'POST', `/api/ven/ordenes/${ov.id}/facturar`, {})).estado).toBe(400);

    // Segundo despacho y segunda factura completan la línea.
    await ok(c, 'POST', `/api/ven/ordenes/${ov.id}/despachar`, { lineas: [{ lineaId: lFiltro.id, cantidad: '1' }] });
    const f2 = await ok(c, 'POST', `/api/ven/ordenes/${ov.id}/facturar`, {});
    expect(f2.total).toBe('28.75');
    d = await ok(c, 'GET', `/api/ven/ordenes/${ov.id}`);
    expect(d.lineas.map((l: Json) => l.fase)).toEqual(['FACTURADA', 'FACTURADA']);
    expect(d.facturas).toHaveLength(2);
    expect(await existencia(s.suscriptorId, s.filtroId)).toEqual({ enMano: 6, comprometido: 0 });

    // Nota de crédito por un filtro devuelto a bodega.
    const det1 = await ok(c, 'GET', `/api/ven/facturas/${f1.facturaId}`);
    const lineaFiltro = det1.lineas.find((l: Json) => l.articulo === 'FILTRO');
    expect((await llamar(c, 'POST', '/api/ven/notas-credito', { facturaId: f1.facturaId, motivo: 'Exceso', lineas: [{ facturaLineaId: lineaFiltro.id, cantidad: '4' }] })).estado).toBe(400);
    const nc = await ok(c, 'POST', '/api/ven/notas-credito', {
      facturaId: f1.facturaId, motivo: 'Producto con falla', devolverInventario: true, lineas: [{ facturaLineaId: lineaFiltro.id, cantidad: '1' }],
    });
    expect(nc.total).toBe('28.75');
    expect(nc.saldoAFavor).toBe('0.00');
    expect((await existencia(s.suscriptorId, s.filtroId)).enMano).toBe(7);
    expect(await saldo(s.suscriptorId, '5.1.06')).toBe(36);
    expect(await saldo(s.suscriptorId, '4.1.03')).toBe(25);

    // Retención del cliente: renta 1,75 % de 147 = 2,57 e IVA 30 % de 22,05 = 6,62.
    const r312 = await idDe(c, 'codigos-retencion', 'codigo=312');
    const r30 = await idDe(c, 'codigos-retencion', 'codigo=1');
    const ret = await ok(c, 'POST', '/api/cxc/retenciones', {
      facturaId: f1.facturaId, secuencial: '001-001-000000777', fecha: hoy(),
      lineas: [{ codigoRetencionId: r312, base: '147' }, { codigoRetencionId: r30, base: '22.05' }],
    });
    expect(ret.total).toBe('9.19');
    expect(await saldo(s.suscriptorId, '1.1.07')).toBe(2.57);
    expect(await saldo(s.suscriptorId, '1.1.08')).toBe(6.62);

    // Cobro de ambas facturas.
    const docs = await ok(c, 'GET', `/api/cxc/documentos?clienteId=${s.clienteId}`);
    expect(docs.map((x: Json) => x.saldo).sort()).toEqual(['131.11', '28.75']);
    const malo = await llamar(c, 'POST', '/api/cxc/cobros', {
      clienteId: s.clienteId, formaPago: 'TRANSFERENCIA', cuentaBancariaId: s.cuentaBancariaId, monto: '100',
      aplicaciones: docs.map((x: Json) => ({ documentoId: x.id, monto: x.saldo })),
    });
    expect(malo.estado).toBe(400);
    await ok(c, 'POST', '/api/cxc/cobros', {
      clienteId: s.clienteId, formaPago: 'TRANSFERENCIA', cuentaBancariaId: s.cuentaBancariaId, monto: '159.86',
      aplicaciones: docs.map((x: Json) => ({ documentoId: x.id, monto: x.saldo })),
    });
    expect(await ok(c, 'GET', '/api/cxc/documentos')).toHaveLength(0);
    expect(await saldo(s.suscriptorId, '1.1.02')).toBe(0);
    expect(await saldo(s.suscriptorId, '1.1.01')).toBe(159.86);
    const det = await ok(c, 'GET', `/api/ven/facturas/${f1.facturaId}`);
    expect(det.aplicaciones).toHaveLength(3);
    expect(det.notas).toHaveLength(1);
    expect(await cuadra(s.suscriptorId)).toBe(true);
  });

  it('retiene por crédito, libera, cancela y cierra saldos liberando el compromiso', async () => {
    const s = await conExistencias('ven2');
    const c = s.correo;
    const clienteMae = await idDe(c, 'clientes', `direccion_id=${s.clienteId}`);
    await ok(c, 'PUT', `/api/e/clientes/${clienteMae}`, { limite_credito: '50' });
    const ov = await ok(c, 'POST', '/api/ven/ordenes', {
      tipo: 'OV', clienteId: s.clienteId, unidadNegocioId: s.bodegaId,
      lineas: [{ articuloId: s.filtroId, cantidad: '3' }, { articuloId: s.filtroId, cantidad: '2' }],
    });
    expect(ov.retenida).toBe(true);
    let d = await ok(c, 'GET', `/api/ven/ordenes/${ov.id}`);
    expect(d.lineas.every((l: Json) => l.fase === 'RETENIDA')).toBe(true);
    expect((await llamar(c, 'POST', `/api/ven/ordenes/${ov.id}/despachar`, { lineas: [{ lineaId: d.lineas[0].id, cantidad: '1' }] })).estado).toBe(400);
    const liberar = d.lineas[0].siguientes.find((x: Json) => x.fase === 'APROBADA');
    await ok(c, 'POST', `/api/ven/ordenes/${ov.id}/estado`, { estado: liberar.estado });
    d = await ok(c, 'GET', `/api/ven/ordenes/${ov.id}`);
    const [l1, l2] = d.lineas;
    await ok(c, 'POST', `/api/ven/ordenes/${ov.id}/despachar`, { lineas: [{ lineaId: l1.id, cantidad: '1' }] });
    await ok(c, 'POST', `/api/ven/ordenes/${ov.id}/cerrar-saldo`, { lineaId: l1.id });
    const cancelar = l2.siguientes.find((x: Json) => x.fase === 'CANCELADA');
    await ok(c, 'POST', `/api/ven/ordenes/${ov.id}/estado`, { estado: cancelar.estado, lineas: [l2.id] });
    d = await ok(c, 'GET', `/api/ven/ordenes/${ov.id}`);
    expect(d.lineas.map((l: Json) => [l.fase, l.cantidad])).toEqual([['DESPACHADA', '1.0000'], ['CANCELADA', '2.0000']]);
    expect(await existencia(s.suscriptorId, s.filtroId)).toEqual({ enMano: 9, comprometido: 0 });
  });

  it('factura los contratos vencidos una sola vez por período', async () => {
    const s = await preparar('ven3');
    const c = s.correo;
    const contrato = await ok(c, 'POST', '/api/e/contratos', { compania_id: s.companiaId, numero: 1, cliente_id: s.clienteId, fecha_inicio: '2026-01-01', frecuencia: 'MENSUAL' });
    await ok(c, 'POST', '/api/e/contratos-lineas', { contrato_id: contrato.id, linea: 1, articulo_id: s.servicioId, cantidad: '1', precio: '200', proxima_facturacion: hoy() });
    const primera = await ok(c, 'POST', '/api/ven/contratos/facturar', {});
    expect(primera).toHaveLength(1);
    expect(primera[0].total).toBe('230.00');
    expect(await ok(c, 'POST', '/api/ven/contratos/facturar', {})).toHaveLength(0);
    const antig = await ok(c, 'GET', '/api/cxc/antiguedad');
    expect(antig[0].por_vencer).toBe('230.00');
    expect(await cuadra(s.suscriptorId)).toBe(true);
  });
});
