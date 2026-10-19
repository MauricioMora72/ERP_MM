import Decimal from 'decimal.js';
import { sql, type Trx } from '@erp/db';
import { ErrorNegocio } from '../errores.js';
import { contabilizar } from '../nucleo/contabilidad.js';
import { hoy, numerar, tipoDocumento } from '../nucleo/documentos.js';
import { ligarAsientoKardex, moverInventario, resolverLote } from '../nucleo/inventario.js';

/** Inventarios: ajustes, transferencias, conteo físico y consultas. Todo movimiento pasa por moverInventario. */

const D = (v: Decimal.Value | null | undefined) => new Decimal(v ?? 0);

async function unidadDe(trx: Trx, articuloId: string): Promise<string> {
  const r = await sql<{ unidad_primaria: string }>`select unidad_primaria from erp.mae_articulos where id = ${articuloId}`.execute(trx);
  if (!r.rows[0]) throw new ErrorNegocio(400, 'Artículo: el registro no existe.');
  return r.rows[0].unidad_primaria;
}

export async function registrarAjuste(
  trx: Trx,
  companiaId: string,
  d: { unidadNegocioId: string; articuloId: string; cantidad: Decimal.Value; costoUnitario?: Decimal.Value | null; motivo?: string | null;
    lote?: string | null; vencimiento?: string | null; fecha?: string | null },
) {
  const cantidad = D(d.cantidad);
  if (cantidad.isZero()) throw new ErrorNegocio(400, 'La cantidad no puede ser cero.');
  if (cantidad.greaterThan(0) && (d.costoUnitario == null || d.costoUnitario === '')) {
    throw new ErrorNegocio(400, 'Indique el costo unitario de la entrada.', { costoUnitario: 'Este campo es obligatorio' });
  }
  const tipo = await tipoDocumento(trx, 'INV', 'AJ');
  const numero = await numerar(trx, companiaId, tipo.id);
  const fecha = d.fecha ?? hoy();
  const doc = await sql<{ id: string }>`
    insert into erp.inv_documentos (compania_id, tipo_documento_id, numero, fecha, unidad_negocio_id, observacion)
    values (${companiaId}, ${tipo.id}, ${numero}, ${fecha}, ${d.unidadNegocioId}, ${d.motivo ?? null}) returning id`.execute(trx);
  const linea = await sql<{ id: string }>`
    insert into erp.inv_documentos_lineas (documento_id, linea, articulo_id, cantidad, unidad, costo_unitario)
    values (${doc.rows[0]!.id}, 1, ${d.articuloId}, ${cantidad.toFixed(4)}, ${await unidadDe(trx, d.articuloId)}, ${d.costoUnitario || null})
    returning id`.execute(trx);
  const mov = await moverInventario(trx, {
    companiaId, fecha, articuloId: d.articuloId, unidadNegocioId: d.unidadNegocioId, cantidad,
    lote: d.lote ? { codigo: d.lote, vencimiento: d.vencimiento ?? null } : null,
    costoUnitario: d.costoUnitario || undefined, tipoDocumentoId: tipo.id, numeroDocumento: numero, origenModulo: 'INV', origenLineaId: linea.rows[0]!.id,
  });
  if (!mov.inventariable) throw new ErrorNegocio(400, 'Solo los artículos inventariables tienen existencias.');
  const entrada = cantidad.greaterThan(0);
  const asiento = await contabilizar(trx, {
    companiaId, fecha, glosa: `Ajuste de inventario ${numero}${d.motivo ? `. ${d.motivo}` : ''}`.slice(0, 500), origenModulo: 'INV', origenId: doc.rows[0]!.id,
    lineas: [
      { concepto: 'INVENTARIO', claseContableId: mov.claseContableId, unidadNegocioId: d.unidadNegocioId, debito: entrada ? mov.costoTotal : mov.costoTotal.negated() },
      { concepto: 'AJUSTE_INV', claseContableId: mov.claseContableId, unidadNegocioId: d.unidadNegocioId, credito: entrada ? mov.costoTotal : mov.costoTotal.negated() },
    ],
  });
  await ligarAsientoKardex(trx, mov.kardexIds, asiento);
  await sql`update erp.inv_documentos_lineas set kardex_id = ${mov.kardexId}, lote_id = ${mov.porLote[0]?.loteId ?? null} where id = ${linea.rows[0]!.id}`.execute(trx);
  return { documentoId: doc.rows[0]!.id, numero };
}

export async function transferir(
  trx: Trx,
  companiaId: string,
  d: { origenId: string; destinoId: string; fecha?: string | null; observacion?: string | null;
    lineas: { articuloId: string; cantidad: Decimal.Value; loteId?: string | null }[] },
) {
  if (d.origenId === d.destinoId) throw new ErrorNegocio(400, 'La bodega de destino debe ser distinta de la de origen.');
  const lineas = d.lineas.filter((l) => D(l.cantidad).greaterThan(0));
  if (lineas.length === 0) throw new ErrorNegocio(400, 'Agregue al menos una línea con cantidad.');
  const tipo = await tipoDocumento(trx, 'INV', 'TR');
  const numero = await numerar(trx, companiaId, tipo.id);
  const fecha = d.fecha ?? hoy();
  const doc = await sql<{ id: string }>`
    insert into erp.inv_documentos (compania_id, tipo_documento_id, numero, fecha, unidad_negocio_id, unidad_destino_id, observacion)
    values (${companiaId}, ${tipo.id}, ${numero}, ${fecha}, ${d.origenId}, ${d.destinoId}, ${d.observacion ?? null}) returning id`.execute(trx);
  const docId = doc.rows[0]!.id;
  const contables: Parameters<typeof contabilizar>[1]['lineas'] = [];
  const kardex: string[] = [];
  for (const [i, l] of lineas.entries()) {
    const cantidad = D(l.cantidad);
    const lin = await sql<{ id: string }>`
      insert into erp.inv_documentos_lineas (documento_id, linea, articulo_id, lote_id, cantidad, unidad)
      values (${docId}, ${i + 1}, ${l.articuloId}, ${l.loteId ?? null}, ${cantidad.toFixed(4)}, ${await unidadDe(trx, l.articuloId)}) returning id`.execute(trx);
    const linId = lin.rows[0]!.id;
    const salida = await moverInventario(trx, {
      companiaId, fecha, articuloId: l.articuloId, unidadNegocioId: d.origenId, cantidad: cantidad.negated(), loteId: l.loteId ?? null,
      tipoDocumentoId: tipo.id, numeroDocumento: numero, origenModulo: 'INV', origenLineaId: linId,
    });
    if (!salida.inventariable) throw new ErrorNegocio(400, `Línea ${i + 1}: solo se transfieren artículos inventariables.`);
    kardex.push(...salida.kardexIds);
    // Entra al destino lote por lote, con el mismo costo con que salió.
    for (const p of salida.porLote) {
      let loteDestino: string | null = null;
      if (p.loteId) {
        const lo = await sql<{ lote: string; fecha_vencimiento: string | null }>`select lote, fecha_vencimiento from erp.inv_lotes where id = ${p.loteId}`.execute(trx);
        loteDestino = await resolverLote(trx, l.articuloId, d.destinoId, lo.rows[0]!.lote, lo.rows[0]!.fecha_vencimiento, true);
      }
      const cant = p.cantidad.abs();
      const entrada = await moverInventario(trx, {
        companiaId, fecha, articuloId: l.articuloId, unidadNegocioId: d.destinoId, cantidad: cant, loteId: loteDestino,
        costoUnitario: p.costoTotal.dividedBy(cant), tipoDocumentoId: tipo.id, numeroDocumento: numero, origenModulo: 'INV', origenLineaId: linId,
      });
      kardex.push(...entrada.kardexIds);
      contables.push(
        { concepto: 'INVENTARIO', claseContableId: entrada.claseContableId, unidadNegocioId: d.destinoId, debito: entrada.costoTotal },
        { concepto: 'INVENTARIO', claseContableId: salida.claseContableId, unidadNegocioId: d.origenId, credito: p.costoTotal },
      );
    }
    await sql`update erp.inv_documentos_lineas set kardex_id = ${salida.kardexId}, costo_unitario = ${salida.costoUnitario.toDecimalPlaces(6).toFixed(6)} where id = ${linId}`.execute(trx);
  }
  const asiento = await contabilizar(trx, {
    companiaId, fecha, glosa: `Transferencia ${numero}${d.observacion ? `. ${d.observacion}` : ''}`.slice(0, 500), origenModulo: 'INV', origenId: docId, lineas: contables,
  });
  await ligarAsientoKardex(trx, kardex, asiento);
  return { documentoId: docId, numero };
}

// ---------------------------------------------------------------------------
// Conteo físico

export async function crearConteo(trx: Trx, companiaId: string, d: { unidadNegocioId: string; categoria?: string | null; observacion?: string | null }) {
  const tipo = await tipoDocumento(trx, 'INV', 'CF');
  const numero = await numerar(trx, companiaId, tipo.id);
  const doc = await sql<{ id: string }>`
    insert into erp.inv_documentos (compania_id, tipo_documento_id, numero, fecha, unidad_negocio_id, observacion, estado)
    values (${companiaId}, ${tipo.id}, ${numero}, ${hoy()}, ${d.unidadNegocioId}, ${d.observacion ?? null}, 'ABIERTO') returning id`.execute(trx);
  const docId = doc.rows[0]!.id;
  // Foto de las existencias: por artículo y lote; los artículos sin lote, con su saldo sin lote.
  await sql`
    insert into erp.inv_documentos_lineas (documento_id, linea, articulo_id, lote_id, cantidad, unidad, cantidad_sistema)
    select ${docId}, row_number() over (order by a.codigo, l.lote nulls first), s.articulo_id, s.lote_id, 0, a.unidad_primaria, s.en_mano
    from erp.inv_saldos s join erp.mae_articulos a on a.id = s.articulo_id left join erp.inv_lotes l on l.id = s.lote_id
    where s.unidad_negocio_id = ${d.unidadNegocioId} and s.ubicacion_id is null and a.tipo_existencia = 'INVENTARIABLE' and a.activo
      and (${d.categoria ?? null}::text is null or a.categoria = ${d.categoria ?? null})
      and (s.en_mano <> 0 or (a.controla_lote = false and s.lote_id is null))
      and not (a.controla_lote and s.lote_id is null)`.execute(trx);
  return { id: docId, numero };
}

export async function agregarLineaConteo(trx: Trx, conteoId: string, d: { articuloId: string; lote?: string | null; vencimiento?: string | null }) {
  const doc = await documentoConteo(trx, conteoId);
  const art = await sql<{ controla_lote: boolean; unidad_primaria: string }>`select controla_lote, unidad_primaria from erp.mae_articulos where id = ${d.articuloId}`.execute(trx);
  if (!art.rows[0]) throw new ErrorNegocio(400, 'El artículo no existe.');
  let loteId: string | null = null;
  if (art.rows[0].controla_lote) {
    if (!d.lote) throw new ErrorNegocio(400, 'El artículo controla lote: indique el lote.');
    loteId = await resolverLote(trx, d.articuloId, doc.unidad_negocio_id, d.lote, d.vencimiento, true);
  }
  const existe = await sql`select 1 from erp.inv_documentos_lineas where documento_id = ${conteoId} and articulo_id = ${d.articuloId} and lote_id is not distinct from ${loteId}`.execute(trx);
  if (existe.rows.length) throw new ErrorNegocio(400, 'El artículo ya está en el conteo.');
  await sql`
    insert into erp.inv_documentos_lineas (documento_id, linea, articulo_id, lote_id, cantidad, unidad, cantidad_sistema)
    values (${conteoId}, (select coalesce(max(linea), 0) + 1 from erp.inv_documentos_lineas where documento_id = ${conteoId}),
      ${d.articuloId}, ${loteId}, 0, ${art.rows[0].unidad_primaria}, 0)`.execute(trx);
}

async function documentoConteo(trx: Trx, conteoId: string) {
  const r = await sql<{ id: string; compania_id: string; numero: string; unidad_negocio_id: string; estado: string; codigo: string }>`
    select d.id, d.compania_id, d.numero, d.unidad_negocio_id, d.estado, t.codigo
    from erp.inv_documentos d join erp.sis_tipos_documento t on t.id = d.tipo_documento_id where d.id = ${conteoId} for update of d`.execute(trx);
  const doc = r.rows[0];
  if (!doc || doc.codigo !== 'CF') throw new ErrorNegocio(404, 'El conteo no existe.');
  if (doc.estado !== 'ABIERTO') throw new ErrorNegocio(400, 'El conteo ya fue contabilizado.');
  return doc;
}

export async function registrarConteo(trx: Trx, conteoId: string, cantidades: { lineaId: string; cantidad: Decimal.Value | null }[]) {
  await documentoConteo(trx, conteoId);
  for (const c of cantidades) {
    const valor = c.cantidad == null || c.cantidad === '' ? null : D(c.cantidad);
    if (valor?.isNegative()) throw new ErrorNegocio(400, 'La cantidad contada no puede ser negativa.');
    await sql`update erp.inv_documentos_lineas set cantidad_contada = ${valor?.toFixed(4) ?? null}
              where id = ${c.lineaId} and documento_id = ${conteoId}`.execute(trx);
  }
}

export async function contabilizarConteo(trx: Trx, conteoId: string) {
  const doc = await documentoConteo(trx, conteoId);
  const tipo = await tipoDocumento(trx, 'INV', 'CF');
  const fecha = hoy();
  const lineas = await sql<{ id: string; articulo_id: string; lote_id: string | null; cantidad_contada: string; en_mano: string | null; costo: string | null }>`
    select l.id, l.articulo_id, l.lote_id, l.cantidad_contada, s.en_mano, c.costo_unitario as costo
    from erp.inv_documentos_lineas l
    left join erp.inv_saldos s on s.articulo_id = l.articulo_id and s.unidad_negocio_id = ${doc.unidad_negocio_id}
      and s.ubicacion_id is null and s.lote_id is not distinct from l.lote_id
    left join erp.inv_costos c on c.articulo_id = l.articulo_id and c.unidad_negocio_id = ${doc.unidad_negocio_id} and c.metodo = 'PROMEDIO'
    where l.documento_id = ${conteoId} and l.cantidad_contada is not null order by l.linea`.execute(trx);
  const contables: Parameters<typeof contabilizar>[1]['lineas'] = [];
  const kardex: string[] = [];
  let ajustadas = 0;
  for (const l of lineas.rows) {
    const diferencia = D(l.cantidad_contada).minus(D(l.en_mano));
    await sql`update erp.inv_documentos_lineas set cantidad = ${diferencia.toFixed(4)}, costo_unitario = ${l.costo} where id = ${l.id}`.execute(trx);
    if (diferencia.isZero()) continue;
    const mov = await moverInventario(trx, {
      companiaId: doc.compania_id, fecha, articuloId: l.articulo_id, unidadNegocioId: doc.unidad_negocio_id, cantidad: diferencia, loteId: l.lote_id,
      costoUnitario: D(l.costo), tipoDocumentoId: tipo.id, numeroDocumento: doc.numero, origenModulo: 'INV', origenLineaId: l.id,
    });
    kardex.push(...mov.kardexIds);
    const valor = diferencia.greaterThan(0) ? mov.costoTotal : mov.costoTotal.negated();
    contables.push(
      { concepto: 'INVENTARIO', claseContableId: mov.claseContableId, unidadNegocioId: doc.unidad_negocio_id, debito: valor },
      { concepto: 'AJUSTE_INV', claseContableId: mov.claseContableId, unidadNegocioId: doc.unidad_negocio_id, credito: valor },
    );
    await sql`update erp.inv_documentos_lineas set kardex_id = ${mov.kardexId} where id = ${l.id}`.execute(trx);
    ajustadas++;
  }
  const asiento = await contabilizar(trx, {
    companiaId: doc.compania_id, fecha, glosa: `Conteo físico ${doc.numero}`, origenModulo: 'INV', origenId: conteoId, lineas: contables,
  });
  await ligarAsientoKardex(trx, kardex, asiento);
  await sql`update erp.inv_documentos set estado = 'CONTABILIZADO', fecha = ${fecha} where id = ${conteoId}`.execute(trx);
  return { ajustadas };
}

// ---------------------------------------------------------------------------
// Consultas

export async function listarDocumentos(trx: Trx, companiaId: string, tipo?: string) {
  const r = await sql`
    select d.id, t.codigo as tipo, t.descripcion as tipo_descripcion, d.numero, d.fecha, d.estado, u.codigo as bodega, ud.codigo as destino, d.observacion,
           (select count(*) from erp.inv_documentos_lineas l where l.documento_id = d.id) as lineas
    from erp.inv_documentos d join erp.sis_tipos_documento t on t.id = d.tipo_documento_id
    join erp.mae_unidades_negocio u on u.id = d.unidad_negocio_id left join erp.mae_unidades_negocio ud on ud.id = d.unidad_destino_id
    where d.compania_id = ${companiaId} and (${tipo ?? null}::text is null or t.codigo = ${tipo ?? null})
    order by d.fecha desc, d.numero desc limit 300`.execute(trx);
  return r.rows;
}

export async function detalleDocumento(trx: Trx, id: string) {
  const d = await sql`
    select d.*, t.codigo as tipo, t.descripcion as tipo_descripcion, u.codigo || ' - ' || u.descripcion as bodega,
           ud.codigo || ' - ' || ud.descripcion as destino
    from erp.inv_documentos d join erp.sis_tipos_documento t on t.id = d.tipo_documento_id
    join erp.mae_unidades_negocio u on u.id = d.unidad_negocio_id left join erp.mae_unidades_negocio ud on ud.id = d.unidad_destino_id
    where d.id = ${id}`.execute(trx);
  if (!d.rows[0]) throw new ErrorNegocio(404, 'El documento no existe.');
  const l = await sql`
    select l.*, a.codigo as articulo, a.descripcion, lo.lote, lo.fecha_vencimiento
    from erp.inv_documentos_lineas l join erp.mae_articulos a on a.id = l.articulo_id left join erp.inv_lotes lo on lo.id = l.lote_id
    where l.documento_id = ${id} order by l.linea`.execute(trx);
  return { documento: d.rows[0], lineas: l.rows };
}

export async function existencias(trx: Trx, q: { buscar?: string; unidadNegocioId?: string }) {
  const patron = q.buscar ? `%${q.buscar}%` : null;
  const r = await sql`
    select a.id as articulo_id, a.codigo, a.descripcion, a.unidad_primaria as unidad, u.id as unidad_negocio_id, u.codigo as bodega,
           l.id as lote_id, l.lote, l.fecha_vencimiento, s.en_mano, s.comprometido,
           coalesce(c.costo_unitario, 0) as costo_unitario, round(s.en_mano * coalesce(c.costo_unitario, 0), 2) as valor
    from erp.inv_saldos s join erp.mae_articulos a on a.id = s.articulo_id
    join erp.mae_unidades_negocio u on u.id = s.unidad_negocio_id
    left join erp.inv_lotes l on l.id = s.lote_id
    left join erp.inv_costos c on c.articulo_id = s.articulo_id and c.unidad_negocio_id = s.unidad_negocio_id and c.metodo = 'PROMEDIO'
    where (s.en_mano <> 0 or s.comprometido <> 0)
      and (${patron}::text is null or a.codigo ilike ${patron} or a.descripcion ilike ${patron} or l.lote ilike ${patron})
      and (${q.unidadNegocioId ?? null}::uuid is null or s.unidad_negocio_id = ${q.unidadNegocioId ?? null}::uuid)
    order by a.codigo, u.codigo, l.fecha_vencimiento nulls first, l.lote limit 1000`.execute(trx);
  return r.rows;
}

export async function lotesDisponibles(trx: Trx, articuloId: string, unidadNegocioId: string) {
  const r = await sql`
    select l.id, l.lote, l.fecha_vencimiento, s.en_mano from erp.inv_lotes l
    join erp.inv_saldos s on s.lote_id = l.id and s.ubicacion_id is null
    where l.articulo_id = ${articuloId} and l.unidad_negocio_id = ${unidadNegocioId} and s.en_mano > 0
    order by l.fecha_vencimiento nulls last, l.lote`.execute(trx);
  return r.rows;
}

/** Kardex de un artículo en una bodega con saldo acumulado en cantidad y valor. */
export async function consultaKardex(trx: Trx, q: { articuloId: string; unidadNegocioId?: string | null; desde: string; hasta: string }) {
  const inicial = await sql<{ cantidad: string; valor: string }>`
    select coalesce(sum(cantidad), 0) as cantidad, coalesce(sum(costo_total), 0) as valor from erp.inv_kardex
    where articulo_id = ${q.articuloId} and (${q.unidadNegocioId ?? null}::uuid is null or unidad_negocio_id = ${q.unidadNegocioId ?? null}::uuid)
      and fecha < ${q.desde}::date`.execute(trx);
  const movs = await sql<{ id: string; fecha: string; tipo: string; numero_documento: string; origen_modulo: string; bodega: string; lote: string | null;
    cantidad: string; costo_unitario: string; costo_total: string; asiento: string | null }>`
    select k.id, k.fecha, t.codigo as tipo, t.descripcion as tipo_descripcion, k.numero_documento, k.origen_modulo, u.codigo as bodega, l.lote,
           k.cantidad, k.costo_unitario, k.costo_total, a.numero as asiento
    from erp.inv_kardex k join erp.sis_tipos_documento t on t.id = k.tipo_documento_id join erp.mae_unidades_negocio u on u.id = k.unidad_negocio_id
    left join erp.inv_lotes l on l.id = k.lote_id left join erp.con_asientos a on a.id = k.asiento_id
    where k.articulo_id = ${q.articuloId} and (${q.unidadNegocioId ?? null}::uuid is null or k.unidad_negocio_id = ${q.unidadNegocioId ?? null}::uuid)
      and k.fecha between ${q.desde}::date and ${q.hasta}::date
    order by k.fecha, k.creado_en, k.id`.execute(trx);
  let cantidad = D(inicial.rows[0]!.cantidad);
  let valor = D(inicial.rows[0]!.valor);
  const saldoInicial = { cantidad: cantidad.toFixed(4), valor: valor.toFixed(2) };
  const filas = movs.rows.map((m) => {
    cantidad = cantidad.plus(m.cantidad);
    valor = valor.plus(m.costo_total);
    return { ...m, saldo_cantidad: cantidad.toFixed(4), saldo_valor: valor.toFixed(2) };
  });
  return { saldoInicial, movimientos: filas, saldoFinal: { cantidad: cantidad.toFixed(4), valor: valor.toFixed(2) } };
}
