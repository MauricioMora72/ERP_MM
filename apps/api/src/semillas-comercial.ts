import { sql, type Trx } from '@erp/db';

/**
 * Configuración de los ciclos de compras al pago y de ventas al cobro: tipos de documento con sus flujos por línea,
 * cuentas, conceptos y reglas contables, formas de pago y códigos de retención de ejemplo.
 * Es idempotente: se aplica al dar de alta la compañía y, para compañías anteriores, la primera vez que se usa el módulo.
 * Todo es de EJEMPLO: un contador debe validar cuentas, reglas y porcentajes de retención.
 */

type Flujo = [number, string, number | null, number[], string][];

const TIPOS: { modulo: string; codigo: string; descripcion: string; clase: string; inventario: boolean; contabilidad: boolean; inicial: number | null; flujo?: Flujo }[] = [
  {
    modulo: 'COM', codigo: 'RQ', descripcion: 'Requisición de compra', clase: 'ORDEN', inventario: false, contabilidad: false, inicial: 10,
    flujo: [
      [10, 'Registrada', 20, [99], 'REGISTRADA'],
      [20, 'Pendiente de aprobación', 30, [10, 99], 'APROBACION'],
      [30, 'Aprobada', 90, [99], 'APROBADA'],
      [90, 'Convertida en orden de compra', null, [], 'CERRADA'],
      [99, 'Cancelada', null, [], 'CANCELADA'],
    ],
  },
  {
    modulo: 'COM', codigo: 'OC', descripcion: 'Orden de compra', clase: 'ORDEN', inventario: false, contabilidad: false, inicial: 10,
    flujo: [
      [10, 'Registrada', 20, [99], 'REGISTRADA'],
      [20, 'Pendiente de aprobación', 30, [10, 99], 'APROBACION'],
      [30, 'Aprobada, por recibir', 40, [99], 'APROBADA'],
      [40, 'Recibida, por facturar', 50, [], 'RECIBIDA'],
      [50, 'Facturada', 90, [], 'FACTURADA'],
      [90, 'Cerrada', null, [], 'CERRADA'],
      [99, 'Cancelada', null, [], 'CANCELADA'],
    ],
  },
  { modulo: 'COM', codigo: 'RC', descripcion: 'Recepción de compra', clase: 'RECEPCION', inventario: true, contabilidad: true, inicial: null },
  { modulo: 'COM', codigo: 'FP', descripcion: 'Factura de proveedor', clase: 'FACTURA', inventario: false, contabilidad: true, inicial: null },
  { modulo: 'COM', codigo: 'RT', descripcion: 'Retención emitida', clase: 'RETENCION', inventario: false, contabilidad: true, inicial: null },
  { modulo: 'CXP', codigo: 'PG', descripcion: 'Pago a proveedor', clase: 'PAGO', inventario: false, contabilidad: true, inicial: null },
  {
    modulo: 'VEN', codigo: 'CO', descripcion: 'Cotización', clase: 'ORDEN', inventario: false, contabilidad: false, inicial: 10,
    flujo: [
      [10, 'Registrada', 90, [99], 'REGISTRADA'],
      [90, 'Convertida en orden de venta', null, [], 'CERRADA'],
      [99, 'Cancelada', null, [], 'CANCELADA'],
    ],
  },
  {
    modulo: 'VEN', codigo: 'OV', descripcion: 'Orden de venta', clase: 'ORDEN', inventario: false, contabilidad: false, inicial: 30,
    flujo: [
      [20, 'Retenida por crédito', 30, [99], 'RETENIDA'],
      [30, 'Por despachar', 40, [99], 'APROBADA'],
      [40, 'Despachada, por facturar', 50, [], 'DESPACHADA'],
      [50, 'Facturada', 90, [], 'FACTURADA'],
      [90, 'Cerrada', null, [], 'CERRADA'],
      [99, 'Cancelada', null, [], 'CANCELADA'],
    ],
  },
  { modulo: 'VEN', codigo: 'DS', descripcion: 'Despacho', clase: 'DESPACHO', inventario: true, contabilidad: true, inicial: null },
  { modulo: 'CXC', codigo: 'RC', descripcion: 'Recibo de cobro', clase: 'COBRO', inventario: false, contabilidad: true, inicial: null },
];

// código, descripción, padre, naturaleza, tipo
const CUENTAS: [string, string, string, 'D' | 'A', 'BALANCE' | 'RESULTADOS'][] = [
  ['1.1.06', 'IVA en compras, crédito tributario', '1', 'D', 'BALANCE'],
  ['1.1.07', 'Retenciones de renta recibidas', '1', 'D', 'BALANCE'],
  ['1.1.08', 'Retenciones de IVA recibidas', '1', 'D', 'BALANCE'],
  ['1.1.09', 'Mercadería despachada por facturar', '1', 'D', 'BALANCE'],
  ['2.1.05', 'Recepciones por facturar', '2', 'A', 'BALANCE'],
  ['2.1.06', 'Retenciones de renta por pagar', '2', 'A', 'BALANCE'],
  ['2.1.07', 'Retenciones de IVA por pagar', '2', 'A', 'BALANCE'],
  ['4.1.03', 'Devoluciones y descuentos en ventas', '4', 'D', 'RESULTADOS'],
  ['5.1.06', 'Costo de ventas', '5', 'D', 'RESULTADOS'],
  ['5.1.07', 'Variación en precio de compras', '5', 'D', 'RESULTADOS'],
  ['5.1.08', 'Gastos de compras de bienes y servicios', '5', 'D', 'RESULTADOS'],
];

// concepto, descripción, cuenta general
const CONCEPTOS: [string, string, string][] = [
  ['PROVEEDORES', 'Proveedores', '2.1.01'],
  ['REC_POR_FACTURAR', 'Recepciones por facturar', '2.1.05'],
  ['VARIACION_COMPRA', 'Variación en precio de compras', '5.1.07'],
  ['GASTO_COMPRA', 'Gasto de compras', '5.1.08'],
  ['IVA_COMPRAS', 'IVA en compras', '1.1.06'],
  ['RET_RENTA_POR_PAGAR', 'Retenciones de renta por pagar', '2.1.06'],
  ['RET_IVA_POR_PAGAR', 'Retenciones de IVA por pagar', '2.1.07'],
  ['BANCOS', 'Caja y bancos', '1.1.01'],
  ['DESP_POR_FACTURAR', 'Mercadería despachada por facturar', '1.1.09'],
  ['COSTO_VENTA', 'Costo de ventas', '5.1.06'],
  ['DEVOLUCION_VENTAS', 'Devoluciones en ventas', '4.1.03'],
  ['RET_RENTA_RECIBIDA', 'Retenciones de renta recibidas', '1.1.07'],
  ['RET_IVA_RECIBIDA', 'Retenciones de IVA recibidas', '1.1.08'],
];

/** Códigos de ejemplo con vigencia. Deben confirmarse con la normativa del SRI vigente. */
const RETENCIONES: [string, string, string, string][] = [
  ['RENTA', '303', 'Honorarios profesionales', '10'],
  ['RENTA', '312', 'Transferencia de bienes muebles de naturaleza corporal', '1.75'],
  ['RENTA', '3440', 'Otras retenciones aplicables', '2.75'],
  ['RENTA', '332', 'Compras no sujetas a retención', '0'],
  ['IVA', '9', 'Retención del 10% del IVA', '10'],
  ['IVA', '10', 'Retención del 20% del IVA', '20'],
  ['IVA', '1', 'Retención del 30% del IVA en bienes', '30'],
  ['IVA', '2', 'Retención del 70% del IVA en servicios', '70'],
  ['IVA', '3', 'Retención del 100% del IVA', '100'],
];

const FORMAS_PAGO: [string, string][] = [
  ['EFECTIVO', 'Efectivo'],
  ['TRANSFERENCIA', 'Transferencia'],
  ['CHEQUE', 'Cheque'],
  ['TARJETA', 'Tarjeta'],
];

export async function asegurarConfiguracionComercial(trx: Trx, companiaId: string): Promise<void> {
  const listo = await sql`
    select 1 from erp.sis_tipos_documento t, erp.con_cuentas c
    where t.modulo = 'CXC' and t.codigo = 'RC' and c.compania_id = ${companiaId} and c.codigo = '5.1.08' limit 1`.execute(trx);
  if (listo.rows.length) return;

  for (const t of TIPOS) {
    const r = await sql<{ id: string }>`
      insert into erp.sis_tipos_documento (modulo, codigo, descripcion, clase, afecta_inventario, genera_contabilidad, estado_inicial)
      values (${t.modulo}, ${t.codigo}, ${t.descripcion}, ${t.clase}, ${t.inventario}, ${t.contabilidad}, ${t.inicial})
      on conflict on constraint uq_sis_tipos_documento_1 do nothing returning id`.execute(trx);
    const id = r.rows[0]?.id;
    if (!id || !t.flujo) continue;
    for (const [estado, descripcion, siguiente, alternos, fase] of t.flujo) {
      await sql`insert into erp.sis_flujos_estado (tipo_documento_id, estado, descripcion, estado_siguiente, estados_alternos, fase)
                values (${id}, ${estado}, ${descripcion}, ${siguiente},
                        ${alternos.length ? sql`${`{${alternos.join(',')}}`}::smallint[]` : null}, ${fase})`.execute(trx);
    }
  }

  for (const [codigo, descripcion, padre, naturaleza, tipo] of CUENTAS) {
    await sql`
      insert into erp.con_cuentas (compania_id, codigo, descripcion, nivel, cuenta_padre_id, naturaleza, tipo, acepta_movimiento)
      select ${companiaId}, ${codigo}, ${descripcion}, 2, p.id, ${naturaleza}, ${tipo}, true
      from erp.con_cuentas p where p.compania_id = ${companiaId} and p.codigo = ${padre}
      on conflict on constraint uq_con_cuentas_1 do nothing`.execute(trx);
  }

  for (const [codigo, descripcion, cuenta] of CONCEPTOS) {
    await sql`insert into erp.con_tipos_transaccion (codigo, descripcion) values (${codigo}, ${descripcion})
              on conflict on constraint uq_con_tipos_transaccion_1 do nothing`.execute(trx);
    await sql`
      insert into erp.con_reglas_contables (compania_id, tipo_transaccion_id, cuenta_id)
      select ${companiaId}, t.id, c.id
      from erp.con_tipos_transaccion t, erp.con_cuentas c
      where t.codigo = ${codigo} and c.compania_id = ${companiaId} and c.codigo = ${cuenta}
        and not exists (select 1 from erp.con_reglas_contables r where r.compania_id = ${companiaId} and r.tipo_transaccion_id = t.id)`.execute(trx);
  }

  const hayRet = await sql`select 1 from erp.ec_codigos_retencion limit 1`.execute(trx);
  if (!hayRet.rows.length) {
    for (const [tipo, codigo, descripcion, porcentaje] of RETENCIONES) {
      await sql`insert into erp.ec_codigos_retencion (tipo, codigo, descripcion, porcentaje, vigente_desde)
                values (${tipo}, ${codigo}, ${descripcion}, ${porcentaje}, '2024-01-01')`.execute(trx);
    }
  }

  const hayForma = await sql`select 1 from erp.cat_catalogos where modulo = 'MAE' and codigo = 'FORMA_PAGO'`.execute(trx);
  if (!hayForma.rows.length) {
    const c = await sql<{ id: string }>`
      insert into erp.cat_catalogos (modulo, codigo, descripcion, es_sistema)
      values ('MAE', 'FORMA_PAGO', 'Formas de pago y cobro', true) returning id`.execute(trx);
    let orden = 1;
    for (const [codigo, descripcion] of FORMAS_PAGO) {
      await sql`insert into erp.cat_valores (catalogo_id, codigo, descripcion, orden)
                values (${c.rows[0]!.id}, ${codigo}, ${descripcion}, ${orden++})`.execute(trx);
    }
  }
}
