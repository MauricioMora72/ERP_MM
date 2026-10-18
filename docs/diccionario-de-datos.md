# Diccionario de datos, fases 0 y 1

Generado desde el mismo origen que db/erp_fase0_fase1.sql. Todas las tablas tienen además: id (uuid, llave primaria), suscriptor_id (uuid, aislamiento por cliente del SaaS, salvo sis_suscriptores) y las columnas de auditoría creado_por, creado_en, modificado_por, modificado_en y programa.

## Sistema y seguridad

### sis_suscriptores

Cliente del SaaS que paga la suscripción; raíz del aislamiento de datos.

Llaves únicas: codigo.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| codigo | varchar(20) | sí |  | Código único del suscriptor |
| nombre | varchar(200) | sí |  | Razón social o nombre comercial |
| plan | varchar(20) |  |  | Plan de suscripción contratado |
| estado | varchar(20) | sí |  | ACTIVO, SUSPENDIDO o CANCELADO |
| pais | char(2) | sí |  | País principal, ISO 3166 |
| activo | boolean | sí |  | Registro activo |

### sis_usuarios

Persona que inicia sesión, ligada a su cuenta de Firebase.

Llaves únicas: correo; firebase_uid.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| firebase_uid | varchar(128) | sí |  | Identificador en Firebase Authentication |
| correo | varchar(200) | sí |  | Correo de inicio de sesión |
| nombre | varchar(200) | sí |  | Nombre para mostrar |
| direccion_id | uuid |  | mae_direcciones | Dirección del empleado, si existe |
| compania_defecto_id | uuid |  | mae_companias | Compañía que abre por defecto |
| idioma | char(2) |  |  | Idioma de la interfaz |
| activo | boolean | sí |  | Registro activo |

### sis_roles

Perfil de acceso.

Llaves únicas: codigo.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| codigo | varchar(20) | sí |  | Código del rol |
| descripcion | varchar(200) | sí |  | Descripción |

### sis_roles_permisos

Acción permitida a un rol sobre un recurso.

Llaves únicas: rol_id, recurso, accion.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| rol_id | uuid | sí | sis_roles | Rol |
| recurso | varchar(100) | sí |  | Recurso: pantalla, API o reporte |
| accion | varchar(20) | sí |  | VER, CREAR, MODIFICAR, ANULAR, APROBAR, CONTABILIZAR |

### sis_usuarios_roles

Roles de un usuario y la compañía donde los ejerce.

Llaves únicas: usuario_id, rol_id, compania_id.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| usuario_id | uuid | sí | sis_usuarios | Usuario |
| rol_id | uuid | sí | sis_roles | Rol |
| compania_id | uuid |  | mae_companias | Compañía; nulo significa todas |

### sis_tipos_documento

Tipo de documento con su módulo y comportamiento.

Llaves únicas: modulo, codigo.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| modulo | varchar(20) | sí |  | VEN, COM, INV, SRV, CXC, CXP, CON |
| codigo | varchar(20) | sí |  | Código del tipo, por ejemplo OV, CT, OC, RQ, AJ, FA |
| descripcion | varchar(200) | sí |  | Descripción |
| clase | varchar(20) | sí |  | Comportamiento base: COTIZACION, ORDEN, REQUISICION, DEVOLUCION, AJUSTE, TRANSFERENCIA, FACTURA, NOTA_CREDITO |
| afecta_inventario | boolean | sí |  | Si sus líneas mueven kardex |
| genera_contabilidad | boolean | sí |  | Si genera asientos |
| estado_inicial | smallint |  |  | Estado con que nace cada línea |
| activo | boolean | sí |  | Registro activo |

### sis_flujos_estado

Estados de línea por tipo de documento y transiciones permitidas.

Llaves únicas: tipo_documento_id, estado.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| tipo_documento_id | uuid | sí | sis_tipos_documento | Tipo de documento |
| estado | smallint | sí |  | Estado actual |
| descripcion | varchar(200) | sí |  | Qué significa |
| estado_siguiente | smallint |  |  | Estado al que pasa normalmente |
| estados_alternos | smallint[] |  |  | Otros estados a los que puede saltar |
| accion | varchar(100) |  |  | Proceso que la ejecuta, por ejemplo aprobar o facturar |

### sis_numeradores

Siguiente número por compañía, tipo de documento y año.

Llaves únicas: compania_id, tipo_documento_id, anio.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| compania_id | uuid | sí | mae_companias | Compañía |
| tipo_documento_id | uuid | sí | sis_tipos_documento | Tipo de documento |
| anio | smallint | sí |  | Año, o 0 si la numeración no reinicia |
| siguiente | bigint | sí |  | Siguiente número a asignar |

### sis_auditoria

Historial de cambios de cualquier tabla.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| tabla | varchar(63) | sí |  | Tabla modificada |
| registro_id | uuid | sí |  | Registro modificado |
| operacion | char(1) | sí |  | I, U o D |
| valores_anteriores | jsonb |  |  | Valores antes del cambio |
| valores_nuevos | jsonb |  |  | Valores después del cambio |

## Catálogos

### cat_catalogos

Definición de cada catálogo configurable.

Llaves únicas: modulo, codigo.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| modulo | varchar(20) | sí |  | Módulo dueño del catálogo |
| codigo | varchar(20) | sí |  | Código del catálogo |
| descripcion | varchar(200) | sí |  | Para qué sirve |
| longitud | smallint | sí |  | Longitud máxima de los códigos |
| es_sistema | boolean | sí |  | Verdadero si lo entrega el producto y el cliente no puede borrarlo |

### cat_valores

Valores de un catálogo.

Llaves únicas: catalogo_id, codigo.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| catalogo_id | uuid | sí | cat_catalogos | Catálogo al que pertenece |
| codigo | varchar(20) | sí |  | Código del valor |
| descripcion | varchar(200) | sí |  | Descripción principal |
| descripcion2 | varchar(200) |  |  | Descripción secundaria |
| codigo_especial | varchar(20) |  |  | Valor auxiliar que usa la lógica del sistema |
| orden | smallint |  |  | Orden de presentación |
| activo | boolean | sí |  | Registro activo |

## Maestros

### mae_monedas

Monedas habilitadas.

Llaves únicas: codigo.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| codigo | char(3) | sí |  | Código ISO 4217, por ejemplo USD |
| descripcion | varchar(200) | sí |  | Nombre de la moneda |
| decimales | smallint | sí |  | Decimales de presentación |

### mae_direcciones

Libro de direcciones: toda persona o empresa con la que se trata.

Llaves únicas: numero.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| numero | bigint | sí |  | Número de dirección, único por suscriptor |
| nombre | varchar(200) | sí |  | Nombre o razón social |
| nombre_comercial | varchar(200) |  |  | Nombre comercial |
| tipo_identificacion | varchar(20) | sí |  | Catálogo de tipos de identificación: RUC, cédula, pasaporte, exterior |
| identificacion | varchar(20) | sí |  | Número de identificación |
| tipo_busqueda | varchar(20) | sí |  | Catálogo: cliente, proveedor, empleado, banco, compañía, contacto |
| correo | varchar(200) |  |  | Correo principal |
| telefono | varchar(30) |  |  | Teléfono principal |
| direccion_padre_id | uuid |  | mae_direcciones | Matriz o empresa a la que pertenece |
| campos | jsonb |  |  | Campos personalizados |
| activo | boolean | sí |  | Registro activo |

### mae_companias

Compañía legal con RUC, moneda base y año fiscal.

Llaves únicas: codigo.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| codigo | varchar(20) | sí |  | Código de compañía |
| direccion_id | uuid | sí | mae_direcciones | Datos de la compañía en el libro de direcciones |
| moneda_id | uuid | sí | mae_monedas | Moneda base |
| mes_inicio_fiscal | smallint | sí |  | Mes en que inicia el año fiscal |
| obligado_contabilidad | boolean | sí |  | Obligado a llevar contabilidad ante el SRI |
| contribuyente_especial | varchar(20) |  |  | Número de resolución, si aplica |
| activo | boolean | sí |  | Registro activo |

### mae_unidades_negocio

Sucursal, bodega, planta o centro de costo.

Llaves únicas: codigo.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| compania_id | uuid | sí | mae_companias | Compañía |
| codigo | varchar(20) | sí |  | Código de la unidad |
| descripcion | varchar(200) | sí |  | Descripción |
| tipo | varchar(20) | sí |  | Catálogo: BODEGA, SUCURSAL, PLANTA, CENTRO_COSTO, PROYECTO |
| unidad_padre_id | uuid |  | mae_unidades_negocio | Unidad superior para consolidar |
| activo | boolean | sí |  | Registro activo |

### mae_tipos_cambio

Cotización de una moneda por fecha.

Llaves únicas: moneda_id, fecha.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| moneda_id | uuid | sí | mae_monedas | Moneda |
| fecha | date | sí |  | Fecha de la cotización |
| tasa | numeric(18,6) | sí |  | Unidades de moneda base por unidad de esta moneda |

### mae_direcciones_ubicaciones

Direcciones físicas de un tercero.

Llaves únicas: direccion_id, secuencia.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| direccion_id | uuid | sí | mae_direcciones | Tercero |
| secuencia | smallint | sí |  | Secuencia |
| tipo | varchar(20) | sí |  | MATRIZ, ENTREGA, FACTURACION |
| linea1 | varchar(200) | sí |  | Calle principal y número |
| linea2 | varchar(200) |  |  | Referencia |
| ciudad | varchar(100) |  |  | Ciudad |
| provincia | varchar(100) |  |  | Provincia |
| pais | char(2) | sí |  | País ISO 3166 |

### mae_contactos

Persona de contacto de un tercero.

Llaves únicas: direccion_id, secuencia.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| direccion_id | uuid | sí | mae_direcciones | Tercero |
| secuencia | smallint | sí |  | Secuencia |
| nombre | varchar(200) | sí |  | Nombre |
| cargo | varchar(100) |  |  | Cargo |
| telefono | varchar(30) |  |  | Teléfono |
| correo | varchar(200) |  |  | Correo |
| recibe_comprobantes | boolean | sí |  | Si recibe los comprobantes electrónicos |

### mae_condiciones_pago

Plazos y cuotas de pago.

Llaves únicas: codigo.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| codigo | varchar(20) | sí |  | Código |
| descripcion | varchar(200) | sí |  | Descripción |
| cuotas | smallint | sí |  | Número de cuotas |
| dias_primera | smallint | sí |  | Días hasta la primera cuota |
| dias_entre_cuotas | smallint | sí |  | Días entre cuotas |

### mae_listas_precios

Lista de precios.

Llaves únicas: codigo.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| codigo | varchar(20) | sí |  | Código |
| descripcion | varchar(200) | sí |  | Descripción |
| moneda_id | uuid | sí | mae_monedas | Moneda |
| incluye_impuestos | boolean | sí |  | Si los precios incluyen IVA |

### mae_impuestos

Tarifa de impuesto con vigencia.

Llaves únicas: codigo, vigente_desde.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| codigo | varchar(20) | sí |  | Código interno |
| tipo | varchar(20) | sí |  | IVA, ICE u otro |
| codigo_sri | varchar(10) |  |  | Código de tarifa en el SRI |
| porcentaje | numeric(7,4) | sí |  | Porcentaje |
| vigente_desde | date | sí |  | Inicio de vigencia |
| vigente_hasta | date |  |  | Fin de vigencia |
| clase_contable_id | uuid |  | con_clases_contables | Clase para resolver la cuenta |

### mae_clientes

Datos de cliente de una dirección en una compañía.

Llaves únicas: direccion_id, compania_id.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| direccion_id | uuid | sí | mae_direcciones | Tercero |
| compania_id | uuid | sí | mae_companias | Compañía |
| condicion_pago_id | uuid |  | mae_condiciones_pago | Condición de pago |
| lista_precios_id | uuid |  | mae_listas_precios | Lista de precios |
| clase_contable_id | uuid | sí | con_clases_contables | Clase contable de cuentas por cobrar |
| limite_credito | numeric(18,2) | sí |  | Límite de crédito |
| vendedor_id | uuid |  | mae_direcciones | Vendedor asignado |
| bloqueado | boolean | sí |  | Bloqueo de crédito |

### mae_proveedores

Datos de proveedor de una dirección en una compañía.

Llaves únicas: direccion_id, compania_id.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| direccion_id | uuid | sí | mae_direcciones | Tercero |
| compania_id | uuid | sí | mae_companias | Compañía |
| condicion_pago_id | uuid |  | mae_condiciones_pago | Condición de pago |
| clase_contable_id | uuid | sí | con_clases_contables | Clase contable de cuentas por pagar |
| codigo_ret_renta | varchar(10) |  |  | Código de retención de renta por defecto |
| codigo_ret_iva | varchar(10) |  |  | Código de retención de IVA por defecto |
| moneda_id | uuid |  | mae_monedas | Moneda habitual |

### mae_articulos

Artículo o servicio.

Llaves únicas: codigo.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| codigo | varchar(30) | sí |  | Código del artículo |
| descripcion | varchar(200) | sí |  | Descripción |
| tipo_existencia | varchar(20) | sí |  | INVENTARIABLE, NO_INVENTARIABLE, SERVICIO |
| unidad_primaria | varchar(20) | sí |  | Catálogo de unidades de medida |
| impuesto_id | uuid |  | mae_impuestos | Impuesto por defecto |
| clase_contable_id | uuid | sí | con_clases_contables | Clase contable |
| controla_lote | boolean | sí |  | Si exige lote o serie |
| categoria | varchar(20) |  |  | Catálogo de categorías |
| campos | jsonb |  |  | Campos personalizados |
| activo | boolean | sí |  | Registro activo |

### mae_articulos_sucursal

Artículo en una unidad de negocio.

Llaves únicas: articulo_id, unidad_negocio_id.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| articulo_id | uuid | sí | mae_articulos | Artículo |
| unidad_negocio_id | uuid | sí | mae_unidades_negocio | Bodega o sucursal |
| metodo_costo | varchar(20) | sí |  | Método de costeo |
| punto_reorden | numeric(18,4) |  |  | Cantidad de reorden |
| comprador_id | uuid |  | mae_direcciones | Comprador responsable |
| clase_contable_id | uuid |  | con_clases_contables | Clase que reemplaza la del artículo en esta unidad |

### mae_conversiones_um

Factor entre unidades de medida.

Llaves únicas: articulo_id, desde, hasta.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| articulo_id | uuid |  | mae_articulos | Artículo; nulo es conversión general |
| desde | varchar(20) | sí |  | Unidad origen |
| hasta | varchar(20) | sí |  | Unidad destino |
| factor | numeric(18,6) | sí |  | Unidades destino por unidad origen |

### mae_precios

Precio de un artículo en una lista.

Llaves únicas: lista_precios_id, articulo_id, unidad, vigente_desde.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| lista_precios_id | uuid | sí | mae_listas_precios | Lista |
| articulo_id | uuid | sí | mae_articulos | Artículo |
| unidad | varchar(20) | sí |  | Unidad de medida |
| vigente_desde | date | sí |  | Inicio de vigencia |
| vigente_hasta | date |  |  | Fin de vigencia |
| precio | numeric(18,6) | sí |  | Precio unitario |

## Gestión de servicios

### srv_tipos_orden

Clase de orden de servicio.

Llaves únicas: codigo.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| codigo | varchar(20) | sí |  | Código |
| descripcion | varchar(200) | sí |  | Descripción |
| tipo_documento_id | uuid | sí | sis_tipos_documento | Tipo de documento y su flujo de estados |
| tipo_objeto | varchar(20) |  |  | Qué se atiende: PACIENTE, EQUIPO, VEHICULO, INSTALACION |
| plantilla_defecto_id | uuid |  |  | Plantilla que se propone al crear la orden |

### srv_campos

Campo personalizado de un tipo de orden.

Llaves únicas: tipo_orden_id, campo.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| tipo_orden_id | uuid | sí | srv_tipos_orden | Tipo de orden |
| campo | varchar(50) | sí |  | Nombre técnico del campo |
| etiqueta | varchar(200) | sí |  | Etiqueta en pantalla |
| tipo_dato | varchar(20) | sí |  | TEXTO, NUMERO, FECHA, SI_NO, CATALOGO |
| catalogo_id | uuid |  | cat_catalogos | Catálogo si el dato es una lista |
| obligatorio | boolean | sí |  | Si es obligatorio |
| orden | smallint |  |  | Orden en pantalla |

### srv_objetos

Lo que se atiende: paciente, equipo, vehículo o instalación.

Llaves únicas: codigo.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| codigo | varchar(30) | sí |  | Código |
| descripcion | varchar(200) | sí |  | Descripción |
| tipo_objeto | varchar(20) | sí |  | Tipo de objeto |
| cliente_id | uuid |  | mae_direcciones | Cliente dueño |
| serie | varchar(50) |  |  | Serie, placa o historia clínica |
| campos | jsonb |  |  | Campos personalizados |
| activo | boolean | sí |  | Registro activo |

### srv_recursos

Quien o lo que presta el servicio.

Llaves únicas: codigo.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| codigo | varchar(20) | sí |  | Código |
| descripcion | varchar(200) | sí |  | Descripción |
| tipo | varchar(20) | sí |  | PERSONA, SALA, VEHICULO, EQUIPO |
| direccion_id | uuid |  | mae_direcciones | Empleado, si es una persona |
| unidad_negocio_id | uuid |  | mae_unidades_negocio | Sucursal donde trabaja |
| costo_hora | numeric(18,6) |  |  | Costo por hora |
| activo | boolean | sí |  | Registro activo |

### srv_plantillas

Trabajo estándar reutilizable.

Llaves únicas: codigo.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| codigo | varchar(20) | sí |  | Código |
| descripcion | varchar(200) | sí |  | Descripción |
| tipo_orden_id | uuid |  | srv_tipos_orden | Tipo de orden al que aplica |

### srv_plantillas_lineas

Actividad o material previsto en la plantilla.

Llaves únicas: plantilla_id, linea.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| plantilla_id | uuid | sí | srv_plantillas | Plantilla |
| linea | integer | sí |  | Línea |
| tipo_linea | varchar(20) | sí |  | ACTIVIDAD o MATERIAL |
| descripcion | varchar(200) |  |  | Descripción de la actividad |
| articulo_id | uuid |  | mae_articulos | Material o servicio |
| cantidad | numeric(18,4) |  |  | Cantidad prevista |
| horas | numeric(18,4) |  |  | Horas previstas |

### srv_ordenes

Orden de servicio.

Llaves únicas: compania_id, tipo_documento_id, numero.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| compania_id | uuid | sí | mae_companias | Compañía |
| tipo_documento_id | uuid | sí | sis_tipos_documento | Tipo de documento |
| numero | bigint | sí |  | Número |
| tipo_orden_id | uuid | sí | srv_tipos_orden | Tipo de orden |
| unidad_negocio_id | uuid | sí | mae_unidades_negocio | Sucursal |
| cliente_id | uuid | sí | mae_direcciones | Cliente |
| objeto_id | uuid |  | srv_objetos | Objeto atendido |
| contrato_id | uuid |  | ven_contratos | Contrato que la cubre |
| fecha_solicitud | timestamptz | sí |  | Fecha de solicitud |
| fecha_programada | timestamptz |  |  | Fecha programada |
| fecha_cierre | timestamptz |  |  | Fecha de cierre |
| descripcion | varchar(1000) |  |  | Problema o servicio solicitado |
| estado | smallint | sí |  | Estado actual según el flujo |
| campos | jsonb |  |  | Valores de los campos personalizados |

### srv_ordenes_actividades

Tarea de una orden de servicio.

Llaves únicas: orden_id, linea.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| orden_id | uuid | sí | srv_ordenes | Orden |
| linea | integer | sí |  | Línea |
| descripcion | varchar(200) | sí |  | Actividad |
| recurso_id | uuid |  | srv_recursos | Recurso asignado |
| horas_previstas | numeric(18,4) |  |  | Horas previstas |
| horas_reales | numeric(18,4) |  |  | Horas reales |
| estado_siguiente | smallint |  |  | Estado siguiente |
| estado_ultimo | smallint |  |  | Último estado |

### srv_ordenes_consumos

Material o servicio usado en una orden.

Llaves únicas: orden_id, linea.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| orden_id | uuid | sí | srv_ordenes | Orden |
| linea | integer | sí |  | Línea |
| articulo_id | uuid | sí | mae_articulos | Artículo o servicio |
| unidad_negocio_id | uuid |  | mae_unidades_negocio | Bodega de donde sale |
| lote_id | uuid |  | inv_lotes | Lote |
| cantidad | numeric(18,4) | sí |  | Cantidad |
| unidad | varchar(20) | sí |  | Unidad de medida |
| costo_unitario | numeric(18,6) |  |  | Costo unitario |
| facturable | boolean | sí |  | Si se cobra al cliente |
| precio | numeric(18,6) |  |  | Precio unitario a facturar |
| estado_siguiente | smallint |  |  | Estado siguiente |
| estado_ultimo | smallint |  |  | Último estado |
| kardex_id | uuid |  | inv_kardex | Movimiento de inventario generado |

### srv_agenda

Reserva de un recurso en un horario.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| recurso_id | uuid | sí | srv_recursos | Recurso |
| inicio | timestamptz | sí |  | Inicio |
| fin | timestamptz | sí |  | Fin |
| orden_id | uuid |  | srv_ordenes | Orden asociada |
| cliente_id | uuid |  | mae_direcciones | Cliente, si aún no hay orden |
| estado | varchar(20) | sí |  | RESERVADA, CONFIRMADA, ATENDIDA, CANCELADA |

## Inventarios

### inv_ubicaciones

Lugar físico dentro de una bodega.

Llaves únicas: unidad_negocio_id, codigo.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| unidad_negocio_id | uuid | sí | mae_unidades_negocio | Bodega |
| codigo | varchar(30) | sí |  | Código de ubicación |
| descripcion | varchar(200) |  |  | Descripción |
| activo | boolean | sí |  | Registro activo |

### inv_lotes

Lote o serie de un artículo.

Llaves únicas: articulo_id, unidad_negocio_id, lote.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| articulo_id | uuid | sí | mae_articulos | Artículo |
| unidad_negocio_id | uuid | sí | mae_unidades_negocio | Bodega |
| lote | varchar(30) | sí |  | Número de lote o serie |
| fecha_vencimiento | date |  |  | Vencimiento |
| estado | varchar(20) | sí |  | DISPONIBLE, CUARENTENA, BLOQUEADO |

### inv_saldos

Existencia por artículo, bodega, ubicación y lote.

Llaves únicas: articulo_id, unidad_negocio_id, ubicacion_id, lote_id.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| articulo_id | uuid | sí | mae_articulos | Artículo |
| unidad_negocio_id | uuid | sí | mae_unidades_negocio | Bodega |
| ubicacion_id | uuid |  | inv_ubicaciones | Ubicación |
| lote_id | uuid |  | inv_lotes | Lote |
| en_mano | numeric(18,4) | sí |  | Cantidad física |
| comprometido | numeric(18,4) | sí |  | Reservado por órdenes |
| en_transito | numeric(18,4) | sí |  | En camino por transferencias |

### inv_costos

Costo unitario vigente.

Llaves únicas: articulo_id, unidad_negocio_id, metodo.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| articulo_id | uuid | sí | mae_articulos | Artículo |
| unidad_negocio_id | uuid | sí | mae_unidades_negocio | Bodega |
| metodo | varchar(20) | sí |  | Método de costeo |
| costo_unitario | numeric(18,6) | sí |  | Costo unitario |

### inv_kardex

Movimiento inmutable de inventario.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| compania_id | uuid | sí | mae_companias | Compañía |
| fecha | date | sí |  | Fecha del movimiento |
| articulo_id | uuid | sí | mae_articulos | Artículo |
| unidad_negocio_id | uuid | sí | mae_unidades_negocio | Bodega |
| ubicacion_id | uuid |  | inv_ubicaciones | Ubicación |
| lote_id | uuid |  | inv_lotes | Lote |
| tipo_documento_id | uuid | sí | sis_tipos_documento | Tipo de documento de origen |
| numero_documento | bigint | sí |  | Número del documento de origen |
| origen_modulo | varchar(20) | sí |  | Módulo de origen |
| origen_linea_id | uuid | sí |  | Línea del documento de origen |
| cantidad | numeric(18,4) | sí |  | Positiva entra, negativa sale, en unidad primaria |
| costo_unitario | numeric(18,6) | sí |  | Costo unitario del movimiento |
| costo_total | numeric(18,2) | sí |  | Cantidad por costo |
| asiento_id | uuid |  | con_asientos | Asiento generado |

### inv_documentos

Ajustes, transferencias, conteos y consumos internos.

Llaves únicas: compania_id, tipo_documento_id, numero.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| compania_id | uuid | sí | mae_companias | Compañía |
| tipo_documento_id | uuid | sí | sis_tipos_documento | Tipo de documento |
| numero | bigint | sí |  | Número |
| fecha | date | sí |  | Fecha |
| unidad_negocio_id | uuid | sí | mae_unidades_negocio | Bodega origen |
| unidad_destino_id | uuid |  | mae_unidades_negocio | Bodega destino en transferencias |
| motivo | varchar(20) |  |  | Catálogo de motivos |
| observacion | varchar(500) |  |  | Observación |

### inv_documentos_lineas

Artículos del documento de inventario.

Llaves únicas: documento_id, linea.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| documento_id | uuid | sí | inv_documentos | Documento |
| linea | integer | sí |  | Línea |
| articulo_id | uuid | sí | mae_articulos | Artículo |
| ubicacion_id | uuid |  | inv_ubicaciones | Ubicación |
| lote_id | uuid |  | inv_lotes | Lote |
| cantidad | numeric(18,4) | sí |  | Cantidad |
| unidad | varchar(20) | sí |  | Unidad de medida |
| costo_unitario | numeric(18,6) |  |  | Costo, para ajustes de entrada |
| estado_siguiente | smallint |  |  | Estado siguiente |
| estado_ultimo | smallint |  |  | Último estado |
| kardex_id | uuid |  | inv_kardex | Movimiento generado |

## Compras

### com_ordenes

Requisición, cotización u orden de compra.

Llaves únicas: compania_id, tipo_documento_id, numero.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| compania_id | uuid | sí | mae_companias | Compañía |
| tipo_documento_id | uuid | sí | sis_tipos_documento | Tipo de documento |
| numero | bigint | sí |  | Número |
| unidad_negocio_id | uuid | sí | mae_unidades_negocio | Sucursal |
| proveedor_id | uuid |  | mae_direcciones | Proveedor; nulo en requisiciones |
| fecha | date | sí |  | Fecha |
| fecha_requerida | date |  |  | Fecha requerida |
| comprador_id | uuid |  | mae_direcciones | Comprador |
| condicion_pago_id | uuid |  | mae_condiciones_pago | Condición de pago |
| moneda_id | uuid | sí | mae_monedas | Moneda |
| documento_origen_id | uuid |  | com_ordenes | Requisición o cotización de la que nace |

### com_ordenes_lineas

Línea de compra.

Llaves únicas: orden_id, linea.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| orden_id | uuid | sí | com_ordenes | Orden |
| linea | integer | sí |  | Línea |
| articulo_id | uuid |  | mae_articulos | Artículo o servicio |
| descripcion | varchar(200) | sí |  | Descripción |
| cuenta_id | uuid |  | con_cuentas | Cuenta de gasto para compras directas |
| unidad_negocio_id | uuid | sí | mae_unidades_negocio | Bodega o centro de costo destino |
| cantidad | numeric(18,4) | sí |  | Cantidad pedida |
| cantidad_recibida | numeric(18,4) | sí |  | Cantidad recibida |
| cantidad_facturada | numeric(18,4) | sí |  | Cantidad facturada |
| unidad | varchar(20) | sí |  | Unidad de medida |
| costo_unitario | numeric(18,6) | sí |  | Costo unitario |
| impuesto_id | uuid |  | mae_impuestos | Impuesto |
| estado_siguiente | smallint | sí |  | Estado siguiente |
| estado_ultimo | smallint | sí |  | Último estado |

### com_aprobaciones

Paso de aprobación de una orden de compra.

Llaves únicas: orden_id, nivel.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| orden_id | uuid | sí | com_ordenes | Orden |
| nivel | smallint | sí |  | Nivel de aprobación |
| aprobador_id | uuid | sí | sis_usuarios | Aprobador |
| resultado | varchar(20) |  |  | APROBADA, RECHAZADA o pendiente si es nulo |
| fecha | timestamptz |  |  | Fecha de la decisión |
| comentario | varchar(500) |  |  | Comentario |

### com_recepciones

Registro de lo recibido por línea.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| orden_linea_id | uuid | sí | com_ordenes_lineas | Línea de orden de compra |
| fecha | date | sí |  | Fecha de recepción |
| cantidad | numeric(18,4) | sí |  | Cantidad recibida |
| costo_unitario | numeric(18,6) | sí |  | Costo unitario |
| ubicacion_id | uuid |  | inv_ubicaciones | Ubicación |
| lote_id | uuid |  | inv_lotes | Lote |
| cantidad_facturada | numeric(18,4) | sí |  | Cantidad ya cruzada con facturas |
| kardex_id | uuid |  | inv_kardex | Movimiento de entrada |
| asiento_id | uuid |  | con_asientos | Asiento de recepción |

### com_facturas

Factura del proveedor.

Llaves únicas: compania_id, proveedor_id, tipo_comprobante, numero_factura.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| compania_id | uuid | sí | mae_companias | Compañía |
| proveedor_id | uuid | sí | mae_direcciones | Proveedor |
| tipo_comprobante | varchar(2) | sí |  | Código de tipo de comprobante del SRI |
| numero_factura | varchar(17) | sí |  | Establecimiento, punto y secuencial del proveedor |
| autorizacion | varchar(49) |  |  | Clave de acceso o autorización |
| fecha | date | sí |  | Fecha de emisión |
| fecha_registro | date | sí |  | Fecha de registro contable |
| moneda_id | uuid | sí | mae_monedas | Moneda |
| subtotal | numeric(18,2) | sí |  | Subtotal |
| impuestos | numeric(18,2) | sí |  | Impuestos |
| total | numeric(18,2) | sí |  | Total |
| estado | varchar(20) | sí |  | REGISTRADA, CONTABILIZADA, ANULADA |
| asiento_id | uuid |  | con_asientos | Asiento de provisión |

### com_facturas_lineas

Línea de factura de proveedor.

Llaves únicas: factura_id, linea.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| factura_id | uuid | sí | com_facturas | Factura |
| linea | integer | sí |  | Línea |
| recepcion_id | uuid |  | com_recepciones | Recepción que cruza |
| orden_linea_id | uuid |  | com_ordenes_lineas | Línea de orden, para servicios sin recepción |
| cuenta_id | uuid |  | con_cuentas | Cuenta de gasto directo |
| descripcion | varchar(200) | sí |  | Descripción |
| cantidad | numeric(18,4) | sí |  | Cantidad |
| costo_unitario | numeric(18,6) | sí |  | Costo unitario |
| impuesto_id | uuid |  | mae_impuestos | Impuesto |
| valor_impuesto | numeric(18,2) | sí |  | Valor del impuesto |
| total | numeric(18,2) | sí |  | Total de la línea |

## Ventas

### ven_contratos

Contrato de servicio recurrente.

Llaves únicas: compania_id, numero.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| compania_id | uuid | sí | mae_companias | Compañía |
| numero | bigint | sí |  | Número de contrato |
| cliente_id | uuid | sí | mae_direcciones | Cliente |
| fecha_inicio | date | sí |  | Inicio |
| fecha_fin | date |  |  | Fin |
| frecuencia | varchar(20) | sí |  | MENSUAL, TRIMESTRAL, ANUAL |
| dia_facturacion | smallint |  |  | Día del mes en que se factura |
| estado | varchar(20) | sí |  | VIGENTE, SUSPENDIDO, TERMINADO |

### ven_contratos_lineas

Servicio incluido en un contrato.

Llaves únicas: contrato_id, linea.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| contrato_id | uuid | sí | ven_contratos | Contrato |
| linea | integer | sí |  | Línea |
| articulo_id | uuid | sí | mae_articulos | Servicio |
| cantidad | numeric(18,4) | sí |  | Cantidad por período |
| precio | numeric(18,6) | sí |  | Precio unitario |
| proxima_facturacion | date |  |  | Próxima fecha de facturación |

### ven_ordenes

Cotización u orden de venta.

Llaves únicas: compania_id, tipo_documento_id, numero.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| compania_id | uuid | sí | mae_companias | Compañía |
| tipo_documento_id | uuid | sí | sis_tipos_documento | Tipo de documento |
| numero | bigint | sí |  | Número |
| unidad_negocio_id | uuid | sí | mae_unidades_negocio | Sucursal |
| cliente_id | uuid | sí | mae_direcciones | Cliente |
| ubicacion_entrega_id | uuid |  | mae_direcciones_ubicaciones | Dirección de entrega |
| fecha | date | sí |  | Fecha de la orden |
| fecha_requerida | date |  |  | Fecha requerida |
| condicion_pago_id | uuid |  | mae_condiciones_pago | Condición de pago |
| moneda_id | uuid | sí | mae_monedas | Moneda |
| vendedor_id | uuid |  | mae_direcciones | Vendedor |
| referencia | varchar(100) |  |  | Orden de compra del cliente |
| documento_origen_id | uuid |  | ven_ordenes | Cotización de la que nace |

### ven_ordenes_lineas

Línea de cotización u orden de venta.

Llaves únicas: orden_id, linea.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| orden_id | uuid | sí | ven_ordenes | Orden |
| linea | integer | sí |  | Línea |
| articulo_id | uuid | sí | mae_articulos | Artículo o servicio |
| descripcion | varchar(200) |  |  | Descripción |
| unidad_negocio_id | uuid | sí | mae_unidades_negocio | Bodega de despacho |
| cantidad | numeric(18,4) | sí |  | Cantidad pedida |
| cantidad_despachada | numeric(18,4) | sí |  | Cantidad despachada |
| unidad | varchar(20) | sí |  | Unidad de medida |
| precio | numeric(18,6) | sí |  | Precio unitario |
| descuento | numeric(18,2) | sí |  | Descuento |
| impuesto_id | uuid |  | mae_impuestos | Impuesto |
| costo_unitario | numeric(18,6) |  |  | Costo al despachar |
| estado_siguiente | smallint | sí |  | Estado siguiente |
| estado_ultimo | smallint | sí |  | Último estado |
| kardex_id | uuid |  | inv_kardex | Movimiento de despacho |

### ven_facturas

Factura, nota de crédito o nota de débito emitida.

Llaves únicas: compania_id, establecimiento, punto_emision, tipo_documento_id, secuencial.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| compania_id | uuid | sí | mae_companias | Compañía |
| tipo_documento_id | uuid | sí | sis_tipos_documento | Tipo de documento |
| establecimiento | char(3) | sí |  | Establecimiento SRI |
| punto_emision | char(3) | sí |  | Punto de emisión SRI |
| secuencial | bigint | sí |  | Secuencial |
| fecha | date | sí |  | Fecha de emisión |
| cliente_id | uuid | sí | mae_direcciones | Cliente |
| moneda_id | uuid | sí | mae_monedas | Moneda |
| subtotal | numeric(18,2) | sí |  | Subtotal sin impuestos |
| descuento | numeric(18,2) | sí |  | Descuento total |
| impuestos | numeric(18,2) | sí |  | Total de impuestos |
| total | numeric(18,2) | sí |  | Total |
| factura_modificada_id | uuid |  | ven_facturas | Factura que modifica una nota |
| estado | varchar(20) | sí |  | EMITIDA, AUTORIZADA, ANULADA |
| asiento_id | uuid |  | con_asientos | Asiento de venta |

### ven_facturas_lineas

Línea facturada con su origen.

Llaves únicas: factura_id, linea.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| factura_id | uuid | sí | ven_facturas | Factura |
| linea | integer | sí |  | Línea |
| articulo_id | uuid | sí | mae_articulos | Artículo o servicio |
| descripcion | varchar(200) | sí |  | Descripción impresa |
| cantidad | numeric(18,4) | sí |  | Cantidad |
| precio | numeric(18,6) | sí |  | Precio unitario |
| descuento | numeric(18,2) | sí |  | Descuento |
| impuesto_id | uuid |  | mae_impuestos | Impuesto |
| valor_impuesto | numeric(18,2) | sí |  | Valor del impuesto |
| total | numeric(18,2) | sí |  | Total de la línea |
| orden_linea_id | uuid |  | ven_ordenes_lineas | Línea de orden de venta de origen |
| consumo_id | uuid |  | srv_ordenes_consumos | Consumo de orden de servicio de origen |
| contrato_linea_id | uuid |  | ven_contratos_lineas | Línea de contrato de origen |

## Cuentas por cobrar

### cxc_documentos

Cuota por cobrar.

Llaves únicas: compania_id, tipo_documento_id, numero, cuota.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| compania_id | uuid | sí | mae_companias | Compañía |
| tipo_documento_id | uuid | sí | sis_tipos_documento | Tipo de documento |
| numero | bigint | sí |  | Número |
| cuota | smallint | sí |  | Número de cuota |
| cliente_id | uuid | sí | mae_direcciones | Cliente |
| factura_id | uuid |  | ven_facturas | Factura de origen |
| fecha | date | sí |  | Fecha del documento |
| vencimiento | date | sí |  | Vencimiento |
| moneda_id | uuid | sí | mae_monedas | Moneda |
| monto | numeric(18,2) | sí |  | Monto original |
| saldo | numeric(18,2) | sí |  | Saldo pendiente |

### cxc_cobros

Dinero recibido de un cliente.

Llaves únicas: compania_id, numero.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| compania_id | uuid | sí | mae_companias | Compañía |
| numero | bigint | sí |  | Número de recibo |
| cliente_id | uuid | sí | mae_direcciones | Cliente |
| fecha | date | sí |  | Fecha |
| forma_pago | varchar(20) | sí |  | Catálogo: efectivo, transferencia, cheque, tarjeta |
| cuenta_bancaria_id | uuid |  | con_cuentas_bancarias | Cuenta donde ingresa |
| monto | numeric(18,2) | sí |  | Monto recibido |
| referencia | varchar(100) |  |  | Referencia |
| asiento_id | uuid |  | con_asientos | Asiento |

### cxc_aplicaciones

Cancelación de una cuota por cobro o retención.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| documento_id | uuid | sí | cxc_documentos | Cuota que se cancela |
| cobro_id | uuid |  | cxc_cobros | Cobro aplicado |
| retencion_id | uuid |  | ec_retenciones | Retención recibida aplicada |
| monto | numeric(18,2) | sí |  | Monto aplicado |
| fecha | date | sí |  | Fecha |

## Cuentas por pagar

### cxp_documentos

Cuota por pagar.

Llaves únicas: compania_id, tipo_documento_id, numero, cuota.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| compania_id | uuid | sí | mae_companias | Compañía |
| tipo_documento_id | uuid | sí | sis_tipos_documento | Tipo de documento |
| numero | bigint | sí |  | Número |
| cuota | smallint | sí |  | Número de cuota |
| proveedor_id | uuid | sí | mae_direcciones | Proveedor |
| factura_id | uuid |  | com_facturas | Factura de origen |
| fecha | date | sí |  | Fecha |
| vencimiento | date | sí |  | Vencimiento |
| moneda_id | uuid | sí | mae_monedas | Moneda |
| monto | numeric(18,2) | sí |  | Monto original |
| saldo | numeric(18,2) | sí |  | Saldo pendiente |

### cxp_pagos

Dinero pagado a un proveedor.

Llaves únicas: compania_id, numero.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| compania_id | uuid | sí | mae_companias | Compañía |
| numero | bigint | sí |  | Número de pago |
| proveedor_id | uuid | sí | mae_direcciones | Proveedor |
| fecha | date | sí |  | Fecha |
| forma_pago | varchar(20) | sí |  | Catálogo de formas de pago |
| cuenta_bancaria_id | uuid |  | con_cuentas_bancarias | Cuenta de donde sale |
| monto | numeric(18,2) | sí |  | Monto pagado |
| referencia | varchar(100) |  |  | Referencia |
| asiento_id | uuid |  | con_asientos | Asiento |

### cxp_aplicaciones

Cancelación de una cuota por pago o retención.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| documento_id | uuid | sí | cxp_documentos | Cuota que se cancela |
| pago_id | uuid |  | cxp_pagos | Pago aplicado |
| retencion_id | uuid |  | ec_retenciones | Retención emitida aplicada |
| monto | numeric(18,2) | sí |  | Monto aplicado |
| fecha | date | sí |  | Fecha |

## Contabilidad y bancos

### con_clases_contables

Agrupación contable de artículos, terceros, impuestos y bancos.

Llaves únicas: codigo.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| codigo | varchar(20) | sí |  | Código de la clase |
| descripcion | varchar(200) | sí |  | Descripción |
| aplica_a | varchar(20) | sí |  | ARTICULO, CLIENTE, PROVEEDOR, IMPUESTO, BANCO, GENERAL |

### con_cuentas

Plan de cuentas jerárquico por compañía.

Llaves únicas: compania_id, codigo.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| compania_id | uuid | sí | mae_companias | Compañía |
| codigo | varchar(30) | sí |  | Código de la cuenta |
| descripcion | varchar(200) | sí |  | Nombre de la cuenta |
| nivel | smallint | sí |  | Nivel en la jerarquía |
| cuenta_padre_id | uuid |  | con_cuentas | Cuenta superior |
| naturaleza | char(1) | sí |  | D deudora o A acreedora |
| tipo | varchar(20) | sí |  | BALANCE o RESULTADOS |
| grupo | varchar(20) |  |  | Activo, pasivo, patrimonio, ingreso, costo, gasto |
| acepta_movimiento | boolean | sí |  | Solo las cuentas de último nivel aceptan asientos |
| exige_centro_costo | boolean | sí |  | Si cada línea debe llevar unidad de negocio |
| exige_tercero | boolean | sí |  | Si cada línea debe llevar dirección |
| activo | boolean | sí |  | Registro activo |

### con_tipos_transaccion

Evento de negocio que genera asiento.

Llaves únicas: codigo.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| codigo | varchar(20) | sí |  | VENTA, COSTO_VENTA, RECEPCION, PROVISION_CXP, AJUSTE_INV, COBRO, PAGO, RET_EMITIDA, RET_RECIBIDA, IVA_VENTAS, IVA_COMPRAS |
| descripcion | varchar(200) | sí |  | Descripción |

### con_reglas_contables

Cuenta a usar según compañía, transacción, clase y unidad; nulos funcionan como comodín.

Llaves únicas: compania_id, tipo_transaccion_id, clase_contable_id, unidad_negocio_id.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| compania_id | uuid | sí | mae_companias | Compañía |
| tipo_transaccion_id | uuid | sí | con_tipos_transaccion | Tipo de transacción |
| clase_contable_id | uuid |  | con_clases_contables | Clase contable; nulo aplica a todas |
| unidad_negocio_id | uuid |  | mae_unidades_negocio | Unidad de negocio; nula aplica a todas |
| cuenta_id | uuid | sí | con_cuentas | Cuenta resultante |
| centro_costo_id | uuid |  | mae_unidades_negocio | Centro de costo fijo; nulo toma el del documento |
| prioridad | smallint | sí |  | Desempate entre reglas igual de específicas |

### con_periodos

Período contable con estado por módulo.

Llaves únicas: compania_id, anio, periodo.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| compania_id | uuid | sí | mae_companias | Compañía |
| anio | smallint | sí |  | Año fiscal |
| periodo | smallint | sí |  | Número de período, 1 a 12 más ajustes |
| fecha_desde | date | sí |  | Inicio |
| fecha_hasta | date | sí |  | Fin |
| estado_ventas | varchar(20) | sí |  | ABIERTO o CERRADO |
| estado_compras | varchar(20) | sí |  | ABIERTO o CERRADO |
| estado_inventario | varchar(20) | sí |  | ABIERTO o CERRADO |
| estado_contabilidad | varchar(20) | sí |  | ABIERTO o CERRADO |

### con_asientos

Cabecera de asiento contable.

Llaves únicas: compania_id, tipo_documento_id, numero.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| compania_id | uuid | sí | mae_companias | Compañía |
| tipo_documento_id | uuid | sí | sis_tipos_documento | Tipo de asiento |
| numero | bigint | sí |  | Número |
| fecha | date | sí |  | Fecha contable |
| periodo_id | uuid | sí | con_periodos | Período |
| glosa | varchar(500) |  |  | Descripción |
| origen_modulo | varchar(20) |  |  | Módulo que lo generó |
| origen_id | uuid |  |  | Documento de origen |
| estado | varchar(20) | sí |  | BORRADOR, CONTABILIZADO, REVERSADO |
| asiento_reversa_id | uuid |  | con_asientos | Asiento que lo reversa |

### con_asientos_lineas

Movimiento a una cuenta.

Llaves únicas: asiento_id, linea.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| asiento_id | uuid | sí | con_asientos | Asiento |
| linea | integer | sí |  | Número de línea |
| cuenta_id | uuid | sí | con_cuentas | Cuenta |
| centro_costo_id | uuid |  | mae_unidades_negocio | Centro de costo |
| tercero_id | uuid |  | mae_direcciones | Tercero |
| debito | numeric(18,2) | sí |  | Débito |
| credito | numeric(18,2) | sí |  | Crédito |
| moneda_id | uuid |  | mae_monedas | Moneda original |
| monto_moneda | numeric(18,2) |  |  | Monto en moneda original |
| glosa | varchar(500) |  |  | Detalle |

### con_saldos

Saldo por cuenta, centro de costo y período.

Llaves únicas: cuenta_id, centro_costo_id, periodo_id.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| compania_id | uuid | sí | mae_companias | Compañía |
| cuenta_id | uuid | sí | con_cuentas | Cuenta |
| centro_costo_id | uuid |  | mae_unidades_negocio | Centro de costo |
| periodo_id | uuid | sí | con_periodos | Período |
| debitos | numeric(18,2) | sí |  | Total de débitos del período |
| creditos | numeric(18,2) | sí |  | Total de créditos del período |

### con_cuentas_bancarias

Cuenta en un banco.

Llaves únicas: compania_id, codigo.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| compania_id | uuid | sí | mae_companias | Compañía |
| codigo | varchar(20) | sí |  | Código interno |
| banco_id | uuid | sí | mae_direcciones | Banco |
| numero | varchar(30) | sí |  | Número de cuenta |
| tipo | varchar(20) | sí |  | CORRIENTE o AHORROS |
| moneda_id | uuid | sí | mae_monedas | Moneda |
| cuenta_id | uuid | sí | con_cuentas | Cuenta contable |
| activo | boolean | sí |  | Registro activo |

### con_movimientos_bancarios

Línea del extracto bancario.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| cuenta_bancaria_id | uuid | sí | con_cuentas_bancarias | Cuenta bancaria |
| fecha | date | sí |  | Fecha |
| referencia | varchar(100) |  |  | Referencia del banco |
| descripcion | varchar(300) |  |  | Descripción |
| monto | numeric(18,2) | sí |  | Positivo depósito, negativo retiro |
| conciliado | boolean | sí |  | Si ya está conciliado |

### con_conciliaciones

Cruce entre banco y contabilidad.

Llaves únicas: movimiento_id, asiento_linea_id.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| movimiento_id | uuid | sí | con_movimientos_bancarios | Movimiento del banco |
| asiento_linea_id | uuid | sí | con_asientos_lineas | Línea de asiento |
| monto | numeric(18,2) | sí |  | Monto conciliado |
| fecha | date | sí |  | Fecha de conciliación |

## Localización Ecuador

### ec_establecimientos

Establecimiento y punto de emisión del SRI.

Llaves únicas: compania_id, establecimiento, punto_emision.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| compania_id | uuid | sí | mae_companias | Compañía |
| establecimiento | char(3) | sí |  | Código de establecimiento |
| punto_emision | char(3) | sí |  | Código de punto de emisión |
| unidad_negocio_id | uuid |  | mae_unidades_negocio | Sucursal asociada |
| direccion | varchar(300) | sí |  | Dirección del establecimiento |
| ambiente | char(1) | sí |  | 1 pruebas, 2 producción |
| activo | boolean | sí |  | Registro activo |

### ec_certificados

Certificado de firma electrónica.

Llaves únicas: compania_id, vigente_desde.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| compania_id | uuid | sí | mae_companias | Compañía |
| titular | varchar(200) | sí |  | Titular del certificado |
| vigente_desde | date | sí |  | Inicio de vigencia |
| vigente_hasta | date | sí |  | Fin de vigencia |
| referencia_secreto | varchar(300) | sí |  | Nombre del secreto en Secret Manager |
| activo | boolean | sí |  | Registro activo |

### ec_codigos_retencion

Código de retención de renta o IVA.

Llaves únicas: tipo, codigo, vigente_desde.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| tipo | varchar(20) | sí |  | RENTA o IVA |
| codigo | varchar(10) | sí |  | Código del SRI |
| descripcion | varchar(300) | sí |  | Concepto |
| porcentaje | numeric(7,4) | sí |  | Porcentaje |
| vigente_desde | date | sí |  | Inicio de vigencia |
| vigente_hasta | date |  |  | Fin de vigencia |
| clase_contable_id | uuid |  | con_clases_contables | Clase para resolver la cuenta |

### ec_retenciones

Comprobante de retención emitido o recibido.

Llaves únicas: compania_id, sentido, tercero_id, secuencial.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| compania_id | uuid | sí | mae_companias | Compañía |
| sentido | varchar(20) | sí |  | EMITIDA a proveedor o RECIBIDA de cliente |
| establecimiento | char(3) |  |  | Establecimiento, en emitidas |
| punto_emision | char(3) |  |  | Punto de emisión, en emitidas |
| secuencial | varchar(17) | sí |  | Secuencial propio o del cliente |
| fecha | date | sí |  | Fecha de emisión |
| tercero_id | uuid | sí | mae_direcciones | Proveedor o cliente |
| compra_id | uuid |  | com_facturas | Factura de compra sustento |
| venta_id | uuid |  | ven_facturas | Factura de venta sustento |
| total | numeric(18,2) | sí |  | Total retenido |
| estado | varchar(20) | sí |  | EMITIDA, AUTORIZADA, ANULADA, REGISTRADA |
| asiento_id | uuid |  | con_asientos | Asiento |

### ec_retenciones_lineas

Detalle de una retención.

Llaves únicas: retencion_id, linea.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| retencion_id | uuid | sí | ec_retenciones | Retención |
| linea | integer | sí |  | Línea |
| codigo_retencion_id | uuid | sí | ec_codigos_retencion | Código de retención |
| base | numeric(18,2) | sí |  | Base imponible |
| porcentaje | numeric(7,4) | sí |  | Porcentaje aplicado |
| valor | numeric(18,2) | sí |  | Valor retenido |

### ec_comprobantes

Comprobante electrónico y su estado ante el SRI.

Llaves únicas: clave_acceso.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| compania_id | uuid | sí | mae_companias | Compañía |
| tipo_comprobante | varchar(2) | sí |  | 01 factura, 04 nota de crédito, 05 nota de débito, 07 retención, 03 liquidación |
| origen_tabla | varchar(63) | sí |  | Tabla del documento de origen |
| origen_id | uuid | sí |  | Documento de origen |
| clave_acceso | char(49) | sí |  | Clave de acceso de 49 dígitos |
| estado | varchar(20) | sí |  | GENERADO, FIRMADO, RECIBIDO, DEVUELTO, AUTORIZADO, NO_AUTORIZADO |
| numero_autorizacion | varchar(49) |  |  | Número de autorización |
| fecha_autorizacion | timestamptz |  |  | Fecha de autorización |
| ruta_xml | varchar(500) |  |  | Ubicación del XML en Cloud Storage |
| ruta_pdf | varchar(500) |  |  | Ubicación del RIDE en PDF |
| mensajes | jsonb |  |  | Mensajes devueltos por el SRI |
| intentos | smallint | sí |  | Intentos de envío |

### ec_ats_periodos

Generación del ATS mensual.

Llaves únicas: compania_id, anio, mes.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| compania_id | uuid | sí | mae_companias | Compañía |
| anio | smallint | sí |  | Año |
| mes | smallint | sí |  | Mes |
| estado | varchar(20) | sí |  | PENDIENTE, GENERADO, PRESENTADO |
| ruta_archivo | varchar(500) |  |  | Ubicación del XML generado |
| fecha_generacion | timestamptz |  |  | Fecha de generación |

## Configuración asistida por IA

### ia_sesiones

Conversación del asesor de configuración con un usuario.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| usuario_id | uuid | sí | sis_usuarios | Usuario del cliente |
| inicio | timestamptz | sí |  | Inicio |
| objetivo | varchar(500) |  |  | Qué se quiere configurar |
| estado | varchar(20) | sí |  | ABIERTA o CERRADA |
| historial | jsonb |  |  | Mensajes de la conversación |

### ia_archivos

Archivo entregado al asesor.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| sesion_id | uuid | sí | ia_sesiones | Sesión |
| nombre | varchar(300) | sí |  | Nombre del archivo |
| tipo_mime | varchar(100) | sí |  | Tipo de archivo |
| ruta | varchar(500) | sí |  | Ubicación en Cloud Storage |
| extraccion | jsonb |  |  | Datos que la IA extrajo |

### ia_propuestas

Conjunto de cambios propuesto por la IA.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| sesion_id | uuid | sí | ia_sesiones | Sesión |
| resumen | varchar(1000) | sí |  | Qué cambia y por qué |
| estado | varchar(20) | sí |  | BORRADOR, APROBADA, APLICADA, RECHAZADA, REVERTIDA |
| requiere_contador | boolean | sí |  | Si toca contabilidad o impuestos |
| aprobado_por | uuid |  | sis_usuarios | Quien aprobó |
| aprobado_en | timestamptz |  |  | Cuándo |
| aplicado_en | timestamptz |  |  | Cuándo se aplicó |

### ia_propuestas_cambios

Cambio individual de una propuesta.

Llaves únicas: propuesta_id, secuencia.

| Columna | Tipo | Obligatoria | Referencia | Descripción |
| --- | --- | --- | --- | --- |
| propuesta_id | uuid | sí | ia_propuestas | Propuesta |
| secuencia | integer | sí |  | Orden de aplicación |
| tabla | varchar(63) | sí |  | Tabla destino |
| operacion | char(1) | sí |  | I, U o D |
| registro_id | uuid |  |  | Registro afectado |
| datos_nuevos | jsonb |  |  | Valores a aplicar |
| datos_anteriores | jsonb |  |  | Valores previos, para revertir |

## Cambios posteriores al esquema inicial

El esquema inicial se amplía solo con migraciones numeradas en packages/db/migraciones. Esta sección resume lo que agregan; el detalle de cada columna está en los comentarios de la base.

### Migración 0003: gestión de servicios

Tablas nuevas: srv_perfiles, srv_recursos_perfiles, srv_tarifas, srv_garantias_definicion, srv_garantias_objeto, ven_contratos_preventivos, srv_casos, srv_casos_notas, srv_ordenes_horas, srv_ordenes_terceros y srv_reclamos. Columnas nuevas en srv_ordenes para la cobertura (cobertura, cobertura_fijada, motivo_cobertura, garantia_objeto_id, contrato_linea_id), el origen (caso_id, preventivo_id, plantilla_id) y el cierre (factura_id, asiento_cierre_id). La columna fase de sis_flujos_estado da el significado de cada estado. Ver docs/especificaciones/srv-gestion-de-servicios.md.

### Migración 0005: compras al pago y ventas al cobro

| Tabla | Columna | Tipo | Descripción |
| --- | --- | --- | --- |
| sis_flujos_estado | fase | varchar(20) | Agrega las fases APROBACION, APROBADA, RECIBIDA, RETENIDA y DESPACHADA |
| com_ordenes | observacion | varchar(500) | Observación |
| com_facturas | numero | bigint | Número interno de registro |
| com_facturas | condicion_pago_id | uuid | Condición de pago |
| com_facturas | retenciones | numeric(18,2) | Total retenido al proveedor |
| com_facturas_lineas | articulo_id | uuid | Artículo o servicio |
| com_facturas_lineas | unidad_negocio_id | uuid | Centro de costo |
| com_facturas_lineas | ret_renta_id | uuid | Código de retención de renta |
| com_facturas_lineas | ret_iva_id | uuid | Código de retención de IVA |
| ven_ordenes | observacion | varchar(500) | Observación |
| ven_ordenes_lineas | cantidad_facturada | numeric(18,4) | Cantidad facturada |
| ven_facturas_lineas | cantidad_devuelta | numeric(18,4) | Cantidad ya devuelta con notas de crédito |
| cxc_aplicaciones | nota_credito_id | uuid | Nota de crédito aplicada; cada aplicación tiene exactamente un origen: cobro, retención o nota de crédito |
| ec_retenciones | autorizacion | varchar(49) | Clave de acceso o autorización |

Ver docs/especificaciones/com-compras-al-pago.md y docs/especificaciones/ven-ventas-al-cobro.md.
