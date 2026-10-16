# ERP propio: reglas del proyecto

Este repositorio contiene un ERP web vendido como suscripción (SaaS multiempresa), con la filosofía de manejo de un ERP clásico de distribución y una arquitectura moderna. Primer mercado: Ecuador. Primera vertical: empresas de servicios, con un módulo genérico y configurable de gestión de servicios.

El dueño del producto es Mauricio Mora. Comunícate con él en español y trátalo de usted.

## Documentos de referencia

Lee estos archivos antes de cualquier tarea:

1. docs/plan-maestro.md: alcance, decisiones, principios de diseño, fases y modelo contable.
2. docs/diccionario-de-datos.md: cada tabla y columna con su significado.
3. db/erp_fase0_fase1.sql: esquema de base de datos de las fases 0 y 1. Es la fuente de verdad del modelo.

Si una tarea contradice estos documentos, detente y pregunta antes de seguir.

## Arquitectura

- Monorepo con pnpm workspaces: apps/web (interfaz), apps/api (API), packages/db (acceso a datos y migraciones), packages/shared (tipos y validaciones comunes).
- Lenguaje: TypeScript en todo el proyecto, modo estricto.
- Interfaz: Next.js con App Router y React. La interfaz nunca accede a la base de datos; solo llama a la API.
- API: Node.js con Fastify, desplegada en Cloud Run.
- Base de datos: PostgreSQL 16 (Cloud SQL en la nube, Docker en desarrollo). Acceso con Kysely y SQL explícito; nada de ORM que oculte las consultas.
- Validación: Zod en la API y en los formularios, con esquemas compartidos desde packages/shared.
- Autenticación: Firebase Authentication. La API verifica el token con firebase-admin.
- Pruebas: Vitest. Cada regla de negocio lleva su prueba.

## Reglas obligatorias

1. Aislamiento por suscriptor. Cada petición a la API abre una transacción y ejecuta SET LOCAL app.suscriptor_id y SET LOCAL app.usuario antes de cualquier consulta. La aplicación se conecta con un rol que NO es dueño de las tablas, para que la seguridad a nivel de fila se aplique siempre.
2. Cambios de esquema solo mediante migraciones numeradas en packages/db/migraciones. Nunca se edita una migración ya aplicada.
3. Nombres: tablas y columnas en español y snake_case, con el prefijo de módulo del plan (sis_, cat_, mae_, srv_, inv_, com_, ven_, cxc_, cxp_, con_, ec_, ia_). En TypeScript, camelCase.
4. Kardex inmutable. Sobre inv_kardex solo se hace INSERT. Todo movimiento de inventario inserta el kardex y actualiza inv_saldos e inv_costos en la misma transacción.
5. Contabilidad por reglas. Ningún módulo escribe asientos directamente: los genera el motor contable con con_reglas_contables. Todo asiento debe cuadrar. Un asiento contabilizado no se modifica, se reversa.
6. Estados de línea. Las transiciones se validan contra sis_flujos_estado; no se escriben estados fijos en el código.
7. Valores tributarios (tarifas de IVA, porcentajes de retención, códigos del SRI) siempre en tablas con fecha de vigencia, nunca en el código.
8. Numeración de documentos con sis_numeradores, tomando el siguiente número con bloqueo de fila (SELECT ... FOR UPDATE) dentro de la transacción del documento.
9. Montos con numeric en la base y con una librería decimal en TypeScript; nunca number de punto flotante para dinero.
10. Secretos solo en Secret Manager o en archivos .env locales ignorados por git. Nunca se sube una credencial al repositorio.
11. Este producto no usa nombres, numeración de tablas ni alias de columnas de Oracle JD Edwards, ni la marca JD Edwards. Se hereda la forma de trabajar, no el esquema.

## Forma de trabajo

- Trabaja solo la fase o el módulo que se te pide. No adelantes módulos.
- Antes de construir un módulo nuevo, propone su especificación funcional en docs/especificaciones/ y espera la aprobación de Mauricio.
- Entrega en pasos pequeños que se puedan probar, con instrucciones para correrlos en local.
- Interfaz en español, sobria y legible, pensada para usuarios de oficina que vienen de un ERP tradicional.
- Al terminar cada tarea, resume en pocas líneas qué cambió y cómo probarlo.
