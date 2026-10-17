import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { conTransaccion, siguienteNumero, sql } from '@erp/db';
import { altaSuscriptor, cabeceras, levantar, type Entorno } from './ayudas.js';

let e: Entorno;

beforeAll(async () => {
  e = await levantar();
});
afterAll(async () => {
  await e.app.close();
  await e.db.destroy();
});

async function crear(correo: string, entidad: string, payload: object) {
  return e.app.inject({ method: 'POST', url: `/api/e/${entidad}`, headers: cabeceras(correo), payload });
}

async function primerId(correo: string, entidad: string, filtro = ''): Promise<string> {
  const r = await e.app.inject({ method: 'GET', url: `/api/e/${entidad}${filtro}`, headers: cabeceras(correo) });
  return (r.json() as { filas: { id: string }[] }).filas[0]!.id;
}

describe('Alta de suscriptor', () => {
  it('crea el suscriptor con su compañía, sucursal, datos base y administrador', async () => {
    const a = await altaSuscriptor(e.app, 'alta');
    const r = await e.app.inject({ method: 'GET', url: '/api/sesion', headers: cabeceras(a.correo) });
    expect(r.statusCode).toBe(200);
    const sesion = r.json();
    expect(sesion.companias).toHaveLength(1);
    expect(sesion.companiaId).toBe(a.companiaId);
    expect(sesion.permisos).toContainEqual({ recurso: '*', accion: '*' });

    const un = await e.app.inject({ method: 'GET', url: '/api/e/unidades-negocio', headers: cabeceras(a.correo) });
    expect(un.json().total).toBe(1);
    const um = await e.app.inject({ method: 'GET', url: '/api/catalogos/MAE/UM', headers: cabeceras(a.correo) });
    expect(um.json().map((v: { codigo: string }) => v.codigo)).toContain('HR');
  });

  it('pide alta a un usuario que todavía no pertenece a ningún suscriptor', async () => {
    const r = await e.app.inject({ method: 'GET', url: '/api/sesion', headers: cabeceras('nuevo@prueba.ec') });
    expect(r.statusCode).toBe(404);
    expect(r.json().necesitaAlta).toBe(true);
  });

  it('rechaza peticiones sin sesión', async () => {
    const r = await e.app.inject({ method: 'GET', url: '/api/e/articulos' });
    expect(r.statusCode).toBe(401);
  });
});

describe('Aislamiento entre suscriptores', () => {
  it('un suscriptor no puede leer, modificar ni referenciar datos de otro', async () => {
    const a = await altaSuscriptor(e.app, 'aisa');
    const b = await altaSuscriptor(e.app, 'aisb');

    const cliente = await crear(a.correo, 'direcciones', {
      nombre: 'Cliente secreto de A',
      tipo_identificacion: 'CED',
      identificacion: '1800000001',
      tipo_busqueda: 'C',
    });
    expect(cliente.statusCode).toBe(201);
    const idCliente = cliente.json().id as string;

    const listaB = await e.app.inject({ method: 'GET', url: '/api/e/direcciones', headers: cabeceras(b.correo) });
    expect(listaB.json().filas.map((f: { nombre: string }) => f.nombre)).not.toContain('Cliente secreto de A');

    const leer = await e.app.inject({ method: 'GET', url: `/api/e/direcciones/${idCliente}`, headers: cabeceras(b.correo) });
    expect(leer.statusCode).toBe(404);

    const cambiar = await e.app.inject({
      method: 'PUT',
      url: `/api/e/direcciones/${idCliente}`,
      headers: cabeceras(b.correo),
      payload: { nombre: 'Intento de B' },
    });
    expect(cambiar.statusCode).toBe(404);

    // B intenta crear una dirección cuyo "padre" es el cliente de A.
    const referencia = await crear(b.correo, 'direcciones', {
      nombre: 'Filial falsa',
      tipo_identificacion: 'CED',
      identificacion: '1800000002',
      tipo_busqueda: 'C',
      direccion_padre_id: idCliente,
    });
    expect(referencia.statusCode).toBe(400);
    expect(referencia.json().campos.direccion_padre_id).toBeDefined();

    // Incluso con SQL directo como rol de la aplicación, la seguridad por fila oculta el registro.
    const filas = await conTransaccion(e.db, { suscriptorId: b.suscriptorId, usuario: 'prueba' }, async (trx) => {
      const r = await sql`update erp.mae_direcciones set nombre = 'x' where id = ${idCliente} returning id`.execute(trx);
      return r.rows.length;
    });
    expect(filas).toBe(0);
  });

  it('sin suscriptor en la sesión no se ve ningún dato', async () => {
    await altaSuscriptor(e.app, 'sinctx');
    const r = await e.db.transaction().execute((trx) => sql`select count(*)::int as n from erp.mae_direcciones`.execute(trx));
    expect((r.rows[0] as { n: number }).n).toBe(0);
  });
});

describe('Numeración de documentos', () => {
  it('veinte documentos creados al mismo tiempo reciben números distintos y consecutivos', async () => {
    const a = await altaSuscriptor(e.app, 'num');
    const tipo = await crear(a.correo, 'tipos-documento', {
      modulo: 'VEN',
      codigo: 'OV',
      descripcion: 'Orden de venta',
      clase: 'ORDEN',
    });
    expect(tipo.statusCode).toBe(201);
    const tipoId = tipo.json().id as string;
    const contexto = { suscriptorId: a.suscriptorId, usuario: a.correo };

    const numeros = await Promise.all(
      Array.from({ length: 20 }, () =>
        conTransaccion(e.db, contexto, async (trx) => {
          const n = await siguienteNumero(trx, a.companiaId, tipoId);
          await sql`select pg_sleep(0.01)`.execute(trx);
          return Number(n);
        }),
      ),
    );
    expect(new Set(numeros).size).toBe(20);
    expect([...numeros].sort((x, y) => x - y)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
});

describe('Permisos', () => {
  it('un usuario con rol de solo lectura de artículos no puede crearlos ni ver roles', async () => {
    const a = await altaSuscriptor(e.app, 'perm');
    const rol = await crear(a.correo, 'roles', { codigo: 'CONSULTA', descripcion: 'Solo consulta de artículos' });
    const rolId = rol.json().id as string;
    await crear(a.correo, 'permisos', { rol_id: rolId, recurso: 'articulos', accion: 'VER' });
    const correoVendedor = `vendedor.${a.suscriptorId.slice(0, 8)}@prueba.ec`;
    const usuario = await crear(a.correo, 'usuarios', {
      firebase_uid: correoVendedor,
      correo: correoVendedor,
      nombre: 'Vendedor de prueba',
      compania_defecto_id: a.companiaId,
    });
    expect(usuario.statusCode).toBe(201);
    await crear(a.correo, 'usuarios-roles', { usuario_id: usuario.json().id, rol_id: rolId });

    const ver = await e.app.inject({ method: 'GET', url: '/api/e/articulos', headers: cabeceras(correoVendedor) });
    expect(ver.statusCode).toBe(200);

    const claseId = await primerId(a.correo, 'clases-contables', '?codigo=ART-SERV');
    const crearArticulo = await crear(correoVendedor, 'articulos', {
      codigo: 'SRV-001',
      descripcion: 'Consulta general',
      tipo_existencia: 'SERVICIO',
      unidad_primaria: 'SV',
      clase_contable_id: claseId,
    });
    expect(crearArticulo.statusCode).toBe(403);

    const roles = await e.app.inject({ method: 'GET', url: '/api/e/roles', headers: cabeceras(correoVendedor) });
    expect(roles.statusCode).toBe(403);
  });
});

describe('Validaciones', () => {
  it('rechaza datos incompletos, valores fuera de catálogo y decimales de más', async () => {
    const a = await altaSuscriptor(e.app, 'val');
    const incompleto = await crear(a.correo, 'direcciones', { nombre: 'Sin identificación' });
    expect(incompleto.statusCode).toBe(400);
    expect(Object.keys(incompleto.json().campos)).toEqual(
      expect.arrayContaining(['tipo_identificacion', 'identificacion', 'tipo_busqueda']),
    );

    const catalogo = await crear(a.correo, 'direcciones', {
      nombre: 'Tipo inventado',
      tipo_identificacion: 'ZZZ',
      identificacion: '1',
      tipo_busqueda: 'C',
    });
    expect(catalogo.statusCode).toBe(400);
    expect(catalogo.json().campos.tipo_identificacion).toBeDefined();

    const impuesto = await crear(a.correo, 'impuestos', {
      codigo: 'X',
      tipo: 'IVA',
      porcentaje: '12.123456',
      vigente_desde: '2026-01-01',
    });
    expect(impuesto.statusCode).toBe(400);

    const duplicado = await crear(a.correo, 'monedas', { codigo: 'USD', descripcion: 'Otra vez', decimales: 2 });
    expect(duplicado.statusCode).toBe(409);
  });

  it('asigna números de dirección consecutivos y guarda montos sin perder decimales', async () => {
    const a = await altaSuscriptor(e.app, 'dec');
    const d = await crear(a.correo, 'direcciones', {
      nombre: 'Segundo tercero',
      tipo_identificacion: 'CED',
      identificacion: '1800000003',
      tipo_busqueda: 'V',
    });
    expect(d.json().numero).toBe('2');
    const i = await crear(a.correo, 'impuestos', {
      codigo: 'ICE1',
      tipo: 'ICE',
      porcentaje: '12.3456',
      vigente_desde: '2026-01-01',
    });
    expect(i.statusCode).toBe(201);
    expect(i.json().porcentaje).toBe('12.3456');
  });
});

describe('Kardex inmutable', () => {
  it('la aplicación no puede modificar ni borrar movimientos de kardex', async () => {
    const a = await altaSuscriptor(e.app, 'kdx');
    const contexto = { suscriptorId: a.suscriptorId, usuario: a.correo };
    await expect(
      conTransaccion(e.db, contexto, (trx) => sql`update erp.inv_kardex set cantidad = 0`.execute(trx)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      conTransaccion(e.db, contexto, (trx) => sql`delete from erp.inv_kardex`.execute(trx)),
    ).rejects.toThrow(/permission denied/);
  });
});
