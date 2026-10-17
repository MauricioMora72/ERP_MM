# ERP propio

ERP web multiempresa para empresas de servicios en Ecuador. Fase actual: 0, fundamentos.

## Qué incluye la fase 0

- Alta de un cliente nuevo en un solo paso: suscripción, primera compañía con su sucursal matriz, catálogos base de ejemplo y usuario administrador.
- Pantallas de lista y ficha para monedas, libro de direcciones con ubicaciones y contactos, compañías, unidades de negocio, impuestos, condiciones de pago, artículos y servicios, catálogos y sus valores, clases contables, tipos de documento con sus flujos de estado, numeradores, usuarios, roles y permisos.
- Aislamiento total entre suscriptores con seguridad a nivel de fila de PostgreSQL.
- Permisos por rol y por compañía.
- Numeración de documentos sin duplicados, aun con altas simultáneas.
- Kardex protegido: la aplicación no puede modificarlo ni borrarlo.
- Auditoría de quién creó y modificó cada registro.

## Requisitos en su computadora

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
