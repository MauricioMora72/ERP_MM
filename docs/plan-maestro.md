# Plan maestro del ERP propio

Autor: Mauricio Mora. Versión del 15 de octubre de 2026. La versión viva está en el documento del proyecto; esta copia es la referencia para el desarrollo.

## Propósito y alcance

Construir un ERP web propio, vendido como suscripción, que conserve la filosofía de manejo que los usuarios de JD Edwards conocen, con arquitectura moderna y modelo de datos original.

El primer mercado es Ecuador, pero el diseño debe permitir crecer a otros países y a miles de empresas sin rehacer el sistema. La primera vertical es la de empresas de servicios; la segunda, la manufactura.

El alcance inicial cubre maestros, inventarios, compras, ventas y la contabilidad completa que esos módulos generan. Transporte y WMS quedan para una fase posterior.

## Decisiones tomadas

| Tema | Decisión | Motivo |
| --- | --- | --- |
| Nube | Google Cloud | Un solo proveedor y una sola factura |
| Base de datos | PostgreSQL en Cloud SQL | Un ERP es relacional: contabilidad, saldos y reportes necesitan transacciones y SQL |
| Backend | Cloud Run (contenedores) | Escala solo según la carga y cobra por uso |
| Inicio de sesión | Firebase Authentication | Usuarios, contraseñas y acceso con Google listos |
| Interfaz | Aplicación web en Next.js y React | Funciona en cualquier navegador, sin instalar nada |
| Lenguaje | TypeScript en todo el sistema | Un solo lenguaje entre interfaz y backend |
| Reportes y analítica | BigQuery | Consultas pesadas sin cargar la base operativa |
| Modelo de negocio | SaaS multiempresa | Muchos clientes en la misma instalación, con datos aislados |
| Mercado inicial | Ecuador | SRI, retenciones y ATS desde la fase 1 |
| Modelo de datos | Original, con la filosofía de manejo de JDE | Se hereda la lógica, no las tablas de Oracle |

## Principios de diseño heredados

Se hereda la forma de pensar de JDE, no su esquema. Cada principio se implementa con nombres y estructuras propias.

| Principio | Cómo se aplica |
| --- | --- |
| Libro de direcciones único | Una sola entidad para clientes, proveedores, empleados y contactos, con roles por tipo de búsqueda |
| Kardex inmutable | Cada movimiento de inventario se inserta y nunca se edita; las correcciones son movimientos nuevos |
| Saldos separados del kardex | Los saldos por artículo, sucursal, ubicación y lote se actualizan en la misma transacción del movimiento |
| Estados siguiente y último | Cada línea de documento avanza por estados numéricos definidos por tipo de documento y configurables |
| Documento = compañía + tipo + número | Llave de negocio uniforme en ventas, compras, inventario y contabilidad |
| Catálogos configurables | Tablas de códigos que el cliente administra sin programar |
| Reglas contables automáticas | Cada transacción operativa genera su asiento según reglas por compañía, tipo de transacción y clase contable |
| Sucursal o planta | El inventario y los costos se manejan por unidad de negocio |
| Numeradores | Siguiente número por compañía y tipo de documento |
| Auditoría | Toda tabla guarda usuario, programa y fecha de creación y de cambio |

Lo que se moderniza: fechas y montos con su tipo real, nombres legibles, API desde el primer día, procesos por eventos en lugar de batch nocturnos y pantallas web.

## Convención de nombres

| Prefijo | Módulo | Ejemplos de tablas |
| --- | --- | --- |
| sis_ | Sistema y seguridad | sis_suscriptores, sis_usuarios, sis_roles, sis_numeradores |
| cat_ | Catálogos configurables | cat_catalogos, cat_valores |
| mae_ | Maestros | mae_direcciones, mae_articulos, mae_unidades_negocio |
| srv_ | Gestión de servicios | srv_ordenes, srv_ordenes_consumos, srv_agenda |
| inv_ | Inventarios | inv_kardex, inv_saldos, inv_ubicaciones, inv_lotes |
| com_ | Compras | com_ordenes, com_ordenes_lineas, com_recepciones |
| ven_ | Ventas | ven_ordenes, ven_ordenes_lineas, ven_contratos, ven_facturas |
| con_ | Contabilidad | con_cuentas, con_asientos, con_asientos_lineas, con_reglas_contables |
| cxc_ / cxp_ | Cuentas por cobrar y por pagar | cxc_documentos, cxp_documentos, cxc_cobros, cxp_pagos |
| ec_ | Localización Ecuador | ec_comprobantes, ec_retenciones, ec_ats_periodos |
| ia_ | Configuración asistida por IA | ia_sesiones, ia_archivos, ia_propuestas, ia_propuestas_cambios |

Las tablas van en minúsculas. Toda tabla de negocio lleva suscriptor_id para aislar a cada cliente del SaaS; dentro de un suscriptor puede haber varias compañías legales, cada una con su RUC. El detalle completo está en docs/diccionario-de-datos.md y en db/erp_fase0_fase1.sql.

## Arquitectura técnica y escalabilidad

Toda pantalla y toda integración pasan por una sola API, y los procesos lentos, como la firma y el envío al SRI, corren aparte sin frenar al usuario.

| Componente | Servicio | Función |
| --- | --- | --- |
| Interfaz web | Next.js en Firebase Hosting o Cloud Run | Pantallas para el usuario |
| Autenticación | Firebase Authentication | Usuarios y sesiones |
| API del ERP | TypeScript en Cloud Run | Toda la lógica de negocio |
| Base de datos | Cloud SQL PostgreSQL | Datos aislados por suscriptor |
| Eventos | Pub/Sub | Eventos del negocio |
| Procesos asíncronos | Cloud Run | Firma y envío al SRI |
| Archivos | Cloud Storage | XML, PDF y adjuntos |
| Secretos | Secret Manager | Certificados de firma |
| Analítica | BigQuery | Reportes pesados |

Todas las empresas cliente comparten la misma base, aisladas por suscriptor_id y por seguridad a nivel de fila de PostgreSQL. Para crecer, Cloud Run agrega instancias solo, Cloud SQL suma réplicas de lectura y los reportes pesados se van a BigQuery. Un cliente grande que lo exija puede recibir su propia base sin cambiar el código.

## Fases y módulos

| Fase | Contenido | Depende de |
| --- | --- | --- |
| 0. Fundamentos | Arquitectura, multiempresa, usuarios y roles, catálogos, numeradores, reglas de estados, libro de direcciones, artículos, unidades de negocio | Nada |
| 1. Vertical de servicios | Gestión de servicios configurable, ventas, compras, inventarios, contabilidad completa y localización Ecuador | Fase 0 |
| 2. Manufactura | Listas de materiales, rutas, órdenes de producción, costeo, planificación de materiales | Fase 1 |
| 3. Logística | Transporte y WMS | Fase 1 |

Los módulos operativos nunca escriben asientos: los genera contabilidad con sus reglas. Todos se apoyan en la misma base de maestros y catálogos.

## Fase 1, vertical de servicios

La fase 1 no se ata a una sola industria: su eje es un módulo genérico de gestión de servicios que cada cliente configura, sea una clínica dental, un taller o una empresa de mantenimiento.

| Módulo | Procesos | Integración contable |
| --- | --- | --- |
| Gestión de servicios | Tipos de orden configurables, agenda y asignación de técnicos o profesionales, activos o pacientes atendidos, horas, materiales y servicios consumidos, contratos y garantías, facturación de la orden | Costo de la orden, consumo de inventario y venta del servicio |
| Ventas | Cotización, contrato con facturación recurrente, factura, nota de crédito, precios y descuentos | Asiento de venta, IVA y cuenta por cobrar |
| Compras | Requisición, aprobación, orden de compra, recepción de bienes o servicios, factura de proveedor, liquidación de compra | Asiento de recepción, provisión de cuenta por pagar, retención |
| Inventarios | Consumibles y repuestos, kardex, saldos por sucursal y lote, ajustes, transferencias, conteo físico, costo promedio | Asiento por movimiento según reglas |
| Cuentas por cobrar | Documentos, cobros, aplicación, antigüedad de saldos | Asiento de cobro |
| Cuentas por pagar | Documentos, programación de pagos, pagos, antigüedad de saldos | Asiento de pago |
| Contabilidad general | Plan de cuentas, asientos automáticos y manuales, bancos y conciliación, períodos, cierre, balance y estado de resultados | Núcleo que recibe todo |

### Gestión de servicios configurable

| Qué se configura | Ejemplo odontología | Ejemplo mantenimiento |
| --- | --- | --- |
| Tipos de orden de servicio | Consulta, tratamiento, control | Correctivo, preventivo, instalación |
| Objeto atendido | Paciente | Equipo o activo del cliente |
| Campos personalizados por tipo | Pieza dental, diagnóstico, alergias declaradas | Número de serie, horómetro, falla reportada |
| Flujo de estados | Agendada, en atención, terminada, facturada | Abierta, asignada, en sitio, cerrada, facturada |
| Recursos | Odontólogos y consultorios | Técnicos y vehículos |
| Plantillas de trabajo | Tratamiento con sus sesiones y materiales | Plan preventivo con tareas y repuestos |

Cada industria se entrega como una plantilla de configuración que se carga al crear la empresa cliente. Lo que la configuración no cubre se resuelve con desarrollos sobre puntos de extensión (API, eventos y reglas propias por empresa) sin modificar el núcleo.

## Modelo contable y financiero

Ningún módulo elige cuentas contables: cada transacción busca su cuenta en una tabla de reglas, a partir de la compañía, el tipo de transacción y la clase contable de lo que se mueve.

| Pieza | Qué define |
| --- | --- |
| Plan de cuentas | Cuentas jerárquicas con niveles configurables, naturaleza, si es de balance o resultados, si acepta movimiento y si exige centro de costo o tercero. Plantilla NIIF que cada compañía adapta |
| Centros de costo | Las unidades de negocio actúan como centro de costo |
| Clases contables | Agrupan artículos, servicios, clientes, proveedores, impuestos y cuentas bancarias según su tratamiento contable |
| Tipos de transacción contable | Venta, costo de venta, recepción de compra, provisión por pagar, ajuste de inventario, cobro, pago, retención emitida, retención recibida, IVA en ventas, IVA en compras |
| Reglas contables | Compañía + tipo de transacción + clase contable, y opcionalmente unidad de negocio, devuelven la cuenta; búsqueda de lo más específico a lo más general |
| Períodos | Por compañía y año fiscal, abiertos o cerrados por módulo |
| Asientos | Siempre cuadrados, con su documento de origen; contabilizados no se editan, se reversan |
| Saldos contables | Por cuenta, centro de costo y período |

Ejemplo: factura de servicios profesionales por 100 dólares más IVA.

| Línea | Regla que la decide | Débito | Crédito |
| --- | --- | --- | --- |
| Clientes locales | Venta + clase del cliente | 115 | |
| Ingresos por servicios | Venta + clase del servicio | | 100 |
| IVA en ventas | IVA en ventas + clase del impuesto | | 15 |

La tarifa de IVA sale de un catálogo con fecha de vigencia. Un contador debe validar la plantilla del plan de cuentas y las reglas iniciales antes de construir esta parte.

## Configuración asistida por IA

Un asesor de configuración dentro del ERP conversa con el cliente, le pide archivos y arma la parametrización; el cliente solo revisa y aprueba.

1. Entrevista al cliente: industria, compañías, sucursales, qué vende y cómo factura.
2. Pide y lee lo que el cliente ya tiene: plan de cuentas en Excel, listas de clientes, proveedores y artículos, foto del RUC, factura de ejemplo, formato de orden de servicio.
3. Propone la configuración completa: compañías, catálogos, tipos de orden con campos y estados, plan de cuentas, reglas contables, establecimientos del SRI y cargas iniciales.
4. Muestra la propuesta como un conjunto de cambios con vista previa.
5. Un administrador aprueba y el sistema aplica los cambios por la API, con versión para deshacerlos.

La IA nunca escribe directo en la base, nada se aplica sin aprobación humana y los cambios contables y tributarios quedan marcados para revisión de un contador. El modelo de IA puede consumirse desde Vertex AI en Google Cloud.

## Localización Ecuador

Todo lo propio de Ecuador vive en una capa separada del núcleo, con prefijo ec_.

| Requisito | Alcance en fase 1 |
| --- | --- |
| Comprobantes electrónicos SRI | Factura, nota de crédito, nota de débito, retención y liquidación de compra en esquema offline, XML firmado y clave de acceso |
| Firma electrónica | Certificado de cada empresa cliente en Secret Manager |
| Retenciones | Porcentajes de renta e IVA configurables por fecha de vigencia |
| ATS | Anexo transaccional mensual desde compras, ventas y retenciones |
| Plan de cuentas | Plantilla base NIIF |
| Guía de remisión | Pasa a la fase 3, con transporte |

Todo valor tributario va en catálogos con fecha de vigencia y nunca escrito en el código.

## Forma de trabajo

1. Claude redacta la especificación funcional del módulo con la filosofía de manejo de JDE.
2. Mauricio corrige y aprueba.
3. Claude actualiza el diccionario de datos y genera las migraciones.
4. Claude construye backend y pantallas.
5. Mauricio prueba con escenarios reales antes de pasar al siguiente módulo.

## Cuidados legales

No se usan numeraciones de tablas de Oracle (ni con otro prefijo), prefijos o alias de columnas de JDE, ni la marca JD Edwards. No se toma nada del software de Oracle descargado. Sí se usan conceptos de negocio de uso general. Los términos de servicio y cualquier tabla de equivalencias con JDE deben revisarse con un abogado antes de publicarse.

## Decisiones pendientes

- Primeras plantillas de industria para gestión de servicios (por ejemplo odontología y mantenimiento)
- Nombre comercial del producto
- Modelo de precios de la suscripción
- Pasarela de pago para cobrar suscripciones en Ecuador
- Quién gestiona el certificado de firma electrónica de cada cliente
- Método de costeo de inventario
- Revisión legal de términos de servicio
