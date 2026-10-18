# Especificación funcional: Compras al pago

Estado: aprobado por Mauricio Mora el 18 de octubre de 2026, con la instrucción de replicar el ciclo estándar de un ERP clásico de distribución sin funcionalidades adicionales. Versión 0.1.

## 1. Objetivo

Cubrir el ciclo completo desde que alguien pide algo hasta que se le paga al proveedor: requisición, orden de compra, aprobación, recepción, factura del proveedor con su retención y pago. Cada paso deja su huella en inventario, en cuentas por pagar y en contabilidad, siempre por reglas contables.

## 2. Referencia funcional

Se replica la forma de trabajo del ciclo de compras de los ERP clásicos de distribución: estados por línea con estado siguiente y último estado, recepción contra la orden, cruce de la factura contra lo recibido con cuenta puente de recepciones por facturar, variación de precio y programación de pagos por vencimiento. No se copia ningún esquema, nombre de tabla, número de programa ni código de estado.

## 3. Documentos

| Documento | Tipo | Qué hace |
| --- | --- | --- |
| Requisición | COM/RQ | Pedido interno de bienes o servicios, sin proveedor obligatorio |
| Orden de compra | COM/OC | Compromiso con un proveedor, con precio, cantidad y destino |
| Recepción | COM/RC | Entrada de lo recibido contra una línea de la orden |
| Factura de proveedor | COM/FP | Registro del comprobante del proveedor y su cuenta por pagar |
| Retención emitida | COM/RT | Comprobante de retención de renta e IVA al proveedor |
| Pago | CXP/PG | Salida de dinero que cancela cuotas por pagar |

## 4. Estados por línea

Cada línea lleva su estado actual y el siguiente, validados contra los flujos de estado configurados. La lógica trabaja por fase y los números se pueden cambiar en Flujos de estado.

Orden de compra:

| Estado | Descripción | Fase | Siguiente | Alternos |
| --- | --- | --- | --- | --- |
| 10 | Registrada | REGISTRADA | 20 | 99 |
| 20 | Pendiente de aprobación | APROBACION | 30 | 10, 99 |
| 30 | Aprobada, por recibir | APROBADA | 40 | 99 |
| 40 | Recibida, por facturar | RECIBIDA | 50 | |
| 50 | Facturada | FACTURADA | 90 | |
| 90 | Cerrada | CERRADA | | |
| 99 | Cancelada | CANCELADA | | |

Requisición: 10 Registrada, 20 Pendiente de aprobación, 30 Aprobada, 90 Convertida en orden de compra (fase CERRADA) y 99 Cancelada.

Si una empresa no quiere aprobación, cambia el siguiente de 10 a 30 y la orden queda aprobada al confirmarla.

Reglas:

1. Pasar de la fase de aprobación a aprobada exige el permiso com-aprobar y deja registro en el historial de aprobaciones con usuario, fecha y comentario.
2. Una línea pasa a recibida cuando se recibió toda su cantidad, y a facturada cuando se facturó todo lo recibido. Una recepción o factura parcial deja la línea en su estado hasta completarla.
3. El saldo no recibido de una línea se puede cerrar. Una línea sin recepciones se puede cancelar.

## 5. Tipos de línea

| Tipo | Cómo se identifica | Recepción | Al recibir | Al facturar |
| --- | --- | --- | --- | --- |
| Artículo inventariable | Artículo con existencia | Obligatoria | Entra al kardex a costo de la orden | Cruza contra la recepción |
| Artículo no inventariable o servicio | Artículo sin existencia | Opcional | Gasto contra recepciones por facturar | Cruza contra la recepción o directo contra la línea |
| Línea por cuenta | Sin artículo, con cuenta contable | Opcional | Gasto a la cuenta de la línea | Igual que el anterior |

## 6. Factura de proveedor

1. Se elige el proveedor y el sistema muestra lo recibido pendiente de facturar y las líneas de servicio aprobadas sin recepción.
2. Se marcan las líneas, la cantidad y el costo que trae la factura. Se pueden agregar líneas directas a una cuenta de gasto.
3. Se registra el número del comprobante (001-001-000000123), la fecha de emisión, la autorización y el tipo de comprobante del SRI. No se acepta el mismo número dos veces para el mismo proveedor.
4. El IVA se calcula con la tarifa vigente del impuesto de la línea.
5. La retención se calcula por línea con el código de retención de renta y el de IVA. Por defecto se usan los del proveedor y se pueden cambiar en cada línea. La base de la retención de renta es el subtotal de la línea y la de IVA es el IVA de la línea. Los porcentajes salen de la tabla de códigos de retención vigente a la fecha.
6. La retención emitida se numera con el establecimiento y punto de emisión de la compañía.
7. Las cuotas por pagar salen de la condición de pago del proveedor. La retención se aplica a la primera cuota.

## 7. Pagos

1. La pantalla de pagos muestra las cuotas abiertas que vencen hasta una fecha, por proveedor.
2. Se marcan las cuotas y el monto a pagar de cada una, se elige la forma de pago y la cuenta bancaria.
3. Se genera un pago por proveedor, que reduce el saldo de cada cuota.
4. La antigüedad de saldos agrupa lo pendiente en por vencer, 1 a 30, 31 a 60, 61 a 90 y más de 90 días.

## 8. Contabilidad

| Evento | Débito | Crédito |
| --- | --- | --- |
| Recepción de inventariable | INVENTARIO | REC_POR_FACTURAR |
| Recepción de no inventariable o cuenta | GASTO_COMPRA o la cuenta de la línea | REC_POR_FACTURAR |
| Factura contra recepción | REC_POR_FACTURAR al costo recibido | PROVEEDORES |
| Diferencia de precio en inventariables | VARIACION_COMPRA, débito o crédito | |
| Diferencia de precio en no inventariables | GASTO_COMPRA o la cuenta de la línea | |
| Factura sin recepción | GASTO_COMPRA o la cuenta de la línea | PROVEEDORES |
| IVA de la factura | IVA_COMPRAS | PROVEEDORES |
| Retención emitida | PROVEEDORES | RET_RENTA_POR_PAGAR y RET_IVA_POR_PAGAR |
| Pago | PROVEEDORES | BANCOS, o la cuenta de la cuenta bancaria |

Las cuentas de cada concepto se resuelven en Reglas contables por compañía, clase contable y unidad de negocio. Una línea por cuenta y una cuenta bancaria llevan su cuenta propia, como en los ERP de referencia.

## 9. Datos

Se usan las tablas ya definidas del modelo: com_ordenes, com_ordenes_lineas, com_aprobaciones, com_recepciones, com_facturas, com_facturas_lineas, ec_codigos_retencion, ec_retenciones, ec_retenciones_lineas, cxp_documentos, cxp_pagos y cxp_aplicaciones. La migración 0005 agrega el número interno y la condición de pago en com_facturas, los códigos de retención por línea en com_facturas_lineas y las fases nuevas de los flujos de estado.

Los códigos de retención y sus porcentajes se cargan como ejemplo con fecha de vigencia. Un contador debe confirmarlos con la normativa vigente antes de usar el sistema.

## 10. Permisos

compras para requisiciones, órdenes, recepciones y facturas de proveedor; com-aprobar para aprobar; cxp para pagos y consultas de cuentas por pagar.

## 11. Fuera de esta versión

Aprobación por montos y varios niveles, nota de crédito de proveedor, anulación de factura de proveedor con reverso, liquidación de compra electrónica, anticipos a proveedores, compras en otra moneda, costo en destino de importaciones y envío electrónico de la retención al SRI. Quedan para versiones siguientes.
