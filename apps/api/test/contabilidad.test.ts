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
const { llamar, ok, idDe, saldo, cuadra, preparar } = herramientas(() => e);
const hoy = () => new Date().toISOString().slice(0, 10);
const anio = () => Number(hoy().slice(0, 4));

async function cuentas(correo: string) {
  const c = async (codigo: string) => idDe(correo, 'cuentas', `codigo=${codigo}`);
  return { caja: await c('1.1.01'), clientes: await c('1.1.02'), capital: await c('3.1.01'), ingreso: await c('4.1.01'), gastoBanco: await c('5.1.09'), activo: await c('1') };
}

describe('Contabilidad general', () => {
  it('asientos manuales, reportes, reversa y cierre del ejercicio', async () => {
    const s = await preparar('con');
    const c = s.correo;
    const k = await cuentas(c);
    const asiento = (glosa: string, lineas: [string, string, string][]) =>
      ({ fecha: hoy(), glosa, lineas: lineas.map(([cuentaId, debito, credito]) => ({ cuentaId, debito, credito })) });

    expect((await llamar(c, 'POST', '/api/con/asientos', asiento('Descuadrado', [[k.caja, '100', ''], [k.capital, '', '90']]))).estado).toBe(400);
    expect((await llamar(c, 'POST', '/api/con/asientos', asiento('Cuenta de grupo', [[k.activo, '100', ''], [k.capital, '', '100']]))).estado).toBe(400);

    await ok(c, 'POST', '/api/con/asientos', asiento('Aporte de capital', [[k.caja, '1000', ''], [k.capital, '', '1000']]));
    await ok(c, 'POST', '/api/con/asientos', asiento('Venta de contado', [[k.caja, '300', ''], [k.ingreso, '', '300']]));
    const gasto = await ok(c, 'POST', '/api/con/asientos', asiento('Comisión bancaria', [[k.gastoBanco, '50', ''], [k.caja, '', '50']]));

    const comp = await ok(c, 'GET', `/api/con/reportes/comprobacion?desde=${anio()}-01-01&hasta=${hoy()}`);
    expect(comp.totales.debitos).toBe('1350.00');
    expect(comp.totales.creditos).toBe('1350.00');
    expect(comp.filas.find((f: Json) => f.codigo === '1.1.01').final).toBe('1250.00');
    expect(comp.filas.find((f: Json) => f.codigo === '1').final).toBe('1250.00');

    const res = await ok(c, 'GET', `/api/con/reportes/resultados?desde=${anio()}-01-01&hasta=${hoy()}`);
    expect(res.utilidad).toBe('250.00');
    const bal = await ok(c, 'GET', `/api/con/reportes/balance?fecha=${hoy()}`);
    expect(bal.cuadra).toBe(true);
    expect(bal.totalDeudoras).toBe('1250.00');
    expect(bal.resultado).toBe('250.00');

    const mayor = await ok(c, 'GET', `/api/con/reportes/mayor?cuentaId=${k.caja}&desde=${anio()}-01-01&hasta=${hoy()}`);
    expect(mayor.filas.map((f: Json) => f.saldo)).toEqual(['1000.00', '1300.00', '1250.00']);

    // Reversa del gasto: el original queda reversado y no se reversa dos veces.
    const rev = await ok(c, 'POST', `/api/con/asientos/${gasto.id}/reversar`, {});
    const det = await ok(c, 'GET', `/api/con/asientos/${gasto.id}`);
    expect(det.asiento.estado).toBe('REVERSADO');
    expect(det.asiento.reversa_numero).toBe(rev.numero);
    expect((await llamar(c, 'POST', `/api/con/asientos/${gasto.id}/reversar`, {})).estado).toBe(400);
    expect((await llamar(c, 'POST', `/api/con/asientos/${rev.id}/reversar`, {})).estado).toBe(400);
    expect(await saldo(s.suscriptorId, '5.1.09')).toBe(0);

    // Un asiento de un módulo no se reversa desde contabilidad.
    await ok(c, 'POST', '/api/inventario/ajustes', { unidadNegocioId: s.bodegaId, articuloId: s.filtroId, cantidad: '1', costoUnitario: '5' });
    const automatico = (await ok(c, 'GET', '/api/con/asientos?modulo=INV'))[0];
    expect((await llamar(c, 'POST', `/api/con/asientos/${automatico.id}/reversar`, {})).estado).toBe(400);

    // Cierre del ejercicio: resultados en cero contra resultado del ejercicio. Ingreso 300, ajuste de inventario a favor 5.
    const cierre = await ok(c, 'POST', '/api/con/cierre-anual', { anio: anio() });
    expect(cierre.utilidad).toBe('305.00');
    expect(await saldo(s.suscriptorId, '4.1.01')).toBe(0);
    expect(await saldo(s.suscriptorId, '3.1.03')).toBe(-305);
    expect((await llamar(c, 'POST', '/api/con/cierre-anual', { anio: anio() })).estado).toBe(400);
    const resAnual = await ok(c, 'GET', `/api/con/reportes/resultados?desde=${anio()}-01-01&hasta=${anio()}-12-31`);
    expect(resAnual.utilidad).toBe('305.00');
    const balCierre = await ok(c, 'GET', `/api/con/reportes/balance?fecha=${anio()}-12-31`);
    expect(balCierre.cuadra).toBe(true);
    expect(balCierre.resultado).toBe('0.00');
    expect(await cuadra(s.suscriptorId)).toBe(true);
  });

  it('el período cerrado por módulo bloquea ese módulo y el cerrado en contabilidad bloquea todo', async () => {
    const s = await preparar('con2');
    const c = s.correo;
    const k = await cuentas(c);
    const periodos = await ok(c, 'GET', `/api/con/periodos?anio=${anio()}`);
    const actual = periodos.find((p: Json) => p.fecha_desde <= hoy() && p.fecha_hasta >= hoy());
    const manual = { fecha: hoy(), glosa: 'Prueba', lineas: [{ cuentaId: k.caja, debito: '10' }, { cuentaId: k.capital, credito: '10' }] };
    const ajuste = { unidadNegocioId: s.bodegaId, articuloId: s.filtroId, cantidad: '1', costoUnitario: '5' };

    await ok(c, 'POST', `/api/con/periodos/${actual.id}`, { modulo: 'inventario', estado: 'CERRADO' });
    expect((await llamar(c, 'POST', '/api/inventario/ajustes', ajuste)).estado).toBe(400);
    await ok(c, 'POST', '/api/con/asientos', manual);
    await ok(c, 'POST', `/api/con/periodos/${actual.id}`, { modulo: 'contabilidad', estado: 'CERRADO' });
    expect((await llamar(c, 'POST', '/api/con/asientos', manual)).estado).toBe(400);
    await ok(c, 'POST', `/api/con/periodos/${actual.id}`, { modulo: 'contabilidad', estado: 'ABIERTO' });
    await ok(c, 'POST', `/api/con/periodos/${actual.id}`, { modulo: 'inventario', estado: 'ABIERTO' });
    await ok(c, 'POST', '/api/inventario/ajustes', ajuste);
    const gen = await ok(c, 'POST', '/api/con/periodos/generar', { anio: anio() + 2 });
    expect(gen.creados).toBe(12);
  });

  it('concilia el banco: automático por valor y fecha, registro de comisiones y saldo conciliado', async () => {
    const s = await preparar('con3');
    const c = s.correo;
    const k = await cuentas(c);
    await ok(c, 'POST', '/api/con/asientos', { fecha: hoy(), glosa: 'Depósito de capital', lineas: [{ cuentaId: k.caja, debito: '500' }, { cuentaId: k.capital, credito: '500' }] });
    await ok(c, 'POST', '/api/con/asientos', { fecha: hoy(), glosa: 'Cheque 101', lineas: [{ cuentaId: k.clientes, debito: '120' }, { cuentaId: k.caja, credito: '120' }] });
    await ok(c, 'POST', `/api/con/bancos/${s.cuentaBancariaId}/movimientos`, {
      lineas: [
        { fecha: hoy(), referencia: 'DEP-1', descripcion: 'Depósito', monto: '500' },
        { fecha: hoy(), referencia: 'CH-101', descripcion: 'Cheque pagado', monto: '-120' },
        { fecha: hoy(), referencia: 'COM', descripcion: 'Comisión de mantenimiento', monto: '-2.50' },
      ],
    });
    let est = await ok(c, 'GET', `/api/con/bancos/${s.cuentaBancariaId}?pendientes=1`);
    expect(est.banco).toHaveLength(3);
    expect(est.libros).toHaveLength(2);
    const malo = await llamar(c, 'POST', `/api/con/bancos/${s.cuentaBancariaId}/conciliar`, { movimientos: [est.banco[0].id], lineas: [est.libros[1].id] });
    expect(malo.estado).toBe(400);

    expect((await ok(c, 'POST', `/api/con/bancos/${s.cuentaBancariaId}/conciliar-automatico`, {})).conciliados).toBe(2);
    est = await ok(c, 'GET', `/api/con/bancos/${s.cuentaBancariaId}?pendientes=1`);
    expect(est.banco.map((b: Json) => b.referencia)).toEqual(['COM']);
    expect(est.resumen.saldoBanco).toBe('377.50');

    await ok(c, 'POST', `/api/con/bancos/movimientos/${est.banco[0].id}/registrar`, { cuentaId: k.gastoBanco });
    est = await ok(c, 'GET', `/api/con/bancos/${s.cuentaBancariaId}?pendientes=1`);
    expect(est.banco).toHaveLength(0);
    expect(est.libros).toHaveLength(0);
    expect(est.resumen).toEqual({ saldoLibros: '377.50', librosPendientes: '0.00', bancoPendientes: '0.00', saldoBanco: '377.50' });
    expect(await saldo(s.suscriptorId, '5.1.09')).toBe(2.5);
    expect(await cuadra(s.suscriptorId)).toBe(true);
  });
});
