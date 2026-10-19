# ERP propio

ERP web multiempresa para empresas de servicios en Ecuador. Fase actual: 1, gestión de servicios con compras al pago, ventas al cobro, contabilidad general e inventarios completos. La facturación electrónica del SRI queda para más adelante.

## Qué incluyen contabilidad general e inventarios (fase 1)

Especificaciones en docs/especificaciones/con-contabilidad-general.md y docs/especificaciones/inv-inventarios-complemento.md.

- Contabilidad: asientos manuales con validación de cuadre, centro de costo y tercero; reversa en lugar de edición; períodos abiertos o cerrados por módulo (ventas, compras, inventario, contabilidad); cierre del ejercicio contra resultado del ejercicio; balance de comprobación, balance general, estado de resultados y mayor por cuenta, todos descargables en CSV.
- Bancos: carga del extracto pegando sus líneas, conciliación manual y automática por valor y fecha, registro de comisiones y débitos bancarios desde la misma pantalla, y saldo conciliado.
- Inventarios: transferencias entre bodegas al costo promedio, conteo físico con foto de existencias y ajuste solo de diferencias, lotes con vencimiento y salida automática por el que vence primero, y consulta de kardex con saldo acumulado.

## Qué incluyen compras al pago y ventas al cobro (fase 1)

Especificaciones en docs/especificaciones/com-compras-al-pago.md y docs/especificaciones/ven-ventas-al-cobro.md.

- Compras: requisición, orden de compra con aprobación por flujo, recepciones parciales que entran al kardex, factura de proveedor cruzada contra lo recibido con variación de precio, retención de renta e IVA por línea, cuotas por pagar y pagos agrupados por proveedor.
- Ventas: cotización, orden de venta con precio de lista, retención por crédito, compromiso de existencias, despachos parciales, facturación de lo despachado con su costo, nota de crédito con devolución a bodega, retención recibida, cobros y facturación periódica de contratos.
- Estados por línea con estado siguiente y último estado, configurables en Flujos de estado.
- Antigüedad de saldos de cuentas por cobrar y por pagar.
- Todo asiento sale del motor contable por reglas y cuadra. Las cuentas, conceptos, códigos de retención y formas de pago se cargan como ejemplo y un contador debe validarlos.

Para probarlo: registre un proveedor y un cliente (Compras, Proveedores y Ventas, Clientes), una lista de precios, una cuenta bancaria (Cobros y pagos, Cuentas bancarias) y un artículo. Luego haga el ciclo en Compras, Requisiciones y órdenes, y en Ventas, Cotizaciones y órdenes.

## Qué incluye el módulo de gestión de servicios (fase 1)

Especificación completa en docs/especificaciones/srv-gestion-de-servicios.md.

- Configurar industria: plantillas para clínica odontológica, clínica u hospital, mantenimiento de equipos y taller automotriz. Crean tipos de orden con su flujo, campos propios, perfiles con tarifas, artículos y temparios. Se pueden aplicar varias y luego ajustar.
- Órdenes de servicio con tempario copiado, actividades, horas por recurso (rango o total), consumo de materiales con kardex y su reverso, servicios de terceros, prefactura y factura con IVA, cuenta por cobrar y asientos. Una orden en garantía, contrato o uso interno se liquida sin factura y su costo va a la cuenta que corresponde.
- Cobertura automática: garantía del objeto, luego contrato vigente, luego interno o facturable. Cambiarla exige permiso y motivo.
- Mesa de ayuda: casos con prioridad, canal, compromiso de respuesta, bitácora, solución obligatoria y generación de la orden desde el caso.
- Reclamos de garantía al fabricante desde órdenes en garantía liquidadas; al aprobarse quedan como cuenta por cobrar al proveedor.
- Contratos de servicio, mantenimientos preventivos, agenda de recursos, reglas de garantía.
- Inventario: ajustes de entrada y salida con costo promedio y consulta de existencias.
- Datos clínicos marcados como sensibles: solo los ve quien tiene el permiso srv-datos-sensibles.

Para probarlo: dé de alta una empresa, entre a Servicios, Configurar industria, aplique una plantilla, registre un cliente, una lista de precios y un recurso, cargue existencias en Inventario, Ajustes y existencias, y cree una orden en Servicios, Órdenes de servicio.

## Qué incluye la fase 0

- Alta de un cliente nuevo en un solo paso: suscripción, primera compañía con su sucursal matriz, catálogos base de ejemplo y usuario administrador.
- Pantallas de lista y ficha para monedas, libro de direcciones con ubicaciones y contactos, compañías, unidades de negocio, impuestos, condiciones de pago, artículos y servicios, catálogos y sus valores, clases contables, tipos de documento con sus flujos de estado, numeradores, usuarios, roles y permisos.
- Aislamiento total entre suscriptores con seguridad a nivel de fila de PostgreSQL.
- Permisos por rol y por compañía.
- Numeración de documentos sin duplicados, aun con altas simultáneas.
- Kardex protegido: la aplicación no puede modificarlo ni borrarlo.
- Auditoría de quién creó y modificó cada registro.

## Opción sin instalar nada: GitHub Codespaces

1. En github.com abra el repositorio ERP_MM.
2. Pulse el botón verde Code, pestaña Codespaces, y luego Create codespace on main.
3. Espere a que termine la preparación (la primera vez tarda unos minutos: instala todo y crea la base).
4. En la terminal de abajo escriba `pnpm dev`.
5. Cuando aparezca el aviso del puerto 3000, pulse Open in Browser.

Al terminar, cierre la pestaña. El codespace se detiene solo por inactividad y conserva sus datos.

## Requisitos para correrlo en su computadora

- Node.js 22 o superior.
- pnpm: se activa con `corepack enable`.
- Docker Desktop, para la base de datos local.

## Cómo levantarlo por primera vez

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrar
pnpm dev
```

Luego abra http://localhost:3000. En modo de desarrollo basta con escribir un correo para ingresar; la primera vez el sistema le pedirá crear su empresa.

## Comandos del día a día

| Comando | Para qué sirve |
| --- | --- |
| `pnpm dev` | Levanta la API (puerto 4000) y la web (puerto 3000) |
| `pnpm db:migrar` | Aplica las migraciones pendientes |
| `pnpm test` | Corre las pruebas automáticas (necesita la base de Docker encendida) |
| `pnpm typecheck` | Revisa los tipos de todo el proyecto |
| `docker compose down -v` | Borra la base local para empezar de cero |

## Estructura

| Carpeta | Contenido |
| --- | --- |
| apps/api | API en Fastify: sesión, permisos, entidades y alta de suscriptores |
| apps/web | Interfaz en Next.js |
| packages/db | Conexión, transacciones con suscriptor, numerador y migraciones |
| packages/shared | Definición de entidades y validaciones compartidas |
| docs | Plan maestro, diccionario de datos y especificaciones |
| db | Esquema completo de las fases 0 y 1 |

Las pantallas se generan a partir de packages/shared/src/entidades.ts: agregar una entidad ahí la deja disponible en la API y en la web.

## Inicio de sesión con Firebase

El modo de desarrollo no existe en producción. Para usar Firebase Authentication, cambie en .env `AUTH_MODE=firebase` y `NEXT_PUBLIC_AUTH_MODE=firebase` y complete los datos de su proyecto de Firebase.

## Documentación

- CLAUDE.md: reglas del proyecto.
- docs/plan-maestro.md: plan maestro.
- docs/diccionario-de-datos.md: tablas y columnas.
- docs/prompt-fase-0.md: alcance original de esta fase.
