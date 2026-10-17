import { sql, type Trx } from '@erp/db';

/**
 * Configuración base que recibe cada compañía nueva: tipos de documento con sus flujos,
 * plan de cuentas, conceptos y reglas contables, períodos, establecimiento SRI y catálogos de servicios.
 * Todo es de EJEMPLO para empezar a trabajar: un contador debe validar el plan de cuentas y las reglas.
 */

const TIPOS_DOCUMENTO: [string, string, string, string, boolean, boolean][] = [
  // módulo, código, descripción, clase, afecta inventario, genera contabilidad
  ['SRV', 'OS', 'Orden de servicio', 'ORDEN', true, true],
  ['SRV', 'CS', 'Caso de mesa de ayuda', 'ORDEN', false, false],
  ['SRV', 'RG', 'Reclamo de garantía', 'ORDEN', false, true],
  ['VEN', 'FA', 'Factura', 'FACTURA', false, true],
  ['VEN', 'NC', 'Nota de crédito', 'NOTA_CREDITO', false, true],
  ['INV', 'AJ', 'Ajuste de inventario', 'AJUSTE', true, true],
  ['CON', 'AS', 'Asiento contable', 'ASIENTO', false, true],
];

/** Flujo sugerido de la orden de servicio (sección 5.1 de la especificación). */
const FLUJO_OS: [number, string, number | null, number[], string][] = [
  [10, 'Registrada', 20, [30, 99], 'REGISTRADA'],
  [20, 'Programada', 30, [99], 'PROGRAMADA'],
  [30, 'En ejecución', 40, [], 'EJECUCION'],
  [40, 'Terminada técnicamente', 50, [30], 'TERMINADA'],
  [50, 'Revisada para cobro', 60, [40], 'REVISADA'],
  [60, 'Facturada o liquidada', 90, [], 'FACTURADA'],
  [90, 'Cerrada', null, [], 'CERRADA'],
  [99, 'Cancelada', null, [], 'CANCELADA'],
];

// código, descripción, nivel, padre, naturaleza, tipo, acepta movimiento
const CUENTAS: [string, string, number, string | null, 'D' | 'A', 'BALANCE' | 'RESULTADOS', boolean][] = [
  ['1', 'Activo', 1, null, 'D', 'BALANCE', false],
  ['1.1.01', 'Caja y bancos', 2, '1', 'D', 'BALANCE', true],
  ['1.1.02', 'Clientes locales', 2, '1', 'D', 'BALANCE', true],
  ['1.1.03', 'Cuentas por cobrar a proveedores por garantías', 2, '1', 'D', 'BALANCE', true],
  ['1.1.04', 'Inventario de repuestos y suministros', 2, '1', 'D', 'BALANCE', true],
  ['1.1.05', 'Servicios en proceso', 2, '1', 'D', 'BALANCE', true],
  ['2', 'Pasivo', 1, null, 'A', 'BALANCE', false],
  ['2.1.01', 'Proveedores locales', 2, '2', 'A', 'BALANCE', true],
  ['2.1.02', 'IVA en ventas', 2, '2', 'A', 'BALANCE', true],
  ['2.1.03', 'Mano de obra aplicada por liquidar', 2, '2', 'A', 'BALANCE', true],
  ['2.1.04', 'Servicios de terceros por pagar', 2, '2', 'A', 'BALANCE', true],
  ['4', 'Ingresos', 1, null, 'A', 'RESULTADOS', false],
  ['4.1.01', 'Ingresos por servicios', 2, '4', 'A', 'RESULTADOS', true],
  ['4.1.02', 'Ingresos por venta de materiales', 2, '4', 'A', 'RESULTADOS', true],
  ['5', 'Costos y gastos', 1, null, 'D', 'RESULTADOS', false],
  ['5.1.01', 'Costo de servicios prestados', 2, '5', 'D', 'RESULTADOS', true],
  ['5.1.02', 'Costo de servicios por contrato', 2, '5', 'D', 'RESULTADOS', true],
  ['5.1.03', 'Gasto de garantías', 2, '5', 'D', 'RESULTADOS', true],
  ['5.1.04', 'Gastos internos de servicio', 2, '5', 'D', 'RESULTADOS', true],
  ['5.1.05', 'Ajustes de inventario', 2, '5', 'D', 'RESULTADOS', true],
];

// concepto, descripción, cuenta general, [clase contable, cuenta específica][]
const CONCEPTOS: [string, string, string, [string, string][]][] = [
  ['INVENTARIO', 'Inventario', '1.1.04', []],
  ['SRV_PROCESO', 'Servicios en proceso', '1.1.05', []],
  ['MO_APLICADA', 'Mano de obra aplicada', '2.1.03', []],
  ['TERCEROS_POR_PAGAR', 'Servicios de terceros por pagar', '2.1.04', []],
  ['COSTO_SERVICIO', 'Costo de servicios prestados', '5.1.01', []],
  ['COSTO_CONTRATO', 'Costo de servicios por contrato', '5.1.02', []],
  ['GASTO_GARANTIA', 'Gasto de garantías', '5.1.03', []],
  ['GASTO_INTERNO', 'Gasto interno de servicio', '5.1.04', []],
  ['CLIENTES', 'Clientes', '1.1.02', []],
  ['INGRESO', 'Ingresos', '4.1.02', [['ART-SERV', '4.1.01']]],
  ['IVA_VENTAS', 'IVA en ventas', '2.1.02', []],
  ['CXC_GARANTIA', 'Cuentas por cobrar a proveedores por garantías', '1.1.03', []],
  ['AJUSTE_INV', 'Ajustes de inventario', '5.1.05', []],
];

const CATALOGOS_SRV: { codigo: string; descripcion: string; valores: [string, string, string?][] }[] = [
  {
    codigo: 'PRIORIDAD',
    descripcion: 'Prioridades de la mesa de ayuda (código especial: horas de respuesta)',
    valores: [
      ['ALTA', 'Alta', '4'],
      ['MEDIA', 'Media', '24'],
      ['BAJA', 'Baja', '72'],
    ],
  },
  {
    codigo: 'CANAL',
    descripcion: 'Canales de atención',
    valores: [
      ['TEL', 'Teléfono'],
      ['CORREO', 'Correo'],
      ['WEB', 'Portal web'],
      ['PRESENCIAL', 'Presencial'],
      ['WHATSAPP', 'WhatsApp'],
    ],
  },
  {
    codigo: 'TIPO_CASO',
    descripcion: 'Tipos de caso',
    valores: [
      ['CONSULTA', 'Consulta'],
      ['INCIDENTE', 'Incidente o falla'],
      ['SOLICITUD', 'Solicitud de servicio o turno'],
      ['RECLAMO', 'Reclamo'],
    ],
  },
];

export async function cargarSemillasCompania(trx: Trx, companiaId: string, unidadId: string): Promise<void> {
  const tipos: Record<string, string> = {};
  for (const [modulo, codigo, descripcion, clase, inv, cont] of TIPOS_DOCUMENTO) {
    const r = await sql<{ id: string }>`
      insert into erp.sis_tipos_documento (modulo, codigo, descripcion, clase, afecta_inventario, genera_contabilidad, estado_inicial)
      values (${modulo}, ${codigo}, ${descripcion}, ${clase}, ${inv}, ${cont}, ${codigo === 'OS' ? 10 : null})
      returning id`.execute(trx);
    tipos[codigo] = r.rows[0]!.id;
  }
  for (const [estado, descripcion, siguiente, alternos, fase] of FLUJO_OS) {
    await sql`insert into erp.sis_flujos_estado (tipo_documento_id, estado, descripcion, estado_siguiente, estados_alternos, fase)
              values (${tipos.OS}, ${estado}, ${descripcion}, ${siguiente}, ${alternos.length ? sql`${`{${alternos.join(',')}}`}::smallint[]` : null}, ${fase})`.execute(trx);
  }

  const cuentas: Record<string, string> = {};
  for (const [codigo, descripcion, nivel, padre, naturaleza, tipo, mov] of CUENTAS) {
    const r = await sql<{ id: string }>`
      insert into erp.con_cuentas (compania_id, codigo, descripcion, nivel, cuenta_padre_id, naturaleza, tipo, acepta_movimiento)
      values (${companiaId}, ${codigo}, ${descripcion}, ${nivel}, ${padre ? cuentas[padre]! : null}, ${naturaleza}, ${tipo}, ${mov})
      returning id`.execute(trx);
    cuentas[codigo] = r.rows[0]!.id;
  }

  const clases = await sql<{ id: string; codigo: string }>`select id, codigo from erp.con_clases_contables`.execute(trx);
  const claseId = (codigo: string) => clases.rows.find((c) => c.codigo === codigo)?.id ?? null;
  for (const [codigo, descripcion, general, especificas] of CONCEPTOS) {
    const t = await sql<{ id: string }>`
      insert into erp.con_tipos_transaccion (codigo, descripcion) values (${codigo}, ${descripcion}) returning id`.execute(trx);
    await sql`insert into erp.con_reglas_contables (compania_id, tipo_transaccion_id, cuenta_id)
              values (${companiaId}, ${t.rows[0]!.id}, ${cuentas[general]!})`.execute(trx);
    for (const [clase, cuenta] of especificas) {
      await sql`insert into erp.con_reglas_contables (compania_id, tipo_transaccion_id, clase_contable_id, cuenta_id)
                values (${companiaId}, ${t.rows[0]!.id}, ${claseId(clase)}, ${cuentas[cuenta]!})`.execute(trx);
    }
  }

  // Períodos mensuales del año en curso y del siguiente.
  const anio = new Date().getUTCFullYear();
  await sql`
    insert into erp.con_periodos (compania_id, anio, periodo, fecha_desde, fecha_hasta)
    select ${companiaId}, extract(year from m)::int, extract(month from m)::int, m::date, (m + interval '1 month - 1 day')::date
    from generate_series(make_date(${anio}, 1, 1), make_date(${anio + 1}, 12, 1), interval '1 month') as m`.execute(trx);

  await sql`insert into erp.ec_establecimientos (compania_id, establecimiento, punto_emision, unidad_negocio_id, direccion)
            values (${companiaId}, '001', '001', ${unidadId}, 'Matriz')`.execute(trx);

  const existe = await sql`select 1 from erp.cat_catalogos where modulo = 'SRV' limit 1`.execute(trx);
  if (existe.rows.length === 0) {
    for (const cat of CATALOGOS_SRV) {
      const c = await sql<{ id: string }>`
        insert into erp.cat_catalogos (modulo, codigo, descripcion, es_sistema)
        values ('SRV', ${cat.codigo}, ${cat.descripcion}, true) returning id`.execute(trx);
      let orden = 1;
      for (const [codigo, descripcion, especial] of cat.valores) {
        await sql`insert into erp.cat_valores (catalogo_id, codigo, descripcion, codigo_especial, orden)
                  values (${c.rows[0]!.id}, ${codigo}, ${descripcion}, ${especial ?? null}, ${orden++})`.execute(trx);
      }
    }
  }

  // Servicio genérico para facturar mano de obra.
  await sql`
    insert into erp.mae_articulos (codigo, descripcion, tipo_existencia, unidad_primaria, impuesto_id, clase_contable_id)
    select 'MO-GENERAL', 'Mano de obra', 'SERVICIO', 'HR',
      (select id from erp.mae_impuestos where codigo = 'IVA15' order by vigente_desde desc limit 1),
      (select id from erp.con_clases_contables where codigo = 'ART-SERV')
    where not exists (select 1 from erp.mae_articulos where codigo = 'MO-GENERAL')`.execute(trx);
}
