import Decimal from 'decimal.js';
import { sql, type Trx } from '@erp/db';
import { ErrorNegocio } from '../errores.js';
import { contabilizar } from '../nucleo/contabilidad.js';
import { hoy, numerar, tipoDocumento } from '../nucleo/documentos.js';
import { aplicarACuotasCxc } from '../nucleo/facturacion.js';
import { D, retencionVigente } from './comun.js';
import { cuentaDeBanco } from './cxp.js';

/** Cuentas por cobrar: cuotas abiertas, cobros y retenciones recibidas de clientes. */

export async function documentosAbiertosCxc(trx: Trx, companiaId: string, q: { clienteId?: string; hasta?: string }) {
  const r = await sql`
    select d.id, d.numero, d.cuota, d.fecha, d.vencimiento, d.monto, d.saldo, d.cliente_id, t.nombre as cliente, d.factura_id,
           f.establecimiento || '-' || f.punto_emision || '-' || lpad(f.secuencial::text, 9, '0') as factura, tp.codigo as tipo,
           (${q.hasta ?? hoy()}::date - d.vencimiento) as dias_vencido
    from erp.cxc_documentos d join erp.mae_direcciones t on t.id = d.cliente_id
    left join erp.ven_facturas f on f.id = d.factura_id join erp.sis_tipos_documento tp on tp.id = d.tipo_documento_id
    where d.compania_id = ${companiaId} and d.saldo <> 0
      and (${q.clienteId ?? null}::uuid is null or d.cliente_id = ${q.clienteId ?? null}::uuid)
      and (${q.hasta ?? null}::date is null or d.vencimiento <= ${q.hasta ?? null}::date)
    order by t.nombre, d.vencimiento, d.numero, d.cuota`.execute(trx);
  return r.rows;
}

async function claseCliente(trx: Trx, companiaId: string, clienteId: string): Promise<string | null> {
  const r = await sql<{ clase_contable_id: string }>`
    select clase_contable_id from erp.mae_clientes where direccion_id = ${clienteId} and compania_id = ${companiaId}`.execute(trx);
  return r.rows[0]?.clase_contable_id ?? null;
}

export async function registrarCobro(
  trx: Trx,
  companiaId: string,
  d: { clienteId: string; fecha?: string | null; formaPago: string; cuentaBancariaId?: string | null; monto: Decimal.Value; referencia?: string | null;
    aplicaciones: { documentoId: string; monto: Decimal.Value }[] },
) {
  const fecha = d.fecha ?? hoy();
  const monto = D(d.monto);
  if (monto.lessThanOrEqualTo(0)) throw new ErrorNegocio(400, 'El valor recibido debe ser mayor que cero.', { monto: 'Debe ser mayor que cero' });
  if (d.formaPago !== 'EFECTIVO' && !d.cuentaBancariaId) {
    throw new ErrorNegocio(400, 'Indique la cuenta bancaria donde ingresa el dinero.', { cuentaBancariaId: 'Este campo es obligatorio' });
  }
  const aplicar = d.aplicaciones.filter((a) => D(a.monto).greaterThan(0));
  const suma = aplicar.reduce((s, a) => s.plus(a.monto), D(0));
  if (!suma.equals(monto)) throw new ErrorNegocio(400, `Lo aplicado (${suma.toFixed(2)}) debe ser igual al valor recibido (${monto.toFixed(2)}).`);
  const cuentaBanco = await cuentaDeBanco(trx, companiaId, d.cuentaBancariaId);
  const tipo = await tipoDocumento(trx, 'CXC', 'RC');
  const numero = await numerar(trx, companiaId, tipo.id);
  const c = await sql<{ id: string }>`
    insert into erp.cxc_cobros (compania_id, numero, cliente_id, fecha, forma_pago, cuenta_bancaria_id, monto, referencia)
    values (${companiaId}, ${numero}, ${d.clienteId}, ${fecha}, ${d.formaPago}, ${d.cuentaBancariaId ?? null}, ${monto.toFixed(2)}, ${d.referencia ?? null})
    returning id`.execute(trx);
  const cobroId = c.rows[0]!.id;
  for (const a of aplicar) {
    const r = await sql<{ id: string; saldo: string; cliente_id: string; compania_id: string; numero: string; cuota: number }>`
      select id, saldo, cliente_id, compania_id, numero, cuota from erp.cxc_documentos where id = ${a.documentoId} for update`.execute(trx);
    const doc = r.rows[0];
    if (!doc || doc.compania_id !== companiaId || doc.cliente_id !== d.clienteId) throw new ErrorNegocio(400, 'Una de las cuotas no es del cliente.');
    if (D(a.monto).greaterThan(doc.saldo)) throw new ErrorNegocio(400, `La cuota ${doc.numero}-${doc.cuota} tiene saldo ${doc.saldo}.`);
    await sql`insert into erp.cxc_aplicaciones (documento_id, cobro_id, monto, fecha) values (${doc.id}, ${cobroId}, ${D(a.monto).toFixed(2)}, ${fecha})`.execute(trx);
    await sql`update erp.cxc_documentos set saldo = saldo - ${D(a.monto).toFixed(2)} where id = ${doc.id}`.execute(trx);
  }
  const asiento = await contabilizar(trx, {
    companiaId, fecha, glosa: `Cobro ${numero}${d.referencia ? `, ${d.referencia}` : ''}`, origenModulo: 'CXC', origenId: cobroId,
    lineas: [
      { concepto: 'BANCOS', cuentaId: cuentaBanco, terceroId: d.clienteId, debito: monto },
      { concepto: 'CLIENTES', claseContableId: await claseCliente(trx, companiaId, d.clienteId), terceroId: d.clienteId, credito: monto },
    ],
  });
  await sql`update erp.cxc_cobros set asiento_id = ${asiento} where id = ${cobroId}`.execute(trx);
  return { id: cobroId, numero };
}

export async function registrarRetencionRecibida(
  trx: Trx,
  companiaId: string,
  d: { facturaId: string; secuencial: string; fecha: string; autorizacion?: string | null; lineas: { codigoRetencionId: string; base: Decimal.Value }[] },
) {
  if (!/^\d{3}-\d{3}-\d{9}$/.test(d.secuencial)) throw new ErrorNegocio(400, 'El número debe tener la forma 001-001-000000123.', { secuencial: 'Formato 001-001-000000123' });
  const f = await sql<{ cliente_id: string; compania_id: string; subtotal: string; descuento: string; impuestos: string }>`
    select cliente_id, compania_id, subtotal, descuento, impuestos from erp.ven_facturas where id = ${d.facturaId}`.execute(trx);
  const factura = f.rows[0];
  if (!factura || factura.compania_id !== companiaId) throw new ErrorNegocio(404, 'La factura no existe.');
  if (d.lineas.length === 0) throw new ErrorNegocio(400, 'Agregue al menos un código de retención.');
  const calc = [];
  for (const l of d.lineas) {
    const codigo = (await retencionVigente(trx, { id: l.codigoRetencionId }, d.fecha))!;
    const base = D(l.base);
    const tope = codigo.tipo === 'IVA' ? D(factura.impuestos) : D(factura.subtotal).minus(factura.descuento);
    if (base.lessThanOrEqualTo(0) || base.greaterThan(tope)) throw new ErrorNegocio(400, `La base de ${codigo.codigo} debe estar entre 0 y ${tope.toFixed(2)}.`);
    calc.push({ codigo, base, valor: base.times(codigo.porcentaje).dividedBy(100).toDecimalPlaces(2) });
  }
  const total = calc.reduce((s, c) => s.plus(c.valor), D(0));
  const r = await sql<{ id: string }>`
    insert into erp.ec_retenciones (compania_id, sentido, secuencial, fecha, tercero_id, venta_id, total, estado, autorizacion)
    values (${companiaId}, 'RECIBIDA', ${d.secuencial}, ${d.fecha}, ${factura.cliente_id}, ${d.facturaId}, ${total.toFixed(2)}, 'REGISTRADA', ${d.autorizacion ?? null})
    returning id`.execute(trx);
  const retencionId = r.rows[0]!.id;
  for (const [i, c] of calc.entries()) {
    await sql`insert into erp.ec_retenciones_lineas (retencion_id, linea, codigo_retencion_id, base, porcentaje, valor)
              values (${retencionId}, ${i + 1}, ${c.codigo.id}, ${c.base.toFixed(2)}, ${c.codigo.porcentaje.toFixed(4)}, ${c.valor.toFixed(2)})`.execute(trx);
  }
  const resto = await aplicarACuotasCxc(trx, d.facturaId, total, d.fecha, { retencionId });
  if (resto.greaterThan(0)) throw new ErrorNegocio(400, `La retención (${total.toFixed(2)}) supera el saldo pendiente de la factura.`);
  const renta = calc.filter((c) => c.codigo.tipo === 'RENTA').reduce((s, c) => s.plus(c.valor), D(0));
  const iva = total.minus(renta);
  const asiento = await contabilizar(trx, {
    companiaId, fecha: d.fecha, glosa: `Retención recibida ${d.secuencial}`, origenModulo: 'CXC', origenId: retencionId,
    lineas: [
      { concepto: 'RET_RENTA_RECIBIDA', terceroId: factura.cliente_id, debito: renta },
      { concepto: 'RET_IVA_RECIBIDA', terceroId: factura.cliente_id, debito: iva },
      { concepto: 'CLIENTES', claseContableId: await claseCliente(trx, companiaId, factura.cliente_id), terceroId: factura.cliente_id, credito: total },
    ],
  });
  await sql`update erp.ec_retenciones set asiento_id = ${asiento} where id = ${retencionId}`.execute(trx);
  return { id: retencionId, total: total.toFixed(2) };
}
