# Especificación funcional: Cuenta segmentada, contabilidad flexible y bancos de datos

Estado: propuesta para aprobación de Mauricio Mora. Versión 0.1, 19 de octubre de 2026.

## 1. Objetivo

Llevar al producto la filosofía de configuración de los ERP clásicos de distribución en dos frentes que hoy están incompletos:

1. La cuenta contable deja de ser un solo código y pasa a ser una combinación de segmentos: unidad de negocio, objeto, auxiliar y hasta diez segmentos adicionales que hacen crecer la cuenta a la derecha. Las reglas contables arman cada segmento con datos de la transacción (contabilidad flexible).
2. Toda lista de valores de cualquier pantalla sale de un banco de datos con código propio (por ejemplo GEN/00, banco de datos general donde se crean los tipos de documento). El cliente los administra sin programar y el código del sistema no lleva listas fijas.

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
| Objeto | Cuenta del plan de cuentas (con_cuentas), con su jerarquía y numeración local para los estados de la Superintendencia | Obligatorio; debe aceptar movimiento |
| Auxiliar | Detalle libre del objeto, hasta 8 caracteres (por ejemplo, el banco dentro de Bancos o la categoría del artículo dentro de Inventario) | Opcional, salvo que el objeto lo exija |
| Segmentos 1 a 10 | Dimensiones que define cada compañía: línea de producto, vendedor, canal, región, proyecto, actividad, etc. | Opcionales; cada objeto dice cuáles exige |

El tercero (cliente, proveedor, empleado) sigue siendo una dimensión aparte de la línea, como auxiliar de terceros, y no forma parte del código de la cuenta.

### 3.2 Definición de segmentos por compañía

Cada compañía define en la pantalla Segmentos contables cuáles de los diez usa. Por cada uno indica:

1. Nombre corto y largo (por ejemplo, LIN, Línea de producto).
2. Longitud.
3. Validación: contra un banco de datos, contra un maestro (artículos, direcciones, unidades de negocio) o libre.
4. Si es obligatorio en todas las cuentas o solo en los objetos que lo pidan.

En la ficha del objeto (plan de cuentas) se marca qué segmentos exige y si exige auxiliar, igual que hoy se marca si exige centro de costo o tercero.

### 3.3 Combinaciones de cuenta

La compañía elige entre dos modos:

| Modo | Comportamiento |
| --- | --- |
| Estricto | Solo se contabiliza en combinaciones unidad de negocio . objeto . auxiliar creadas antes, como en el ERP de referencia. Hay una herramienta para copiar los objetos de una unidad modelo a otras unidades. |
| Abierto | Cualquier unidad válida con cualquier objeto de movimiento y un auxiliar válido forman una cuenta. La combinación se registra sola la primera vez que se usa. |

Los segmentos 1 a 10 nunca exigen combinación previa; se validan solos contra su banco de datos o su maestro.

### 3.4 Saldos y reportes

1. Los saldos se guardan por período y por combinación completa: unidad, objeto, auxiliar, segmentos 1 a 10 y tercero cuando el objeto lo exige.
2. Balance de comprobación, mayor, balance general y estado de resultados se pueden sacar a cualquier nivel: por objeto (como hoy), por unidad de negocio y su jerarquía, por auxiliar o por cualquier segmento, con filtros por rango de valores.
3. El mayor muestra la cuenta completa con sus segmentos.

## 4. Reglas contables y contabilidad flexible

### 4.1 Reglas contables (instrucciones de contabilización)

Siguen siendo el único camino para que un módulo genere asientos. Se amplían:

1. Llave de búsqueda: compañía, concepto contable (tipo de transacción), tipo de documento (nuevo, opcional), clase contable (opcional) y unidad de negocio (opcional). Se busca de lo más específico a lo más general, como hoy.
2. Resultado: el objeto y, si se indican, un auxiliar fijo y una unidad de negocio fija. Si la unidad queda en blanco se toma la de la transacción según la regla flexible.
3. Se presentan en una sola pantalla agrupadas por concepto, con la descripción de para qué sirve cada concepto y qué módulos lo usan, y con una consulta que simula una transacción y muestra la cuenta completa que resultaría.

### 4.2 Contabilidad flexible

Una regla flexible dice, para una compañía, un concepto (o todos) y un rango de objetos, de dónde sale cada segmento que la regla contable no fijó:

| Segmento | Fuentes posibles |
| --- | --- |
| Unidad de negocio | Del documento, de la bodega o de la línea, del vendedor, del recurso, fija |
| Auxiliar | Valor fijo, una categoría del artículo, del cliente o proveedor o de la unidad de negocio, el tipo de documento, la clase contable |
| Segmentos 1 a 10 | Las mismas fuentes que el auxiliar, más campos de la transacción (vendedor, proyecto, tipo de orden de servicio, canal) |

Ejemplo: en el concepto INGRESO, el segmento Línea de producto toma la categoría 1 del artículo y el segmento Vendedor toma el vendedor de la orden. Cada factura queda contabilizada con ambos datos sin que ventas sepa nada de cuentas.

Si un segmento obligatorio queda vacío después de aplicar las reglas, el documento no se graba y el mensaje dice qué regla falta.

### 4.3 Categorías en los maestros

Para que la contabilidad flexible tenga de dónde tomar datos, se agregan diez categorías configurables a artículos, direcciones (clientes y proveedores) y unidades de negocio. Cada categoría se liga a un banco de datos (por ejemplo, INV/01 a INV/10 para artículos) y se usa también en reportes y búsquedas.

## 5. Bancos de datos

### 5.1 Concepto

Un banco de datos es una lista de códigos con su descripción que el cliente administra. Se identifica con el prefijo del módulo y dos caracteres: GEN/00, MAE/01, INV/03. Todo campo de lista de cualquier pantalla apunta a un banco de datos, y la ayuda del campo muestra cuál es, para que el usuario sepa dónde se mantiene.

### 5.2 Definición del banco de datos

| Dato | Uso |
| --- | --- |
| Código | Módulo y dos caracteres, por ejemplo GEN/00 |
| Descripción | Para qué sirve |
| Longitud y tipo | Longitud máxima y si los códigos son numéricos o alfanuméricos |
| Del sistema | Lo entrega el producto y no se puede borrar |
| Valores fijos | El sistema depende de sus códigos: no se borran ni se agregan, solo se cambia la descripción |

### 5.3 Valores

Cada valor tiene código, descripción, segunda descripción, código especial (dato que usa la lógica, por ejemplo la clase de comportamiento), orden y activo. Un valor en uso no se borra, se inactiva.

### 5.4 Uso en pantallas

1. Los campos de lista muestran código y descripción y permiten buscar.
2. Junto al campo, quien tiene el permiso cat-mantener puede abrir el banco de datos y agregar un valor sin salir de la pantalla.
3. Las listas que hoy están fijas en el código (tipos de unidad de negocio, tipos de cuenta bancaria, prioridad y canal de casos, coberturas, tipos de existencia, motivos, etc.) pasan a bancos de datos. Las que la lógica necesita quedan como bancos con valores fijos.

### 5.5 Tipos de documento en GEN/00

1. GEN/00 es el banco de datos general de tipos de documento. Un tipo nace ahí con su código de dos caracteres y su descripción, y el código es único en toda la empresa, no por módulo.
2. Su comportamiento (módulo, clase, si mueve inventario, si genera contabilidad, estado inicial, flujo de estados y numerador) se configura en la pantalla Tipos de documento, que solo deja escoger códigos que existan en GEN/00.
3. Se agregan bancos de agrupación de tipos de documento que usa la lógica, por ejemplo GEN/01 tipos de documento de venta que generan factura, GEN/02 tipos que mueven inventario, GEN/03 tipos de cobro y pago.
4. Por la unicidad hay que resolver un choque actual: RC se usa para recepción de compras y para recibo de cobro. Se propone dejar RC para la recepción y usar RB para el recibo de cobro. El asiento de cierre CIERRE pasa a CA.

### 5.6 Bancos de datos iniciales

| Código | Contenido | Valores fijos |
| --- | --- | --- |
| GEN/00 | Tipos de documento | No |
| GEN/01 a GEN/03 | Agrupaciones de tipos de documento | Sí |
| GEN/04 | Clases de comportamiento de documento | Sí |
| GEN/05 | Fases de estado de línea | Sí |
| MAE/01 | Tipos de identificación | Sí |
| MAE/02 | Tipos de búsqueda de dirección (cliente, proveedor, empleado, banco) | No |
| MAE/03 | Tipos de unidad de negocio | No |
| MAE/04 | Unidades de medida | No |
| MAE/11 a MAE/20 | Categorías 1 a 10 de direcciones | No |
| MAE/21 a MAE/30 | Categorías 1 a 10 de unidades de negocio | No |
| INV/01 a INV/10 | Categorías 1 a 10 de artículos | No |
| INV/11 | Tipos de existencia | Sí |
| INV/12 | Motivos de ajuste | No |
| COM/01 | Motivos de cancelación de compra | No |
| VEN/01 | Motivos de cancelación y de nota de crédito | No |
| SRV/01 a SRV/05 | Prioridad, canal, coberturas y motivos de cambio de cobertura en servicios | Coberturas sí |
| CXC/01 y CXP/01 | Formas de cobro y de pago | No |
| CON/11 a CON/20 | Valores de los segmentos contables 1 a 10 cuando se validan contra banco de datos | No |

La lista final se completa al recorrer todas las pantallas y queda en el diccionario de datos.

## 6. Datos

1. con_segmentos (nueva): definición de los diez segmentos por compañía.
2. con_combinaciones (nueva): combinaciones unidad . objeto . auxiliar para el modo estricto.
3. con_reglas_flexibles (nueva): origen de la unidad, el auxiliar y cada segmento.
4. con_reglas_contables: agrega tipo de documento, auxiliar fijo y unidad fija.
5. con_cuentas: agrega exige_auxiliar y los segmentos que exige.
6. con_asientos_lineas y con_saldos: agregan auxiliar y segmento_01 a segmento_10; el centro de costo actual pasa a ser el segmento unidad de negocio.
7. cat_catalogos: agrega código de banco de datos, tipo de código y valores fijos.
8. mae_articulos, mae_direcciones y mae_unidades_negocio: agregan categoria_01 a categoria_10.
9. sis_tipos_documento: el código pasa a validarse contra GEN/00 y deja de repetirse entre módulos.

Todo va en una migración nueva; no se edita ninguna aplicada.

## 7. Permisos

con-configurar para segmentos, combinaciones, reglas contables y reglas flexibles; cat-mantener para bancos de datos.

## 8. Fuera de esta versión

Moneda extranjera por segmento, presupuestos por segmento, distribuciones y prorrateos automáticos entre unidades, y consolidación entre compañías.

## 9. Decisiones que necesito de usted

1. Modo de combinaciones por defecto: estricto (como el ERP de referencia) o abierto.
2. Si el objeto sigue usando la numeración del plan local (1.1.01.001), que es la que se reporta a la Superintendencia, o si prefiere un objeto corto numérico con la cuenta local como dato de reporte.
3. Si diez categorías por maestro le bastan o quiere más.
4. Si acepta RB para el recibo de cobro y CA para el cierre.
