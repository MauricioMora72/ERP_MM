import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { sql, type Trx } from '@erp/db';
import { ErrorNegocio } from '../errores.js';
import { contabilizar } from '../nucleo/contabilidad.js';
import { hoy } from '../nucleo/documentos.js';

/** Bancos: movimientos del extracto y conciliación contra las líneas contables de la cuenta del banco. */

const D = (v: Decimal.Value | null | undefined) => new Decimal(v ?? 0);

async function cuentaBancaria(trx: Trx, companiaId: string, id: string) {
  const r = await sql<{ id: string; cuenta_id: string; codigo: string; numero: string }>`
    select id, cuenta_id, codigo, numero from erp.con_cuentas_bancarias where id = ${id} and compania_id = ${companiaId}`.execute(trx);
  if (!r.rows[0]) throw new ErrorNegocio(404, 'La cuenta bancaria no existe.');
  return r.rows[0];
}

export async function importarMovimientos(
  trx: Trx,
  companiaId: string,
  cuentaBancariaId: string,
  lineas: { fecha: string; referencia?: string | null; descripcion?: string | null; monto: Decimal.Value }[],
) {
  await cuentaBancaria(trx, companiaId, cuentaBancariaId);
  let n = 0;
  for (const l of lineas) {
    const monto = D(l.monto);
    if (monto.isZero()) continue;
    await sql`insert into erp.con_movimientos_bancarios (cuenta_bancaria_id, fecha, referencia, descripcion, monto)
              values (${cuentaBancariaId}, ${l.fecha}, ${l.referencia ?? null}, ${l.descripcion ?? null}, ${monto.toFixed(2)})`.execute(trx);
    n++;
  }
  if (n === 0) throw new ErrorNegocio(400, 'No hay movimientos con valor para importar.');
  return { importados: n };
}

/** Movimientos del banco y líneas de libros de la cuenta, con su estado de conciliación. */
export async function estadoConciliacion(trx: Trx, companiaId: string, cuentaBancariaId: string, q: { pendientes?: boolean; hasta?: string }) {
  const cb = await cuentaBancaria(trx, companiaId, cuentaBancariaId);
  const hasta = q.hasta ?? hoy();
  const banco = await sql<{ id: string; fecha: string; referencia: string | null; descripcion: string | null; monto: string; conciliado: boolean }>`
    select id, fecha, referencia, descripcion, monto, conciliado from erp.con_movimientos_bancarios
    where cuenta_bancaria_id = ${cuentaBancariaId} and fecha <= ${hasta}::date and (${q.pendientes ?? false} = false or not conciliado)
    order by fecha, creado_en`.execute(trx);
  const libros = await sql<{ id: string; fecha: string; numero: string; glosa: string; tercero: string | null; monto: string; conciliado: boolean }>`
    select l.id, a.fecha, a.numero, coalesce(l.glosa, a.glosa) as glosa, d.nombre as tercero, (l.debito - l.credito) as monto,
           exists (select 1 from erp.con_conciliaciones x where x.asiento_linea_id = l.id) as conciliado
    from erp.con_asientos_lineas l join erp.con_asientos a on a.id = l.asiento_id left join erp.mae_direcciones d on d.id = l.tercero_id
    where l.cuenta_id = ${cb.cuenta_id} and a.compania_id = ${companiaId} and a.fecha <= ${hasta}::date
      and (${q.pendientes ?? false} = false or not exists (select 1 from erp.con_conciliaciones x where x.asiento_linea_id = l.id))
    order by a.fecha, a.numero, l.linea`.execute(trx);
  // Saldo en libros a la fecha y partidas pendientes de cada lado.
  const saldoLibros = await sql<{ s: string }>`
    select coalesce(sum(l.debito - l.credito), 0) as s from erp.con_asientos_lineas l join erp.con_asientos a on a.id = l.asiento_id
    where l.cuenta_id = ${cb.cuenta_id} and a.compania_id = ${companiaId} and a.fecha <= ${hasta}::date`.execute(trx);
  const pendLibros = libros.rows.filter((x) => !x.conciliado).reduce((s, x) => s.plus(x.monto), D(0));
  const pendBanco = banco.rows.filter((x) => !x.conciliado).reduce((s, x) => s.plus(x.monto), D(0));
  const libro = D(saldoLibros.rows[0]!.s);
  return {
    cuenta: cb,
    hasta,
    banco: banco.rows,
    libros: libros.rows,
    resumen: {
      saldoLibros: libro.toFixed(2),
      librosPendientes: pendLibros.toFixed(2),
      bancoPendientes: pendBanco.toFixed(2),
      saldoBanco: libro.minus(pendLibros).plus(pendBanco).toFixed(2),
    },
  };
}

export async function conciliar(trx: Trx, companiaId: string, cuentaBancariaId: string, movimientoIds: string[], lineaIds: string[]) {
  const cb = await cuentaBancaria(trx, companiaId, cuentaBancariaId);
  if (movimientoIds.length === 0 || lineaIds.length === 0) throw new ErrorNegocio(400, 'Seleccione movimientos del banco y líneas de libros.');
  if (movimientoIds.length > 1 && lineaIds.length > 1) throw new ErrorNegocio(400, 'Concilie un movimiento con varias líneas o varios movimientos con una línea.');
  const movs = await sql<{ id: string; monto: string; fecha: string }>`
    select id, monto, fecha from erp.con_movimientos_bancarios
    where id = any(${movimientoIds}::uuid[]) and cuenta_bancaria_id = ${cuentaBancariaId} and not conciliado for update`.execute(trx);
  if (movs.rows.length !== movimientoIds.length) throw new ErrorNegocio(400, 'Algún movimiento no existe o ya está conciliado.');
  const lineas = await sql<{ id: string; monto: string }>`
    select l.id, (l.debito - l.credito) as monto from erp.con_asientos_lineas l join erp.con_asientos a on a.id = l.asiento_id
    where l.id = any(${lineaIds}::uuid[]) and l.cuenta_id = ${cb.cuenta_id} and a.compania_id = ${companiaId}
      and not exists (select 1 from erp.con_conciliaciones x where x.asiento_linea_id = l.id)`.execute(trx);
  if (lineas.rows.length !== lineaIds.length) throw new ErrorNegocio(400, 'Alguna línea no es de la cuenta del banco o ya está conciliada.');
  const sumaBanco = movs.rows.reduce((s, x) => s.plus(x.monto), D(0));
  const sumaLibros = lineas.rows.reduce((s, x) => s.plus(x.monto), D(0));
  if (!sumaBanco.equals(sumaLibros)) {
    throw new ErrorNegocio(400, `Los valores no coinciden: banco ${sumaBanco.toFixed(2)} y libros ${sumaLibros.toFixed(2)}.`);
  }
  const fecha = hoy();
  for (const m of movs.rows) {
    for (const l of lineas.rows) {
      const monto = movs.rows.length === 1 ? l.monto : m.monto;
      await sql`insert into erp.con_conciliaciones (movimiento_id, asiento_linea_id, monto, fecha) values (${m.id}, ${l.id}, ${monto}, ${fecha})`.execute(trx);
    }
  }
  await sql`update erp.con_movimientos_bancarios set conciliado = true where id = any(${movimientoIds}::uuid[])`.execute(trx);
}

/** Cruza cada movimiento con la única línea pendiente del mismo valor dentro de cinco días. */
export async function conciliarAutomatico(trx: Trx, companiaId: string, cuentaBancariaId: string) {
  const estado = await estadoConciliacion(trx, companiaId, cuentaBancariaId, { pendientes: true, hasta: '9999-12-31' });
  const usadas = new Set<string>();
  let conciliados = 0;
  for (const m of estado.banco) {
    const candidatas = estado.libros.filter((l) => !usadas.has(l.id) && D(l.monto).equals(m.monto)
      && Math.abs(new Date(l.fecha).getTime() - new Date(m.fecha).getTime()) <= 5 * 86400000);
    if (candidatas.length !== 1) continue;
    // Si la misma línea también calza con otro movimiento, no se adivina.
    const rivales = estado.banco.filter((x) => x.id !== m.id && D(x.monto).equals(m.monto)
      && Math.abs(new Date(candidatas[0]!.fecha).getTime() - new Date(x.fecha).getTime()) <= 5 * 86400000);
    if (rivales.length) continue;
    await conciliar(trx, companiaId, cuentaBancariaId, [m.id], [candidatas[0]!.id]);
    usadas.add(candidatas[0]!.id);
    conciliados++;
  }
  return { conciliados };
}

/** Registra en libros un movimiento del banco (comisión, interés, débito) contra la cuenta indicada y lo concilia. */
export async function registrarDesdeBanco(trx: Trx, companiaId: string, movimientoId: string, d: { cuentaId: string; glosa?: string | null; centroCostoId?: string | null }) {
  const m = await sql<{ id: string; cuenta_bancaria_id: string; fecha: string; monto: string; descripcion: string | null; conciliado: boolean }>`
    select id, cuenta_bancaria_id, fecha, monto, descripcion, conciliado from erp.con_movimientos_bancarios where id = ${movimientoId} for update`.execute(trx);
  const mov = m.rows[0];
  if (!mov) throw new ErrorNegocio(404, 'El movimiento no existe.');
  if (mov.conciliado) throw new ErrorNegocio(400, 'El movimiento ya está conciliado.');
  const cb = await cuentaBancaria(trx, companiaId, mov.cuenta_bancaria_id);
  const monto = D(mov.monto);
  const glosa = (d.glosa?.trim() || mov.descripcion || 'Movimiento bancario').slice(0, 500);
  const id = await contabilizar(trx, {
    companiaId, fecha: mov.fecha, glosa: `${glosa} (banco ${cb.codigo})`, origenModulo: 'CON', origenId: randomUUID(),
    lineas: [
      { concepto: 'BANCO', cuentaId: cb.cuenta_id, debito: monto },
      { concepto: 'CONTRAPARTIDA', cuentaId: d.cuentaId, centroCostoId: d.centroCostoId ?? null, credito: monto },
    ],
  });
  await sql`update erp.con_asientos set origen_id = id where id = ${id}`.execute(trx);
  const linea = await sql<{ id: string }>`select id from erp.con_asientos_lineas where asiento_id = ${id} and cuenta_id = ${cb.cuenta_id}`.execute(trx);
  await conciliar(trx, companiaId, cb.id, [mov.id], [linea.rows[0]!.id]);
  return { asientoId: id };
}
