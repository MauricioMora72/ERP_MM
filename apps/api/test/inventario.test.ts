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

async function conSegundaBodega(prefijo: string) {
  const s = await preparar(prefijo);
  const b2 = await ok(s.correo, 'POST', '/api/e/unidades-negocio', { compania_id: s.companiaId, codigo: 'BOD-NORTE', descripcion: 'Bodega norte', tipo: 'BODEGA' });
  return { ...s, bodega2Id: b2.id as string };
}

describe('Inventarios', () => {
  it('transfiere entre bodegas al costo promedio y el kardex muestra el saldo acumulado', async () => {
    const s = await conSegundaBodega('inv');
    const c = s.correo;
    await ok(c, 'POST', '/api/inventario/ajustes', { unidadNegocioId: s.bodegaId, articuloId: s.filtroId, cantidad: '10', costoUnitario: '12' });
    expect((await llamar(c, 'POST', '/api/inventario/transferencias', { origenId: s.bodegaId, destinoId: s.bodegaId, lineas: [{ articuloId: s.filtroId, cantidad: '1' }] })).estado).toBe(400);
    expect((await llamar(c, 'POST', '/api/inventario/transferencias', { origenId: s.bodegaId, destinoId: s.bodega2Id, lineas: [{ articuloId: s.filtroId, cantidad: '11' }] })).estado).toBe(400);
    const tr = await ok(c, 'POST', '/api/inventario/transferencias', { origenId: s.bodegaId, destinoId: s.bodega2Id, lineas: [{ articuloId: s.filtroId, cantidad: '4' }] });
    expect(tr.numero).toBe('1');
    const saldos = await ok(c, 'GET', '/api/inventario/saldos?buscar=FILTRO');
    expect(saldos.map((x: Json) => [x.bodega, x.en_mano, x.valor])).toEqual([['BOD-NORTE', '4.0000', '48.00'], ['C01-01', '6.0000', '72.00']]);
    expect(await saldo(s.suscriptorId, '1.1.04')).toBe(120);

    const k = await ok(c, 'GET', `/api/inventario/kardex?articuloId=${s.filtroId}&unidadNegocioId=${s.bodegaId}`);
    expect(k.saldoInicial.cantidad).toBe('0.0000');
    expect(k.movimientos.map((m: Json) => [m.tipo, m.cantidad, m.saldo_cantidad, m.saldo_valor])).toEqual([
      ['AJ', '10.0000', '10.0000', '120.00'], ['TR', '-4.0000', '6.0000', '72.00'],
    ]);
    expect(await cuadra(s.suscriptorId)).toBe(true);
  });

  it('el conteo físico toma la foto, ajusta solo las diferencias y luego no se modifica', async () => {
    const s = await preparar('inv2');
    const c = s.correo;
    await ok(c, 'POST', '/api/inventario/ajustes', { unidadNegocioId: s.bodegaId, articuloId: s.filtroId, cantidad: '6', costoUnitario: '12' });
    const conteo = await ok(c, 'POST', '/api/inventario/conteos', { unidadNegocioId: s.bodegaId });
    let d = await ok(c, 'GET', `/api/inventario/documentos/${conteo.id}`);
    expect(d.lineas.map((l: Json) => [l.articulo, l.cantidad_sistema])).toEqual([['FILTRO', '6.0000']]);
    await ok(c, 'PUT', `/api/inventario/conteos/${conteo.id}`, { cantidades: [{ lineaId: d.lineas[0].id, cantidad: '5' }] });
    const r = await ok(c, 'POST', `/api/inventario/conteos/${conteo.id}/contabilizar`, {});
    expect(r.ajustadas).toBe(1);
    expect((await existencia(s.suscriptorId, s.filtroId)).enMano).toBe(5);
    // El ajuste de entrada abonó 72 y el faltante del conteo carga 12.
    expect(await saldo(s.suscriptorId, '5.1.05')).toBe(-60);
    d = await ok(c, 'GET', `/api/inventario/documentos/${conteo.id}`);
    expect(d.documento.estado).toBe('CONTABILIZADO');
    expect(d.lineas[0].cantidad).toBe('-1.0000');
    expect((await llamar(c, 'PUT', `/api/inventario/conteos/${conteo.id}`, { cantidades: [{ lineaId: d.lineas[0].id, cantidad: '6' }] })).estado).toBe(400);
    expect(await cuadra(s.suscriptorId)).toBe(true);
  });

  it('los lotes exigen código en la entrada, salen por vencimiento, regresan a su lote y viajan en las transferencias', async () => {
    const s = await conSegundaBodega('inv3');
    const c = s.correo;
    const iva = await idDe(c, 'impuestos', 'codigo=IVA15');
    const lote = await ok(c, 'POST', '/api/e/articulos', {
      codigo: 'VACUNA', descripcion: 'Vacuna veterinaria', tipo_existencia: 'INVENTARIABLE', unidad_primaria: 'UN', impuesto_id: iva,
      clase_contable_id: await idDe(c, 'clases-contables', 'codigo=ART-INV'), controla_lote: true,
    });
    expect((await llamar(c, 'POST', '/api/inventario/ajustes', { unidadNegocioId: s.bodegaId, articuloId: lote.id, cantidad: '5', costoUnitario: '10' })).estado).toBe(400);
    await ok(c, 'POST', '/api/inventario/ajustes', { unidadNegocioId: s.bodegaId, articuloId: lote.id, cantidad: '5', costoUnitario: '10', lote: 'a-2027', vencimiento: '2027-03-01' });
    await ok(c, 'POST', '/api/inventario/ajustes', { unidadNegocioId: s.bodegaId, articuloId: lote.id, cantidad: '5', costoUnitario: '10', lote: 'B-2026', vencimiento: '2026-12-01' });
    await ok(c, 'POST', '/api/e/precios', { lista_precios_id: await idDe(c, 'listas-precios', 'codigo=PVP'), articulo_id: lote.id, unidad: 'UN', vigente_desde: '2024-01-01', precio: '20' });

    // La venta de 7 toma primero el lote que vence antes.
    const ov = await ok(c, 'POST', '/api/ven/ordenes', { tipo: 'OV', clienteId: s.clienteId, unidadNegocioId: s.bodegaId, lineas: [{ articuloId: lote.id, cantidad: '7' }] });
    const d = await ok(c, 'GET', `/api/ven/ordenes/${ov.id}`);
    await ok(c, 'POST', `/api/ven/ordenes/${ov.id}/despachar`, { lineas: [{ lineaId: d.lineas[0].id, cantidad: '7' }] });
    let saldos = await ok(c, 'GET', '/api/inventario/saldos?buscar=VACUNA');
    expect(saldos.filter((x: Json) => x.lote).map((x: Json) => [x.lote, x.en_mano])).toEqual([['A-2027', '3.0000']]);
    const k = await ok(c, 'GET', `/api/inventario/kardex?articuloId=${lote.id}&unidadNegocioId=${s.bodegaId}`);
    expect(k.movimientos.filter((m: Json) => m.tipo === 'DS').map((m: Json) => [m.lote, m.cantidad])).toEqual([['B-2026', '-5.0000'], ['A-2027', '-2.0000']]);

    // La devolución regresa a un lote del que salió esa misma línea.
    const f = await ok(c, 'POST', `/api/ven/ordenes/${ov.id}/facturar`, {});
    const fac = await ok(c, 'GET', `/api/ven/facturas/${f.facturaId}`);
    await ok(c, 'POST', '/api/ven/notas-credito', { facturaId: f.facturaId, motivo: 'Cadena de frío', devolverInventario: true, lineas: [{ facturaLineaId: fac.lineas[0].id, cantidad: '1' }] });
    saldos = await ok(c, 'GET', '/api/inventario/saldos?buscar=VACUNA');
    expect(saldos.filter((x: Json) => x.lote).map((x: Json) => [x.lote, x.en_mano])).toEqual([['A-2027', '4.0000']]);

    // La transferencia lleva el lote con su vencimiento.
    await ok(c, 'POST', '/api/inventario/transferencias', { origenId: s.bodegaId, destinoId: s.bodega2Id, lineas: [{ articuloId: lote.id, cantidad: '2' }] });
    saldos = await ok(c, 'GET', `/api/inventario/saldos?buscar=VACUNA&unidadNegocioId=${s.bodega2Id}`);
    expect(saldos.map((x: Json) => [x.lote, x.fecha_vencimiento, x.en_mano])).toEqual([['A-2027', '2027-03-01', '2.0000']]);
    const lotes = await ok(c, 'GET', `/api/inventario/lotes?articuloId=${lote.id}&unidadNegocioId=${s.bodegaId}`);
    expect(lotes.map((x: Json) => [x.lote, x.en_mano])).toEqual([['A-2027', '2.0000']]);

    // El conteo físico incluye cada lote.
    const conteo = await ok(c, 'POST', '/api/inventario/conteos', { unidadNegocioId: s.bodegaId });
    const dc = await ok(c, 'GET', `/api/inventario/documentos/${conteo.id}`);
    expect(dc.lineas.filter((l: Json) => l.articulo === 'VACUNA').map((l: Json) => [l.lote, l.cantidad_sistema])).toEqual([['A-2027', '2.0000']]);
    expect(await cuadra(s.suscriptorId)).toBe(true);
  });
});
