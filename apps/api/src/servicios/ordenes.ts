import Decimal from 'decimal.js';
import { sql, type Trx } from '@erp/db';
import { tienePermiso, type Sesion } from '../contexto.js';
import { ErrorNegocio } from '../errores.js';
import { contabilizar } from '../nucleo/contabilidad.js';
import { hoy, numerar, tipoDocumento } from '../nucleo/documentos.js';
import { emitirFactura } from '../nucleo/facturacion.js';
import { estadoDeFase, estadosDe, faseDe, siguientesPermitidos, type Fase } from '../nucleo/flujos.js';
import { ligarAsientoKardex, moverInventario } from '../nucleo/inventario.js';
import { companiaDe, D, existe, impuestoArticulo, precioLista, tarifaVigente } from './comun.js';

export type Cobertura = 'FACTURABLE' | 'GARANTIA' | 'CONTRATO' | 'INTERNO';

export interface Orden {
  id: string;
  compania_id: string;
  tipo_documento_id: string;
  numero: string;
  tipo_orden_id: string;
  unidad_negocio_id: string;
  cliente_id: string;
  objeto_id: string | null;
  contrato_id: string | null;
  estado: number;
  descripcion: string | null;
  campos: Record<string, unknown> | null;
  cobertura: Cobertura;
  cobertura_fijada: boolean;
  motivo_cobertura: string | null;
  garantia_objeto_id: string | null;
  contrato_linea_id: string | null;
  plantilla_id: string | null;
  centro_costo_id: string | null;
  caso_id: string | null;
  factura_id: string | null;
  fecha_solicitud: string;
  fecha_programada: string | null;
  // del tipo de orden
  tipo_clase_contable_id: string | null;
  tipo_articulo_mo_id: string | null;
  tipo_margen_terceros: string;
  tipo_modo_horas: 'RANGO' | 'TOTAL' | 'AMBOS';
}

/** Fases en las que la orden todavía admite horas, consumos y terceros. */
const FASES_ABIERTAS: Fase[] = ['REGISTRADA', 'PROGRAMADA', 'EJECUCION', 'TERMINADA'];

export async function cargarOrden(trx: Trx, id: string, bloquear = false): Promise<Orden> {
  const r = await sql<Orden>`
    select o.*, t.clase_contable_id as tipo_clase_contable_id, t.articulo_mano_obra_id as tipo_articulo_mo_id,
           t.margen_terceros as tipo_margen_terceros, t.modo_horas as tipo_modo_horas
    from erp.srv_ordenes o join erp.srv_tipos_orden t on t.id = o.tipo_orden_id
    where o.id = ${id} ${bloquear ? sql`for update of o` : sql``}`.execute(trx);
  if (!r.rows[0]) throw new ErrorNegocio(404, 'La orden de servicio no existe.');
  return r.rows[0];
}

async function faseActual(trx: Trx, orden: Orden): Promise<Fase | null> {
  return faseDe(await estadosDe(trx, orden.tipo_documento_id), orden.estado);
}

async function exigirAbierta(trx: Trx, orden: Orden): Promise<void> {
  const fase = await faseActual(trx, orden);
  if (!fase || !FASES_ABIERTAS.includes(fase)) {
    throw new ErrorNegocio(400, 'La orden ya no admite registros: está revisada, facturada, cerrada o cancelada.');
  }
}

/** Al registrar la primera hora o consumo, la orden pasa sola a la fase de ejecución. */
async function pasarAEjecucion(trx: Trx, orden: Orden): Promise<void> {
  const estados = await estadosDe(trx, orden.tipo_documento_id);
  const fase = faseDe(estados, orden.estado);
  if (fase === 'REGISTRADA' || fase === 'PROGRAMADA') {
    const destino = estadoDeFase(estados, 'EJECUCION');
    await sql`update erp.srv_ordenes set estado = ${destino.estado} where id = ${orden.id}`.execute(trx);
  }
}

// ---------------------------------------------------------------------------
// Cobertura

export interface ResultadoCobertura {
  cobertura: Cobertura;
  garantiaObjetoId: string | null;
  contratoLineaId: string | null;
  contratoId: string | null;
  motivo: string;
}

/** Decide quién paga la orden: garantía vigente, contrato vigente, interno o el cliente (sección 5.3). */
export async function determinarCobertura(
  trx: Trx,
  datos: { tipoOrdenId: string; clienteId: string; objetoId: string | null; fecha: string },
): Promise<ResultadoCobertura> {
  if (datos.objetoId) {
    const g = await sql<{ id: string }>`
      select id from erp.srv_garantias_objeto
      where objeto_id = ${datos.objetoId} and ${datos.fecha}::date between fecha_inicio and fecha_fin
      order by fecha_fin desc limit 1`.execute(trx);
    if (g.rows[0]) {
      return { cobertura: 'GARANTIA', garantiaObjetoId: g.rows[0].id, contratoLineaId: null, contratoId: null, motivo: 'Garantía vigente del objeto' };
    }
  }
  const c = await sql<{ linea_id: string; contrato_id: string }>`
    select l.id as linea_id, c.id as contrato_id
    from erp.ven_contratos c join erp.ven_contratos_lineas l on l.contrato_id = c.id
    where c.cliente_id = ${datos.clienteId} and c.estado = 'VIGENTE'
      and ${datos.fecha}::date >= c.fecha_inicio and (c.fecha_fin is null or ${datos.fecha}::date <= c.fecha_fin)
      and (l.tipo_orden_id is null or l.tipo_orden_id = ${datos.tipoOrdenId})
      and (l.tope_ordenes is null or l.tope_ordenes > (
            select count(*) from erp.srv_ordenes o where o.contrato_linea_id = l.id and o.cobertura = 'CONTRATO'))
    order by (l.tipo_orden_id is not null) desc limit 1`.execute(trx);
  if (c.rows[0]) {
    return { cobertura: 'CONTRATO', garantiaObjetoId: null, contratoLineaId: c.rows[0].linea_id, contratoId: c.rows[0].contrato_id, motivo: 'Contrato vigente del cliente' };
  }
  const t = await sql<{ cobertura_defecto: Cobertura }>`
    select cobertura_defecto from erp.srv_tipos_orden where id = ${datos.tipoOrdenId}`.execute(trx);
  if (t.rows[0]?.cobertura_defecto === 'INTERNO') {
    return { cobertura: 'INTERNO', garantiaObjetoId: null, contratoLineaId: null, contratoId: null, motivo: 'Tipo de orden interno' };
  }
  return { cobertura: 'FACTURABLE', garantiaObjetoId: null, contratoLineaId: null, contratoId: null, motivo: 'Sin garantía ni contrato vigente' };
}

/** Porcentajes cubiertos (no cobrados al cliente) de mano de obra y de materiales. */
async function porcentajesCubiertos(trx: Trx, orden: Orden): Promise<{ mo: Decimal; mat: Decimal }> {
  if (orden.cobertura === 'FACTURABLE') return { mo: D(0), mat: D(0) };
  if (orden.cobertura === 'INTERNO') return { mo: D(100), mat: D(100) };
  if (orden.cobertura === 'GARANTIA') {
    if (!orden.garantia_objeto_id) return { mo: D(100), mat: D(100) };
    const g = await sql<{ pct_mano_obra: string; pct_materiales: string }>`
      select pct_mano_obra, pct_materiales from erp.srv_garantias_objeto where id = ${orden.garantia_objeto_id}`.execute(trx);
    return { mo: D(g.rows[0]?.pct_mano_obra), mat: D(g.rows[0]?.pct_materiales) };
  }
  const l = await sql<{ pct_mano_obra: string; pct_materiales: string }>`
    select pct_mano_obra, pct_materiales from erp.ven_contratos_lineas where id = ${orden.contrato_linea_id}`.execute(trx);
  return { mo: D(l.rows[0]?.pct_mano_obra), mat: D(l.rows[0]?.pct_materiales) };
}

// ---------------------------------------------------------------------------
// Creación

export interface DatosOrden {
  tipoOrdenId: string;
  clienteId: string;
  objetoId?: string | null;
  unidadNegocioId?: string | null;
  plantillaId?: string | null;
  descripcion?: string | null;
  fechaProgramada?: string | null;
  centroCostoId?: string | null;
  casoId?: string | null;
  campos?: Record<string, unknown> | null;
  preventivoId?: string | null;
  fechaPreventivo?: string | null;
}

async function validarCampos(
  trx: Trx,
  tipoOrdenId: string,
  campos: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const defs = await sql<{ campo: string; etiqueta: string; tipo_dato: string; obligatorio: boolean }>`
    select campo, etiqueta, tipo_dato, obligatorio from erp.srv_campos where tipo_orden_id = ${tipoOrdenId}`.execute(trx);
  const errores: Record<string, string> = {};
  const limpio: Record<string, unknown> = {};
  for (const d of defs.rows) {
    const v = campos[d.campo];
    const vacio = v === undefined || v === null || v === '';
    if (vacio) {
      if (d.obligatorio) errores[`campos.${d.campo}`] = `${d.etiqueta} es obligatorio`;
      continue;
    }
    if (d.tipo_dato === 'NUMERO' && Number.isNaN(Number(v))) errores[`campos.${d.campo}`] = `${d.etiqueta} debe ser un número`;
    if (d.tipo_dato === 'FECHA' && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) errores[`campos.${d.campo}`] = `${d.etiqueta} debe ser una fecha`;
    limpio[d.campo] = d.tipo_dato === 'SI_NO' ? Boolean(v) : v;
  }
  if (Object.keys(errores).length) throw new ErrorNegocio(400, 'Revise los campos del tipo de orden.', errores);
  return limpio;
}

export async function crearOrden(trx: Trx, sesion: Sesion, datos: DatosOrden): Promise<string> {
  const companiaId = companiaDe(sesion);
  const tipo = await sql<{ tipo_documento_id: string; plantilla_defecto_id: string | null; activo: boolean }>`
    select tipo_documento_id, plantilla_defecto_id, activo from erp.srv_tipos_orden where id = ${datos.tipoOrdenId}`.execute(trx);
  const t = tipo.rows[0];
  if (!t || !t.activo) throw new ErrorNegocio(400, 'El tipo de orden no existe o está inactivo.');
  await existe(trx, 'mae_direcciones', datos.clienteId, 'Cliente');
  await existe(trx, 'srv_objetos', datos.objetoId, 'Objeto atendido');
  await existe(trx, 'srv_casos', datos.casoId, 'Caso');
  await existe(trx, 'mae_unidades_negocio', datos.centroCostoId, 'Centro de costo');

  let unidadId = datos.unidadNegocioId ?? null;
  if (unidadId) await existe(trx, 'mae_unidades_negocio', unidadId, 'Unidad de negocio');
  else {
    const u = await sql<{ id: string }>`
      select id from erp.mae_unidades_negocio where compania_id = ${companiaId} and activo order by codigo limit 1`.execute(trx);
    unidadId = u.rows[0]?.id ?? null;
    if (!unidadId) throw new ErrorNegocio(400, 'La compañía no tiene unidades de negocio.');
  }

  const estados = await estadosDe(trx, t.tipo_documento_id);
  const inicial = estadoDeFase(estados, 'REGISTRADA');
  const fecha = hoy();
  const cobertura = await determinarCobertura(trx, {
    tipoOrdenId: datos.tipoOrdenId,
    clienteId: datos.clienteId,
    objetoId: datos.objetoId ?? null,
    fecha,
  });
  const campos = await validarCampos(trx, datos.tipoOrdenId, datos.campos ?? {});
  const numero = await numerar(trx, companiaId, t.tipo_documento_id);
  const plantillaId = datos.plantillaId ?? t.plantilla_defecto_id;
  await existe(trx, 'srv_plantillas', plantillaId, 'Tempario');

  const r = await sql<{ id: string }>`
    insert into erp.srv_ordenes (compania_id, tipo_documento_id, numero, tipo_orden_id, unidad_negocio_id, cliente_id,
      objeto_id, contrato_id, fecha_solicitud, fecha_programada, descripcion, estado, campos, cobertura, motivo_cobertura,
      garantia_objeto_id, contrato_linea_id, plantilla_id, centro_costo_id, caso_id, preventivo_id, fecha_preventivo)
    values (${companiaId}, ${t.tipo_documento_id}, ${numero}, ${datos.tipoOrdenId}, ${unidadId}, ${datos.clienteId},
      ${datos.objetoId ?? null}, ${cobertura.contratoId}, now(), ${datos.fechaProgramada ?? null}, ${datos.descripcion ?? null},
      ${inicial.estado}, ${JSON.stringify(campos)}::jsonb, ${cobertura.cobertura}, ${cobertura.motivo},
      ${cobertura.garantiaObjetoId}, ${cobertura.contratoLineaId}, ${plantillaId}, ${datos.centroCostoId ?? null},
      ${datos.casoId ?? null}, ${datos.preventivoId ?? null}, ${datos.fechaPreventivo ?? null})
    returning id`.execute(trx);
  const ordenId = r.rows[0]!.id;
  if (plantillaId) await copiarTempario(trx, ordenId, plantillaId, unidadId);
  return ordenId;
}

/** Copia las actividades y materiales del tempario a la orden como previstos (sección 4.4). */
async function copiarTempario(trx: Trx, ordenId: string, plantillaId: string, unidadId: string): Promise<void> {
  const lineas = await sql<{
    tipo_linea: string; descripcion: string | null; articulo_id: string | null; cantidad: string | null;
    horas: string | null; perfil_id: string | null; personas: number; facturable: boolean; unidad: string | null;
  }>`
    select l.tipo_linea, l.descripcion, l.articulo_id, l.cantidad, l.horas, l.perfil_id, l.personas, l.facturable,
           a.unidad_primaria as unidad
    from erp.srv_plantillas_lineas l left join erp.mae_articulos a on a.id = l.articulo_id
    where l.plantilla_id = ${plantillaId} order by l.linea`.execute(trx);
  let nAct = 1;
  let nCon = 1;
  for (const l of lineas.rows) {
    if (l.tipo_linea === 'ACTIVIDAD') {
      await sql`insert into erp.srv_ordenes_actividades (orden_id, linea, descripcion, perfil_id, personas, horas_previstas, facturable)
                values (${ordenId}, ${nAct++}, ${l.descripcion ?? 'Actividad'}, ${l.perfil_id}, ${l.personas},
                        ${D(l.horas).times(l.personas).toFixed(4)}, ${l.facturable})`.execute(trx);
    } else if (l.tipo_linea === 'MATERIAL' && l.articulo_id) {
      await sql`insert into erp.srv_ordenes_consumos (orden_id, linea, articulo_id, unidad_negocio_id, cantidad, cantidad_prevista, unidad, facturable)
                values (${ordenId}, ${nCon++}, ${l.articulo_id}, ${unidadId}, 0, ${D(l.cantidad).toFixed(4)}, ${l.unidad ?? 'UN'}, ${l.facturable})`.execute(trx);
    }
  }
}

// ---------------------------------------------------------------------------
// Ejecución: actividades, horas, consumos, terceros

export async function agregarActividad(
  trx: Trx,
  ordenId: string,
  d: { descripcion: string; perfilId?: string | null; articuloId?: string | null; personas?: number; horasPrevistas?: string | number; recursoId?: string | null; facturable?: boolean; precioCerrado?: string | number | null },
): Promise<string> {
  const orden = await cargarOrden(trx, ordenId, true);
  await exigirAbierta(trx, orden);
  await existe(trx, 'srv_perfiles', d.perfilId, 'Perfil');
  await existe(trx, 'mae_articulos', d.articuloId, 'Servicio');
  await existe(trx, 'srv_recursos', d.recursoId, 'Recurso');
  const n = await sql<{ n: number }>`select coalesce(max(linea), 0) + 1 as n from erp.srv_ordenes_actividades where orden_id = ${ordenId}`.execute(trx);
  const r = await sql<{ id: string }>`
    insert into erp.srv_ordenes_actividades (orden_id, linea, descripcion, perfil_id, articulo_id, personas, horas_previstas, recurso_id, facturable, precio_cerrado)
    values (${ordenId}, ${n.rows[0]!.n}, ${d.descripcion}, ${d.perfilId ?? null}, ${d.articuloId ?? null}, ${d.personas ?? 1},
            ${D(d.horasPrevistas).toFixed(4)}, ${d.recursoId ?? null}, ${d.facturable ?? true},
            ${d.precioCerrado != null ? D(d.precioCerrado).toFixed(6) : null})
    returning id`.execute(trx);
  return r.rows[0]!.id;
}

export async function registrarHoras(
  trx: Trx,
  ordenId: string,
  d: { actividadId: string; recursoId: string; fecha?: string; inicio?: string | null; fin?: string | null; horas?: string | number | null },
): Promise<string> {
  const orden = await cargarOrden(trx, ordenId, true);
  await exigirAbierta(trx, orden);
  const act = await sql<{ id: string; perfil_id: string | null }>`
    select id, perfil_id from erp.srv_ordenes_actividades where id = ${d.actividadId} and orden_id = ${ordenId}`.execute(trx);
  if (!act.rows[0]) throw new ErrorNegocio(400, 'La actividad no pertenece a la orden.');
  const rec = await sql<{ costo_hora: string | null }>`select costo_hora from erp.srv_recursos where id = ${d.recursoId}`.execute(trx);
  if (!rec.rows[0]) throw new ErrorNegocio(400, 'Recurso: el registro no existe.');

  const conRango = !!(d.inicio && d.fin);
  if (orden.tipo_modo_horas === 'RANGO' && !conRango) throw new ErrorNegocio(400, 'Este tipo de orden exige hora de inicio y de fin.');
  if (orden.tipo_modo_horas === 'TOTAL' && conRango) throw new ErrorNegocio(400, 'Este tipo de orden registra solo el total de horas.');
  let horas: Decimal;
  if (conRango) {
    const ms = Date.parse(d.fin!) - Date.parse(d.inicio!);
    if (!(ms > 0)) throw new ErrorNegocio(400, 'La hora de fin debe ser posterior a la de inicio.');
    horas = new Decimal(ms).dividedBy(3_600_000).toDecimalPlaces(4);
  } else {
    horas = D(d.horas);
    if (!horas.greaterThan(0)) throw new ErrorNegocio(400, 'Indique las horas trabajadas.');
  }
  const fecha = d.fecha ?? (conRango ? d.inicio!.slice(0, 10) : hoy());
  const tarifa = await tarifaVigente(trx, { recursoId: d.recursoId, perfilId: act.rows[0].perfil_id, fecha });
  const costoHora = tarifa?.costo ?? D(rec.rows[0].costo_hora);
  const costoTotal = costoHora.times(horas).toDecimalPlaces(2);

  const r = await sql<{ id: string }>`
    insert into erp.srv_ordenes_horas (orden_id, actividad_id, recurso_id, fecha, inicio, fin, horas, costo_hora, costo_total)
    values (${ordenId}, ${d.actividadId}, ${d.recursoId}, ${fecha}, ${d.inicio ?? null}, ${d.fin ?? null},
            ${horas.toFixed(4)}, ${costoHora.toFixed(6)}, ${costoTotal.toFixed(2)})
    returning id`.execute(trx);
  await sql`update erp.srv_ordenes_actividades set horas_reales = coalesce(horas_reales, 0) + ${horas.toFixed(4)},
              recurso_id = coalesce(recurso_id, ${d.recursoId}) where id = ${d.actividadId}`.execute(trx);
  const asiento = await contabilizar(trx, {
    companiaId: orden.compania_id,
    fecha,
    glosa: `Mano de obra, orden de servicio ${orden.numero}`,
    origenModulo: 'SRV',
    origenId: ordenId,
    lineas: [
      { concepto: 'SRV_PROCESO', claseContableId: orden.tipo_clase_contable_id, unidadNegocioId: orden.unidad_negocio_id, debito: costoTotal },
      { concepto: 'MO_APLICADA', claseContableId: orden.tipo_clase_contable_id, unidadNegocioId: orden.unidad_negocio_id, credito: costoTotal },
    ],
  });
  if (asiento) await sql`update erp.srv_ordenes_horas set asiento_id = ${asiento} where id = ${r.rows[0]!.id}`.execute(trx);
  await pasarAEjecucion(trx, orden);
  return r.rows[0]!.id;
}

/** Consume un material: nueva línea, o una línea prevista que se emite. Descarga inventario con kardex. */
export async function consumir(
  trx: Trx,
  ordenId: string,
  d: { consumoId?: string | null; articuloId?: string | null; unidadNegocioId?: string | null; cantidad?: string | number | null; facturable?: boolean; loteId?: string | null; precio?: string | number | null },
): Promise<string> {
  const orden = await cargarOrden(trx, ordenId, true);
  await exigirAbierta(trx, orden);
  let consumoId = d.consumoId ?? null;
  let articuloId: string;
  let unidadId: string;
  let cantidad: Decimal;
  if (consumoId) {
    const c = await sql<{ articulo_id: string; unidad_negocio_id: string | null; cantidad: string; cantidad_prevista: string }>`
      select articulo_id, unidad_negocio_id, cantidad, cantidad_prevista from erp.srv_ordenes_consumos
      where id = ${consumoId} and orden_id = ${ordenId}`.execute(trx);
    const fila = c.rows[0];
    if (!fila) throw new ErrorNegocio(400, 'La línea de consumo no pertenece a la orden.');
    if (!D(fila.cantidad).isZero()) throw new ErrorNegocio(400, 'Esa línea ya fue consumida; agregue una línea nueva.');
    articuloId = fila.articulo_id;
    unidadId = d.unidadNegocioId ?? fila.unidad_negocio_id ?? orden.unidad_negocio_id;
    cantidad = d.cantidad != null && d.cantidad !== '' ? D(d.cantidad) : D(fila.cantidad_prevista);
  } else {
    if (!d.articuloId) throw new ErrorNegocio(400, 'Indique el artículo a consumir.');
    articuloId = d.articuloId;
    unidadId = d.unidadNegocioId ?? orden.unidad_negocio_id;
    cantidad = D(d.cantidad);
    const art = await sql<{ unidad_primaria: string }>`select unidad_primaria from erp.mae_articulos where id = ${articuloId}`.execute(trx);
    if (!art.rows[0]) throw new ErrorNegocio(400, 'Artículo: el registro no existe.');
    const n = await sql<{ n: number }>`select coalesce(max(linea), 0) + 1 as n from erp.srv_ordenes_consumos where orden_id = ${ordenId}`.execute(trx);
    const ins = await sql<{ id: string }>`
      insert into erp.srv_ordenes_consumos (orden_id, linea, articulo_id, unidad_negocio_id, lote_id, cantidad, unidad, facturable, precio)
      values (${ordenId}, ${n.rows[0]!.n}, ${articuloId}, ${unidadId}, ${d.loteId ?? null}, 0, ${art.rows[0].unidad_primaria},
              ${d.facturable ?? true}, ${d.precio != null && d.precio !== '' ? D(d.precio).toFixed(6) : null})
      returning id`.execute(trx);
    consumoId = ins.rows[0]!.id;
  }
  if (!cantidad.greaterThan(0)) throw new ErrorNegocio(400, 'La cantidad debe ser mayor que cero.');
  await existe(trx, 'mae_unidades_negocio', unidadId, 'Bodega');

  const tipoOs = await sql<{ id: string }>`select tipo_documento_id as id from erp.srv_ordenes where id = ${ordenId}`.execute(trx);
  const fecha = hoy();
  const mov = await moverInventario(trx, {
    companiaId: orden.compania_id,
    fecha,
    articuloId,
    unidadNegocioId: unidadId,
    loteId: d.loteId ?? null,
    cantidad: cantidad.negated(),
    tipoDocumentoId: tipoOs.rows[0]!.id,
    numeroDocumento: orden.numero,
    origenModulo: 'SRV',
    origenLineaId: consumoId,
  });
  const asiento = await contabilizar(trx, {
    companiaId: orden.compania_id,
    fecha,
    glosa: `Consumo de material, orden de servicio ${orden.numero}`,
    origenModulo: 'SRV',
    origenId: ordenId,
    lineas: [
      { concepto: 'SRV_PROCESO', claseContableId: orden.tipo_clase_contable_id, unidadNegocioId: orden.unidad_negocio_id, debito: mov.costoTotal },
      { concepto: 'INVENTARIO', claseContableId: mov.claseContableId, unidadNegocioId: unidadId, credito: mov.costoTotal },
    ],
  });
  if (mov.kardexId) await ligarAsientoKardex(trx, mov.kardexIds, asiento);
  await sql`update erp.srv_ordenes_consumos set cantidad = ${cantidad.toFixed(4)}, unidad_negocio_id = ${unidadId},
              costo_unitario = ${mov.costoUnitario.toDecimalPlaces(6).toFixed(6)}, kardex_id = ${mov.kardexId}, asiento_id = ${asiento}
            where id = ${consumoId}`.execute(trx);
  await pasarAEjecucion(trx, orden);
  return consumoId;
}

/** Reversa un consumo: movimiento de kardex inverso y asiento inverso. Nunca se borra el original. */
export async function reversarConsumo(trx: Trx, ordenId: string, consumoId: string): Promise<void> {
  const orden = await cargarOrden(trx, ordenId, true);
  await exigirAbierta(trx, orden);
  const c = await sql<{ articulo_id: string; unidad_negocio_id: string; cantidad: string; costo_unitario: string | null; reversado: boolean; lote_id: string | null }>`
    select articulo_id, unidad_negocio_id, cantidad, costo_unitario, reversado, lote_id from erp.srv_ordenes_consumos
    where id = ${consumoId} and orden_id = ${ordenId} for update`.execute(trx);
  const fila = c.rows[0];
  if (!fila) throw new ErrorNegocio(400, 'La línea de consumo no pertenece a la orden.');
  if (fila.reversado || D(fila.cantidad).isZero()) throw new ErrorNegocio(400, 'La línea no tiene un consumo vigente que reversar.');
  const fecha = hoy();
  const mov = await moverInventario(trx, {
    companiaId: orden.compania_id,
    fecha,
    articuloId: fila.articulo_id,
    unidadNegocioId: fila.unidad_negocio_id,
    loteId: fila.lote_id,
    cantidad: D(fila.cantidad),
    costoUnitario: D(fila.costo_unitario),
    tipoDocumentoId: orden.tipo_documento_id,
    numeroDocumento: orden.numero,
    origenModulo: 'SRV',
    origenLineaId: consumoId,
  });
  const asiento = await contabilizar(trx, {
    companiaId: orden.compania_id,
    fecha,
    glosa: `Reverso de consumo, orden de servicio ${orden.numero}`,
    origenModulo: 'SRV',
    origenId: ordenId,
    lineas: [
      { concepto: 'INVENTARIO', claseContableId: mov.claseContableId, unidadNegocioId: fila.unidad_negocio_id, debito: mov.costoTotal },
      { concepto: 'SRV_PROCESO', claseContableId: orden.tipo_clase_contable_id, unidadNegocioId: orden.unidad_negocio_id, credito: mov.costoTotal },
    ],
  });
  if (mov.kardexId) await ligarAsientoKardex(trx, mov.kardexIds, asiento);
  await sql`update erp.srv_ordenes_consumos set reversado = true where id = ${consumoId}`.execute(trx);
}

export async function registrarTercero(
  trx: Trx,
  ordenId: string,
  d: { descripcion: string; proveedorId?: string | null; articuloId?: string | null; costo: string | number; precio?: string | number | null; facturable?: boolean },
): Promise<string> {
  const orden = await cargarOrden(trx, ordenId, true);
  await exigirAbierta(trx, orden);
  await existe(trx, 'mae_direcciones', d.proveedorId, 'Proveedor');
  await existe(trx, 'mae_articulos', d.articuloId, 'Servicio');
  const costo = D(d.costo).toDecimalPlaces(2);
  if (!costo.greaterThan(0)) throw new ErrorNegocio(400, 'El costo debe ser mayor que cero.');
  const precio = d.precio != null && d.precio !== '' ? D(d.precio) : costo.times(D(100).plus(orden.tipo_margen_terceros)).dividedBy(100);
  const n = await sql<{ n: number }>`select coalesce(max(linea), 0) + 1 as n from erp.srv_ordenes_terceros where orden_id = ${ordenId}`.execute(trx);
  const r = await sql<{ id: string }>`
    insert into erp.srv_ordenes_terceros (orden_id, linea, descripcion, proveedor_id, articulo_id, costo, precio, facturable)
    values (${ordenId}, ${n.rows[0]!.n}, ${d.descripcion}, ${d.proveedorId ?? null}, ${d.articuloId ?? null},
            ${costo.toFixed(2)}, ${precio.toDecimalPlaces(6).toFixed(6)}, ${d.facturable ?? true})
    returning id`.execute(trx);
  const asiento = await contabilizar(trx, {
    companiaId: orden.compania_id,
    fecha: hoy(),
    glosa: `Servicio de tercero, orden de servicio ${orden.numero}`,
    origenModulo: 'SRV',
    origenId: ordenId,
    lineas: [
      { concepto: 'SRV_PROCESO', claseContableId: orden.tipo_clase_contable_id, unidadNegocioId: orden.unidad_negocio_id, debito: costo },
      { concepto: 'TERCEROS_POR_PAGAR', terceroId: d.proveedorId ?? null, credito: costo },
    ],
  });
  await sql`update erp.srv_ordenes_terceros set asiento_id = ${asiento} where id = ${r.rows[0]!.id}`.execute(trx);
  await pasarAEjecucion(trx, orden);
  return r.rows[0]!.id;
}

// ---------------------------------------------------------------------------
// Prefactura y facturación

export interface LineaPrefactura {
  origen: 'MO' | 'MAT' | 'TER' | 'CERRADO';
  origenId: string | null;
  descripcion: string;
  articuloId: string;
  cantidad: string;
  precioUnitario: string;
  subtotal: string;
  pctCubierto: string;
  cubierto: string;
  montoCliente: string;
  impuestoId: string | null;
  valorImpuesto: string;
  costo: string;
  costoCubierto: string;
  claseContableId: string | null;
}

export interface Prefactura {
  cobertura: Cobertura;
  lineas: LineaPrefactura[];
  advertencias: string[];
  totales: { subtotal: string; cubierto: string; baseCliente: string; impuestos: string; totalCliente: string; costo: string; costoCubierto: string };
}

export async function calcularPrefactura(trx: Trx, ordenId: string): Promise<Prefactura> {
  const orden = await cargarOrden(trx, ordenId);
  const fecha = hoy();
  const pct = await porcentajesCubiertos(trx, orden);
  const lista = await sql<{ lista_precios_id: string | null }>`
    select lista_precios_id from erp.mae_clientes where direccion_id = ${orden.cliente_id} and compania_id = ${orden.compania_id}`.execute(trx);
  const listaId = lista.rows[0]?.lista_precios_id ?? null;
  const advertencias: string[] = [];
  const crudas: Omit<LineaPrefactura, 'impuestoId' | 'valorImpuesto' | 'claseContableId' | 'cubierto' | 'montoCliente' | 'costoCubierto'>[] = [];
  const facturables = new Map<string, boolean>();

  let articuloMo = orden.tipo_articulo_mo_id;
  if (!articuloMo) {
    const mo = await sql<{ id: string }>`select id from erp.mae_articulos where codigo = 'MO-GENERAL'`.execute(trx);
    articuloMo = mo.rows[0]?.id ?? null;
  }

  const acts = await sql<{ id: string; descripcion: string; perfil_id: string | null; articulo_id: string | null; horas_reales: string | null; precio_cerrado: string | null; facturable: boolean }>`
    select id, descripcion, perfil_id, articulo_id, horas_reales, precio_cerrado, facturable
    from erp.srv_ordenes_actividades where orden_id = ${ordenId} order by linea`.execute(trx);
  for (const a of acts.rows) {
    const horas = D(a.horas_reales);
    const costoR = await sql<{ costo: string }>`select coalesce(sum(costo_total), 0) as costo from erp.srv_ordenes_horas where actividad_id = ${a.id}`.execute(trx);
    const costo = D(costoR.rows[0]!.costo);
    if (horas.isZero() && a.precio_cerrado == null) continue;
    let precio: Decimal;
    let cantidad: Decimal;
    if (a.precio_cerrado != null) {
      precio = D(a.precio_cerrado);
      cantidad = D(1);
    } else {
      const t = await tarifaVigente(trx, { perfilId: a.perfil_id, listaPreciosId: listaId, fecha });
      if (!t) advertencias.push(`La actividad "${a.descripcion}" no tiene tarifa de venta vigente; se valoró en cero.`);
      precio = t?.venta ?? D(0);
      cantidad = horas;
    }
    const articulo = a.articulo_id ?? articuloMo;
    if (!articulo) throw new ErrorNegocio(400, 'Configure el servicio de mano de obra en el tipo de orden.');
    facturables.set(a.id, a.facturable);
    crudas.push({ origen: 'MO', origenId: a.id, descripcion: a.descripcion, articuloId: articulo, cantidad: cantidad.toFixed(4), precioUnitario: precio.toFixed(6), subtotal: precio.times(cantidad).toDecimalPlaces(2).toFixed(2), pctCubierto: pct.mo.toFixed(4), costo: costo.toFixed(2) });
  }

  const cons = await sql<{ id: string; articulo_id: string; descripcion: string; cantidad: string; costo_unitario: string | null; precio: string | null; facturable: boolean }>`
    select c.id, c.articulo_id, a.descripcion, c.cantidad, c.costo_unitario, c.precio, c.facturable
    from erp.srv_ordenes_consumos c join erp.mae_articulos a on a.id = c.articulo_id
    where c.orden_id = ${ordenId} and c.cantidad > 0 and not c.reversado order by c.linea`.execute(trx);
  for (const c of cons.rows) {
    const cantidad = D(c.cantidad);
    let precio = c.precio != null ? D(c.precio) : await precioLista(trx, { articuloId: c.articulo_id, listaPreciosId: listaId, fecha });
    if (precio == null) {
      if (c.facturable) advertencias.push(`El material "${c.descripcion}" no tiene precio de lista; se valoró en cero.`);
      precio = D(0);
    }
    facturables.set(c.id, c.facturable);
    crudas.push({ origen: 'MAT', origenId: c.id, descripcion: c.descripcion, articuloId: c.articulo_id, cantidad: cantidad.toFixed(4), precioUnitario: precio.toFixed(6), subtotal: precio.times(cantidad).toDecimalPlaces(2).toFixed(2), pctCubierto: pct.mat.toFixed(4), costo: D(c.costo_unitario).times(cantidad).toDecimalPlaces(2).toFixed(2) });
  }

  const ters = await sql<{ id: string; descripcion: string; articulo_id: string | null; costo: string; precio: string | null; facturable: boolean }>`
    select id, descripcion, articulo_id, costo, precio, facturable from erp.srv_ordenes_terceros where orden_id = ${ordenId} order by linea`.execute(trx);
  for (const t of ters.rows) {
    const precio = D(t.precio ?? t.costo);
    const articulo = t.articulo_id ?? articuloMo;
    if (!articulo) throw new ErrorNegocio(400, 'Indique el servicio con que se factura el tercero.');
    facturables.set(t.id, t.facturable);
    crudas.push({ origen: 'TER', origenId: t.id, descripcion: t.descripcion, articuloId: articulo, cantidad: '1.0000', precioUnitario: precio.toFixed(6), subtotal: precio.toDecimalPlaces(2).toFixed(2), pctCubierto: pct.mat.toFixed(4), costo: D(t.costo).toFixed(2) });
  }

  // Tempario con precio cerrado: una sola línea reemplaza la mano de obra y los materiales.
  if (orden.plantilla_id) {
    const p = await sql<{ descripcion: string; precio_cerrado: string | null; articulo_id: string | null }>`
      select descripcion, precio_cerrado, articulo_id from erp.srv_plantillas where id = ${orden.plantilla_id}`.execute(trx);
    const pl = p.rows[0];
    if (pl?.precio_cerrado != null) {
      const costoIncluido = crudas.filter((l) => l.origen !== 'TER').reduce((s, l) => s.plus(l.costo), D(0));
      for (const l of crudas) if (l.origen !== 'TER') facturables.set(l.origenId!, false);
      const articulo = pl.articulo_id ?? articuloMo;
      if (!articulo) throw new ErrorNegocio(400, 'Indique el servicio del tempario con precio cerrado.');
      crudas.push({ origen: 'CERRADO', origenId: null, descripcion: pl.descripcion, articuloId: articulo, cantidad: '1.0000', precioUnitario: D(pl.precio_cerrado).toFixed(6), subtotal: D(pl.precio_cerrado).toFixed(2), pctCubierto: pct.mo.toFixed(4), costo: '0.00' });
      // El costo de lo incluido se mantiene en sus líneas; la línea cerrada solo lleva el precio.
      void costoIncluido;
    }
  }

  const lineas: LineaPrefactura[] = [];
  for (const l of crudas) {
    const facturable = l.origenId ? facturables.get(l.origenId) !== false : true;
    const pctCub = D(l.pctCubierto);
    const subtotal = facturable ? D(l.subtotal) : D(0);
    const cubierto = subtotal.times(pctCub).dividedBy(100).toDecimalPlaces(2);
    const montoCliente = subtotal.minus(cubierto);
    const imp = await impuestoArticulo(trx, l.articuloId, fecha);
    const costoCubierto = D(l.costo).times(pctCub).dividedBy(100).toDecimalPlaces(2);
    lineas.push({
      ...l,
      subtotal: subtotal.toFixed(2),
      cubierto: cubierto.toFixed(2),
      montoCliente: montoCliente.toFixed(2),
      impuestoId: imp.impuestoId,
      valorImpuesto: montoCliente.times(imp.porcentaje).dividedBy(100).toDecimalPlaces(2).toFixed(2),
      costoCubierto: costoCubierto.toFixed(2),
      claseContableId: imp.claseContableId,
    });
  }
  const suma = (k: keyof LineaPrefactura) => lineas.reduce((s, l) => s.plus(l[k] as string), D(0));
  const base = suma('montoCliente');
  const iva = suma('valorImpuesto');
  return {
    cobertura: orden.cobertura,
    lineas,
    advertencias,
    totales: {
      subtotal: suma('subtotal').toFixed(2),
      cubierto: suma('cubierto').toFixed(2),
      baseCliente: base.toFixed(2),
      impuestos: iva.toFixed(2),
      totalCliente: base.plus(iva).toFixed(2),
      costo: suma('costo').toFixed(2),
      costoCubierto: suma('costoCubierto').toFixed(2),
    },
  };
}

const CONCEPTO_CUBIERTO: Record<Cobertura, string> = {
  FACTURABLE: 'COSTO_SERVICIO',
  GARANTIA: 'GASTO_GARANTIA',
  CONTRATO: 'COSTO_CONTRATO',
  INTERNO: 'GASTO_INTERNO',
};

/** Factura al cliente lo no cubierto y traslada el costo según la cobertura (secciones 6 y 7). */
export async function facturar(trx: Trx, sesion: Sesion, ordenId: string): Promise<{ facturaId: string | null; asientoCierreId: string | null }> {
  const orden = await cargarOrden(trx, ordenId, true);
  const estados = await estadosDe(trx, orden.tipo_documento_id);
  if (faseDe(estados, orden.estado) !== 'REVISADA') {
    throw new ErrorNegocio(400, 'Solo se factura una orden revisada para cobro.');
  }
  const pre = await calcularPrefactura(trx, ordenId);
  const fecha = hoy();
  let facturaId: string | null = null;

  if (D(pre.totales.totalCliente).greaterThan(0)) {
    const emitida = await emitirFactura(trx, {
      companiaId: orden.compania_id,
      clienteId: orden.cliente_id,
      fecha,
      glosa: `Orden de servicio ${orden.numero}`,
      lineas: pre.lineas
        .filter((l) => !D(l.montoCliente).isZero())
        .map((l) => ({
          articuloId: l.articuloId,
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          precio: l.precioUnitario,
          subtotal: l.subtotal,
          descuento: l.cubierto,
          impuestoId: l.impuestoId,
          porcentajeImpuesto: 0,
          valorImpuesto: l.valorImpuesto,
          claseContableId: l.claseContableId,
          unidadNegocioId: orden.unidad_negocio_id,
          ordenServicioId: ordenId,
          consumoId: l.origen === 'MAT' ? l.origenId : null,
          actividadId: l.origen === 'MO' ? l.origenId : null,
          terceroId: l.origen === 'TER' ? l.origenId : null,
        })),
    });
    facturaId = emitida.facturaId;
  }

  // Cierre: el costo acumulado en servicios en proceso pasa a su destino según la cobertura.
  const costo = D(pre.totales.costo);
  const cubierto = D(pre.totales.costoCubierto);
  const noCubierto = costo.minus(cubierto);
  const centro = orden.cobertura === 'INTERNO' ? orden.centro_costo_id ?? orden.unidad_negocio_id : orden.unidad_negocio_id;
  const asientoCierre = await contabilizar(trx, {
    companiaId: orden.compania_id,
    fecha,
    glosa: `Cierre de costos, orden de servicio ${orden.numero} (${orden.cobertura.toLowerCase()})`,
    origenModulo: 'SRV',
    origenId: ordenId,
    lineas: [
      { concepto: CONCEPTO_CUBIERTO[orden.cobertura], claseContableId: orden.tipo_clase_contable_id, unidadNegocioId: orden.unidad_negocio_id, centroCostoId: centro, debito: cubierto },
      { concepto: 'COSTO_SERVICIO', claseContableId: orden.tipo_clase_contable_id, unidadNegocioId: orden.unidad_negocio_id, debito: noCubierto },
      { concepto: 'SRV_PROCESO', claseContableId: orden.tipo_clase_contable_id, unidadNegocioId: orden.unidad_negocio_id, credito: costo },
    ],
  });
  const facturada = estadoDeFase(estados, 'FACTURADA');
  await sql`update erp.srv_ordenes set estado = ${facturada.estado}, factura_id = ${facturaId}, asiento_cierre_id = ${asientoCierre},
              cobertura_fijada = true where id = ${ordenId}`.execute(trx);
  if (sesion && orden.caso_id) {
    await sql`update erp.srv_casos set estado = 'RESUELTO', solucion = coalesce(solucion, ${`Atendido con la orden de servicio ${orden.numero}`})
              where id = ${orden.caso_id} and estado in ('ABIERTO','EN_PROCESO','ESPERA_CLIENTE')`.execute(trx);
  }
  return { facturaId, asientoCierreId: asientoCierre };
}

// ---------------------------------------------------------------------------
// Estados y cobertura manual

export async function cambiarEstado(trx: Trx, ordenId: string, nuevo: number): Promise<void> {
  const orden = await cargarOrden(trx, ordenId, true);
  const estados = await estadosDe(trx, orden.tipo_documento_id);
  const destino = siguientesPermitidos(estados, orden.estado).find((e) => e.estado === nuevo);
  if (!destino) throw new ErrorNegocio(400, `No se puede pasar del estado ${orden.estado} al ${nuevo}.`);
  if (destino.fase === 'FACTURADA') throw new ErrorNegocio(400, 'Para facturar use la acción Facturar.');
  if (destino.fase === 'CANCELADA') {
    const mov = await sql<{ n: number }>`
      select (select count(*) from erp.srv_ordenes_horas where orden_id = ${ordenId})
           + (select count(*) from erp.srv_ordenes_consumos where orden_id = ${ordenId} and cantidad > 0 and not reversado)
           + (select count(*) from erp.srv_ordenes_terceros where orden_id = ${ordenId}) as n`.execute(trx);
    if (Number(mov.rows[0]!.n) > 0) {
      throw new ErrorNegocio(400, 'No se puede cancelar una orden con horas, consumos o terceros registrados; reverse primero los consumos.');
    }
  }
  await sql`update erp.srv_ordenes set estado = ${nuevo}, cobertura_fijada = ${destino.fase === 'REVISADA'} where id = ${ordenId}`.execute(trx);
}

export async function cambiarCobertura(trx: Trx, sesion: Sesion, ordenId: string, cobertura: Cobertura, motivo: string): Promise<void> {
  if (!(await tienePermiso(trx, sesion, 'srv-cobertura', 'MODIFICAR'))) {
    throw new ErrorNegocio(403, 'No tiene permiso para cambiar la cobertura de una orden.');
  }
  if (!motivo || motivo.trim().length < 5) throw new ErrorNegocio(400, 'Indique el motivo del cambio de cobertura.');
  const orden = await cargarOrden(trx, ordenId, true);
  if (orden.cobertura_fijada) throw new ErrorNegocio(400, 'La cobertura ya está fijada: la orden fue revisada para cobro.');
  let garantia: string | null = null;
  let linea: string | null = null;
  let contrato: string | null = null;
  if (cobertura === 'GARANTIA' || cobertura === 'CONTRATO') {
    const r = await determinarCobertura(trx, { tipoOrdenId: orden.tipo_orden_id, clienteId: orden.cliente_id, objetoId: orden.objeto_id, fecha: hoy() });
    if (cobertura === 'CONTRATO') {
      if (r.cobertura !== 'CONTRATO') throw new ErrorNegocio(400, 'El cliente no tiene un contrato vigente que cubra esta orden.');
      linea = r.contratoLineaId;
      contrato = r.contratoId;
    } else {
      garantia = r.garantiaObjetoId;
    }
  }
  await sql`update erp.srv_ordenes set cobertura = ${cobertura}, motivo_cobertura = ${motivo.trim()},
              garantia_objeto_id = ${garantia}, contrato_linea_id = ${linea}, contrato_id = coalesce(${contrato}, contrato_id)
            where id = ${ordenId}`.execute(trx);
}

// ---------------------------------------------------------------------------
// Lectura

export async function detalleOrden(trx: Trx, sesion: Sesion, ordenId: string) {
  const orden = await cargarOrden(trx, ordenId);
  const estados = await estadosDe(trx, orden.tipo_documento_id);
  const verSensibles = await tienePermiso(trx, sesion, 'srv-datos-sensibles', 'VER');
  const [cab, actividades, horas, consumos, terceros, campos, reclamo] = await Promise.all([
    sql`select o.id, o.numero, o.estado, o.cobertura, o.cobertura_fijada, o.motivo_cobertura, o.descripcion,
               o.fecha_solicitud, o.fecha_programada, o.campos, o.factura_id, o.caso_id, o.plantilla_id, o.unidad_negocio_id,
               o.tipo_orden_id, t.descripcion as tipo_orden, o.cliente_id, d.nombre as cliente, o.objeto_id,
               ob.descripcion as objeto, ob.serie as objeto_serie, p.descripcion as plantilla,
               f.establecimiento || '-' || f.punto_emision || '-' || lpad(f.secuencial::text, 9, '0') as factura,
               c.numero as caso_numero
        from erp.srv_ordenes o join erp.srv_tipos_orden t on t.id = o.tipo_orden_id
        join erp.mae_direcciones d on d.id = o.cliente_id
        left join erp.srv_objetos ob on ob.id = o.objeto_id
        left join erp.srv_plantillas p on p.id = o.plantilla_id
        left join erp.ven_facturas f on f.id = o.factura_id
        left join erp.srv_casos c on c.id = o.caso_id
        where o.id = ${ordenId}`.execute(trx),
    sql<{ horas_previstas: string | null; horas_reales: string } & Record<string, unknown>>`select a.id, a.linea, a.descripcion, a.perfil_id, pe.descripcion as perfil, a.personas, a.horas_previstas,
               coalesce(a.horas_reales, 0) as horas_reales, a.recurso_id, r.descripcion as recurso, a.facturable, a.precio_cerrado
        from erp.srv_ordenes_actividades a left join erp.srv_perfiles pe on pe.id = a.perfil_id
        left join erp.srv_recursos r on r.id = a.recurso_id where a.orden_id = ${ordenId} order by a.linea`.execute(trx),
    sql`select h.id, h.actividad_id, h.recurso_id, r.descripcion as recurso, h.fecha, h.inicio, h.fin, h.horas, h.costo_total
        from erp.srv_ordenes_horas h join erp.srv_recursos r on r.id = h.recurso_id
        where h.orden_id = ${ordenId} order by h.fecha, h.creado_en`.execute(trx),
    sql`select c.id, c.linea, c.articulo_id, a.codigo, a.descripcion, c.unidad, c.cantidad_prevista, c.cantidad,
               c.costo_unitario, c.facturable, c.reversado, c.unidad_negocio_id
        from erp.srv_ordenes_consumos c join erp.mae_articulos a on a.id = c.articulo_id
        where c.orden_id = ${ordenId} order by c.linea`.execute(trx),
    sql`select t.id, t.linea, t.descripcion, t.proveedor_id, d.nombre as proveedor, t.costo, t.precio, t.facturable
        from erp.srv_ordenes_terceros t left join erp.mae_direcciones d on d.id = t.proveedor_id
        where t.orden_id = ${ordenId} order by t.linea`.execute(trx),
    sql<{ campo: string; etiqueta: string; tipo_dato: string; obligatorio: boolean; sensible: boolean; catalogo_id: string | null }>`
        select campo, etiqueta, tipo_dato, obligatorio, sensible, catalogo_id from erp.srv_campos
        where tipo_orden_id = ${orden.tipo_orden_id} order by orden nulls last, campo`.execute(trx),
    sql`select id, numero, estado, monto_reclamado, monto_aprobado from erp.srv_reclamos
        where orden_id = ${ordenId} and estado <> 'RECHAZADO' limit 1`.execute(trx),
  ]);
  const cabecera = cab.rows[0] as Record<string, unknown>;
  const defs = campos.rows.filter((c) => verSensibles || !c.sensible);
  if (!verSensibles) {
    const valores = { ...((cabecera.campos as Record<string, unknown>) ?? {}) };
    for (const c of campos.rows) if (c.sensible) delete valores[c.campo];
    cabecera.campos = valores;
  }
  const costoReal = [
    ...horas.rows.map((h) => D((h as { costo_total: string }).costo_total)),
    ...consumos.rows.filter((c) => !(c as { reversado: boolean }).reversado).map((c) => D((c as { cantidad: string }).cantidad).times(D((c as { costo_unitario: string | null }).costo_unitario))),
    ...terceros.rows.map((t) => D((t as { costo: string }).costo)),
  ].reduce((s, v) => s.plus(v), D(0));
  return {
    orden: cabecera,
    fase: faseDe(estados, orden.estado),
    estados,
    siguientes: siguientesPermitidos(estados, orden.estado),
    actividades: actividades.rows,
    horas: horas.rows,
    consumos: consumos.rows,
    terceros: terceros.rows,
    camposDefinicion: defs,
    reclamo: reclamo.rows[0] ?? null,
    resumen: {
      horasPrevistas: actividades.rows.reduce((s: Decimal, a) => s.plus(a.horas_previstas ?? 0), D(0)).toFixed(2),
      horasReales: actividades.rows.reduce((s: Decimal, a) => s.plus(a.horas_reales), D(0)).toFixed(2),
      costoReal: costoReal.toDecimalPlaces(2).toFixed(2),
    },
  };
}

/** Actualiza datos generales y campos propios; los sensibles solo los cambia quien tiene permiso. */
export async function actualizarOrden(
  trx: Trx,
  sesion: Sesion,
  ordenId: string,
  d: { descripcion?: string | null; fechaProgramada?: string | null; campos?: Record<string, unknown> },
): Promise<void> {
  const orden = await cargarOrden(trx, ordenId, true);
  const fase = await faseActual(trx, orden);
  if (fase === 'FACTURADA' || fase === 'CERRADA' || fase === 'CANCELADA') throw new ErrorNegocio(400, 'La orden ya no se puede modificar.');
  let campos = orden.campos ?? {};
  if (d.campos) {
    const verSensibles = await tienePermiso(trx, sesion, 'srv-datos-sensibles', 'MODIFICAR');
    const defs = await sql<{ campo: string; sensible: boolean }>`select campo, sensible from erp.srv_campos where tipo_orden_id = ${orden.tipo_orden_id}`.execute(trx);
    const entrada = { ...d.campos };
    for (const def of defs.rows) if (def.sensible && !verSensibles) entrada[def.campo] = campos[def.campo];
    campos = await validarCampos(trx, orden.tipo_orden_id, { ...campos, ...entrada });
  }
  await sql`update erp.srv_ordenes set descripcion = coalesce(${d.descripcion ?? null}, descripcion),
              fecha_programada = coalesce(${d.fechaProgramada ?? null}::timestamptz, fecha_programada),
              campos = ${JSON.stringify(campos)}::jsonb where id = ${ordenId}`.execute(trx);
}
