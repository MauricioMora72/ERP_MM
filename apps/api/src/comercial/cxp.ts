import Decimal from 'decimal.js';
import { sql, type Trx } from '@erp/db';
import { ErrorNegocio } from '../errores.js';
import { contabilizar } from '../nucleo/contabilidad.js';
import { hoy, numerar, tipoDocumento } from '../nucleo/documentos.js';
import { D } from './comun.js';

/** Cuentas por pagar: cuotas abiertas, pagos agrupados por proveedor. */

export async function documentosAbiertosCxp(trx: Trx, companiaId: string, q: { hasta?: string; proveedorId?: string }) {
  const r = await sql`
    select d.id, d.numero, d.cuota, d.fecha, d.vencimiento, d.monto, d.saldo, d.proveedor_id, t.nombre as proveedor,
           f.numero_factura, (${q.hasta ?? hoy()}::date - d.vencimiento) as dias_vencido
    from erp.cxp_documentos d join erp.mae_direcciones t on t.id = d.proveedor_id
    left join erp.com_facturas f on f.id = d.factura_id
    where d.compania_id = ${companiaId} and d.saldo > 0
      and (${q.hasta ?? null}::date is null or d.vencimiento <= ${q.hasta ?? null}::date)
      and (${q.proveedorId ?? null}::uuid is null or d.proveedor_id = ${q.proveedorId ?? null}::uuid)
    order by t.nombre, d.vencimiento, d.numero, d.cuota`.execute(trx);
  return r.rows;
}

/** Cuenta contable de la cuenta bancaria; sin cuenta bancaria se usa la regla del concepto de caja y bancos. */
export async function cuentaDeBanco(trx: Trx, companiaId: string, cuentaBancariaId: string | null | undefined): Promise<string | null> {
  if (!cuentaBancariaId) return null;
  const r = await sql<{ cuenta_id: string }>`
    select cuenta_id from erp.con_cuentas_bancarias where id = ${cuentaBancariaId} and compania_id = ${companiaId} and activo`.execute(trx);
  if (!r.rows[0]) throw new ErrorNegocio(400, 'La cuenta bancaria no existe o está inactiva.');
  return r.rows[0].cuenta_id;
}

export async function registrarPagos(
  trx: Trx,
  companiaId: string,
  d: { fecha?: string | null; formaPago: string; cuentaBancariaId?: string | null; referencia?: string | null; aplicaciones: { documentoId: string; monto: Decimal.Value }[] },
) {
  const fecha = d.fecha ?? hoy();
  if (d.formaPago !== 'EFECTIVO' && !d.cuentaBancariaId) {
    throw new ErrorNegocio(400, 'Indique la cuenta bancaria de donde sale el pago.', { cuentaBancariaId: 'Este campo es obligatorio' });
  }
  const cuentaBanco = await cuentaDeBanco(trx, companiaId, d.cuentaBancariaId);
  const aplicar = d.aplicaciones.filter((a) => D(a.monto).greaterThan(0));
  if (aplicar.length === 0) throw new ErrorNegocio(400, 'Seleccione al menos una cuota a pagar.');

  const porProveedor = new Map<string, { documento: { id: string; numero: string; cuota: number; saldo: string; clase: string }; monto: Decimal }[]>();
  for (const a of aplicar) {
    const r = await sql<{ id: string; numero: string; cuota: number; saldo: string; proveedor_id: string; clase: string; compania_id: string }>`
      select d.id, d.numero, d.cuota, d.saldo, d.proveedor_id, d.compania_id, p.clase_contable_id as clase
      from erp.cxp_documentos d left join erp.mae_proveedores p on p.direccion_id = d.proveedor_id and p.compania_id = d.compania_id
      where d.id = ${a.documentoId} for update of d`.execute(trx);
    const doc = r.rows[0];
    if (!doc || doc.compania_id !== companiaId) throw new ErrorNegocio(400, 'Una de las cuotas no existe.');
    const monto = D(a.monto);
    if (monto.greaterThan(doc.saldo)) throw new ErrorNegocio(400, `La cuota ${doc.numero}-${doc.cuota} tiene saldo ${doc.saldo}.`);
    const lista = porProveedor.get(doc.proveedor_id) ?? [];
    lista.push({ documento: doc, monto });
    porProveedor.set(doc.proveedor_id, lista);
  }

  const tipo = await tipoDocumento(trx, 'CXP', 'PG');
  const pagos: { id: string; numero: string; proveedorId: string; monto: string }[] = [];
  for (const [proveedorId, lista] of porProveedor) {
    const total = lista.reduce((s, x) => s.plus(x.monto), D(0));
    const numero = await numerar(trx, companiaId, tipo.id);
    const p = await sql<{ id: string }>`
      insert into erp.cxp_pagos (compania_id, numero, proveedor_id, fecha, forma_pago, cuenta_bancaria_id, monto, referencia)
      values (${companiaId}, ${numero}, ${proveedorId}, ${fecha}, ${d.formaPago}, ${d.cuentaBancariaId ?? null}, ${total.toFixed(2)}, ${d.referencia ?? null})
      returning id`.execute(trx);
    const pagoId = p.rows[0]!.id;
    for (const x of lista) {
      await sql`insert into erp.cxp_aplicaciones (documento_id, pago_id, monto, fecha) values (${x.documento.id}, ${pagoId}, ${x.monto.toFixed(2)}, ${fecha})`.execute(trx);
      await sql`update erp.cxp_documentos set saldo = saldo - ${x.monto.toFixed(2)} where id = ${x.documento.id}`.execute(trx);
    }
    const asiento = await contabilizar(trx, {
      companiaId, fecha, glosa: `Pago ${numero}${d.referencia ? `, ${d.referencia}` : ''}`, origenModulo: 'CXP', origenId: pagoId,
      lineas: [
        ...lista.map((x) => ({ concepto: 'PROVEEDORES', claseContableId: x.documento.clase, terceroId: proveedorId, debito: x.monto, glosa: `Pago cuota ${x.documento.numero}-${x.documento.cuota}` })),
        { concepto: 'BANCOS', cuentaId: cuentaBanco, terceroId: proveedorId, credito: total },
      ],
    });
    await sql`update erp.cxp_pagos set asiento_id = ${asiento} where id = ${pagoId}`.execute(trx);
    pagos.push({ id: pagoId, numero, proveedorId, monto: total.toFixed(2) });
  }
  return pagos;
}
