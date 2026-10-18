import { conTransaccion, sql } from '@erp/db';
import { altaSuscriptor, cabeceras, type Entorno } from './ayudas.js';

export type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function herramientas(e: () => Entorno) {
  async function llamar(correo: string, metodo: 'GET' | 'POST' | 'PUT', url: string, payload?: object) {
    const r = await e().app.inject({ method: metodo, url, headers: cabeceras(correo), payload });
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
  async function saldo(suscriptorId: string, cuenta: string): Promise<number> {
    return conTransaccion(e().db, { suscriptorId, usuario: 'prueba' }, async (trx) => {
      const r = await sql<{ s: string }>`select coalesce(sum(sa.debitos - sa.creditos), 0) as s
        from erp.con_saldos sa join erp.con_cuentas c on c.id = sa.cuenta_id where c.codigo = ${cuenta}`.execute(trx);
      return Number(r.rows[0]!.s);
    });
  }
  async function cuadra(suscriptorId: string): Promise<boolean> {
    return conTransaccion(e().db, { suscriptorId, usuario: 'prueba' }, async (trx) => {
      const r = await sql<{ d: string; c: string }>`select sum(debito) as d, sum(credito) as c from erp.con_asientos_lineas`.execute(trx);
      return r.rows[0]!.d === r.rows[0]!.c;
    });
  }
  async function existencia(suscriptorId: string, articuloId: string): Promise<{ enMano: number; comprometido: number }> {
    return conTransaccion(e().db, { suscriptorId, usuario: 'prueba' }, async (trx) => {
      const r = await sql<{ en_mano: string; comprometido: string }>`
        select coalesce(sum(en_mano), 0) as en_mano, coalesce(sum(comprometido), 0) as comprometido from erp.inv_saldos where articulo_id = ${articuloId}`.execute(trx);
      return { enMano: Number(r.rows[0]!.en_mano), comprometido: Number(r.rows[0]!.comprometido) };
    });
  }

  /** Suscriptor con proveedor, cliente, artículos, lista de precios, cuenta bancaria y condición de pago a 30 días. */
  async function preparar(prefijo: string) {
    const a = await altaSuscriptor(e().app, prefijo);
    const c = a.correo;
    const bodegaId = await idDe(c, 'unidades-negocio', '');
    const usd = await idDe(c, 'monedas', 'codigo=USD');
    const iva15 = await idDe(c, 'impuestos', 'codigo=IVA15');
    const credito30 = await idDe(c, 'condiciones-pago', 'codigo=30D');
    const clase = (codigo: string) => idDe(c, 'clases-contables', `codigo=${codigo}`);
    const filtro = await ok(c, 'POST', '/api/e/articulos', {
      codigo: 'FILTRO', descripcion: 'Filtro de aceite', tipo_existencia: 'INVENTARIABLE', unidad_primaria: 'UN', impuesto_id: iva15, clase_contable_id: await clase('ART-INV'),
    });
    const servicio = await ok(c, 'POST', '/api/e/articulos', {
      codigo: 'MANT', descripcion: 'Mantenimiento de equipos', tipo_existencia: 'SERVICIO', unidad_primaria: 'SV', impuesto_id: iva15, clase_contable_id: await clase('ART-SERV'),
    });
    const prov = await ok(c, 'POST', '/api/e/direcciones', { nombre: 'Distribuidora Andina', tipo_identificacion: 'RUC', identificacion: '1891234567001', tipo_busqueda: 'V' });
    await ok(c, 'POST', '/api/e/proveedores', {
      direccion_id: prov.id, compania_id: a.companiaId, condicion_pago_id: credito30, clase_contable_id: await clase('PRO-LOCAL'),
      codigo_ret_renta: '312', codigo_ret_iva: '1',
    });
    const lista = await ok(c, 'POST', '/api/e/listas-precios', { codigo: 'PVP', descripcion: 'Precio público', moneda_id: usd });
    await ok(c, 'POST', '/api/e/precios', { lista_precios_id: lista.id, articulo_id: filtro.id, unidad: 'UN', vigente_desde: '2024-01-01', precio: '25' });
    await ok(c, 'POST', '/api/e/precios', { lista_precios_id: lista.id, articulo_id: servicio.id, unidad: 'SV', vigente_desde: '2024-01-01', precio: '80' });
    const cli = await ok(c, 'POST', '/api/e/direcciones', { nombre: 'Industrias del Valle', tipo_identificacion: 'RUC', identificacion: '1890011223001', tipo_busqueda: 'C' });
    await ok(c, 'POST', '/api/e/clientes', {
      direccion_id: cli.id, compania_id: a.companiaId, lista_precios_id: lista.id, condicion_pago_id: credito30, clase_contable_id: await clase('CLI-LOCAL'),
    });
    const banco = await ok(c, 'POST', '/api/e/direcciones', { nombre: 'Banco del Pacífico', tipo_identificacion: 'RUC', identificacion: '0990005737001', tipo_busqueda: 'B' });
    const cuenta = await idDe(c, 'cuentas', 'codigo=1.1.01');
    const cb = await ok(c, 'POST', '/api/e/cuentas-bancarias', {
      compania_id: a.companiaId, codigo: 'PAC-CTE', banco_id: banco.id, numero: '1234567890', tipo: 'CORRIENTE', moneda_id: usd, cuenta_id: cuenta,
    });
    return {
      correo: c, suscriptorId: a.suscriptorId, companiaId: a.companiaId, bodegaId, iva15, credito30,
      filtroId: filtro.id as string, servicioId: servicio.id as string, proveedorId: prov.id as string, clienteId: cli.id as string,
      cuentaBancariaId: cb.id as string,
    };
  }
  return { llamar, ok, idDe, saldo, cuadra, existencia, preparar };
}
