import Decimal from 'decimal.js';
import { sql, type Trx } from '@erp/db';
import { ErrorNegocio } from '../errores.js';

export interface Movimiento {
  companiaId: string;
  fecha: string;
  articuloId: string;
  unidadNegocioId: string;
  /** Lote ya existente. */
  loteId?: string | null;
  /** Lote por su código; si no existe en la bodega se crea con su vencimiento (solo en entradas). */
  lote?: { codigo: string; vencimiento?: string | null } | null;
  /** Positiva entra, negativa sale. En la unidad primaria del artículo. */
  cantidad: Decimal.Value;
  /** Solo para entradas; las salidas usan el costo promedio vigente. */
  costoUnitario?: Decimal.Value;
  tipoDocumentoId: string;
  numeroDocumento: string;
  origenModulo: string;
  origenLineaId: string;
}

export interface PorLote {
  loteId: string | null;
  cantidad: Decimal;
  costoTotal: Decimal;
}

export interface ResultadoMovimiento {
  /** Primer movimiento de kardex; una salida por lotes puede generar varios (ver kardexIds). */
  kardexId: string | null;
  kardexIds: string[];
  costoUnitario: Decimal;
  costoTotal: Decimal;
  inventariable: boolean;
  claseContableId: string;
  porLote: PorLote[];
}

interface Articulo {
  tipo_existencia: string;
  clase_contable_id: string;
  descripcion: string;
  controla_lote: boolean;
}

/** Busca el lote por código en la bodega; lo crea si se permite. */
export async function resolverLote(
  trx: Trx,
  articuloId: string,
  unidadNegocioId: string,
  codigo: string,
  vencimiento: string | null | undefined,
  crear: boolean,
): Promise<string> {
  const limpio = codigo.trim().toUpperCase();
  if (!limpio) throw new ErrorNegocio(400, 'Indique el lote.');
  const r = await sql<{ id: string }>`
    select id from erp.inv_lotes where articulo_id = ${articuloId} and unidad_negocio_id = ${unidadNegocioId} and lote = ${limpio}`.execute(trx);
  if (r.rows[0]) return r.rows[0].id;
  if (!crear) throw new ErrorNegocio(400, `El lote ${limpio} no existe en la bodega.`);
  const n = await sql<{ id: string }>`
    insert into erp.inv_lotes (articulo_id, unidad_negocio_id, lote, fecha_vencimiento)
    values (${articuloId}, ${unidadNegocioId}, ${limpio}, ${vencimiento ?? null}) returning id`.execute(trx);
  return n.rows[0]!.id;
}

/** Reparte una cantidad entre lotes: salidas por vencimiento más próximo; devoluciones a los lotes de los que salió el mismo origen. */
async function repartirPorLotes(trx: Trx, m: Movimiento, a: Articulo, cantidad: Decimal): Promise<{ loteId: string; cantidad: Decimal }[]> {
  const partes: { loteId: string; cantidad: Decimal }[] = [];
  let resto = cantidad.abs();
  if (cantidad.isNegative()) {
    const r = await sql<{ lote_id: string; en_mano: string }>`
      select s.lote_id, s.en_mano from erp.inv_saldos s join erp.inv_lotes l on l.id = s.lote_id
      where s.articulo_id = ${m.articuloId} and s.unidad_negocio_id = ${m.unidadNegocioId} and s.ubicacion_id is null and s.en_mano > 0
        and l.estado = 'DISPONIBLE'
      order by l.fecha_vencimiento nulls last, l.lote`.execute(trx);
    for (const f of r.rows) {
      if (resto.isZero()) break;
      const toma = Decimal.min(resto, new Decimal(f.en_mano));
      partes.push({ loteId: f.lote_id, cantidad: toma.negated() });
      resto = resto.minus(toma);
    }
    if (resto.greaterThan(0)) {
      throw new ErrorNegocio(400, `No hay existencia suficiente en lotes de ${a.descripcion}: faltan ${resto}.`);
    }
    return partes;
  }
  const r = await sql<{ lote_id: string; neto: string }>`
    select k.lote_id, -sum(k.cantidad) as neto from erp.inv_kardex k join erp.inv_lotes l on l.id = k.lote_id
    where k.origen_linea_id = ${m.origenLineaId} and k.articulo_id = ${m.articuloId} and k.unidad_negocio_id = ${m.unidadNegocioId}
    group by k.lote_id, l.fecha_vencimiento, l.lote having -sum(k.cantidad) > 0
    order by l.fecha_vencimiento desc nulls first, l.lote desc`.execute(trx);
  for (const f of r.rows) {
    if (resto.isZero()) break;
    const toma = Decimal.min(resto, new Decimal(f.neto));
    partes.push({ loteId: f.lote_id, cantidad: toma });
    resto = resto.minus(toma);
  }
  if (resto.greaterThan(0)) throw new ErrorNegocio(400, `${a.descripcion} controla lote: indique el lote de la entrada.`);
  return partes;
}

/**
 * Único punto de entrada para mover inventario.
 * Inserta el kardex (inmutable) y actualiza saldos y costo promedio en la misma transacción.
 * Los artículos no inventariables no generan kardex. Los que controlan lote mueven uno o varios lotes.
 */
export async function moverInventario(trx: Trx, m: Movimiento): Promise<ResultadoMovimiento> {
  const art = await sql<Articulo>`
    select a.tipo_existencia, coalesce(s.clase_contable_id, a.clase_contable_id) as clase_contable_id, a.descripcion, a.controla_lote
    from erp.mae_articulos a
    left join erp.mae_articulos_sucursal s on s.articulo_id = a.id and s.unidad_negocio_id = ${m.unidadNegocioId}
    where a.id = ${m.articuloId}`.execute(trx);
  const a = art.rows[0];
  if (!a) throw new ErrorNegocio(400, 'El artículo no existe.');
  const cantidad = new Decimal(m.cantidad);
  if (cantidad.isZero()) throw new ErrorNegocio(400, 'La cantidad no puede ser cero.');

  if (a.tipo_existencia !== 'INVENTARIABLE') {
    const costo = new Decimal(m.costoUnitario ?? 0);
    const total = costo.times(cantidad.abs()).toDecimalPlaces(2);
    return { kardexId: null, kardexIds: [], costoUnitario: costo, costoTotal: total, inventariable: false, claseContableId: a.clase_contable_id, porLote: [] };
  }

  let partes: { loteId: string | null; cantidad: Decimal }[];
  if (!a.controla_lote) {
    partes = [{ loteId: null, cantidad }];
  } else if (m.loteId) {
    partes = [{ loteId: m.loteId, cantidad }];
  } else if (m.lote?.codigo) {
    partes = [{ loteId: await resolverLote(trx, m.articuloId, m.unidadNegocioId, m.lote.codigo, m.lote.vencimiento, cantidad.greaterThan(0)), cantidad }];
  } else {
    partes = await repartirPorLotes(trx, m, a, cantidad);
  }

  const kardexIds: string[] = [];
  const porLote: PorLote[] = [];
  let costoTotal = new Decimal(0);
  for (const p of partes) {
    const r = await moverUno(trx, m, a, p.loteId, p.cantidad);
    kardexIds.push(r.kardexId);
    porLote.push({ loteId: p.loteId, cantidad: p.cantidad, costoTotal: r.costoTotal });
    costoTotal = costoTotal.plus(r.costoTotal);
  }
  return {
    kardexId: kardexIds[0] ?? null,
    kardexIds,
    costoUnitario: costoTotal.dividedBy(cantidad.abs()),
    costoTotal,
    inventariable: true,
    claseContableId: a.clase_contable_id,
    porLote,
  };
}

async function moverUno(trx: Trx, m: Movimiento, a: Articulo, loteId: string | null, cantidad: Decimal): Promise<{ kardexId: string; costoTotal: Decimal }> {
  // Bloquea el saldo y el costo del artículo en la bodega para que dos movimientos no se pisen.
  await sql`insert into erp.inv_saldos (articulo_id, unidad_negocio_id, ubicacion_id, lote_id)
            values (${m.articuloId}, ${m.unidadNegocioId}, null, ${loteId})
            on conflict on constraint uq_inv_saldos_1 do nothing`.execute(trx);
  const saldo = await sql<{ id: string; en_mano: string }>`
    select id, en_mano from erp.inv_saldos
    where articulo_id = ${m.articuloId} and unidad_negocio_id = ${m.unidadNegocioId}
      and ubicacion_id is null and lote_id is not distinct from ${loteId}
    for update`.execute(trx);
  const s = saldo.rows[0]!;
  await sql`insert into erp.inv_costos (articulo_id, unidad_negocio_id, metodo, costo_unitario)
            values (${m.articuloId}, ${m.unidadNegocioId}, 'PROMEDIO', 0)
            on conflict on constraint uq_inv_costos_1 do nothing`.execute(trx);
  const costoFila = await sql<{ id: string; costo_unitario: string }>`
    select id, costo_unitario from erp.inv_costos
    where articulo_id = ${m.articuloId} and unidad_negocio_id = ${m.unidadNegocioId} and metodo = 'PROMEDIO'
    for update`.execute(trx);
  const c = costoFila.rows[0]!;
  // El promedio es por bodega: se calcula con la existencia de todos los lotes.
  const total = await sql<{ en_mano: string }>`
    select coalesce(sum(en_mano), 0) as en_mano from erp.inv_saldos
    where articulo_id = ${m.articuloId} and unidad_negocio_id = ${m.unidadNegocioId}`.execute(trx);

  const enManoLote = new Decimal(s.en_mano);
  const enManoBodega = new Decimal(total.rows[0]!.en_mano);
  const promedio = new Decimal(c.costo_unitario);
  let costoUnitario: Decimal;
  if (cantidad.isNegative()) {
    if (enManoLote.plus(cantidad).isNegative()) {
      throw new ErrorNegocio(400, `No hay existencia suficiente de ${a.descripcion}: disponible ${enManoLote}, requerido ${cantidad.abs()}.`);
    }
    costoUnitario = promedio;
  } else {
    costoUnitario = new Decimal(m.costoUnitario ?? promedio);
    const nuevoTotal = enManoBodega.plus(cantidad);
    const nuevoPromedio = nuevoTotal.lessThanOrEqualTo(0)
      ? costoUnitario
      : enManoBodega.times(promedio).plus(cantidad.times(costoUnitario)).dividedBy(nuevoTotal);
    await sql`update erp.inv_costos set costo_unitario = ${nuevoPromedio.toDecimalPlaces(6).toFixed(6)}
              where id = ${c.id}`.execute(trx);
  }
  const costoTotal = costoUnitario.times(cantidad).toDecimalPlaces(2);

  const k = await sql<{ id: string }>`
    insert into erp.inv_kardex (compania_id, fecha, articulo_id, unidad_negocio_id, lote_id, tipo_documento_id,
      numero_documento, origen_modulo, origen_linea_id, cantidad, costo_unitario, costo_total, creado_en)
    values (${m.companiaId}, ${m.fecha}, ${m.articuloId}, ${m.unidadNegocioId}, ${loteId}, ${m.tipoDocumentoId},
      ${m.numeroDocumento}, ${m.origenModulo}, ${m.origenLineaId}, ${cantidad.toFixed(4)},
      ${costoUnitario.toDecimalPlaces(6).toFixed(6)}, ${costoTotal.toFixed(2)}, clock_timestamp())
    returning id`.execute(trx);
  await sql`update erp.inv_saldos set en_mano = en_mano + ${cantidad.toFixed(4)} where id = ${s.id}`.execute(trx);
  return { kardexId: k.rows[0]!.id, costoTotal: costoTotal.abs() };
}

/** Liga el asiento generado a sus movimientos de kardex (única columna del kardex que se completa después). */
export async function ligarAsientoKardex(trx: Trx, kardex: string | string[] | null, asientoId: string | null): Promise<void> {
  if (!asientoId || !kardex) return;
  // El rol de la aplicación no puede modificar el kardex; esta función de base lo hace solo para el asiento.
  for (const id of Array.isArray(kardex) ? kardex : [kardex]) {
    await sql`select erp.fn_kardex_ligar_asiento(${id}, ${asientoId})`.execute(trx);
  }
}

/**
 * Compromete (positivo) o libera (negativo) existencia de un artículo inventariable en una bodega.
 * El compromiso se lleva en el saldo sin lote. Devuelve lo disponible; los no inventariables no comprometen.
 */
export async function comprometer(trx: Trx, articuloId: string, unidadNegocioId: string, cantidad: Decimal.Value): Promise<Decimal | null> {
  const a = await sql<{ tipo_existencia: string }>`select tipo_existencia from erp.mae_articulos where id = ${articuloId}`.execute(trx);
  if (a.rows[0]?.tipo_existencia !== 'INVENTARIABLE') return null;
  await sql`insert into erp.inv_saldos (articulo_id, unidad_negocio_id, ubicacion_id, lote_id)
            values (${articuloId}, ${unidadNegocioId}, null, null)
            on conflict on constraint uq_inv_saldos_1 do nothing`.execute(trx);
  await sql`
    update erp.inv_saldos set comprometido = greatest(comprometido + ${new Decimal(cantidad).toFixed(4)}, 0)
    where articulo_id = ${articuloId} and unidad_negocio_id = ${unidadNegocioId} and ubicacion_id is null and lote_id is null`.execute(trx);
  const r = await sql<{ disponible: string }>`
    select coalesce(sum(en_mano), 0) - coalesce(sum(comprometido), 0) as disponible from erp.inv_saldos
    where articulo_id = ${articuloId} and unidad_negocio_id = ${unidadNegocioId}`.execute(trx);
  return new Decimal(r.rows[0]!.disponible);
}
