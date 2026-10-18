# Especificación funcional: Ventas al cobro

Estado: aprobado por Mauricio Mora el 18 de octubre de 2026, con la instrucción de replicar el ciclo estándar de un ERP clásico de distribución sin funcionalidades adicionales. Versión 0.1.

## 1. Objetivo

Cubrir el ciclo completo desde la cotización hasta el cobro: cotización, orden de venta, control de crédito, despacho, facturación, nota de crédito, cobro y retención recibida del cliente. Incluye la facturación periódica de los contratos de servicio, que la especificación de servicios dejó a cargo de ventas.

## 2. Referencia funcional

Se replica la forma de trabajo del ciclo de ventas de los ERP clásicos de distribución: estados por línea, compromiso de existencias al tomar el pedido, retención por crédito, confirmación de despacho que descarga el inventario, actualización de ventas que factura lo despachado y cuentas por cobrar por cuotas. No se copia ningún esquema, nombre de tabla, número de programa ni código de estado.

## 3. Documentos

| Documento | Tipo | Qué hace |
| --- | --- | --- |
| Cotización | VEN/CO | Oferta al cliente, se convierte en orden de venta |
| Orden de venta | VEN/OV | Pedido del cliente con precio, cantidad y bodega |
| Despacho | VEN/DS | Salida de inventario de una línea de la orden |
| Factura | VEN/FA | Comprobante de venta y su cuenta por cobrar |
| Nota de crédito | VEN/NC | Devolución o descuento sobre una factura |
| Recibo de cobro | CXC/RC | Dinero recibido que cancela cuotas |

## 4. Estados por línea

Orden de venta:

| Estado | Descripción | Fase | Siguiente | Alternos |
| --- | --- | --- | --- | --- |
| 20 | Retenida por crédito | RETENIDA | 30 | 99 |
| 30 | Por despachar | APROBADA | 40 | 99 |
| 40 | Despachada, por facturar | DESPACHADA | 50 | |
| 50 | Facturada | FACTURADA | 90 | |
| 90 | Cerrada | CERRADA | | |
| 99 | Cancelada | CANCELADA | | |

Cotización: 10 Registrada, 90 Convertida en orden (fase CERRADA) y 99 Cancelada.

Reglas:

1. Al grabar la orden se revisa el crédito. Si el cliente está bloqueado, o si su saldo por cobrar más sus órdenes abiertas y la nueva superan su límite de crédito, las líneas quedan retenidas por crédito. Un límite en cero significa sin control.
2. Liberar una línea retenida exige el permiso ven-credito.
3. Al grabar, los artículos inventariables comprometen existencia en la bodega. Si no alcanza, el sistema avisa pero deja grabar, como en los ERP de referencia.
4. Una línea pasa a despachada cuando se despachó toda su cantidad y a facturada cuando se facturó todo lo despachado. El despacho y la factura pueden ser parciales.
5. Una línea sin despacho se puede cancelar y libera su compromiso. El saldo no despachado se puede cerrar.
6. El precio sale de la lista de precios del cliente vigente a la fecha y se puede cambiar. El descuento se ingresa en porcentaje y se guarda en valor.

## 5. Despacho y facturación

1. El despacho de un artículo inventariable lo saca del kardex al costo promedio y libera el compromiso. Los servicios y no inventariables solo se confirman.
2. La facturación toma lo despachado y no facturado de la orden y emite una factura con el establecimiento y punto de emisión de la compañía.
3. Las cuotas por cobrar salen de la condición de pago del cliente.
4. La factura de las órdenes de servicio usa el mismo proceso de emisión.

## 6. Nota de crédito

Se parte de una factura emitida. Se eligen las líneas y la cantidad a devolver, con un máximo de lo facturado menos lo ya devuelto. Si la mercadería regresa, entra a la bodega al costo con que salió. El valor de la nota cancela primero las cuotas abiertas de la factura; si sobra, queda como saldo a favor del cliente.

## 7. Cobros y retenciones recibidas

1. El recibo de cobro se registra por cliente, con forma de pago, cuenta bancaria y el detalle de cuotas que cancela. La suma aplicada debe ser igual al valor recibido.
2. La retención que entrega el cliente se registra contra la factura con su número, fecha, autorización y códigos. Los porcentajes salen de la tabla de códigos de retención vigente. Su valor cancela cuotas de esa factura.
3. La antigüedad de saldos agrupa lo pendiente en por vencer, 1 a 30, 31 a 60, 61 a 90 y más de 90 días.

## 8. Facturación de contratos

Un proceso factura las líneas de contratos vigentes cuya próxima fecha de facturación llegó: una factura por contrato, a precio y cantidad de la línea. La próxima fecha avanza un mes, tres meses o un año según la frecuencia del contrato. Si una línea no tiene fecha, se toma el inicio del contrato.

## 9. Contabilidad

| Evento | Débito | Crédito |
| --- | --- | --- |
| Despacho de inventariable | DESP_POR_FACTURAR | INVENTARIO |
| Factura | CLIENTES | INGRESO por clase del artículo e IVA_VENTAS |
| Costo de lo facturado | COSTO_VENTA | DESP_POR_FACTURAR |
| Nota de crédito | DEVOLUCION_VENTAS e IVA_VENTAS | CLIENTES |
| Mercadería devuelta | INVENTARIO | COSTO_VENTA |
| Cobro | BANCOS, o la cuenta de la cuenta bancaria | CLIENTES |
| Retención recibida | RET_RENTA_RECIBIDA y RET_IVA_RECIBIDA | CLIENTES |

La cuenta puente de despachos por facturar hace que el costo se reconozca junto con el ingreso y que el kardex cuadre con contabilidad en todo momento.

## 10. Datos

Se usan las tablas ya definidas del modelo: ven_ordenes, ven_ordenes_lineas, ven_facturas, ven_facturas_lineas, ven_contratos, ven_contratos_lineas, cxc_documentos, cxc_cobros, cxc_aplicaciones, ec_retenciones y ec_retenciones_lineas. La migración 0005 agrega la cantidad facturada en las líneas de orden, la cantidad devuelta en las líneas de factura, la nota de crédito como forma de aplicación en cuentas por cobrar y la autorización en las retenciones.

## 11. Permisos

ventas para cotizaciones, órdenes, despachos, facturas y notas de crédito; ven-credito para liberar retenciones por crédito; cxc para cobros, retenciones recibidas y consultas de cuentas por cobrar.

## 12. Fuera de esta versión

Facturación antes del despacho, ya acordada en su diseño: al facturar se reconoce el costo al promedio del momento contra una cuenta puente de mercadería facturada por despachar, y al despachar la diferencia con el costo real ajusta el costo de ventas; su contador debe validar el reconocimiento del ingreso según la NIIF 15. También quedan fuera precios por cantidad y promociones, comisiones, anticipos de clientes, aplicación posterior del saldo a favor, ventas en otra moneda, guía de remisión y envío electrónico al SRI.
