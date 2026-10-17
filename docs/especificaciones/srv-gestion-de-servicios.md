# Especificación funcional: Gestión de servicios

Estado: aprobado por Mauricio Mora con alcance completo. Versión 0.2, 17 de octubre de 2026.

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
| Reclamos de garantía al proveedor | Recuperar del fabricante lo gastado en garantías | Fase 1 |
| Llamadas o casos | Mesa de ayuda que registra la solicitud antes de la orden | Fase 1 |

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

Ningún asiento se escribe a mano: todos salen de con_reglas_contables. Igual que en los ERP clásicos, cada línea de un asiento corresponde a un concepto contable (una cuenta con su función), y la regla resuelve la cuenta del concepto según la compañía, la clase contable y la unidad de negocio, de lo más específico a lo más general. El costo se acumula primero en servicios en proceso y al cerrar la orden se traslada según la cobertura. Las cuentas son de ejemplo; las define el plan de cuentas de cada compañía y debe validarlas un contador.

| Evento | Débito (concepto) | Crédito (concepto) |
| --- | --- | --- |
| Consumo de material en la orden | Servicios en proceso (SRV_PROCESO) | Inventario (INVENTARIO) |
| Registro de horas | Servicios en proceso (SRV_PROCESO) | Mano de obra aplicada (MO_APLICADA) |
| Servicio de tercero | Servicios en proceso (SRV_PROCESO) | Servicios de terceros por pagar (TERCEROS_POR_PAGAR) |
| Cierre, parte facturable | Costo de servicios prestados (COSTO_SERVICIO) | Servicios en proceso (SRV_PROCESO) |
| Cierre, parte en garantía | Gasto de garantías (GASTO_GARANTIA) | Servicios en proceso (SRV_PROCESO) |
| Cierre, parte por contrato | Costo de servicios por contrato (COSTO_CONTRATO) | Servicios en proceso (SRV_PROCESO) |
| Cierre, orden interna | Gasto interno de servicio (GASTO_INTERNO) | Servicios en proceso (SRV_PROCESO) |
| Factura al cliente | Clientes (CLIENTES) | Ingresos (INGRESO) e IVA en ventas (IVA_VENTAS) |
| Reclamo aprobado por el proveedor | Cuentas por cobrar a proveedores por garantías (CXC_GARANTIA) | Gasto de garantías (GASTO_GARANTIA) |
| Ajuste de inventario | Inventario (INVENTARIO) | Ajustes de inventario (AJUSTE_INV), o al revés en salidas |

Con esto la garantía nunca se mezcla con el costo de lo vendido: queda en su propia cuenta y, si el fabricante la reconoce, la recuperación se descuenta de esa misma cuenta. En coberturas parciales el costo se reparte en la misma proporción que la cobertura.

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
| con_tipos_transaccion | Cargar los conceptos contables de la sección 7 |
| sis_flujos_estado | Agregar la fase de cada estado (registrada, programada, en ejecución, terminada, revisada, facturada, cerrada, cancelada), para que el código trabaje por fase y los números sigan siendo configurables |
| srv_campos | Agregar la marca de dato sensible |
| srv_casos (nueva) | Casos de la mesa de ayuda |
| srv_casos_notas (nueva) | Bitácora de cada caso |
| srv_reclamos (nueva) | Reclamos de garantía al fabricante o proveedor |

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
9. Caso de mesa de ayuda con prioridad alta: calcula su fecha compromiso y genera una orden ligada.
10. Reclamo de garantía aprobado por un monto menor al reclamado: genera el asiento de recuperación por el monto aprobado.
11. Campo sensible: un usuario sin permiso de datos sensibles no lo ve en la orden.

## 12. Mesa de ayuda

La mesa de ayuda registra la solicitud del cliente antes de que exista una orden: una llamada, un correo, una consulta en ventanilla o un pedido de turno médico.

Cada caso tiene número, cliente, contacto, objeto atendido, canal, tipo, prioridad, asunto, descripción, responsable y estado (abierto, en proceso, en espera del cliente, resuelto, cerrado). La prioridad viene de un catálogo configurable que define las horas de respuesta comprometidas; con ellas el sistema calcula la fecha compromiso y marca los casos vencidos. El caso guarda una bitácora de notas, internas o visibles para el cliente. Si el caso requiere trabajo, desde él se genera la orden de servicio, que queda ligada al caso; si se resuelve por teléfono, se cierra con la solución registrada.

## 13. Reclamos de garantía al fabricante o proveedor

Cuando una orden en garantía cubre un objeto respaldado por su fabricante o proveedor, al cerrarla se puede generar un reclamo por el costo cubierto. El reclamo pasa por los estados borrador, enviado, aprobado, rechazado y cerrado. Se registra la referencia que da el proveedor y el monto aprobado, que puede ser menor al reclamado. Al aprobarse se genera el asiento de recuperación de la sección 7, y el cobro sigue luego por cuentas por cobrar.

## 14. Configuración por industria y área médica

El módulo trae plantillas de industria que se aplican con un clic: odontología, clínica u hospital, mantenimiento de equipos y taller automotriz. Cada plantilla crea los tipos de orden, el flujo de estados, los campos propios, los perfiles y temparios de ejemplo de esa industria. El cliente luego los ajusta a su realidad.

Para el área médica se agregan dos reglas. Los campos personalizados pueden marcarse como sensibles (diagnóstico, alergias, antecedentes) y solo los ven los usuarios con el permiso de datos sensibles; el resto ve la orden sin esos campos. Además, el contenido clínico de los temparios lo define la institución con su personal médico; el sistema solo lo administra. El tratamiento de estos datos debe ajustarse a la Ley Orgánica de Protección de Datos Personales y conviene revisarlo con un abogado antes de vender a clínicas.

## 15. Decisiones tomadas

| Tema | Decisión |
| --- | --- |
| Reclamos al fabricante y mesa de ayuda | Entran en la fase 1, por instrucción de Mauricio |
| Cuenta intermedia | Se usa servicios en proceso: permite ver el costo de las órdenes abiertas y cerrar cada una según su cobertura |
| Provisión de garantías al vender | No en la fase 1: el gasto se reconoce al cerrar cada orden. Se puede agregar después como mejora contable |
| Registro de horas | Se aceptan ambas formas, hora de inicio y fin o total de horas; el tipo de orden define cuál se exige |
| Facturación de la cuota de los contratos | Corresponde al módulo de ventas; aquí solo se aplica la cobertura del contrato |
