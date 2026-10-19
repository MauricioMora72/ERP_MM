# Especificación funcional: Contabilidad general

Estado: aprobado por Mauricio Mora el 19 de octubre de 2026, con la instrucción de construir la funcionalidad estándar y dejar fuera todo lo del SRI. Versión 0.1.

## 1. Objetivo

Cerrar el circuito contable: los módulos ya generan sus asientos por reglas; ahora la contabilidad permite registrar asientos manuales, reversarlos, controlar los períodos por módulo, cerrar el ejercicio, conciliar los bancos y sacar los reportes básicos.

## 2. Referencia funcional

Se replica la forma de trabajo de la contabilidad general de los ERP clásicos de distribución: asientos de diario con su documento, reversa en lugar de edición, períodos abiertos o cerrados por módulo, balance de comprobación, mayor por cuenta, estados financieros a partir de la jerarquía del plan de cuentas y conciliación bancaria contra el extracto. No se copia ningún esquema, nombre de tabla ni número de programa.

## 3. Asientos manuales

1. Se registran con fecha, glosa y líneas con cuenta, centro de costo, tercero, débito o crédito y glosa propia.
2. El asiento debe cuadrar; cada cuenta debe aceptar movimiento y, si la cuenta lo exige, la línea debe llevar centro de costo o tercero.
3. Se numeran con el tipo CON/AS por año, igual que los automáticos, y quedan contabilizados al grabar.
4. Un asiento contabilizado no se edita. Se reversa con un asiento espejo en la fecha que se indique; el original queda en estado reversado y ligado a su reversa.
5. Solo se reversan desde contabilidad los asientos manuales. Los automáticos se corrigen con su documento de origen (nota de crédito, reverso de consumo, ajuste), para que módulo y contabilidad no se separen.

## 4. Períodos y cierre

1. Cada período mensual tiene estado por módulo: ventas, compras, inventario y contabilidad.
2. Un asiento solo entra en un período con contabilidad abierta y, si viene de un módulo, con ese módulo abierto. Así se puede cerrar inventario o ventas antes que contabilidad, como en los ERP de referencia.
3. Abrir y cerrar períodos exige el permiso con-cierre. Se pueden generar los períodos de un año nuevo.
4. El cierre del ejercicio genera, con fecha del último día del año, un asiento que deja en cero las cuentas de resultados y lleva la diferencia a la cuenta de resultado del ejercicio (concepto RESULTADO_EJERCICIO). No se puede ejecutar dos veces para el mismo año sin reversar el anterior.

## 5. Reportes

| Reporte | Contenido |
| --- | --- |
| Balance de comprobación | Por cuenta y con totales por nivel: saldo inicial, débitos, créditos y saldo final entre dos fechas |
| Balance general | Activo, pasivo y patrimonio a una fecha, con el resultado del ejercicio en curso dentro del patrimonio; verifica que activo sea igual a pasivo más patrimonio |
| Estado de resultados | Ingresos, costos y gastos entre dos fechas, con la utilidad o pérdida |
| Mayor por cuenta | Saldo inicial, cada movimiento con su asiento, glosa y tercero, y saldo acumulado |

Los saldos se muestran según la naturaleza de la cuenta. Todos los reportes se pueden descargar en CSV.

## 6. Bancos y conciliación

1. Cada cuenta bancaria tiene su cuenta contable.
2. Los movimientos del extracto se ingresan pegando las líneas del banco (fecha, referencia, descripción y valor, positivo para depósitos y negativo para retiros) o uno por uno.
3. La conciliación cruza movimientos del banco con líneas contables de la cuenta del banco. Se puede conciliar un movimiento con varias líneas o varios movimientos con una línea; las sumas deben coincidir.
4. La conciliación automática cruza cada movimiento con la única línea pendiente del mismo valor dentro de cinco días.
5. Un movimiento del banco que no está en libros (comisiones, intereses, débitos bancarios) se registra desde la misma pantalla: se elige la cuenta de contrapartida y el sistema genera el asiento y lo concilia.
6. El reporte de conciliación muestra el saldo en libros, las partidas de libros pendientes, los movimientos del banco sin registrar y el saldo del banco que resulta.

## 7. Datos

Se usan las tablas ya definidas: con_asientos, con_asientos_lineas, con_saldos, con_periodos, con_cuentas, con_cuentas_bancarias, con_movimientos_bancarios y con_conciliaciones. El estado del asiento admite CONTABILIZADO y REVERSADO. Se agregan al plan de cuentas de ejemplo las cuentas de patrimonio (capital, resultados acumulados y resultado del ejercicio) y gastos bancarios.

## 8. Permisos

contabilidad para asientos, reportes y bancos; con-cierre para abrir y cerrar períodos y cerrar el ejercicio.

## 9. Fuera de esta versión

Asientos recurrentes y plantillas de asiento, presupuestos, moneda extranjera y diferencia en cambio, consolidación de compañías, depreciación de activos fijos, importación automática de extractos en formato del banco y todo lo tributario y del SRI.
