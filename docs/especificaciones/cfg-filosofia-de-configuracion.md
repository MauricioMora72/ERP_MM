# Especificación funcional: Filosofía de configuración (cuenta segmentada, reglas contables, bancos de datos e interfaz cabecera y detalle)

Estado: propuesta para aprobación de Mauricio Mora. Versión 0.3, 19 de octubre de 2026. Incorpora sus respuestas sobre combinaciones, formato del objeto y categorías, el inventario completo de bancos de datos, la pantalla de reglas contables con el mapa de transacciones y la interfaz cabecera y detalle en todas las pantallas.

## 1. Objetivo

Llevar al producto la filosofía de configuración de los ERP clásicos de distribución en cuatro frentes que hoy están incompletos:

1. La cuenta contable deja de ser un solo código y pasa a ser una combinación de segmentos: unidad de negocio, objeto, auxiliar y hasta diez segmentos adicionales que hacen crecer la cuenta a la derecha. Las reglas contables arman cada segmento con datos de la transacción (contabilidad flexible).
2. Las reglas contables se configuran en una pantalla propia, concepto por concepto, y el consultor tiene un mapa de qué conceptos usa cada transacción.
3. Toda lista de valores de cualquier pantalla sale de un banco de datos con código propio (por ejemplo GEN/00, banco de datos general donde se crean los tipos de documento). El cliente crea y mantiene bancos de datos sin programar y el código del sistema no lleva listas fijas.
4. Todas las pantallas siguen los mismos patrones: pantalla de trabajo para buscar y, para registrar, cabecera arriba y detalle en grilla abajo.

Se hereda la forma de trabajar, no el esquema: no se usan nombres de tablas, números de programa, alias ni códigos de banco de datos del ERP de referencia.

## 2. Situación actual

| Tema | Hoy | Lo que falta |
| --- | --- | --- |
| Cuenta contable | Código jerárquico del plan (1.1.01) con centro de costo y tercero aparte | Auxiliar y segmentos adicionales; saldos por combinación |
| Reglas contables | Compañía, tipo de transacción, clase contable y unidad de negocio devuelven la cuenta | Que también decidan la unidad de negocio, el auxiliar y cada segmento a partir de la transacción; llave por tipo de documento |
| Catálogos | Existen cat_catalogos y cat_valores, pero solo cinco campos los usan | Código de banco de datos visible, uso obligatorio en toda lista, valores fijos del sistema, categorías en los maestros |
| Tipos de documento | Tabla propia, código único por módulo | Que nazcan en GEN/00 con código único en toda la empresa |

## 3. Cuenta segmentada

### 3.1 Estructura

La cuenta completa de una línea contable se escribe así:

Unidad de negocio . Objeto . Auxiliar . Segmento 1 . … . Segmento 10

| Segmento | Qué es | De dónde sale el valor |
| --- | --- | --- |
| Unidad de negocio | Sucursal, bodega, planta, centro de costo o proyecto (mae_unidades_negocio) | Obligatoria en toda línea |
| Objeto | Cuenta del plan de cuentas (con_cuentas), con su jerarquía; su formato se configura por compañía (ver 3.2) | Obligatorio; debe aceptar movimiento |
| Auxiliar | Detalle libre del objeto, hasta 8 caracteres (por ejemplo, el banco dentro de Bancos o la categoría del artículo dentro de Inventario) | Opcional, salvo que el objeto lo exija |
| Segmentos 1 a 10 | Dimensiones que define cada compañía: línea de producto, vendedor, canal, región, proyecto, actividad, etc. | Opcionales; cada objeto dice cuáles exige |

El tercero (cliente, proveedor, empleado) sigue siendo una dimensión aparte de la línea, como auxiliar de terceros, y no forma parte del código de la cuenta.

### 3.2 Formato del objeto

Cada compañía escoge cómo numera el objeto:

| Formato | Comportamiento |
| --- | --- |
| Plan local | El objeto es el código del plan de la Superintendencia (1.1.01.001) y los estados se arman directamente con él |
| Objeto corto | El objeto es un código corto propio (por ejemplo 1110) y cada objeto lleva su cuenta del plan local como dato de reporte; los estados para la Superintendencia se arman con ese dato |

La compañía define además la máscara del objeto (longitud y separadores) y el formato se puede cambiar mientras no haya asientos.

### 3.3 Definición de segmentos por compañía

Cada compañía define en la pantalla Segmentos contables cuáles de los diez usa. Por cada uno indica:

1. Nombre corto y largo (por ejemplo, LIN, Línea de producto).
2. Longitud.
3. Validación: contra un banco de datos, contra un maestro (artículos, direcciones, unidades de negocio) o libre.
4. Si es obligatorio en todas las cuentas o solo en los objetos que lo pidan.

En la ficha del objeto (plan de cuentas) se marca qué segmentos exige y si exige auxiliar, igual que hoy se marca si exige centro de costo o tercero.

### 3.4 Combinaciones de cuenta

1. Solo se contabiliza en combinaciones unidad de negocio . objeto . auxiliar creadas antes, como en el ERP de referencia. Una regla contable que lleve a una combinación inexistente detiene el documento y dice qué combinación falta.
2. Cada combinación tiene descripción, estado activo o inactivo y nivel de detalle, y puede marcarse como no contabilizable.
3. Hay una herramienta para copiar los objetos de una unidad modelo a otras unidades, con o sin sus auxiliares.

Los segmentos 1 a 10 nunca exigen combinación previa; se validan solos contra su banco de datos o su maestro.

### 3.5 Saldos y reportes

1. Los saldos se guardan por período y por combinación completa: unidad, objeto, auxiliar, segmentos 1 a 10 y tercero cuando el objeto lo exige.
2. Balance de comprobación, mayor, balance general y estado de resultados se pueden sacar a cualquier nivel: por objeto (como hoy), por unidad de negocio y su jerarquía, por auxiliar o por cualquier segmento, con filtros por rango de valores.
3. El mayor muestra la cuenta completa con sus segmentos.

## 4. Reglas contables y contabilidad flexible

### 4.1 Reglas contables (instrucciones de contabilización)

Son el único camino para que un módulo genere asientos. Ningún programa escoge cuentas: cada transacción pide al motor contable un concepto (por ejemplo INGRESO o INVENTARIO) con los datos de la línea, y el motor busca la regla.

Conceptos. El producto entrega los conceptos que usa la lógica en el banco de datos de valores fijos CON/03. El cliente no crea conceptos, porque ningún programa los pediría; solo configura sus reglas. Cada concepto tiene:

1. Descripción y para qué sirve.
2. Transacciones que lo usan y de qué lado van normalmente (débito o crédito). Ver el anexo B.
3. Qué llaves admite: por ejemplo INVENTARIO admite clase contable de artículo y unidad de negocio; CLIENTES admite clase contable de cliente; IVA_VENTAS admite clase contable de impuesto.

Llave de búsqueda de la regla, de lo más específico a lo más general:

| Llave | Valor en blanco significa |
| --- | --- |
| Compañía | Regla por defecto para todas las compañías del suscriptor |
| Tipo de documento (GEN/00) | Todos los tipos |
| Clase contable (CON/01) | Todas las clases |
| Unidad de negocio | Todas las unidades |

El orden de precedencia es: compañía exacta antes que compañía en blanco, luego tipo de documento, luego clase contable, luego unidad de negocio, y la prioridad desempata.

Resultado de la regla: objeto (obligatorio), auxiliar fijo (opcional) y unidad de negocio fija (opcional). Lo que quede en blanco lo llena la contabilidad flexible (4.2). La combinación que resulte debe existir (3.4).

### 4.2 Pantalla Reglas contables

Pantalla de trabajo: se busca por compañía y concepto. La grilla muestra un concepto por fila con su descripción, cuántas reglas tiene y si le falta regla para alguna compañía.

Pantalla de cabecera y detalle (al seleccionar un concepto):

1. Cabecera: concepto, descripción, lado normal, llaves que admite y la lista de transacciones que lo usan, para que el consultor sepa qué afecta.
2. Detalle en grilla editable: una fila por regla con compañía, tipo de documento, clase contable, unidad de negocio, objeto, auxiliar fijo, unidad fija y prioridad. La última fila en blanco sirve para agregar. Cada código muestra su descripción al lado.
3. Acciones de la pantalla: copiar las reglas de una compañía a otra, simular y revisar integridad.

Simulación. Se escoge una transacción del anexo B, una compañía, un artículo, cliente o proveedor y una bodega o unidad, y la pantalla muestra el asiento que resultaría con la cuenta completa de cada línea y qué regla la produjo. Así el consultor prueba la configuración antes de que el usuario registre documentos.

Revisión de integridad. Reporte que cruza conceptos, compañías, tipos de documento en uso y clases contables en uso (en artículos, clientes, proveedores, impuestos y cuentas bancarias) y lista las combinaciones que no encuentran regla, las reglas que llevan a combinaciones inexistentes o inactivas y los objetos que no aceptan movimiento. Se corre al terminar la configuración y antes de cada salida en vivo.

### 4.3 Contabilidad flexible

Una regla flexible dice, para una compañía, un concepto (o todos) y un rango de objetos, de dónde sale cada segmento que la regla contable no fijó:

| Segmento | Fuentes posibles |
| --- | --- |
| Unidad de negocio | Del documento, de la bodega o de la línea, del vendedor, del recurso, fija |
| Auxiliar | Valor fijo, una categoría del artículo, del cliente o proveedor o de la unidad de negocio, el tipo de documento, la clase contable |
| Segmentos 1 a 10 | Las mismas fuentes que el auxiliar, más campos de la transacción (vendedor, proyecto, tipo de orden de servicio, canal) |

Ejemplo: en el concepto INGRESO, el segmento Línea de producto toma la categoría 1 del artículo y el segmento Vendedor toma el vendedor de la orden. Cada factura queda contabilizada con ambos datos sin que ventas sepa nada de cuentas.

Si un segmento obligatorio queda vacío después de aplicar las reglas, el documento no se graba y el mensaje dice qué regla falta.

### 4.4 Categorías en los maestros

Para que la contabilidad flexible tenga de dónde tomar datos, artículos, direcciones (clientes y proveedores) y unidades de negocio llevan categorías. No hay un número fijo de columnas: las categorías son registros hacia abajo.

1. Cada compañía define qué categorías usa cada maestro, cuantas necesite. Cada una se liga a un banco de datos (por ejemplo, INV/50 Línea de producto, INV/51 Marca).
2. Un banco de datos puede depender de otro para formar subcategorías: en INV/52 Sublínea cada valor tiene su valor padre en INV/50 Línea. Al escoger la línea, la sublínea solo ofrece sus hijos.
3. En la ficha del maestro, una pestaña Categorías muestra una fila por categoría definida, con su valor. Se puede marcar una categoría como obligatoria.
4. Las reglas flexibles, los reportes y las búsquedas se refieren a la categoría por el código de su banco de datos.

## 5. Bancos de datos

### 5.1 Concepto

Un banco de datos es una lista de códigos con su descripción que el cliente administra. Se identifica con el prefijo del módulo y dos caracteres: GEN/00, MAE/01, INV/03. El banco de datos no se liga a la pantalla sino al campo del diccionario de datos: toda pantalla que use ese campo valida contra la misma lista y ofrece la misma ayuda, sin configurarla pantalla por pantalla. La ayuda del campo muestra el código del banco, para que el usuario sepa dónde se mantiene.

### 5.2 Definición del banco de datos

| Dato | Uso |
| --- | --- |
| Código | Módulo y dos caracteres, por ejemplo GEN/00 |
| Descripción | Para qué sirve |
| Longitud y tipo | Longitud máxima y si los códigos son numéricos o alfanuméricos |
| Del sistema | Lo entrega el producto y no se puede borrar |
| Valores fijos | El sistema depende de sus códigos: no se borran ni se agregan, solo se cambia la descripción |

### 5.3 Valores

Cada valor tiene código, descripción, segunda descripción, código especial (dato que usa la lógica, por ejemplo la clase de comportamiento de un tipo de documento o las horas de compromiso de una prioridad), valor padre cuando el banco depende de otro, orden y activo. Un valor en uso no se borra, se inactiva.

El cliente puede crear sus propios bancos de datos con el prefijo de cualquier módulo y un código de dos caracteres que no use el producto. El producto reserva del 00 al 49 en cada módulo; del 50 al 99 quedan para el cliente. Los bancos del cliente se usan en categorías, segmentos contables y campos propios de órdenes de servicio.

### 5.4 Uso en pantallas

1. Los campos de lista muestran código y descripción y permiten buscar.
2. Junto al campo, quien tiene el permiso cat-mantener puede abrir el banco de datos y agregar un valor sin salir de la pantalla.
3. Las listas que hoy están fijas en el código (tipos de unidad de negocio, tipos de cuenta bancaria, prioridad y canal de casos, coberturas, tipos de existencia, motivos, etc.) pasan a bancos de datos. Las que la lógica necesita quedan como bancos con valores fijos.

### 5.5 Tipos de documento en GEN/00

1. GEN/00 es el banco de datos general de tipos de documento. Un tipo nace ahí con su código de dos caracteres y su descripción, y el código es único en toda la empresa, no por módulo.
2. Su comportamiento (módulo, clase, si mueve inventario, si genera contabilidad, estado inicial, flujo de estados y numerador) se configura en la pantalla Tipos de documento, que solo deja escoger códigos que existan en GEN/00.
3. El código especial de cada tipo es su clase de comportamiento (GEN/01): así la lógica sabe qué tipos son órdenes de venta, facturas, recepciones o cobros, y el cliente puede crear tipos propios (por ejemplo una segunda orden de venta para exportación) que se comportan igual que el del producto.
4. Por la unicidad se resuelve un choque actual: RC queda para la recepción de compras, el recibo de cobro pasa a RB y el asiento de cierre CIERRE pasa a CA.

### 5.6 Qué es banco de datos y qué no

Es banco de datos toda lista de códigos con descripción y, a lo sumo, un dato especial. Sigue siendo tabla maestra lo que tiene muchos atributos propios o fechas de vigencia: monedas y tipos de cambio, impuestos, códigos de retención del SRI, condiciones de pago, listas de precios, tipos de orden de servicio, cuentas bancarias y el plan de cuentas. Así se respeta la regla de que los valores tributarios van en tablas con fecha de vigencia.

### 5.7 Inventario de bancos de datos

El anexo A trae la lista completa de bancos de datos que necesitan los módulos construidos hasta hoy, con el campo al que se liga cada uno, si sus valores son fijos y qué hace su código especial. Son 70 bancos: 34 de valores fijos, que reemplazan las listas que hoy están escritas en el código, y 36 que el cliente amplía. Los marcados como nuevos reemplazan un texto libre o agregan un dato que hoy falta.

## 6. Interfaz: pantalla de trabajo y cabecera y detalle

### 6.1 Patrones de pantalla

Todas las pantallas del producto usan uno de cuatro patrones, como en el ERP de referencia:

| Patrón | Para qué | Cómo se ve |
| --- | --- | --- |
| Pantalla de trabajo | Buscar y escoger registros o documentos | Filtros arriba, una fila de búsqueda bajo los títulos de la grilla para filtrar por cualquier columna, grilla de resultados y botones Buscar, Agregar, Seleccionar, Copiar y Borrar o anular |
| Cabecera y detalle | Registrar y modificar documentos con líneas | Cabecera arriba con los datos del documento; grilla editable de líneas abajo con una fila en blanco al final para agregar; totales al pie. La misma pantalla sirve para crear, modificar y consultar |
| Detalle sin cabecera | Configuración que es una lista | Uno o dos campos de filtro arriba y grilla editable abajo: valores de un banco de datos, reglas contables de un concepto, flujos de estado, precios, períodos, segmentos, combinaciones |
| Ficha | Maestros con muchos datos | Datos en pestañas: dirección, artículo, unidad de negocio, compañía. Las listas dependientes (ubicaciones, contactos, categorías, sucursales del artículo) van como grillas dentro de su pestaña |

### 6.2 Reglas comunes

1. Todo documento se abre desde su pantalla de trabajo y vuelve a ella.
2. En la cabecera y detalle se graba el documento completo de una vez con el botón Aceptar; Cancelar descarta los cambios. Las líneas que ya avanzaron de estado quedan protegidas y solo admiten las acciones que su flujo permita.
3. Acciones de fila: al marcar una o varias líneas, un menú ofrece lo que se puede hacer con ellas (cambiar estado, despachar, recibir, ver kardex, ver asiento, cancelar). Acciones de pantalla: un menú con lo que aplica al documento entero (imprimir, ver asiento, copiar, documentos relacionados).
4. Todo campo con banco de datos o maestro muestra código y descripción y tiene ayuda visual (lupa) para buscar. La descripción aparece al salir del campo.
5. Se trabaja con teclado: Tab avanza de campo, Enter en la última columna baja a la siguiente línea, y hay atajos para Aceptar, Buscar y Agregar.
6. La grilla permite escoger columnas, ordenarlas, filtrarlas y exportarlas a hoja de cálculo.
7. Los mensajes de error señalan el campo y la línea exacta.
8. Cada pantalla tiene su código de pantalla visible en la esquina, para referirse a ella en soporte y en permisos.

### 6.3 Pantallas actuales y su patrón

El anexo C lista las pantallas construidas y el patrón que tendrán. Hoy varias registran el documento en un panel y lo consultan en otra página; con este cambio quedan en una sola pantalla de cabecera y detalle.

## 7. Datos

1. con_segmentos (nueva): definición de los diez segmentos por compañía.
2. con_combinaciones (nueva): combinaciones unidad . objeto . auxiliar, que deben existir antes de contabilizar.
3. con_reglas_flexibles (nueva): origen de la unidad, el auxiliar y cada segmento.
4. con_reglas_contables: agrega tipo de documento, auxiliar fijo y unidad fija.
5. con_cuentas: agrega exige_auxiliar, los segmentos que exige y la cuenta del plan local como dato de reporte. mae_companias agrega el formato y la máscara del objeto.
6. con_asientos_lineas y con_saldos: agregan auxiliar y segmento_01 a segmento_10; el centro de costo actual pasa a ser el segmento unidad de negocio.
7. cat_catalogos: agrega código de banco de datos, tipo de código, valores fijos y banco de datos padre. cat_valores agrega valor padre para las subcategorías.
7a. sis_campos_diccionario (nueva): campos del diccionario de datos con su etiqueta, ayuda y banco de datos; las pantallas toman de ahí la validación.
7b. con_clases_contables y con_tipos_transaccion pasan a ser los bancos de datos CON/01 y CON/03; sus datos se trasladan en la migración.
8. mae_categorias_definidas (nueva): qué bancos de datos son categorías de cada maestro, por compañía, con su orden y si son obligatorias.
9. mae_categorias (nueva): una fila por registro de maestro y categoría, con su valor.
10. sis_tipos_documento: el código pasa a validarse contra GEN/00 y deja de repetirse entre módulos.

Todo va en una migración nueva; no se edita ninguna aplicada.

## 8. Permisos

con-configurar para segmentos, combinaciones, reglas contables y reglas flexibles; cat-mantener para valores de bancos de datos; cat-definir para crear bancos de datos nuevos.

## 9. Fuera de esta versión

Moneda extranjera por segmento, presupuestos por segmento, distribuciones y prorrateos automáticos entre unidades, y consolidación entre compañías.

## 10. Decisiones

1. Combinaciones: se crean antes de contabilizar (respuesta de Mauricio Mora).
2. Formato del objeto: configurable por compañía entre plan local y objeto corto (respuesta de Mauricio Mora).
3. Categorías: registros hacia abajo, sin número fijo, con subcategorías (respuesta de Mauricio Mora).
4. Tipos de documento: RC para la recepción de compras, RB para el recibo de cobro y CA para el asiento de cierre.
5. Reglas contables con pantalla propia, simulación y revisión de integridad; mapa de conceptos por transacción en el anexo B.
6. Interfaz cabecera y detalle en todas las pantallas de documentos (anexo C).

## 11. Orden de construcción propuesto

1. Bancos de datos: diccionario de campos, pantalla de bancos de datos en detalle sin cabecera, traslado de las listas fijas y de las categorías actuales.
2. Componentes de interfaz: pantalla de trabajo, cabecera y detalle con grilla editable, ayuda visual y menús de fila y de pantalla.
3. Cuenta segmentada: formato del objeto, segmentos, combinaciones y saldos por combinación.
4. Reglas contables y contabilidad flexible: pantalla, simulación, revisión de integridad y cambio del motor contable.
5. Pasar las pantallas existentes al patrón que les corresponde según el anexo C.

Cada paso queda probado y utilizable antes del siguiente.

## Anexo A. Bancos de datos del producto

Fijos: Sí significa que la lógica depende de sus códigos; el cliente solo cambia descripciones. No significa que el cliente agrega valores; los protegidos no se borran. Los bancos EC se usarán cuando se construya la parte del SRI.

| Banco | Contenido | Campo o uso | Fijos | Código especial |
| --- | --- | --- | --- | --- |
| GEN/00 | Tipos de documento | Todo campo tipo de documento; sis_tipos_documento | No; los del producto no se borran | Clase de comportamiento (GEN/01) |
| GEN/01 | Clases de comportamiento de documento | sis_tipos_documento.clase | Sí |  |
| GEN/02 | Módulos | sis_tipos_documento.modulo, origen de asientos, bancos de datos | Sí | Prefijo de tablas |
| GEN/03 | Fases de estado de línea | sis_flujos_estado.fase | Sí | Orden de la fase |
| GEN/04 | Acciones de permiso | sis_roles_permisos.accion | Sí |  |
| GEN/05 | Tipos de dato de campos propios | srv_campos.tipo_dato | Sí |  |
| GEN/06 | Estados de período | con_periodos, estado por módulo | Sí |  |
| GEN/07 | Países | Ubicaciones de direcciones (hoy texto) | No | Código ISO |
| GEN/08 | Provincias, dependiente de GEN/07 | Ubicaciones de direcciones (hoy texto) | No | Código oficial |
| GEN/09 | Cantones o ciudades, dependiente de GEN/08 | Ubicaciones de direcciones (hoy texto) | No | Código oficial |
| MAE/01 | Tipos de identificación | mae_direcciones.tipo_identificacion | Sí | Código del SRI |
| MAE/02 | Tipos de búsqueda de dirección | mae_direcciones.tipo_busqueda | No; cliente, proveedor, empleado y banco protegidos |  |
| MAE/03 | Tipos de ubicación | mae_direcciones_ubicaciones.tipo | No; matriz, entrega y facturación protegidos |  |
| MAE/04 | Tipos de unidad de negocio | mae_unidades_negocio.tipo | No; bodega protegido | B si la unidad guarda inventario |
| MAE/05 | Unidades de medida | Unidad de artículos, conversiones, precios y líneas | No | Decimales permitidos |
| MAE/06 | Tipos de existencia | mae_articulos.tipo_existencia | Sí | S si pasa por kardex |
| MAE/07 | Tipos de impuesto | mae_impuestos.tipo | Sí |  |
| MAE/08 | Formas de cobro y pago | Cobros, pagos y facturas | No | Código del SRI de forma de pago |
| SRV/01 | Tipos de objeto atendido | Tipos de orden y objetos atendidos | No |  |
| SRV/02 | Coberturas | Órdenes, tipos de orden y coberturas de contrato | Sí | Concepto contable con que se liquida (CON/03) |
| SRV/03 | Modo de registro de horas | srv_tipos_orden.modo_horas | Sí |  |
| SRV/04 | Tipos de recurso | srv_recursos.tipo | No |  |
| SRV/05 | Clases de línea de tempario | srv_plantillas_lineas.tipo_linea | Sí |  |
| SRV/06 | Estados de reserva de agenda | srv_agenda.estado | Sí |  |
| SRV/07 | Prioridades de caso | srv_casos.prioridad | No | Horas de compromiso de respuesta |
| SRV/08 | Canales de caso | srv_casos.canal | No |  |
| SRV/09 | Tipos de caso | srv_casos.tipo | No |  |
| SRV/10 | Estados de caso | srv_casos.estado | Sí |  |
| SRV/11 | Estados de reclamo de garantía | srv_reclamos.estado | Sí |  |
| SRV/12 | Motivos de cambio de cobertura (nuevo) | srv_ordenes.motivo_cobertura (hoy texto) | No |  |
| VEN/01 | Frecuencias de facturación de contratos | ven_contratos.frecuencia | No | Número de meses |
| VEN/02 | Estados de contrato | ven_contratos.estado | Sí |  |
| VEN/03 | Estados de factura | ven_facturas.estado | Sí |  |
| VEN/04 | Códigos de retención de órdenes (nuevo) | Orden de venta retenida | No; crédito protegido | Permiso que la libera |
| VEN/05 | Motivos de nota de crédito (nuevo) | Notas de crédito | No | D si devuelve a bodega |
| VEN/06 | Motivos de cancelación de línea de venta (nuevo) | Líneas de orden de venta | No |  |
| COM/01 | Resultados de aprobación | com_aprobaciones.resultado | Sí |  |
| COM/02 | Estados de factura de proveedor | com_facturas.estado | Sí |  |
| COM/03 | Motivos de cancelación de línea de compra (nuevo) | Líneas de orden de compra | No |  |
| INV/01 | Estados de lote | inv_lotes.estado | Sí | S si se puede despachar |
| INV/02 | Estados de documento de inventario | inv_documentos.estado | Sí |  |
| INV/03 | Motivos de ajuste (nuevo) | Ajustes y conteos | No |  |
| INV/20 | Categoría de artículo (la actual, primera categoría) | Categorías del artículo | No |  |
| CXC/01 | Rangos de antigüedad de clientes | Antigüedad de saldos (hoy fijo 30, 60, 90) | No | Días hasta |
| CXP/01 | Rangos de antigüedad de proveedores | Antigüedad de saldos (hoy fijo 30, 60, 90) | No | Días hasta |
| CON/01 | Clases contables | Artículos, clientes, proveedores, impuestos, tipos de orden, cuentas bancarias y reglas | No | A qué aplica (CON/02) |
| CON/02 | Aplicación de clase contable | Clases contables | Sí |  |
| CON/03 | Conceptos contables | Reglas contables | Sí | Módulo que lo usa |
| CON/04 | Naturaleza de cuenta | con_cuentas.naturaleza | Sí |  |
| CON/05 | Tipos de cuenta | con_cuentas.tipo | Sí |  |
| CON/06 | Grupos de cuenta | con_cuentas.grupo | Sí |  |
| CON/07 | Estados de asiento | con_asientos.estado | Sí |  |
| CON/08 | Tipos de cuenta bancaria | con_cuentas_bancarias.tipo | No |  |
| CON/09 | Fuentes de contabilidad flexible | Reglas flexibles | Sí |  |
| CON/10 | Formatos del objeto | Compañías | Sí |  |
| CON/11 a 20 | Valores de los segmentos contables 1 a 10 (diez bancos) | Líneas de asiento, combinaciones y reglas | No |  |
| EC/01 | Tipos de retención | ec_codigos_retencion.tipo | Sí |  |
| EC/02 | Ambientes del SRI | ec_establecimientos.ambiente | Sí |  |
| EC/03 | Estados de comprobante electrónico | ec_comprobantes.estado | Sí |  |
| EC/04 | Estados de retención | ec_retenciones.estado | Sí |  |
| EC/05 | Estados del ATS | ec_ats_periodos.estado | Sí |  |

## Anexo B. Conceptos contables por transacción

Es el mapa que usa el consultor para configurar las reglas. Clase contable de: de dónde toma la transacción la clase que entra en la llave. Unidad de negocio de: qué unidad entra en la llave y, si la regla no la fija, en la cuenta. Las líneas marcadas como directas no pasan por reglas porque el usuario o el maestro ya dicen la cuenta. Los conceptos de retención y de IVA también admiten la clase contable del código de retención o del impuesto.

| Transacción | Pantalla | Concepto | Lado | Clase contable de | Unidad de negocio de |
| --- | --- | --- | --- | --- | --- |
| Recepción de compra | Requisiciones y órdenes | INVENTARIO o GASTO_COMPRA | Débito | Artículo | Bodega de la línea |
|  |  | REC_POR_FACTURAR | Crédito | Artículo | Bodega de la línea |
| Factura de proveedor | Facturas de proveedor | REC_POR_FACTURAR | Débito | Artículo | Bodega de la línea |
|  |  | VARIACION_COMPRA | Débito o crédito | Artículo | Bodega de la línea |
|  |  | GASTO_COMPRA | Débito | Artículo | Unidad de la línea |
|  |  | IVA_COMPRAS | Débito | Impuesto |  |
|  |  | RET_RENTA_POR_PAGAR y RET_IVA_POR_PAGAR | Crédito |  |  |
|  |  | PROVEEDORES | Crédito | Proveedor |  |
| Pago a proveedores | Pagos | PROVEEDORES | Débito | Proveedor |  |
|  |  | Cuenta del banco (directa) | Crédito |  |  |
| Despacho de venta | Cotizaciones y órdenes | DESP_POR_FACTURAR | Débito | Artículo | Bodega de la línea |
|  |  | INVENTARIO | Crédito | Artículo | Bodega de la línea |
| Factura de venta, de orden de servicio o de contrato | Órdenes de venta, órdenes de servicio, facturar contratos | CLIENTES | Débito | Cliente |  |
|  |  | INGRESO | Crédito | Artículo | Unidad del documento |
|  |  | IVA_VENTAS | Crédito | Impuesto |  |
|  |  | COSTO_VENTA | Débito | Artículo | Bodega de la línea |
|  |  | DESP_POR_FACTURAR | Crédito | Artículo | Bodega de la línea |
| Nota de crédito | Notas de crédito | DEVOLUCION_VENTAS | Débito | Artículo | Bodega de la línea |
|  |  | IVA_VENTAS | Débito | Impuesto |  |
|  |  | CLIENTES | Crédito | Cliente |  |
|  |  | INVENTARIO | Débito | Artículo | Bodega de la línea |
|  |  | COSTO_VENTA | Crédito | Artículo | Bodega de la línea |
| Cobro | Cobros | Cuenta del banco (directa) | Débito |  |  |
|  |  | CLIENTES | Crédito | Cliente |  |
| Retención recibida | Factura de venta | RET_RENTA_RECIBIDA y RET_IVA_RECIBIDA | Débito |  |  |
|  |  | CLIENTES | Crédito | Cliente |  |
| Horas en orden de servicio | Órdenes de servicio | SRV_PROCESO | Débito | Tipo de orden | Unidad de la orden |
|  |  | MO_APLICADA | Crédito | Tipo de orden | Unidad de la orden |
| Consumo de materiales y su reverso | Órdenes de servicio | SRV_PROCESO | Débito (crédito en el reverso) | Tipo de orden | Unidad de la orden |
|  |  | INVENTARIO | Crédito (débito en el reverso) | Artículo | Bodega del consumo |
| Servicio de tercero | Órdenes de servicio | SRV_PROCESO | Débito | Tipo de orden | Unidad de la orden |
|  |  | TERCEROS_POR_PAGAR | Crédito |  |  |
| Liquidación de orden de servicio | Órdenes de servicio | COSTO_SERVICIO, o según cobertura GASTO_GARANTIA, COSTO_CONTRATO o GASTO_INTERNO (SRV/02) | Débito | Tipo de orden | Unidad de la orden |
|  |  | SRV_PROCESO | Crédito | Tipo de orden | Unidad de la orden |
| Reclamo de garantía aprobado | Reclamos de garantía | CXC_GARANTIA | Débito | Proveedor |  |
|  |  | GASTO_GARANTIA | Crédito | Tipo de orden | Unidad de la orden |
| Ajuste de inventario y conteo físico | Ajustes, Conteo físico | INVENTARIO | Débito en entradas, crédito en salidas | Artículo | Bodega |
|  |  | AJUSTE_INV | Lado contrario | Artículo | Bodega |
| Transferencia entre bodegas | Transferencias | INVENTARIO | Crédito en origen, débito en destino | Artículo | Bodega de origen y de destino |
| Movimiento bancario sin registrar | Conciliación bancaria | Cuenta del banco y contrapartida (directas) | Según el movimiento |  |  |
| Asiento manual y reversa | Asientos contables | Cuentas directas | Según el asiento |  |  |
| Cierre del ejercicio | Períodos y cierre | Cuentas de resultados (directas) | Contrario a su saldo |  |  |
|  |  | RESULTADO_EJERCICIO | Diferencia |  |  |

## Anexo C. Pantallas y su patrón

| Pantalla | Patrón que tendrá | Hoy |
| --- | --- | --- |
| Direcciones (clientes, proveedores, empleados, bancos) | Ficha con pestañas: datos, ubicaciones, contactos, categorías, cliente, proveedor | Ficha simple y listas aparte |
| Artículos | Ficha con pestañas: datos, sucursales, conversiones, categorías | Ficha simple |
| Compañías y unidades de negocio | Ficha con pestañas, categorías en la unidad | Ficha simple |
| Monedas, impuestos, condiciones de pago, códigos de retención, cuentas bancarias | Pantalla de trabajo y ficha | Igual |
| Listas de precios y precios | Cabecera (lista) y detalle (precios por artículo) | Ficha con lista hija |
| Bancos de datos y sus valores | Detalle sin cabecera: se escoge el banco y se editan sus valores en grilla | Ficha con lista hija |
| Tipos de documento y flujos de estado | Cabecera (tipo) y detalle (estados y siguientes) | Ficha con lista hija |
| Numeradores, usuarios, roles y permisos | Pantalla de trabajo y ficha; permisos en detalle del rol | Igual |
| Plan de cuentas | Pantalla de trabajo en árbol y ficha | Lista plana |
| Segmentos, combinaciones, reglas contables y reglas flexibles | Detalle sin cabecera, reglas por concepto en cabecera y detalle | Nuevas |
| Períodos y cierre | Detalle sin cabecera por año | Página propia |
| Requisiciones y órdenes de compra | Pantalla de trabajo y cabecera y detalle; recepción como acción de fila | Panel de alta y página de detalle |
| Facturas de proveedor | Pantalla de trabajo y cabecera y detalle con las recepciones pendientes como líneas | Panel de alta y página de detalle |
| Pagos | Cabecera (banco, fecha, proveedor) y detalle (documentos abiertos a pagar) | Página propia |
| Cotizaciones y órdenes de venta | Pantalla de trabajo y cabecera y detalle; despacho y factura como acciones de fila | Panel de alta y página de detalle |
| Notas de crédito | Cabecera (factura origen) y detalle (líneas a devolver) | Página propia |
| Facturar contratos | Pantalla de trabajo con selección de contratos y acción de pantalla | Página propia |
| Cobros y retención recibida | Cabecera (cliente, banco, fecha) y detalle (documentos abiertos a aplicar) | Página propia |
| Órdenes de servicio | Pantalla de trabajo y cabecera y detalle con pestañas de detalle: actividades, horas, materiales, terceros | Página de detalle con secciones |
| Mesa de ayuda y reclamos | Pantalla de trabajo y cabecera y detalle (bitácora como detalle) | Páginas propias |
| Ajustes, transferencias y conteo físico | Pantalla de trabajo y cabecera y detalle | Paneles y página de conteo |
| Asientos contables | Pantalla de trabajo y cabecera y detalle | Panel de alta y página de detalle |
| Consultas: kardex, existencias, mayor, antigüedad, reportes | Pantalla de trabajo de consulta con filtros arriba y grilla | Igual |
| Conciliación bancaria | Cabecera (cuenta, fechas) con dos grillas: banco y libros | Página propia |
