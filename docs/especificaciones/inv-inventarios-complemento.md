# Especificación funcional: Inventarios, complemento

Estado: aprobado por Mauricio Mora el 19 de octubre de 2026 junto con la contabilidad general. Versión 0.1.

## 1. Objetivo

Completar el alcance de inventarios del plan maestro: transferencias entre bodegas, conteo físico, lotes con fecha de vencimiento y consulta del kardex con saldo. Los ajustes, el costo promedio y los movimientos de compras, ventas y servicios ya existen.

## 2. Transferencias

1. Documento INV/TR con bodega de origen, bodega de destino y líneas de artículo, cantidad y lote.
2. Sale del origen al costo promedio y entra al destino con ese mismo costo, que se promedia con lo que ya hay en el destino.
3. El asiento mueve el inventario entre los centros de costo de ambas bodegas por las reglas del concepto INVENTARIO; si las reglas dan la misma cuenta, el asiento solo cambia el centro de costo.
4. En artículos con lote, el lote viaja con la mercadería y se crea en el destino con su misma fecha de vencimiento.

## 3. Conteo físico

1. Documento INV/CF que toma una foto de las existencias de una bodega, por artículo y lote, al momento de crearlo.
2. El bodeguero ingresa lo contado. Una línea sin cantidad contada no se ajusta.
3. Al contabilizar, cada diferencia entre lo contado y lo que hay en ese momento genera su movimiento de kardex al costo promedio y su asiento contra el concepto AJUSTE_INV. El documento queda contabilizado y no se modifica más.
4. Mientras el conteo está abierto, la bodega debería detener sus movimientos; el sistema lo advierte en pantalla pero no lo impide.

## 4. Lotes

1. Un artículo que controla lote exige el lote en toda entrada: ajuste, recepción de compra y conteo. El lote se crea con su fecha de vencimiento la primera vez que entra a una bodega.
2. En las salidas el lote se puede indicar; si no se indica, el sistema toma primero el lote que vence antes y, si no alcanza, sigue con el siguiente. Una salida puede generar varios movimientos de kardex, uno por lote.
3. Las devoluciones y reversos regresan la mercadería a los mismos lotes de los que salió.
4. Las existencias se muestran por lote con su vencimiento.

## 5. Consulta de kardex

Por artículo y bodega, entre dos fechas: saldo inicial, cada movimiento con su documento, lote, cantidad, costo y saldo acumulado en cantidad y valor.

## 6. Contabilidad e integridad

El kardex sigue siendo inmutable: transferencias, conteos y lotes solo agregan movimientos. Los saldos, el costo promedio y el kardex se actualizan en la misma transacción, y cada movimiento con valor genera su asiento por reglas. Un período con inventario cerrado no admite movimientos.

## 7. Datos

Se usan inv_documentos, inv_documentos_lineas, inv_lotes, inv_saldos e inv_kardex. La migración 0006 agrega el estado del documento de inventario y las cantidades del sistema y contada en sus líneas.

## 8. Fuera de esta versión

Ubicaciones dentro de la bodega, series individuales, transferencias en tránsito con recepción en destino, conteos cíclicos programados y costeo distinto del promedio ponderado.
