import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { sql, type Trx } from '@erp/db';
import { ErrorNegocio } from '../errores.js';
import { contabilizar, type LineaContable } from '../nucleo/contabilidad.js';
import { hoy } from '../nucleo/documentos.js';

/** Contabilidad general: asientos manuales y reversa, períodos por módulo, cierre del ejercicio y reportes. */

const D = (v: Decimal.Value | null | undefined) => new Decimal(v ?? 0);

export interface LineaManual {
  cuentaId: string;
  centroCostoId?: string | null;
  terceroId?: string | null;
  debito?: Decimal.Value | null;
  credito?: Decimal.Value | null;
  glosa?: string | null;
}

export async function crearAsientoManual(trx: Trx, companiaId: string, d: { fecha: string; glosa: string; lineas: LineaManual[] }) {
  if (!d.glosa?.trim()) throw new ErrorNegocio(400, 'Indique la glosa del asiento.', { glosa: 'Este campo es obligatorio' });
  const lineas = d.lineas.filter((l) => !D(l.debito || 0).isZero() || !D(l.credito || 0).isZero());
  if (lineas.length < 2) throw new ErrorNegocio(400, 'El asiento necesita al menos dos líneas con valor.');
  let debitos = D(0);
  let creditos = D(0);
  for (const [i, l] of lineas.entries()) {
    const deb = D(l.debito || 0);
    const cre = D(l.credito || 0);
    if (deb.isNegative() || cre.isNegative()) throw new ErrorNegocio(400, `Línea ${i + 1}: los valores no pueden ser negativos.`);
    if (!deb.isZero() && !cre.isZero()) throw new ErrorNegocio(400, `Línea ${i + 1}: use débito o crédito, no ambos.`);
    if (deb.decimalPlaces() > 2 || cre.decimalPlaces() > 2) throw new ErrorNegocio(400, `Línea ${i + 1}: use máximo dos decimales.`);
    const c = await sql<{ codigo: string; acepta_movimiento: boolean; exige_centro_costo: boolean; exige_tercero: boolean; activo: boolean }>`
      select codigo, acepta_movimiento, exige_centro_costo, exige_tercero, activo from erp.con_cuentas where id = ${l.cuentaId} and compania_id = ${companiaId}`.execute(trx);
    const cuenta = c.rows[0];
    if (!cuenta || !cuenta.activo) throw new ErrorNegocio(400, `Línea ${i + 1}: la cuenta no existe o está inactiva.`);
    if (!cuenta.acepta_movimiento) throw new ErrorNegocio(400, `Línea ${i + 1}: la cuenta ${cuenta.codigo} no acepta movimiento.`);
    if (cuenta.exige_centro_costo && !l.centroCostoId) throw new ErrorNegocio(400, `Línea ${i + 1}: la cuenta ${cuenta.codigo} exige centro de costo.`);
    if (cuenta.exige_tercero && !l.terceroId) throw new ErrorNegocio(400, `Línea ${i + 1}: la cuenta ${cuenta.codigo} exige tercero.`);
    debitos = debitos.plus(deb);
    creditos = creditos.plus(cre);
  }
  if (!debitos.equals(creditos)) {
    throw new ErrorNegocio(400, `El asiento no cuadra: débitos ${debitos.toFixed(2)} y créditos ${creditos.toFixed(2)}.`);
  }
  const provisional = randomUUID();
  const id = await contabilizar(trx, {
    companiaId, fecha: d.fecha, glosa: d.glosa.trim(), origenModulo: 'CON', origenId: provisional,
    lineas: lineas.map((l) => ({
      concepto: 'MANUAL', cuentaId: l.cuentaId, centroCostoId: l.centroCostoId ?? null, terceroId: l.terceroId ?? null,
      debito: l.debito || 0, credito: l.credito || 0, glosa: l.glosa?.trim() || undefined,
    })),
  });
  await sql`update erp.con_asientos set origen_id = id where id = ${id}`.execute(trx);
  const n = await sql<{ numero: string }>`select numero from erp.con_asientos where id = ${id}`.execute(trx);
  return { id: id!, numero: n.rows[0]!.numero };
}

/** Reversa un asiento manual o de cierre con un asiento espejo; el original queda reversado. */
export async function reversarAsiento(trx: Trx, companiaId: string, asientoId: string, fecha?: string | null) {
  const a = await sql<{ id: string; numero: string; fecha: string; glosa: string; origen_modulo: string; estado: string; asiento_reversa_id: string | null; compania_id: string }>`
    select id, numero, fecha, glosa, origen_modulo, estado, asiento_reversa_id, compania_id from erp.con_asientos where id = ${asientoId} for update`.execute(trx);
  const original = a.rows[0];
  if (!original || original.compania_id !== companiaId) throw new ErrorNegocio(404, 'El asiento no existe.');
  if (!['CON', 'CIERRE'].includes(original.origen_modulo)) {
    throw new ErrorNegocio(400, 'Este asiento lo generó un módulo; corríjalo con su documento de origen para que módulo y contabilidad no se separen.');
  }
  if (original.estado !== 'CONTABILIZADO' || original.asiento_reversa_id) throw new ErrorNegocio(400, 'El asiento ya fue reversado.');
  const esReversa = await sql`select 1 from erp.con_asientos where asiento_reversa_id = ${asientoId}`.execute(trx);
  if (esReversa.rows.length) throw new ErrorNegocio(400, 'Este asiento es la reversa de otro y no se reversa.');
  const lineas = await sql<{ cuenta_id: string; centro_costo_id: string | null; tercero_id: string | null; debito: string; credito: string; glosa: string | null }>`
    select cuenta_id, centro_costo_id, tercero_id, debito, credito, glosa from erp.con_asientos_lineas where asiento_id = ${asientoId} order by linea`.execute(trx);
  const id = await contabilizar(trx, {
    companiaId, fecha: fecha ?? hoy(), glosa: `Reversa del asiento ${original.numero}: ${original.glosa ?? ''}`.slice(0, 500),
    origenModulo: original.origen_modulo, origenId: asientoId,
    lineas: lineas.rows.map((l): LineaContable => ({
      concepto: 'REVERSA', cuentaId: l.cuenta_id, centroCostoId: l.centro_costo_id, terceroId: l.tercero_id, debito: l.credito, credito: l.debito, glosa: l.glosa ?? undefined,
    })),
  });
  await sql`update erp.con_asientos set estado = 'REVERSADO', asiento_reversa_id = ${id} where id = ${asientoId}`.execute(trx);
  const n = await sql<{ numero: string }>`select numero from erp.con_asientos where id = ${id}`.execute(trx);
  return { id: id!, numero: n.rows[0]!.numero };
}

export async function listarAsientos(trx: Trx, companiaId: string, q: { desde?: string; hasta?: string; modulo?: string; buscar?: string }) {
  const patron = q.buscar ? `%${q.buscar}%` : null;
  const r = await sql`
    select a.id, a.numero, a.fecha, a.glosa, a.origen_modulo, a.estado, p.anio, p.periodo,
           (select sum(debito) from erp.con_asientos_lineas l where l.asiento_id = a.id) as total
    from erp.con_asientos a join erp.con_periodos p on p.id = a.periodo_id
    where a.compania_id = ${companiaId}
      and (${q.desde ?? null}::date is null or a.fecha >= ${q.desde ?? null}::date)
      and (${q.hasta ?? null}::date is null or a.fecha <= ${q.hasta ?? null}::date)
      and (${q.modulo ?? null}::text is null or a.origen_modulo = ${q.modulo ?? null})
      and (${patron}::text is null or a.glosa ilike ${patron} or a.numero::text = ${q.buscar ?? ''})
    order by a.fecha desc, a.numero desc limit 500`.execute(trx);
  return r.rows;
}

export async function detalleAsiento(trx: Trx, companiaId: string, id: string) {
  const a = await sql`
    select a.*, p.anio, p.periodo, r.numero as reversa_numero, o.id as reversa_de_id, o.numero as reversa_de_numero
    from erp.con_asientos a join erp.con_periodos p on p.id = a.periodo_id
    left join erp.con_asientos r on r.id = a.asiento_reversa_id left join erp.con_asientos o on o.asiento_reversa_id = a.id
    where a.id = ${id} and a.compania_id = ${companiaId}`.execute(trx);
  if (!a.rows[0]) throw new ErrorNegocio(404, 'El asiento no existe.');
  const l = await sql`
    select l.linea, l.debito, l.credito, l.glosa, c.codigo as cuenta, c.descripcion as cuenta_descripcion, c.id as cuenta_id,
           u.codigo as centro, d.nombre as tercero
    from erp.con_asientos_lineas l join erp.con_cuentas c on c.id = l.cuenta_id
    left join erp.mae_unidades_negocio u on u.id = l.centro_costo_id left join erp.mae_direcciones d on d.id = l.tercero_id
    where l.asiento_id = ${id} order by l.linea`.execute(trx);
  return { asiento: a.rows[0], lineas: l.rows };
}

// ---------------------------------------------------------------------------
// Períodos y cierre

export type ModuloPeriodo = 'ventas' | 'compras' | 'inventario' | 'contabilidad';

export async function listarPeriodos(trx: Trx, companiaId: string, anio?: number) {
  const r = await sql`
    select id, anio, periodo, fecha_desde, fecha_hasta, estado_ventas, estado_compras, estado_inventario, estado_contabilidad
    from erp.con_periodos where compania_id = ${companiaId} and (${anio ?? null}::int is null or anio = ${anio ?? null}::int)
    order by anio desc, periodo`.execute(trx);
  return r.rows;
}

export async function cambiarPeriodo(trx: Trx, companiaId: string, periodoId: string, modulo: ModuloPeriodo, estado: 'ABIERTO' | 'CERRADO') {
  const columna = sql.ref(`estado_${modulo}`);
  const r = await sql`update erp.con_periodos set ${columna} = ${estado} where id = ${periodoId} and compania_id = ${companiaId}`.execute(trx);
  if (Number(r.numAffectedRows ?? 0) === 0) throw new ErrorNegocio(404, 'El período no existe.');
}

export async function generarPeriodos(trx: Trx, companiaId: string, anio: number) {
  const r = await sql`
    insert into erp.con_periodos (compania_id, anio, periodo, fecha_desde, fecha_hasta)
    select ${companiaId}, ${anio}, extract(month from m)::int, m::date, (m + interval '1 month - 1 day')::date
    from generate_series(make_date(${anio}, 1, 1), make_date(${anio}, 12, 1), interval '1 month') as m
    on conflict on constraint uq_con_periodos_1 do nothing`.execute(trx);
  return { creados: Number(r.numAffectedRows ?? 0) };
}

/** Cierre del ejercicio: deja en cero las cuentas de resultados contra la cuenta de resultado del ejercicio. */
export async function cierreAnual(trx: Trx, companiaId: string, anio: number) {
  const fecha = `${anio}-12-31`;
  const previo = await sql`select numero from erp.con_asientos where compania_id = ${companiaId} and origen_modulo = 'CIERRE'
                           and fecha = ${fecha}::date and estado = 'CONTABILIZADO'`.execute(trx);
  if (previo.rows.length) throw new ErrorNegocio(400, `El ejercicio ${anio} ya tiene asiento de cierre; reverse ese asiento si necesita repetirlo.`);
  const saldos = await sql<{ cuenta_id: string; centro_costo_id: string | null; neto: string }>`
    select l.cuenta_id, l.centro_costo_id, sum(l.debito - l.credito) as neto
    from erp.con_asientos_lineas l join erp.con_asientos a on a.id = l.asiento_id join erp.con_cuentas c on c.id = l.cuenta_id
    where a.compania_id = ${companiaId} and c.tipo = 'RESULTADOS' and a.fecha <= ${fecha}::date
    group by l.cuenta_id, l.centro_costo_id having sum(l.debito - l.credito) <> 0`.execute(trx);
  if (saldos.rows.length === 0) throw new ErrorNegocio(400, `No hay saldos de resultados para cerrar en ${anio}.`);
  const resultado = saldos.rows.reduce((s, x) => s.plus(x.neto), D(0));
  const id = await contabilizar(trx, {
    companiaId, fecha, glosa: `Cierre del ejercicio ${anio}`, origenModulo: 'CIERRE', origenId: randomUUID(),
    lineas: [
      ...saldos.rows.map((x): LineaContable => ({ concepto: 'CIERRE', cuentaId: x.cuenta_id, centroCostoId: x.centro_costo_id, credito: x.neto })),
      { concepto: 'RESULTADO_EJERCICIO', debito: resultado },
    ],
  });
  await sql`update erp.con_asientos set origen_id = id where id = ${id}`.execute(trx);
  return { id, utilidad: resultado.negated().toFixed(2) };
}

// ---------------------------------------------------------------------------
// Reportes

interface Cuenta {
  id: string;
  codigo: string;
  descripcion: string;
  nivel: number;
  cuenta_padre_id: string | null;
  naturaleza: 'D' | 'A';
  tipo: 'BALANCE' | 'RESULTADOS';
  acepta_movimiento: boolean;
  inicial: string;
  debitos: string;
  creditos: string;
}

/** Movimientos por cuenta entre dos fechas, con saldo anterior, sumados hacia las cuentas padre. */
async function movimientosPorCuenta(trx: Trx, companiaId: string, desde: string | null, hasta: string, excluirCierre = false) {
  const r = await sql<Cuenta>`
    select c.id, c.codigo, c.descripcion, c.nivel, c.cuenta_padre_id, c.naturaleza, c.tipo, c.acepta_movimiento,
      coalesce(sum(case when ${desde}::date is not null and a.fecha < ${desde}::date then l.debito - l.credito end), 0) as inicial,
      coalesce(sum(case when ${desde}::date is null or a.fecha >= ${desde}::date then l.debito end), 0) as debitos,
      coalesce(sum(case when ${desde}::date is null or a.fecha >= ${desde}::date then l.credito end), 0) as creditos
    from erp.con_cuentas c
    left join (erp.con_asientos_lineas l join erp.con_asientos a on a.id = l.asiento_id and a.fecha <= ${hasta}::date
                 and (${excluirCierre} = false or a.origen_modulo <> 'CIERRE')) on l.cuenta_id = c.id
    where c.compania_id = ${companiaId}
    group by c.id order by c.codigo`.execute(trx);
  const mapa = new Map(r.rows.map((c) => [c.id, { ...c, ini: D(c.inicial), deb: D(c.debitos), cre: D(c.creditos) }]));
  // Suma hacia arriba: cada cuenta con movimiento aporta a todos sus ancestros.
  for (const c of r.rows) {
    if (!c.acepta_movimiento) continue;
    let padre = c.cuenta_padre_id;
    while (padre) {
      const p = mapa.get(padre);
      if (!p) break;
      p.ini = p.ini.plus(c.inicial);
      p.deb = p.deb.plus(c.debitos);
      p.cre = p.cre.plus(c.creditos);
      padre = p.cuenta_padre_id;
    }
  }
  return [...mapa.values()];
}

const segunNaturaleza = (naturaleza: 'D' | 'A', v: Decimal) => (naturaleza === 'D' ? v : v.negated());

export async function balanceComprobacion(trx: Trx, companiaId: string, desde: string, hasta: string) {
  const cuentas = await movimientosPorCuenta(trx, companiaId, desde, hasta);
  const filas = cuentas
    .filter((c) => !c.ini.isZero() || !c.deb.isZero() || !c.cre.isZero())
    .map((c) => {
      const final = c.ini.plus(c.deb).minus(c.cre);
      return {
        id: c.id, codigo: c.codigo, descripcion: c.descripcion, nivel: c.nivel, movimiento: c.acepta_movimiento, naturaleza: c.naturaleza,
        inicial: segunNaturaleza(c.naturaleza, c.ini).toFixed(2), debitos: c.deb.toFixed(2), creditos: c.cre.toFixed(2),
        final: segunNaturaleza(c.naturaleza, final).toFixed(2),
      };
    });
  const hojas = cuentas.filter((c) => c.acepta_movimiento);
  const totales = {
    debitos: hojas.reduce((s, c) => s.plus(c.deb), D(0)).toFixed(2),
    creditos: hojas.reduce((s, c) => s.plus(c.cre), D(0)).toFixed(2),
    saldosDeudores: hojas.reduce((s, c) => { const f = c.ini.plus(c.deb).minus(c.cre); return f.greaterThan(0) ? s.plus(f) : s; }, D(0)).toFixed(2),
    saldosAcreedores: hojas.reduce((s, c) => { const f = c.ini.plus(c.deb).minus(c.cre); return f.lessThan(0) ? s.minus(f) : s; }, D(0)).toFixed(2),
  };
  return { desde, hasta, filas, totales };
}

function raizDe(cuentas: Map<string, { cuenta_padre_id: string | null; id: string }>, id: string): string {
  let actual = cuentas.get(id)!;
  while (actual.cuenta_padre_id && cuentas.get(actual.cuenta_padre_id)) actual = cuentas.get(actual.cuenta_padre_id)!;
  return actual.id;
}

export async function balanceGeneral(trx: Trx, companiaId: string, fecha: string) {
  const cuentas = await movimientosPorCuenta(trx, companiaId, null, fecha);
  const mapa = new Map(cuentas.map((c) => [c.id, c]));
  const resultado = cuentas.filter((c) => c.tipo === 'RESULTADOS' && c.acepta_movimiento).reduce((s, c) => s.plus(c.deb).minus(c.cre), D(0)).negated();
  const raices = cuentas.filter((c) => c.tipo === 'BALANCE' && !c.cuenta_padre_id);
  const secciones = raices.map((r) => {
    const filas = cuentas
      .filter((c) => c.tipo === 'BALANCE' && raizDe(mapa, c.id) === r.id && !c.deb.minus(c.cre).isZero())
      .map((c) => ({ id: c.id, codigo: c.codigo, descripcion: c.descripcion, nivel: c.nivel, saldo: segunNaturaleza(r.naturaleza, c.deb.minus(c.cre)).toFixed(2) }));
    const total = segunNaturaleza(r.naturaleza, r.deb.minus(r.cre));
    return { codigo: r.codigo, descripcion: r.descripcion, naturaleza: r.naturaleza, filas, total };
  });
  // El resultado aún no cerrado se muestra dentro del patrimonio.
  const patrimonio = secciones.find((s) => s.naturaleza === 'A' && s.codigo.startsWith('3')) ?? [...secciones].reverse().find((s) => s.naturaleza === 'A');
  if (patrimonio && !resultado.isZero()) {
    patrimonio.filas.push({ id: 'resultado', codigo: '', descripcion: 'Resultado del ejercicio no cerrado', nivel: 2, saldo: resultado.toFixed(2) });
    patrimonio.total = patrimonio.total.plus(resultado);
  }
  const deudoras = secciones.filter((s) => s.naturaleza === 'D').reduce((s, x) => s.plus(x.total), D(0));
  const acreedoras = secciones.filter((s) => s.naturaleza === 'A').reduce((s, x) => s.plus(x.total), D(0));
  return {
    fecha,
    secciones: secciones.map((s) => ({ ...s, total: s.total.toFixed(2) })),
    resultado: resultado.toFixed(2),
    totalDeudoras: deudoras.toFixed(2),
    totalAcreedoras: acreedoras.toFixed(2),
    cuadra: deudoras.equals(acreedoras),
  };
}

/** Estado de resultados del período, sin el asiento de cierre del ejercicio. */
export async function estadoResultados(trx: Trx, companiaId: string, desde: string, hasta: string) {
  const cuentas = await movimientosPorCuenta(trx, companiaId, desde, hasta, true);
  const mapa = new Map(cuentas.map((c) => [c.id, c]));
  const raices = cuentas.filter((c) => c.tipo === 'RESULTADOS' && !c.cuenta_padre_id);
  const secciones = raices.map((r) => ({
    codigo: r.codigo, descripcion: r.descripcion, naturaleza: r.naturaleza,
    filas: cuentas
      .filter((c) => c.tipo === 'RESULTADOS' && raizDe(mapa, c.id) === r.id && !c.deb.minus(c.cre).isZero())
      .map((c) => ({ id: c.id, codigo: c.codigo, descripcion: c.descripcion, nivel: c.nivel, valor: segunNaturaleza(r.naturaleza, c.deb.minus(c.cre)).toFixed(2) })),
    total: segunNaturaleza(r.naturaleza, r.deb.minus(r.cre)).toFixed(2),
  }));
  const utilidad = cuentas.filter((c) => c.tipo === 'RESULTADOS' && c.acepta_movimiento).reduce((s, c) => s.plus(c.cre).minus(c.deb), D(0));
  return { desde, hasta, secciones, utilidad: utilidad.toFixed(2) };
}

export async function libroMayor(trx: Trx, companiaId: string, cuentaId: string, desde: string, hasta: string) {
  const c = await sql<{ codigo: string; descripcion: string; naturaleza: 'D' | 'A' }>`
    select codigo, descripcion, naturaleza from erp.con_cuentas where id = ${cuentaId} and compania_id = ${companiaId}`.execute(trx);
  const cuenta = c.rows[0];
  if (!cuenta) throw new ErrorNegocio(404, 'La cuenta no existe.');
  // La cuenta y todas sus subcuentas.
  const ids = sql`(with recursive arbol as (select id from erp.con_cuentas where id = ${cuentaId}
                   union all select h.id from erp.con_cuentas h join arbol on h.cuenta_padre_id = arbol.id) select id from arbol)`;
  const ini = await sql<{ s: string }>`
    select coalesce(sum(l.debito - l.credito), 0) as s from erp.con_asientos_lineas l join erp.con_asientos a on a.id = l.asiento_id
    where l.cuenta_id in ${ids} and a.fecha < ${desde}::date`.execute(trx);
  const movs = await sql<{ asiento_id: string; numero: string; fecha: string; glosa: string; origen_modulo: string; cuenta: string; centro: string | null; tercero: string | null; debito: string; credito: string }>`
    select a.id as asiento_id, a.numero, a.fecha, coalesce(l.glosa, a.glosa) as glosa, a.origen_modulo, cu.codigo as cuenta, u.codigo as centro,
           d.nombre as tercero, l.debito, l.credito
    from erp.con_asientos_lineas l join erp.con_asientos a on a.id = l.asiento_id join erp.con_cuentas cu on cu.id = l.cuenta_id
    left join erp.mae_unidades_negocio u on u.id = l.centro_costo_id left join erp.mae_direcciones d on d.id = l.tercero_id
    where l.cuenta_id in ${ids} and a.fecha between ${desde}::date and ${hasta}::date
    order by a.fecha, a.numero, l.linea`.execute(trx);
  let saldo = D(ini.rows[0]!.s);
  const inicial = segunNaturaleza(cuenta.naturaleza, saldo).toFixed(2);
  const filas = movs.rows.map((m) => {
    saldo = saldo.plus(m.debito).minus(m.credito);
    return { ...m, saldo: segunNaturaleza(cuenta.naturaleza, saldo).toFixed(2) };
  });
  return { cuenta, desde, hasta, inicial, filas, final: segunNaturaleza(cuenta.naturaleza, saldo).toFixed(2) };
}
