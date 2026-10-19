import Decimal from 'decimal.js';
import { sql, type Trx } from '@erp/db';
import { ErrorNegocio } from '../errores.js';
import { numerar, tipoDocumento } from './documentos.js';

/**
 * Motor contable por reglas.
 * Cada línea indica un concepto contable (la función de la cuenta: inventario, servicios en proceso, ingreso...)
 * y la regla de con_reglas_contables resuelve la cuenta según compañía, clase contable y unidad de negocio,
 * de lo más específico a lo más general. Ningún módulo elige cuentas directamente.
 */
export interface LineaContable {
  concepto: string;
  claseContableId?: string | null;
  unidadNegocioId?: string | null;
  centroCostoId?: string | null;
  terceroId?: string | null;
  /** Cuenta propia de la transacción (línea de compra por cuenta, cuenta bancaria). Si viene, no se busca regla. */
  cuentaId?: string | null;
  debito?: Decimal.Value;
  credito?: Decimal.Value;
  glosa?: string;
}

export interface Asiento {
  companiaId: string;
  fecha: string;
  glosa: string;
  origenModulo: string;
  origenId: string;
  lineas: LineaContable[];
}

async function resolverCuenta(
  trx: Trx,
  companiaId: string,
  linea: LineaContable,
): Promise<{ cuentaId: string; centroCostoId: string | null }> {
  if (linea.cuentaId) {
    const c = await sql<{ acepta_movimiento: boolean; codigo: string }>`
      select acepta_movimiento, codigo from erp.con_cuentas where id = ${linea.cuentaId} and compania_id = ${companiaId}`.execute(trx);
    if (!c.rows[0]) throw new ErrorNegocio(400, 'La cuenta contable indicada no existe en la compañía.');
    if (!c.rows[0].acepta_movimiento) throw new ErrorNegocio(400, `La cuenta ${c.rows[0].codigo} no acepta movimiento.`);
    return { cuentaId: linea.cuentaId, centroCostoId: null };
  }
  const r = await sql<{ cuenta_id: string; centro_costo_id: string | null }>`
    select r.cuenta_id, r.centro_costo_id
    from erp.con_reglas_contables r
    join erp.con_tipos_transaccion t on t.id = r.tipo_transaccion_id
    where r.compania_id = ${companiaId}
      and t.codigo = ${linea.concepto}
      and (r.clase_contable_id is null or r.clase_contable_id = ${linea.claseContableId ?? null})
      and (r.unidad_negocio_id is null or r.unidad_negocio_id = ${linea.unidadNegocioId ?? null})
    order by (r.clase_contable_id is not null) desc, (r.unidad_negocio_id is not null) desc, r.prioridad desc
    limit 1`.execute(trx);
  const regla = r.rows[0];
  if (!regla) {
    throw new ErrorNegocio(
      400,
      `Falta la regla contable para el concepto ${linea.concepto}. Configúrela en Contabilidad, Reglas contables.`,
    );
  }
  return { cuentaId: regla.cuenta_id, centroCostoId: regla.centro_costo_id };
}

const MODULO_PERIODO: Record<string, { columna: 'estado_ventas' | 'estado_compras' | 'estado_inventario'; nombre: string }> = {
  VEN: { columna: 'estado_ventas', nombre: 'ventas' },
  CXC: { columna: 'estado_ventas', nombre: 'ventas' },
  COM: { columna: 'estado_compras', nombre: 'compras' },
  CXP: { columna: 'estado_compras', nombre: 'compras' },
  INV: { columna: 'estado_inventario', nombre: 'inventario' },
};

/** Genera y contabiliza un asiento cuadrado. Devuelve su id, o null si todas las líneas son cero. */
export async function contabilizar(trx: Trx, asiento: Asiento): Promise<string | null> {
  // Cada línea queda con su neto en débito o en crédito; un débito negativo es un crédito.
  const lineas = asiento.lineas
    .map((l) => {
      const neto = new Decimal(l.debito ?? 0).minus(l.credito ?? 0).toDecimalPlaces(2);
      return { ...l, d: neto.greaterThan(0) ? neto : new Decimal(0), c: neto.lessThan(0) ? neto.negated() : new Decimal(0) };
    })
    .filter((l) => !l.d.isZero() || !l.c.isZero());
  if (lineas.length === 0) return null;
  const totalD = lineas.reduce((s, l) => s.plus(l.d), new Decimal(0));
  const totalC = lineas.reduce((s, l) => s.plus(l.c), new Decimal(0));
  if (!totalD.equals(totalC)) {
    throw new ErrorNegocio(500, `El asiento no cuadra: débitos ${totalD} y créditos ${totalC}.`);
  }

  const periodo = await sql<{ id: string; anio: number; estado_contabilidad: string; estado_ventas: string; estado_compras: string; estado_inventario: string }>`
    select id, anio, estado_contabilidad, estado_ventas, estado_compras, estado_inventario from erp.con_periodos
    where compania_id = ${asiento.companiaId} and ${asiento.fecha}::date between fecha_desde and fecha_hasta
    order by periodo limit 1`.execute(trx);
  const p = periodo.rows[0];
  if (!p || p.estado_contabilidad !== 'ABIERTO') throw new ErrorNegocio(400, `No hay un período contable abierto para la fecha ${asiento.fecha}.`);
  // Cada módulo puede cerrar su período antes que contabilidad.
  const modulo = MODULO_PERIODO[asiento.origenModulo];
  if (modulo && p[modulo.columna] !== 'ABIERTO') {
    throw new ErrorNegocio(400, `El período de ${modulo.nombre} está cerrado para la fecha ${asiento.fecha}.`);
  }

  const tipo = await tipoDocumento(trx, 'CON', 'AS');
  const numero = await numerar(trx, asiento.companiaId, tipo.id, p.anio);
  const cab = await sql<{ id: string }>`
    insert into erp.con_asientos (compania_id, tipo_documento_id, numero, fecha, periodo_id, glosa, origen_modulo, origen_id, estado)
    values (${asiento.companiaId}, ${tipo.id}, ${numero}, ${asiento.fecha}, ${p.id}, ${asiento.glosa},
            ${asiento.origenModulo}, ${asiento.origenId}, 'CONTABILIZADO')
    returning id`.execute(trx);
  const asientoId = cab.rows[0]!.id;

  let n = 1;
  for (const l of lineas) {
    const { cuentaId, centroCostoId } = await resolverCuenta(trx, asiento.companiaId, l);
    const centro = centroCostoId ?? l.centroCostoId ?? l.unidadNegocioId ?? null;
    await sql`
      insert into erp.con_asientos_lineas (asiento_id, linea, cuenta_id, centro_costo_id, tercero_id, debito, credito, glosa)
      values (${asientoId}, ${n++}, ${cuentaId}, ${centro}, ${l.terceroId ?? null}, ${l.d.toFixed(2)}, ${l.c.toFixed(2)},
              ${l.glosa ?? asiento.glosa})`.execute(trx);
    await sql`
      insert into erp.con_saldos (compania_id, cuenta_id, centro_costo_id, periodo_id, debitos, creditos)
      values (${asiento.companiaId}, ${cuentaId}, ${centro}, ${p.id}, ${l.d.toFixed(2)}, ${l.c.toFixed(2)})
      on conflict on constraint uq_con_saldos_1
      do update set debitos = erp.con_saldos.debitos + excluded.debitos,
                    creditos = erp.con_saldos.creditos + excluded.creditos`.execute(trx);
  }
  return asientoId;
}
