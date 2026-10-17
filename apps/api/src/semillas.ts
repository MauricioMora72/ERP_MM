import { sql, type Trx } from '@erp/db';

/**
 * Datos base que recibe cada suscriptor nuevo.
 * Son EJEMPLOS para que el cliente empiece a trabajar: deben ser validados y ajustados por cada cliente.
 * Los valores tributarios (IVA) se cargan con su fecha de vigencia y el cliente debe confirmarlos.
 */
const CATALOGOS: { modulo: string; codigo: string; descripcion: string; valores: [string, string][] }[] = [
  {
    modulo: 'MAE',
    codigo: 'TIPO_ID',
    descripcion: 'Tipos de identificación',
    valores: [
      ['RUC', 'RUC'],
      ['CED', 'Cédula'],
      ['PAS', 'Pasaporte'],
      ['EXT', 'Identificación del exterior'],
      ['CF', 'Consumidor final'],
    ],
  },
  {
    modulo: 'MAE',
    codigo: 'TIPO_BUSQUEDA',
    descripcion: 'Tipos de búsqueda del libro de direcciones',
    valores: [
      ['C', 'Cliente'],
      ['V', 'Proveedor'],
      ['E', 'Empleado'],
      ['B', 'Banco'],
      ['CO', 'Compañía'],
      ['X', 'Contacto'],
    ],
  },
  {
    modulo: 'MAE',
    codigo: 'UM',
    descripcion: 'Unidades de medida',
    valores: [
      ['UN', 'Unidad'],
      ['HR', 'Hora'],
      ['SV', 'Servicio'],
      ['KG', 'Kilogramo'],
      ['LT', 'Litro'],
      ['M', 'Metro'],
      ['CJ', 'Caja'],
    ],
  },
  {
    modulo: 'MAE',
    codigo: 'TIPO_UN',
    descripcion: 'Tipos de unidad de negocio',
    valores: [
      ['SUCURSAL', 'Sucursal'],
      ['BODEGA', 'Bodega'],
      ['PLANTA', 'Planta'],
      ['CENTRO_COSTO', 'Centro de costo'],
      ['PROYECTO', 'Proyecto'],
    ],
  },
  {
    modulo: 'MAE',
    codigo: 'CATEGORIA_ART',
    descripcion: 'Categorías de artículos',
    valores: [
      ['SERV', 'Servicios'],
      ['REP', 'Repuestos'],
      ['CONS', 'Consumibles'],
    ],
  },
];

const CLASES_CONTABLES: [string, string, string][] = [
  ['ART-SERV', 'Servicios prestados', 'ARTICULO'],
  ['ART-INV', 'Artículos inventariables', 'ARTICULO'],
  ['ART-CONS', 'Consumibles y suministros', 'ARTICULO'],
  ['CLI-LOCAL', 'Clientes locales', 'CLIENTE'],
  ['PRO-LOCAL', 'Proveedores locales', 'PROVEEDOR'],
  ['IMP-IVA', 'IVA', 'IMPUESTO'],
];

export interface ResultadoSemillas {
  monedaUsdId: string;
}

export async function cargarSemillas(trx: Trx): Promise<ResultadoSemillas> {
  const moneda = await sql<{ id: string }>`
    insert into erp.mae_monedas (codigo, descripcion, decimales) values ('USD', 'Dólar estadounidense', 2)
    returning id`.execute(trx);
  for (const cat of CATALOGOS) {
    const c = await sql<{ id: string }>`
      insert into erp.cat_catalogos (modulo, codigo, descripcion, es_sistema)
      values (${cat.modulo}, ${cat.codigo}, ${cat.descripcion}, true) returning id`.execute(trx);
    let orden = 1;
    for (const [codigo, descripcion] of cat.valores) {
      await sql`insert into erp.cat_valores (catalogo_id, codigo, descripcion, orden)
                values (${c.rows[0]!.id}, ${codigo}, ${descripcion}, ${orden++})`.execute(trx);
    }
  }
  for (const [codigo, descripcion, aplica] of CLASES_CONTABLES) {
    await sql`insert into erp.con_clases_contables (codigo, descripcion, aplica_a)
              values (${codigo}, ${descripcion}, ${aplica})`.execute(trx);
  }
  // Tarifas de IVA de ejemplo con vigencia: el cliente debe confirmarlas con la normativa vigente.
  await sql`
    insert into erp.mae_impuestos (codigo, tipo, codigo_sri, porcentaje, vigente_desde, clase_contable_id)
    select v.codigo, 'IVA', v.sri, v.pct::numeric, v.desde::date, cc.id
    from (values ('IVA15', '4', '15', '2024-04-01'), ('IVA0', '0', '0', '2000-01-01')) as v(codigo, sri, pct, desde)
    cross join erp.con_clases_contables cc where cc.codigo = 'IMP-IVA'`.execute(trx);
  await sql`insert into erp.mae_condiciones_pago (codigo, descripcion, cuotas, dias_primera)
            values ('CONTADO', 'Contado', 1, 0), ('30D', 'Crédito 30 días', 1, 30)`.execute(trx);
  return { monedaUsdId: moneda.rows[0]!.id };
}
