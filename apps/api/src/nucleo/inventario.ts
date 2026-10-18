import Decimal from 'decimal.js';
import { sql, type Trx } from '@erp/db';
import { ErrorNegocio } from '../errores.js';

export interface Movimiento {
  companiaId: string;
  fecha: string;
  articuloId: string;
  unidadNegocioId: string;
  loteId?: string | null;
  /** Positiva entra, negativa sale. En la unidad primaria del artículo. */
  cantidad: Decimal.Value;
  /** Solo para entradas; las salidas usan el costo promedio vigente. */
  costoUnitario?: Decimal.Value;
  tipoDocumentoId: string;
  numeroDocumento: string;
  origenModulo: string;
  origenLineaId: string;
}

export interface ResultadoMovimiento {
  kardexId: string | null;
  costoUnitario: Decimal;
  costoTotal: Decimal;
  inventariable: boolean;
  claseContableId: string;
}

/**
 * Único punto de entrada para mover inventario.
 * Inserta el kardex (inmutable) y actualiza saldos y costo promedio en la misma transacción.
 * Los artículos no inventariables no generan kardex.
 */
export async function moverInventario(trx: Trx, m: Movimiento): Promise<ResultadoMovimiento> {
  const art = await sql<{ tipo_existencia: string; clase_contable_id: string; descripcion: string }>`
    select a.tipo_existencia, coalesce(s.clase_contable_id, a.clase_contable_id) as clase_contable_id, a.descripcion
    from erp.mae_articulos a
    left join erp.mae_articulos_sucursal s on s.articulo_id = a.id and s.unidad_negocio_id = ${m.unidadNegocioId}
    where a.id = ${m.articuloId}`.execute(trx);
  const a = art.rows[0];
  if (!a) throw new ErrorNegocio(400, 'El artículo no existe.');
  const cantidad = new Decimal(m.cantidad);
  if (cantidad.isZero()) throw new ErrorNegocio(400, 'La cantidad no puede ser cero.');

  if (a.tipo_existencia !== 'INVENTARIABLE') {
    const costo = new Decimal(m.costoUnitario ?? 0);
    return {
      kardexId: null,
      costoUnitario: costo,
      costoTotal: costo.times(cantidad.abs()).toDecimalPlaces(2),
      inventariable: false,
      claseContableId: a.clase_contable_id,
    };
  }

  // Bloquea el saldo y el costo del artículo en la bodega para que dos movimientos no se pisen.
  await sql`insert into erp.inv_saldos (articulo_id, unidad_negocio_id, ubicacion_id, lote_id)
            values (${m.articuloId}, ${m.unidadNegocioId}, null, ${m.loteId ?? null})
            on conflict on constraint uq_inv_saldos_1 do nothing`.execute(trx);
  const saldo = await sql<{ id: string; en_mano: string }>`
    select id, en_mano from erp.inv_saldos
    where articulo_id = ${m.articuloId} and unidad_negocio_id = ${m.unidadNegocioId}
      and ubicacion_id is null and lote_id is not distinct from ${m.loteId ?? null}
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

  const enMano = new Decimal(s.en_mano);
  const promedio = new Decimal(c.costo_unitario);
  let costoUnitario: Decimal;
  if (cantidad.isNegative()) {
    if (enMano.plus(cantidad).isNegative()) {
      throw new ErrorNegocio(400, `No hay existencia suficiente de ${a.descripcion}: disponible ${enMano}, requerido ${cantidad.abs()}.`);
    }
    costoUnitario = promedio;
  } else {
    costoUnitario = new Decimal(m.costoUnitario ?? promedio);
    const nuevoTotal = enMano.plus(cantidad);
    const nuevoPromedio = nuevoTotal.isZero()
      ? costoUnitario
      : enMano.times(promedio).plus(cantidad.times(costoUnitario)).dividedBy(nuevoTotal);
    await sql`update erp.inv_costos set costo_unitario = ${nuevoPromedio.toDecimalPlaces(6).toFixed(6)}
              where id = ${c.id}`.execute(trx);
  }
  const costoTotal = costoUnitario.times(cantidad).toDecimalPlaces(2);

  const k = await sql<{ id: string }>`
    insert into erp.inv_kardex (compania_id, fecha, articulo_id, unidad_negocio_id, lote_id, tipo_documento_id,
      numero_documento, origen_modulo, origen_linea_id, cantidad, costo_unitario, costo_total)
    values (${m.companiaId}, ${m.fecha}, ${m.articuloId}, ${m.unidadNegocioId}, ${m.loteId ?? null}, ${m.tipoDocumentoId},
      ${m.numeroDocumento}, ${m.origenModulo}, ${m.origenLineaId}, ${cantidad.toFixed(4)},
      ${costoUnitario.toDecimalPlaces(6).toFixed(6)}, ${costoTotal.toFixed(2)})
    returning id`.execute(trx);
  await sql`update erp.inv_saldos set en_mano = en_mano + ${cantidad.toFixed(4)} where id = ${s.id}`.execute(trx);

  return {
    kardexId: k.rows[0]!.id,
    costoUnitario,
    costoTotal: costoTotal.abs(),
    inventariable: true,
    claseContableId: a.clase_contable_id,
  };
}

/** Liga el asiento generado a su movimiento de kardex (única columna del kardex que se completa después). */
export async function ligarAsientoKardex(trx: Trx, kardexId: string, asientoId: string | null): Promise<void> {
  if (!asientoId) return;
  // El rol de la aplicación no puede modificar el kardex; esta función de base lo hace solo para el asiento.
  await sql`select erp.fn_kardex_ligar_asiento(${kardexId}, ${asientoId})`.execute(trx);
}

/**
 * Compromete (positivo) o libera (negativo) existencia de un artículo inventariable en una bodega.
 * Devuelve lo disponible después del compromiso; los no inventariables no comprometen.
 */
export async function comprometer(trx: Trx, articuloId: string, unidadNegocioId: string, cantidad: Decimal.Value): Promise<Decimal | null> {
  const a = await sql<{ tipo_existencia: string }>`select tipo_existencia from erp.mae_articulos where id = ${articuloId}`.execute(trx);
  if (a.rows[0]?.tipo_existencia !== 'INVENTARIABLE') return null;
  await sql`insert into erp.inv_saldos (articulo_id, unidad_negocio_id, ubicacion_id, lote_id)
            values (${articuloId}, ${unidadNegocioId}, null, null)
            on conflict on constraint uq_inv_saldos_1 do nothing`.execute(trx);
  const r = await sql<{ disponible: string }>`
    update erp.inv_saldos set comprometido = greatest(comprometido + ${new Decimal(cantidad).toFixed(4)}, 0)
    where articulo_id = ${articuloId} and unidad_negocio_id = ${unidadNegocioId} and ubicacion_id is null and lote_id is null
    returning en_mano - comprometido as disponible`.execute(trx);
  return new Decimal(r.rows[0]!.disponible);
}
