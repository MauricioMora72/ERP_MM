# Especificación funcional: Gestión de servicios

Estado: borrador para aprobación de Mauricio Mora. Versión 0.1, 17 de octubre de 2026.

## 1. Objetivo

El módulo de gestión de servicios es el eje de la vertical de servicios. Permite registrar lo que se atiende, planificar y ejecutar órdenes de servicio con personas y materiales, y decidir automáticamente cómo se cobra cada orden: al cliente, a una garantía, a un contrato o como gasto interno. Cada camino tiene su propio tratamiento contable.

El módulo es genérico. Una clínica dental, un taller, un hospital o una empresa de mantenimiento usan el mismo módulo con distinta configuración: tipos de orden, campos propios, estados, recursos y temparios.

## 2. Referencia funcional

Se toma como referencia la lógica general de los módulos de servicio de los ERP clásicos de distribución. No se copia ningún esquema, nombre de tabla ni pantalla. Las piezas de esa lógica y la propuesta para este ERP son estas:

| Pieza de la lógica de referencia | Qué hace | Propuesta |
| --- | --- | --- |
| Base instalada | Registro de cada equipo o activo del cliente, con su serie, fecha de venta y garantía | Fase 1, como objeto atendido |
| Procedimientos estándar | Trabajo tipo con sus pasos, tiempos, personas y repuestos | Fase 1, como tempario |
| Órdenes de servicio | Documento que junta mano de obra, materiales y terceros sobre un objeto | Fase 1 |
| Tipos de cobertura | Facturable, garantía, contrato o interno, con distinto cobro y distinta contabilidad | Fase 1 |
| Facturación de servicio | Mano de obra por horas o precio cerrado, materiales a precio de lista, revisión antes de facturar | Fase 1 |
| Contratos de servicio con derechos | Qué cubre un contrato, en qué porcentaje y hasta cuándo | Fase 1 |
| Mantenimiento preventivo | Órdenes generadas solas según calendario del contrato | Fase 1 |
| Reclamos de garantía al proveedor | Recuperar del fabricante lo gastado en garantías | Por decidir |
| Llamadas o casos | Mesa de ayuda que registra la solicitud antes de la orden | Por decidir |

## 3. Conceptos

| Concepto | Significado en este ERP |
| --- | --- |
| Orden de servicio | Documento central. Tiene cabecera, actividades (mano de obra) y consumos (materiales y servicios) |
| Objeto atendido | Lo que recibe el servicio: paciente, equipo, vehículo, instalación |
| Recurso | Quien o lo que presta el servicio: profesional, técnico, sala, vehículo, equipo |
| Perfil | Especialidad que pide una actividad: odontólogo, cirujano, técnico eléctrico |
| Tempario | Plantilla de un servicio: actividades con perfil, número de personas y tiempo estándar, más los materiales previstos |
| Cobertura | Quién paga la orden: FACTURABLE (el cliente), GARANTIA, CONTRATO o INTERNO |
| Garantía | Cobertura por un plazo desde la venta o instalación de un objeto, para mano de obra, materiales o ambos |
| Contrato de servicio | Acuerdo con el cliente que cubre ciertos servicios, con porcentaje de cobertura, vigencia y preventivos programados |

## 4. Maestros y configuración

### 4.1 Tipos de orden

Cada tipo de orden define su tipo de documento y numerador, su flujo de estados, el tipo de objeto atendido, sus campos personalizados, el tempario sugerido y la cobertura por defecto. Ejemplos: consulta, tratamiento, cirugía, mantenimiento correctivo, preventivo, instalación.

### 4.2 Objetos atendidos

Por cada objeto se registra el cliente dueño, código, descripción, serie, placa o historia, artículo de origen si se vendió, fecha de venta o instalación, y sus campos propios. Desde el objeto se ve su historial completo de órdenes y su garantía vigente.

### 4.3 Recursos, perfiles y tarifas

Cada recurso tiene uno o varios perfiles, una unidad de negocio y dos tarifas por hora: costo (lo que le cuesta a la empresa) y venta (lo que se cobra al cliente). La tarifa de venta puede variar por perfil y por lista de precios del cliente.

### 4.4 Temparios

El tempario es la lista de lo que lleva un servicio. Tiene cabecera (código, descripción, tipo de orden, precio cerrado opcional) y líneas de tres clases:

| Clase de línea | Datos |
| --- | --- |
| Actividad | Descripción, perfil requerido, número de personas, tiempo estándar en horas |
| Material | Artículo, cantidad, unidad, si es facturable |
| Servicio de tercero | Descripción, proveedor sugerido, costo estimado |

Ejemplo de tempario en una clínica dental:

| Clase | Detalle | Perfil o artículo | Personas | Tiempo o cantidad |
| --- | --- | --- | --- | --- |
| Actividad | Evaluación y anestesia | Odontólogo | 1 | 0,25 h |
| Actividad | Endodoncia unirradicular | Odontólogo | 1 | 1,00 h |
| Actividad | Asistencia | Auxiliar de odontología | 1 | 1,25 h |
| Material | Anestésico local | Cartucho de anestesia | | 2 |
| Material | Limas y conos | Kit de endodoncia | | 1 |

Ejemplo en un hospital, para una atención quirúrgica de peritonitis. Es solo ilustrativo: el contenido clínico lo define cada institución con su personal médico.

| Clase | Detalle | Perfil o artículo | Personas | Tiempo o cantidad |
| --- | --- | --- | --- | --- |
| Actividad | Valoración prequirúrgica | Médico cirujano | 1 | 0,50 h |
| Actividad | Cirugía | Médico cirujano | 2 | 2,00 h |
| Actividad | Anestesia | Anestesiólogo | 1 | 2,50 h |
| Actividad | Instrumentación | Enfermera instrumentista | 1 | 2,50 h |
| Material | Kit quirúrgico | Kit de laparotomía | | 1 |
| Material | Suturas | Sutura según protocolo | | 4 |
| Servicio de tercero | Estudio de laboratorio | Laboratorio externo | | 1 |

Al crear una orden con un tempario, sus líneas se copian a la orden como actividades y consumos previstos. A partir de ahí la orden es independiente: se pueden agregar, quitar o cambiar líneas sin tocar el tempario.

### 4.5 Garantías

La garantía se define por artículo o por categoría: plazo en meses o en uso (por ejemplo horas de equipo), si cubre mano de obra, materiales o ambos, y en qué porcentaje. Cuando se vende o instala un objeto, su garantía queda calculada con fecha de inicio y fin.

### 4.6 Contratos de servicio

El contrato (ya previsto en ven_contratos) se amplía con líneas de cobertura: qué tipos de orden o servicios cubre, porcentaje de cobertura de mano de obra y de materiales, tope de órdenes o de monto por período, y preventivos programados con su frecuencia y tempario.

## 5. Flujo de la orden de servicio

### 5.1 Estados sugeridos

Los estados son configurables por tipo de orden en sis_flujos_estado. La configuración de fábrica sugerida es:

| Estado | Significado | Siguiente |
| --- | --- | --- |
| 10 | Registrada | 20 |
| 20 | Programada (recursos y agenda asignados) | 30 |
| 30 | En ejecución | 40 |
| 40 | Terminada técnicamente | 50 |
| 50 | Revisada para cobro | 60 |
| 60 | Facturada o liquidada | 90 |
| 90 | Cerrada | |
| 99 | Cancelada | |

### 5.2 Creación

La orden puede nacer de cuatro formas: manual, desde la agenda al reservar una cita, desde un preventivo del contrato, o más adelante desde un caso de mesa de ayuda. Al crearla se elige el cliente, el objeto atendido y el tipo de orden; el sistema propone el tempario del tipo de orden.

### 5.3 Determinación automática de la cobertura

Al registrar la orden, el sistema decide la cobertura en este orden:

1. Si el objeto tiene una garantía vigente que cubre el tipo de orden, propone GARANTIA.
2. Si el cliente tiene un contrato vigente que cubre el tipo de orden y no superó su tope, propone CONTRATO.
3. Si el tipo de orden es interno (por ejemplo, mantenimiento de equipos propios), propone INTERNO.
4. En otro caso, FACTURABLE.

El usuario puede cambiar la cobertura solo con permiso y registrando el motivo, que queda en la auditoría. La cobertura se fija al pasar a estado 50 y desde ahí no cambia.

### 5.4 Ejecución

Durante la ejecución se registran:

- Horas reales por recurso y actividad (fecha, hora de inicio y fin, o total de horas). El costo se calcula con la tarifa de costo del recurso.
- Consumos de materiales. Cada consumo descarga inventario de la bodega indicada con un movimiento de kardex, al costo promedio vigente.
- Servicios de terceros, ligados a una orden de compra o a la factura del proveedor.

La orden muestra en todo momento lo previsto contra lo real, en horas, materiales y costo.

### 5.5 Revisión para cobro

En el estado 50 el sistema arma una prefactura según la cobertura. El usuario puede marcar líneas como no facturables, ajustar precios con permiso y agregar recargos o descuentos. La prefactura no tiene efecto contable hasta que se confirma.

## 6. Facturación y liquidación

### 6.1 Reglas de precio

| Elemento | Regla de precio |
| --- | --- |
| Mano de obra por horas | Horas reales por tarifa de venta del perfil (según lista de precios del cliente) |
| Servicio con precio cerrado | Precio del servicio o del tempario, sin importar las horas reales |
| Materiales | Precio de lista del cliente a la fecha |
| Servicios de terceros | Costo más margen configurable por tipo de orden |

### 6.2 Resultado según la cobertura

| Cobertura | Qué pasa al confirmar |
| --- | --- |
| FACTURABLE | Se emite una factura al cliente con las líneas de mano de obra, materiales y terceros |
| GARANTIA | No se factura al cliente lo cubierto. Si la garantía es parcial, se factura al cliente solo la parte no cubierta. El costo cubierto va a gasto de garantías |
| CONTRATO | Se aplica el porcentaje de cobertura del contrato. La parte cubierta no se factura (ya se cobra en la cuota del contrato) y la no cubierta, como copago, se factura al cliente |
| INTERNO | No hay factura. El costo se carga al centro de costo indicado |

La factura se genera en ven_facturas, con cada línea apuntando a la actividad o al consumo de la orden que le dio origen. Desde ahí sigue el flujo normal de ventas: comprobante electrónico del SRI y cuenta por cobrar.

## 7. Tratamiento contable

Ningún asiento se escribe a mano: todos salen de con_reglas_contables. El costo se acumula primero en una cuenta de servicios en proceso y al cerrar la orden se traslada según la cobertura. Las cuentas son ilustrativas; las define el plan de cuentas de cada compañía y debe validarlas un contador.

| Evento | Tipo de transacción | Débito | Crédito |
| --- | --- | --- | --- |
| Consumo de material en la orden | SRV_CONSUMO | Servicios en proceso | Inventario |
| Registro de horas | SRV_MANO_OBRA | Servicios en proceso | Mano de obra aplicada |
| Servicio de tercero recibido | SRV_TERCERO | Servicios en proceso | Provisión por pagar |
| Cierre de orden facturable | SRV_CIERRE_FACTURABLE | Costo de servicios prestados | Servicios en proceso |
| Factura al cliente | VENTA e IVA_VENTAS | Clientes | Ingresos por servicios, IVA en ventas |
| Cierre de orden en garantía | SRV_CIERRE_GARANTIA | Gasto de garantías | Servicios en proceso |
| Cierre de orden por contrato | SRV_CIERRE_CONTRATO | Costo de servicios por contrato | Servicios en proceso |
| Cierre de orden interna | SRV_CIERRE_INTERNO | Gasto del centro de costo | Servicios en proceso |

Con esto la garantía nunca se mezcla con el costo de lo vendido: queda en su propia cuenta, como se pidió. La clase contable del tipo de orden permite además separar cuentas por línea de negocio, por ejemplo garantías de equipos y garantías de instalaciones.

## 8. Cambios al modelo de datos

Se harán en una migración nueva (0003). Lo que ya existe se mantiene.

| Tabla | Cambio |
| --- | --- |
| srv_tipos_orden | Agregar cobertura por defecto, clase contable y margen para servicios de terceros |
| srv_objetos | Agregar artículo de origen, fecha de venta o instalación |
| srv_perfiles (nueva) | Catálogo de perfiles o especialidades |
| srv_recursos_perfiles (nueva) | Perfiles de cada recurso |
| srv_tarifas (nueva) | Tarifa de costo y de venta por perfil, recurso y lista de precios, con vigencia |
| srv_plantillas | Agregar precio cerrado opcional |
| srv_plantillas_lineas | Agregar clase de línea TERCERO, perfil requerido, número de personas y facturable |
| srv_ordenes | Agregar cobertura, motivo de cambio de cobertura, garantía aplicada, contrato aplicado, plantilla usada y centro de costo para internas |
| srv_ordenes_actividades | Agregar perfil, tarifa de costo y de venta, precio cerrado y facturable |
| srv_ordenes_horas (nueva) | Registro de horas reales por recurso, fecha, inicio y fin |
| srv_ordenes_terceros (nueva) | Servicios de terceros ligados a compras |
| srv_garantias_definicion (nueva) | Reglas de garantía por artículo o categoría |
| srv_garantias_objeto (nueva) | Garantía calculada de cada objeto, con inicio, fin y coberturas |
| ven_contratos_lineas | Agregar porcentajes de cobertura de mano de obra y materiales, tope y tipos de orden cubiertos |
| ven_contratos_preventivos (nueva) | Preventivos programados con frecuencia, tempario y próxima fecha |
| ven_facturas_lineas | Agregar referencia a la actividad de orden de servicio de origen |
| con_tipos_transaccion | Cargar los tipos SRV_ de la sección 7 |

## 9. Pantallas

| Pantalla | Uso |
| --- | --- |
| Tablero de órdenes | Órdenes por estado, recurso y fecha, con filtros |
| Orden de servicio | Cabecera, pestañas de actividades, horas, consumos, terceros, previsto contra real y prefactura |
| Agenda de recursos | Vista por día y semana para reservar y reprogramar |
| Objeto atendido | Ficha con historial de órdenes y garantía vigente |
| Temparios | Mantenimiento de temparios con sus líneas |
| Garantías y contratos | Definición de garantías y coberturas de contratos |
| Revisión para cobro | Lista de órdenes en estado 50 para revisar y facturar en lote |

## 10. Reglas y validaciones

1. No se registran horas ni consumos en una orden cerrada, cancelada o facturada.
2. Un consumo de material inventariable exige bodega y existencia disponible, salvo que la bodega permita saldo negativo.
3. Cambiar la cobertura exige permiso y motivo.
4. No se cancela una orden con consumos o horas registradas; primero se reversan.
5. Al reversar un consumo se crea un movimiento de kardex inverso; nunca se borra el original.
6. La prefactura de una orden en garantía o contrato muestra lo cubierto y lo no cubierto por separado.
7. Los preventivos de contrato generan sus órdenes con un proceso diario y nunca duplican una orden del mismo período.

## 11. Escenarios de prueba para aceptar el módulo

1. Orden facturable con tempario: se copian actividades y materiales, se registran horas y consumos, se factura y los asientos cuadran.
2. Orden sobre un objeto en garantía: se propone GARANTIA, no se factura al cliente y el costo termina en gasto de garantías.
3. Garantía parcial que cubre solo mano de obra: los materiales se facturan al cliente.
4. Orden con contrato al 80 %: se factura el 20 % como copago y el resto va a costo por contrato.
5. Cambio manual de cobertura sin permiso: se rechaza. Con permiso: queda el motivo en la auditoría.
6. Consumo de material sin existencia: se rechaza.
7. Preventivo mensual: el proceso genera una orden por período y no la repite.
8. Aislamiento: un suscriptor no ve órdenes, objetos ni temparios de otro.

## 12. Decisiones que necesito de usted

1. Reclamos de garantía al fabricante o proveedor (recuperar lo gastado): ¿entran en la fase 1 o quedan para después?
2. Mesa de ayuda con casos antes de la orden: ¿fase 1 o posterior?
3. ¿Usamos la cuenta de servicios en proceso, como propone la sección 7, o prefiere cargar el costo directo al cierre sin cuenta intermedia?
4. Para las órdenes en garantía: ¿basta con el gasto de garantías, o también quiere una provisión de garantías al momento de la venta?
5. ¿Las horas se registran con hora de inicio y fin, solo con total de horas, o ambas opciones según el tipo de orden?
