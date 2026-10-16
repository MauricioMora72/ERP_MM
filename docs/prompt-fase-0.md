# Prompt de arranque: fase 0

Copie el texto de abajo como primer mensaje a Claude Code, con este repositorio abierto.

---

Lee CLAUDE.md, docs/plan-maestro.md, docs/diccionario-de-datos.md y db/erp_fase0_fase1.sql. Vamos a construir solo la fase 0 (fundamentos). No construyas ventas, compras, inventario, servicios ni contabilidad todavía.

Antes de escribir código, preséntame en pocas líneas el plan de trabajo de la fase 0 y las dudas que tengas. Espera mi visto bueno.

Alcance de la fase 0:

1. Estructura del monorepo según CLAUDE.md, con pnpm, TypeScript estricto, ESLint y Prettier.
2. Docker Compose con PostgreSQL 16 y el emulador de Firebase Authentication para desarrollo local.
3. Migración inicial que aplique db/erp_fase0_fase1.sql, y creación de un rol de aplicación que no sea dueño de las tablas.
4. API en Fastify con:
   - verificación del token de Firebase y resolución del usuario y su suscriptor en sis_usuarios;
   - una transacción por petición con SET LOCAL app.suscriptor_id y app.usuario;
   - control de permisos con sis_roles_permisos y sis_usuarios_roles;
   - endpoints de lectura, alta, modificación e inactivación para: compañías, unidades de negocio, libro de direcciones con ubicaciones y contactos, catálogos y sus valores, tipos de documento con sus flujos de estado, numeradores, usuarios y roles, monedas, impuestos, condiciones de pago y artículos;
   - una función de servicio para tomar el siguiente número de un documento con bloqueo de fila.
5. Interfaz web en Next.js con inicio de sesión, selector de compañía, menú por módulo y pantallas de lista y detalle para todo lo anterior. Diseño sobrio, en español.
6. Alta de un suscriptor nuevo con su primera compañía y su usuario administrador, en un solo proceso.
7. Datos semilla de catálogos base (tipos de identificación, tipos de búsqueda, unidades de medida, tipos de unidad de negocio) marcados como ejemplos para que yo los valide.
8. Pruebas automáticas que demuestren:
   - que un suscriptor no puede leer ni escribir datos de otro;
   - que dos documentos creados al mismo tiempo nunca reciben el mismo número;
   - que un usuario sin permiso recibe error al intentar una acción.

Criterios de aceptación:

- Con un solo comando levanto todo en local y puedo iniciar sesión.
- Puedo crear un suscriptor, su compañía, una sucursal, un cliente en el libro de direcciones y un artículo de servicio desde la interfaz.
- Todas las pruebas pasan.
- Un README explica cómo correr, probar y reiniciar el ambiente local.

No despliegues nada en Google Cloud todavía. Al terminar, resume qué se construyó, qué quedó pendiente y qué decisiones tomaste que yo deba validar.
