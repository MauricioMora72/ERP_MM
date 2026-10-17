import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { conTransaccion, sql } from '@erp/db';
import { altaSuscriptor, cabeceras, levantar, type Entorno } from './ayudas.js';

let e: Entorno;
beforeAll(async () => {
  e = await levantar();
});
afterAll(async () => {
  await e.app.close();
  await e.db.destroy();
});

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function llamar(correo: string, metodo: 'GET' | 'POST' | 'PUT', url: string, payload?: object, compania?: string) {
  const r = await e.app.inject({ method: metodo, url, headers: cabeceras(correo, compania), payload });
  return { estado: r.statusCode, json: (r.body ? r.json() : null) as Json };
}
async function ok(correo: string, metodo: 'GET' | 'POST' | 'PUT', url: string, payload?: object): Promise<Json> {
  const r = await llamar(correo, metodo, url, payload);
  if (r.estado >= 300) throw new Error(`${metodo} ${url} -> ${r.estado} ${JSON.stringify(r.json)}`);
  return r.json;
}
async function idDe(correo: string, entidad: string, filtro: string): Promise<string> {
  const r = await ok(correo, 'GET', `/api/e/${entidad}?${filtro}`);
  if (!r.filas[0]) throw new Error(`No hay ${entidad} con ${filtro}`);
  return r.filas[0].id;
}

interface Escenario {
  correo: string;
  suscriptorId: string;
  companiaId: string;
  bodegaId: string;
  clienteId: string;
  proveedorId: string;
  recursoId: string;
}

/** Suscriptor con la plantilla de mantenimiento, un cliente con lista de precios, un técnico y existencias. */
async function preparar(prefijo: string): Promise<Escenario> {
  const a = await altaSuscriptor(e.app, prefijo);
  const c = a.correo;
  await ok(c, 'POST', '/api/srv/industrias/MANTENIMIENTO/aplicar');
  const bodegaId = await idDe(c, 'unidades-negocio', '');
  const usd = await idDe(c, 'monedas', 'codigo=USD');
  const lista = await ok(c, 'POST', '/api/e/listas-precios', { codigo: 'PVP', descripcion: 'Precio público', moneda_id: usd });
  for (const [art, precio] of [['FILTRO-AIRE', '20'], ['ACEITE-LT', '6']] as const) {
    await ok(c, 'POST', '/api/e/precios', { lista_precios_id: lista.id, articulo_id: await idDe(c, 'articulos', `codigo=${art}`), unidad: art === 'ACEITE-LT' ? 'LT' : 'UN', vigente_desde: '2024-01-01', precio });
  }
  const cliente = await ok(c, 'POST', '/api/e/direcciones', { nombre: 'Industrias Andinas', tipo_identificacion: 'RUC', identificacion: '1891234567001', tipo_busqueda: 'C' });
  await ok(c, 'POST', '/api/e/clientes', {
    direccion_id: cliente.id, compania_id: a.companiaId, lista_precios_id: lista.id,
    clase_contable_id: await idDe(c, 'clases-contables', 'codigo=CLI-LOCAL'),
  });
  const proveedor = await ok(c, 'POST', '/api/e/direcciones', { nombre: 'Compresores del Pacífico', tipo_identificacion: 'RUC', identificacion: '0991234567001', tipo_busqueda: 'V' });
  const recurso = await ok(c, 'POST', '/api/e/recursos', { codigo: 'TEC1', descripcion: 'Técnico Juan', tipo: 'PERSONA' });
  await ok(c, 'POST', '/api/inventario/ajustes', { unidadNegocioId: bodegaId, articuloId: await idDe(c, 'articulos', 'codigo=FILTRO-AIRE'), cantidad: 10, costoUnitario: '12' });
  await ok(c, 'POST', '/api/inventario/ajustes', { unidadNegocioId: bodegaId, articuloId: await idDe(c, 'articulos', 'codigo=ACEITE-LT'), cantidad: 20, costoUnitario: '3.50' });
  return { correo: c, suscriptorId: a.suscriptorId, companiaId: a.companiaId, bodegaId, clienteId: cliente.id, proveedorId: proveedor.id, recursoId: recurso.id };
}

async function saldo(s: Escenario, cuenta: string): Promise<number> {
  return conTransaccion(e.db, { suscriptorId: s.suscriptorId, usuario: 'prueba' }, async (trx) => {
    const r = await sql<{ s: string }>`select coalesce(sum(sa.debitos - sa.creditos), 0) as s
      from erp.con_saldos sa join erp.con_cuentas c on c.id = sa.cuenta_id where c.codigo = ${cuenta}`.execute(trx);
    return Number(r.rows[0]!.s);
  });
}
async function sumasCuadran(s: Escenario): Promise<boolean> {
  return conTransaccion(e.db, { suscriptorId: s.suscriptorId, usuario: 'prueba' }, async (trx) => {
    const r = await sql<{ d: string; c: string }>`select sum(debito) as d, sum(credito) as c from erp.con_asientos_lineas`.execute(trx);
    return r.rows[0]!.d === r.rows[0]!.c;
  });
}
async function llevarARevision(s: Escenario, ordenId: string) {
  let d = await ok(s.correo, 'GET', `/api/srv/ordenes/${ordenId}`);
  while (d.fase !== 'REVISADA') {
    const sig = d.siguientes.find((x: Json) => x.fase !== 'CANCELADA' && x.estado > d.orden.estado);
    await ok(s.correo, 'POST', `/api/srv/ordenes/${ordenId}/estado`, { estado: sig.estado });
    d = await ok(s.correo, 'GET', `/api/srv/ordenes/${ordenId}`);
  }
}

describe('Orden facturable con tempario', () => {
  it('copia el tempario, registra horas y consumos, factura y deja los asientos cuadrados', async () => {
    const s = await preparar('fact');
    const objeto = await ok(s.correo, 'POST', '/api/e/objetos', { codigo: 'EQ-1', descripcion: 'Compresor planta 1', tipo_objeto: 'EQUIPO', cliente_id: s.clienteId });
    const tipo = await idDe(s.correo, 'tipos-orden', 'codigo=PREVENTIVO');
    const { id } = await ok(s.correo, 'POST', '/api/srv/ordenes', { tipoOrdenId: tipo, clienteId: s.clienteId, objetoId: objeto.id, campos: { horometro: 1200 } });
    let d = await ok(s.correo, 'GET', `/api/srv/ordenes/${id}`);
    expect(d.orden.cobertura).toBe('FACTURABLE');
    expect(d.actividades).toHaveLength(2);
    expect(d.consumos).toHaveLength(2);
    expect(d.consumos.map((c: Json) => Number(c.cantidad_prevista))).toEqual([1, 2]);

    await ok(s.correo, 'POST', `/api/srv/ordenes/${id}/horas`, { actividadId: d.actividades[0].id, recursoId: s.recursoId, horas: '1.5' });
    await ok(s.correo, 'POST', `/api/srv/ordenes/${id}/horas`, { actividadId: d.actividades[1].id, recursoId: s.recursoId, inicio: '2026-10-17T09:00:00-05:00', fin: '2026-10-17T10:00:00-05:00' });
    for (const c of d.consumos) await ok(s.correo, 'POST', `/api/srv/ordenes/${id}/consumos`, { consumoId: c.id });
    d = await ok(s.correo, 'GET', `/api/srv/ordenes/${id}`);
    expect(d.fase).toBe('EJECUCION');
    expect(d.resumen.costoReal).toBe('39.00');

    await llevarARevision(s, id);
    const pre = await ok(s.correo, 'GET', `/api/srv/ordenes/${id}/prefactura`);
    expect(pre.totales.subtotal).toBe('94.50');
    expect(pre.totales.impuestos).toBe('14.18');
    expect(pre.totales.totalCliente).toBe('108.68');
    expect(pre.advertencias).toEqual([]);

    const f = await ok(s.correo, 'POST', `/api/srv/ordenes/${id}/facturar`);
    expect(f.facturaId).toBeTruthy();
    const factura = await ok(s.correo, 'GET', `/api/e/facturas/${f.facturaId}`);
    expect(factura.total).toBe('108.68');
    d = await ok(s.correo, 'GET', `/api/srv/ordenes/${id}`);
    expect(d.fase).toBe('FACTURADA');

    expect(await sumasCuadran(s)).toBe(true);
    expect(await saldo(s, '1.1.05')).toBe(0); // servicios en proceso queda en cero
    expect(await saldo(s, '5.1.01')).toBe(39); // costo de servicios prestados
    expect(await saldo(s, '4.1.01')).toBe(-62.5); // ingresos por servicios (acreedor)
    expect(await saldo(s, '4.1.02')).toBe(-32); // ingresos por materiales
    expect(await saldo(s, '1.1.02')).toBe(108.68); // clientes
    expect(await saldo(s, '1.1.04')).toBe(120 + 70 - 19); // inventario: entradas menos consumos

    const kardex = await ok(s.correo, 'GET', '/api/e/kardex');
    expect(kardex.total).toBe(4);
    const enviar = await llamar(s.correo, 'POST', `/api/srv/ordenes/${id}/horas`, { actividadId: d.actividades[0].id, recursoId: s.recursoId, horas: 1 });
    expect(enviar.estado).toBe(400);
  });
});

describe('Garantías y reclamos al fabricante', () => {
  it('una orden en garantía no se factura, va a gasto de garantías y el reclamo aprobado recupera el monto', async () => {
    const s = await preparar('gar');
    const equipo = await ok(s.correo, 'POST', '/api/e/articulos', {
      codigo: 'COMPRESOR-X', descripcion: 'Compresor modelo X', tipo_existencia: 'NO_INVENTARIABLE', unidad_primaria: 'UN',
      clase_contable_id: await idDe(s.correo, 'clases-contables', 'codigo=ART-INV'),
    });
    await ok(s.correo, 'POST', '/api/e/garantias', { codigo: 'G-COMP', descripcion: 'Garantía de compresores', articulo_id: equipo.id, meses: 12, respaldo_fabricante: true });
    const objeto = await ok(s.correo, 'POST', '/api/e/objetos', {
      codigo: 'EQ-2', descripcion: 'Compresor vendido', tipo_objeto: 'EQUIPO', cliente_id: s.clienteId,
      articulo_origen_id: equipo.id, fecha_venta: new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), fabricante_id: s.proveedorId,
    });
    const garantias = await ok(s.correo, 'GET', `/api/e/garantias-objeto?objeto_id=${objeto.id}`);
    expect(garantias.total).toBe(1);

    const tipo = await idDe(s.correo, 'tipos-orden', 'codigo=CORRECTIVO');
    const sinCampo = await llamar(s.correo, 'POST', '/api/srv/ordenes', { tipoOrdenId: tipo, clienteId: s.clienteId, objetoId: objeto.id });
    expect(sinCampo.estado).toBe(400);
    expect(sinCampo.json.campos['campos.falla_reportada']).toBeDefined();
    const { id } = await ok(s.correo, 'POST', '/api/srv/ordenes', { tipoOrdenId: tipo, clienteId: s.clienteId, objetoId: objeto.id, campos: { falla_reportada: 'No arranca' } });
    let d = await ok(s.correo, 'GET', `/api/srv/ordenes/${id}`);
    expect(d.orden.cobertura).toBe('GARANTIA');

    const perfil = await idDe(s.correo, 'perfiles', 'codigo=TEC-ELECTRICO');
    const act = await ok(s.correo, 'POST', `/api/srv/ordenes/${id}/actividades`, { descripcion: 'Cambio de arrancador', perfilId: perfil, horasPrevistas: 2 });
    await ok(s.correo, 'POST', `/api/srv/ordenes/${id}/horas`, { actividadId: act.id, recursoId: s.recursoId, horas: 2 });
    await ok(s.correo, 'POST', `/api/srv/ordenes/${id}/consumos`, { articuloId: await idDe(s.correo, 'articulos', 'codigo=FILTRO-AIRE'), cantidad: 1 });
    await llevarARevision(s, id);
    const pre = await ok(s.correo, 'GET', `/api/srv/ordenes/${id}/prefactura`);
    expect(pre.totales.totalCliente).toBe('0.00');
    expect(pre.totales.costoCubierto).toBe('28.00');
    const f = await ok(s.correo, 'POST', `/api/srv/ordenes/${id}/facturar`);
    expect(f.facturaId).toBeNull();
    expect(await saldo(s, '5.1.03')).toBe(28);
    expect(await saldo(s, '5.1.01')).toBe(0);

    const reclamo = await ok(s.correo, 'POST', `/api/srv/ordenes/${id}/reclamo`, {});
    const lista = await ok(s.correo, 'GET', '/api/srv/reclamos');
    expect(lista[0].monto_reclamado).toBe('28.00');
    const saltar = await llamar(s.correo, 'POST', `/api/srv/reclamos/${reclamo.id}/estado`, { estado: 'APROBADO' });
    expect(saltar.estado).toBe(400);
    await ok(s.correo, 'POST', `/api/srv/reclamos/${reclamo.id}/estado`, { estado: 'ENVIADO', referencia: 'RMA-551' });
    await ok(s.correo, 'POST', `/api/srv/reclamos/${reclamo.id}/estado`, { estado: 'APROBADO', montoAprobado: '20' });
    expect(await saldo(s, '1.1.03')).toBe(20);
    expect(await saldo(s, '5.1.03')).toBe(8);
    expect(await sumasCuadran(s)).toBe(true);
  });

  it('una garantía que cubre solo mano de obra factura los materiales al cliente', async () => {
    const s = await preparar('garp');
    const equipo = await ok(s.correo, 'POST', '/api/e/articulos', {
      codigo: 'BOMBA', descripcion: 'Bomba', tipo_existencia: 'NO_INVENTARIABLE', unidad_primaria: 'UN',
      clase_contable_id: await idDe(s.correo, 'clases-contables', 'codigo=ART-INV'),
    });
    await ok(s.correo, 'POST', '/api/e/garantias', { codigo: 'G-MO', descripcion: 'Solo mano de obra', articulo_id: equipo.id, meses: 6, pct_mano_obra: '100', pct_materiales: '0' });
    const objeto = await ok(s.correo, 'POST', '/api/e/objetos', { codigo: 'EQ-3', descripcion: 'Bomba', tipo_objeto: 'EQUIPO', cliente_id: s.clienteId, articulo_origen_id: equipo.id, fecha_venta: new Date().toISOString().slice(0, 10) });
    const { id } = await ok(s.correo, 'POST', '/api/srv/ordenes', { tipoOrdenId: await idDe(s.correo, 'tipos-orden', 'codigo=CORRECTIVO'), clienteId: s.clienteId, objetoId: objeto.id, campos: { falla_reportada: 'Fuga' } });
    const act = await ok(s.correo, 'POST', `/api/srv/ordenes/${id}/actividades`, { descripcion: 'Revisión', perfilId: await idDe(s.correo, 'perfiles', 'codigo=TEC-MECANICO') });
    await ok(s.correo, 'POST', `/api/srv/ordenes/${id}/horas`, { actividadId: act.id, recursoId: s.recursoId, horas: 1 });
    await ok(s.correo, 'POST', `/api/srv/ordenes/${id}/consumos`, { articuloId: await idDe(s.correo, 'articulos', 'codigo=FILTRO-AIRE'), cantidad: 1 });
    const pre = await ok(s.correo, 'GET', `/api/srv/ordenes/${id}/prefactura`);
    expect(pre.totales.baseCliente).toBe('20.00'); // solo el filtro
    expect(pre.totales.cubierto).toBe('25.00'); // la hora de mano de obra
  });
});

describe('Contratos', () => {
  it('un contrato al 80 % factura el 20 % como copago y reparte el costo', async () => {
    const s = await preparar('ctr');
    const tipo = await idDe(s.correo, 'tipos-orden', 'codigo=CORRECTIVO');
    const contrato = await ok(s.correo, 'POST', '/api/e/contratos', { compania_id: s.companiaId, numero: 1, cliente_id: s.clienteId, fecha_inicio: '2026-01-01', frecuencia: 'MENSUAL' });
    await ok(s.correo, 'POST', '/api/e/contratos-lineas', {
      contrato_id: contrato.id, linea: 1, articulo_id: await idDe(s.correo, 'articulos', 'codigo=MO-GENERAL'), precio: '100',
      tipo_orden_id: tipo, pct_mano_obra: '80', pct_materiales: '80',
    });
    const { id } = await ok(s.correo, 'POST', '/api/srv/ordenes', { tipoOrdenId: tipo, clienteId: s.clienteId, campos: { falla_reportada: 'Ruido' } });
    const d = await ok(s.correo, 'GET', `/api/srv/ordenes/${id}`);
    expect(d.orden.cobertura).toBe('CONTRATO');
    const act = await ok(s.correo, 'POST', `/api/srv/ordenes/${id}/actividades`, { descripcion: 'Ajuste', perfilId: await idDe(s.correo, 'perfiles', 'codigo=TEC-MECANICO') });
    await ok(s.correo, 'POST', `/api/srv/ordenes/${id}/horas`, { actividadId: act.id, recursoId: s.recursoId, horas: 1 });
    await llevarARevision(s, id);
    const pre = await ok(s.correo, 'GET', `/api/srv/ordenes/${id}/prefactura`);
    expect(pre.totales.baseCliente).toBe('5.00');
    expect(pre.totales.totalCliente).toBe('5.75');
    await ok(s.correo, 'POST', `/api/srv/ordenes/${id}/facturar`);
    expect(await saldo(s, '5.1.02')).toBe(6.4);
    expect(await saldo(s, '5.1.01')).toBe(1.6);
  });

  it('los preventivos generan una orden por período y nunca la repiten', async () => {
    const s = await preparar('prev');
    const contrato = await ok(s.correo, 'POST', '/api/e/contratos', { compania_id: s.companiaId, numero: 7, cliente_id: s.clienteId, fecha_inicio: '2026-01-01', frecuencia: 'MENSUAL' });
    const hace2 = new Date();
    hace2.setUTCMonth(hace2.getUTCMonth() - 2);
    await ok(s.correo, 'POST', '/api/e/preventivos', {
      contrato_id: contrato.id, tipo_orden_id: await idDe(s.correo, 'tipos-orden', 'codigo=PREVENTIVO'), frecuencia_meses: 1, proxima_fecha: hace2.toISOString().slice(0, 10),
    });
    const r1 = await ok(s.correo, 'POST', '/api/srv/preventivos/generar');
    expect(r1.generadas).toBe(3);
    const r2 = await ok(s.correo, 'POST', '/api/srv/preventivos/generar');
    expect(r2.generadas).toBe(0);
    const ordenes = await ok(s.correo, 'GET', '/api/srv/ordenes');
    expect(ordenes).toHaveLength(3);
  });
});

describe('Controles', () => {
  it('cambiar la cobertura exige permiso y motivo, y el consumo sin existencia se rechaza', async () => {
    const s = await preparar('ctl');
    const tipo = await idDe(s.correo, 'tipos-orden', 'codigo=INSTALACION');
    const { id } = await ok(s.correo, 'POST', '/api/srv/ordenes', { tipoOrdenId: tipo, clienteId: s.clienteId });

    const rol = await ok(s.correo, 'POST', '/api/e/roles', { codigo: 'TECNICO', descripcion: 'Técnico' });
    await ok(s.correo, 'POST', '/api/e/permisos', { rol_id: rol.id, recurso: 'srv-ordenes', accion: '*' });
    const correoTec = `tecnico.${s.suscriptorId.slice(0, 8)}@prueba.ec`;
    const u = await ok(s.correo, 'POST', '/api/e/usuarios', { firebase_uid: correoTec, correo: correoTec, nombre: 'Técnico', compania_defecto_id: s.companiaId });
    await ok(s.correo, 'POST', '/api/e/usuarios-roles', { usuario_id: u.id, rol_id: rol.id });

    const sinPermiso = await llamar(correoTec, 'POST', `/api/srv/ordenes/${id}/cobertura`, { cobertura: 'INTERNO', motivo: 'Equipo propio de la empresa' });
    expect(sinPermiso.estado).toBe(403);
    const sinMotivo = await llamar(s.correo, 'POST', `/api/srv/ordenes/${id}/cobertura`, { cobertura: 'INTERNO', motivo: '' });
    expect(sinMotivo.estado).toBe(400);
    await ok(s.correo, 'POST', `/api/srv/ordenes/${id}/cobertura`, { cobertura: 'INTERNO', motivo: 'Equipo propio de la empresa' });
    const d = await ok(s.correo, 'GET', `/api/srv/ordenes/${id}`);
    expect(d.orden.cobertura).toBe('INTERNO');
    expect(d.orden.motivo_cobertura).toBe('Equipo propio de la empresa');

    const sinStock = await llamar(s.correo, 'POST', `/api/srv/ordenes/${id}/consumos`, { articuloId: await idDe(s.correo, 'articulos', 'codigo=KIT-MANT'), cantidad: 1 });
    expect(sinStock.estado).toBe(400);
    expect(sinStock.json.error).toMatch(/existencia/);

    const consumo = await ok(s.correo, 'POST', `/api/srv/ordenes/${id}/consumos`, { articuloId: await idDe(s.correo, 'articulos', 'codigo=FILTRO-AIRE'), cantidad: 2 });
    const cancelar = await llamar(s.correo, 'POST', `/api/srv/ordenes/${id}/estado`, { estado: 99 });
    expect(cancelar.estado).toBe(400);
    await ok(s.correo, 'POST', `/api/srv/ordenes/${id}/consumos/${consumo.id}/reversar`);
    expect(await saldo(s, '1.1.04')).toBe(190);
    expect(await saldo(s, '1.1.05')).toBe(0);

    const soloLectura = await llamar(s.correo, 'POST', '/api/e/kardex', {});
    expect(soloLectura.estado).toBe(405);
  });

  it('la agenda no permite dos reservas del mismo recurso en el mismo horario', async () => {
    const s = await preparar('age');
    await ok(s.correo, 'POST', '/api/e/agenda', { recurso_id: s.recursoId, inicio: '2026-11-02T09:00', fin: '2026-11-02T10:00' });
    const choque = await llamar(s.correo, 'POST', '/api/e/agenda', { recurso_id: s.recursoId, inicio: '2026-11-02T09:30', fin: '2026-11-02T10:30' });
    expect(choque.estado).toBe(409);
    await ok(s.correo, 'POST', '/api/e/agenda', { recurso_id: s.recursoId, inicio: '2026-11-02T10:00', fin: '2026-11-02T11:00' });
  });
});

describe('Mesa de ayuda y área médica', () => {
  it('un caso de prioridad alta calcula su compromiso y genera una orden ligada', async () => {
    const s = await preparar('mda');
    const caso = await ok(s.correo, 'POST', '/api/srv/casos', { clienteId: s.clienteId, prioridad: 'ALTA', canal: 'TEL', tipo: 'INCIDENTE', asunto: 'Compresor detenido' });
    let d = await ok(s.correo, 'GET', `/api/srv/casos/${caso.id}`);
    const horas = (Date.parse(d.caso.fecha_compromiso) - Date.parse(d.caso.fecha_apertura)) / 3_600_000;
    expect(Math.round(horas)).toBe(4);
    await ok(s.correo, 'POST', `/api/srv/casos/${caso.id}/notas`, { nota: 'Cliente indica que se apagó solo' });
    const orden = await ok(s.correo, 'POST', `/api/srv/casos/${caso.id}/orden`, { tipoOrdenId: await idDe(s.correo, 'tipos-orden', 'codigo=INSTALACION') });
    d = await ok(s.correo, 'GET', `/api/srv/casos/${caso.id}`);
    expect(d.caso.estado).toBe('EN_PROCESO');
    expect(d.ordenes[0].id).toBe(orden.id);
    expect(d.notas).toHaveLength(1);
    const otra = await llamar(s.correo, 'POST', `/api/srv/casos/${caso.id}/orden`, { tipoOrdenId: await idDe(s.correo, 'tipos-orden', 'codigo=INSTALACION') });
    expect(otra.estado).toBe(409);
    const resolverSinSolucion = await llamar(s.correo, 'POST', `/api/srv/casos/${caso.id}/estado`, { estado: 'RESUELTO' });
    expect(resolverSinSolucion.estado).toBe(400);
  });

  it('los campos sensibles solo los ve quien tiene permiso de datos sensibles', async () => {
    const a = await altaSuscriptor(e.app, 'med');
    await ok(a.correo, 'POST', '/api/srv/industrias/SALUD/aplicar');
    const paciente = await ok(a.correo, 'POST', '/api/e/direcciones', { nombre: 'Paciente Ana', tipo_identificacion: 'CED', identificacion: '1801111111', tipo_busqueda: 'C' });
    const { id } = await ok(a.correo, 'POST', '/api/srv/ordenes', {
      tipoOrdenId: await idDe(a.correo, 'tipos-orden', 'codigo=CONSULTA-MED'), clienteId: paciente.id,
      campos: { historia_clinica: 'HC-1001', diagnostico: 'Diagnóstico de prueba', alergias: 'Penicilina' },
    });
    const admin = await ok(a.correo, 'GET', `/api/srv/ordenes/${id}`);
    expect(admin.orden.campos.diagnostico).toBe('Diagnóstico de prueba');

    const rol = await ok(a.correo, 'POST', '/api/e/roles', { codigo: 'RECEPCION', descripcion: 'Recepción' });
    await ok(a.correo, 'POST', '/api/e/permisos', { rol_id: rol.id, recurso: 'srv-ordenes', accion: '*' });
    const correoRec = `recepcion.${a.suscriptorId.slice(0, 8)}@prueba.ec`;
    const u = await ok(a.correo, 'POST', '/api/e/usuarios', { firebase_uid: correoRec, correo: correoRec, nombre: 'Recepción', compania_defecto_id: a.companiaId });
    await ok(a.correo, 'POST', '/api/e/usuarios-roles', { usuario_id: u.id, rol_id: rol.id });
    const rec = await ok(correoRec, 'GET', `/api/srv/ordenes/${id}`);
    expect(rec.orden.campos.historia_clinica).toBe('HC-1001');
    expect(rec.orden.campos.diagnostico).toBeUndefined();
    expect(rec.camposDefinicion.map((c: Json) => c.campo)).not.toContain('alergias');

    // Recepción actualiza un dato no sensible y el diagnóstico se conserva.
    await ok(correoRec, 'PUT', `/api/srv/ordenes/${id}`, { campos: { aseguradora: 'Seguro X', diagnostico: '' } });
    const despues = await ok(a.correo, 'GET', `/api/srv/ordenes/${id}`);
    expect(despues.orden.campos.diagnostico).toBe('Diagnóstico de prueba');
    expect(despues.orden.campos.aseguradora).toBe('Seguro X');
  });
});
