-- ERP propio: modelo de datos de las fases 0 y 1
-- PostgreSQL 15 o superior (Cloud SQL). Generado a partir del plan maestro.
-- Cada tabla de negocio lleva suscriptor_id y seguridad a nivel de fila.
-- La aplicación fija el suscriptor de la sesión con: SET app.suscriptor_id = '<uuid>';

CREATE SCHEMA IF NOT EXISTS erp;
SET search_path TO erp;

CREATE OR REPLACE FUNCTION erp.fn_suscriptor_actual() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.suscriptor_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION erp.fn_marcar_modificacion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.modificado_en := now();
  NEW.modificado_por := coalesce(nullif(current_setting('app.usuario', true), ''), NEW.modificado_por);
  RETURN NEW;
END $$;

-- ----------------------------------------------------------------------
-- sis_suscriptores: Cliente del SaaS que paga la suscripción; raíz del aislamiento de datos
CREATE TABLE sis_suscriptores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo varchar(20) NOT NULL,
  nombre varchar(200) NOT NULL,
  plan varchar(20),
  estado varchar(20) NOT NULL DEFAULT 'ACTIVO',
  pais char(2) NOT NULL DEFAULT 'EC',
  activo boolean NOT NULL DEFAULT true,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_sis_suscriptores_1 UNIQUE NULLS NOT DISTINCT (codigo)
);
COMMENT ON TABLE sis_suscriptores IS 'Cliente del SaaS que paga la suscripción; raíz del aislamiento de datos';
COMMENT ON COLUMN sis_suscriptores.codigo IS 'Código único del suscriptor';
COMMENT ON COLUMN sis_suscriptores.nombre IS 'Razón social o nombre comercial';
COMMENT ON COLUMN sis_suscriptores.plan IS 'Plan de suscripción contratado';
COMMENT ON COLUMN sis_suscriptores.estado IS 'ACTIVO, SUSPENDIDO o CANCELADO';
COMMENT ON COLUMN sis_suscriptores.pais IS 'País principal, ISO 3166';
COMMENT ON COLUMN sis_suscriptores.activo IS 'Registro activo';
CREATE TRIGGER tg_sis_suscriptores_mod BEFORE UPDATE ON sis_suscriptores FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();

-- ----------------------------------------------------------------------
-- cat_catalogos: Definición de cada catálogo configurable
CREATE TABLE cat_catalogos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  modulo varchar(20) NOT NULL,
  codigo varchar(20) NOT NULL,
  descripcion varchar(200) NOT NULL,
  longitud smallint NOT NULL DEFAULT 10,
  es_sistema boolean NOT NULL DEFAULT false,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_cat_catalogos_1 UNIQUE NULLS NOT DISTINCT (suscriptor_id, modulo, codigo)
);
COMMENT ON TABLE cat_catalogos IS 'Definición de cada catálogo configurable';
COMMENT ON COLUMN cat_catalogos.modulo IS 'Módulo dueño del catálogo';
COMMENT ON COLUMN cat_catalogos.codigo IS 'Código del catálogo';
COMMENT ON COLUMN cat_catalogos.descripcion IS 'Para qué sirve';
COMMENT ON COLUMN cat_catalogos.longitud IS 'Longitud máxima de los códigos';
COMMENT ON COLUMN cat_catalogos.es_sistema IS 'Verdadero si lo entrega el producto y el cliente no puede borrarlo';
CREATE TRIGGER tg_cat_catalogos_mod BEFORE UPDATE ON cat_catalogos FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE cat_catalogos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_cat_catalogos_suscriptor ON cat_catalogos USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- cat_valores: Valores de un catálogo
CREATE TABLE cat_valores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  catalogo_id uuid NOT NULL REFERENCES cat_catalogos(id),
  codigo varchar(20) NOT NULL,
  descripcion varchar(200) NOT NULL,
  descripcion2 varchar(200),
  codigo_especial varchar(20),
  orden smallint,
  activo boolean NOT NULL DEFAULT true,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_cat_valores_1 UNIQUE NULLS NOT DISTINCT (catalogo_id, codigo)
);
CREATE INDEX ix_cat_valores_catalogo_id ON cat_valores (catalogo_id);
COMMENT ON TABLE cat_valores IS 'Valores de un catálogo';
COMMENT ON COLUMN cat_valores.catalogo_id IS 'Catálogo al que pertenece';
COMMENT ON COLUMN cat_valores.codigo IS 'Código del valor';
COMMENT ON COLUMN cat_valores.descripcion IS 'Descripción principal';
COMMENT ON COLUMN cat_valores.descripcion2 IS 'Descripción secundaria';
COMMENT ON COLUMN cat_valores.codigo_especial IS 'Valor auxiliar que usa la lógica del sistema';
COMMENT ON COLUMN cat_valores.orden IS 'Orden de presentación';
COMMENT ON COLUMN cat_valores.activo IS 'Registro activo';
CREATE TRIGGER tg_cat_valores_mod BEFORE UPDATE ON cat_valores FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE cat_valores ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_cat_valores_suscriptor ON cat_valores USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- mae_monedas: Monedas habilitadas
CREATE TABLE mae_monedas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  codigo char(3) NOT NULL,
  descripcion varchar(200) NOT NULL,
  decimales smallint NOT NULL DEFAULT 2,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_mae_monedas_1 UNIQUE NULLS NOT DISTINCT (suscriptor_id, codigo)
);
COMMENT ON TABLE mae_monedas IS 'Monedas habilitadas';
COMMENT ON COLUMN mae_monedas.codigo IS 'Código ISO 4217, por ejemplo USD';
COMMENT ON COLUMN mae_monedas.descripcion IS 'Nombre de la moneda';
COMMENT ON COLUMN mae_monedas.decimales IS 'Decimales de presentación';
CREATE TRIGGER tg_mae_monedas_mod BEFORE UPDATE ON mae_monedas FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE mae_monedas ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_mae_monedas_suscriptor ON mae_monedas USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- mae_direcciones: Libro de direcciones: toda persona o empresa con la que se trata
CREATE TABLE mae_direcciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  numero bigint NOT NULL,
  nombre varchar(200) NOT NULL,
  nombre_comercial varchar(200),
  tipo_identificacion varchar(20) NOT NULL,
  identificacion varchar(20) NOT NULL,
  tipo_busqueda varchar(20) NOT NULL,
  correo varchar(200),
  telefono varchar(30),
  direccion_padre_id uuid REFERENCES mae_direcciones(id),
  campos jsonb,
  activo boolean NOT NULL DEFAULT true,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_mae_direcciones_1 UNIQUE NULLS NOT DISTINCT (suscriptor_id, numero)
);
CREATE INDEX ix_mae_direcciones_1 ON mae_direcciones (suscriptor_id, identificacion);
CREATE INDEX ix_mae_direcciones_direccion_padre_id ON mae_direcciones (direccion_padre_id);
COMMENT ON TABLE mae_direcciones IS 'Libro de direcciones: toda persona o empresa con la que se trata';
COMMENT ON COLUMN mae_direcciones.numero IS 'Número de dirección, único por suscriptor';
COMMENT ON COLUMN mae_direcciones.nombre IS 'Nombre o razón social';
COMMENT ON COLUMN mae_direcciones.nombre_comercial IS 'Nombre comercial';
COMMENT ON COLUMN mae_direcciones.tipo_identificacion IS 'Catálogo de tipos de identificación: RUC, cédula, pasaporte, exterior';
COMMENT ON COLUMN mae_direcciones.identificacion IS 'Número de identificación';
COMMENT ON COLUMN mae_direcciones.tipo_busqueda IS 'Catálogo: cliente, proveedor, empleado, banco, compañía, contacto';
COMMENT ON COLUMN mae_direcciones.correo IS 'Correo principal';
COMMENT ON COLUMN mae_direcciones.telefono IS 'Teléfono principal';
COMMENT ON COLUMN mae_direcciones.direccion_padre_id IS 'Matriz o empresa a la que pertenece';
COMMENT ON COLUMN mae_direcciones.campos IS 'Campos personalizados';
COMMENT ON COLUMN mae_direcciones.activo IS 'Registro activo';
CREATE TRIGGER tg_mae_direcciones_mod BEFORE UPDATE ON mae_direcciones FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE mae_direcciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_mae_direcciones_suscriptor ON mae_direcciones USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- mae_companias: Compañía legal con RUC, moneda base y año fiscal
CREATE TABLE mae_companias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  codigo varchar(20) NOT NULL,
  direccion_id uuid NOT NULL REFERENCES mae_direcciones(id),
  moneda_id uuid NOT NULL REFERENCES mae_monedas(id),
  mes_inicio_fiscal smallint NOT NULL DEFAULT 1,
  obligado_contabilidad boolean NOT NULL DEFAULT false,
  contribuyente_especial varchar(20),
  activo boolean NOT NULL DEFAULT true,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_mae_companias_1 UNIQUE NULLS NOT DISTINCT (suscriptor_id, codigo)
);
CREATE INDEX ix_mae_companias_direccion_id ON mae_companias (direccion_id);
CREATE INDEX ix_mae_companias_moneda_id ON mae_companias (moneda_id);
COMMENT ON TABLE mae_companias IS 'Compañía legal con RUC, moneda base y año fiscal';
COMMENT ON COLUMN mae_companias.codigo IS 'Código de compañía';
COMMENT ON COLUMN mae_companias.direccion_id IS 'Datos de la compañía en el libro de direcciones';
COMMENT ON COLUMN mae_companias.moneda_id IS 'Moneda base';
COMMENT ON COLUMN mae_companias.mes_inicio_fiscal IS 'Mes en que inicia el año fiscal';
COMMENT ON COLUMN mae_companias.obligado_contabilidad IS 'Obligado a llevar contabilidad ante el SRI';
COMMENT ON COLUMN mae_companias.contribuyente_especial IS 'Número de resolución, si aplica';
COMMENT ON COLUMN mae_companias.activo IS 'Registro activo';
CREATE TRIGGER tg_mae_companias_mod BEFORE UPDATE ON mae_companias FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE mae_companias ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_mae_companias_suscriptor ON mae_companias USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- sis_usuarios: Persona que inicia sesión, ligada a su cuenta de Firebase
CREATE TABLE sis_usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  firebase_uid varchar(128) NOT NULL,
  correo varchar(200) NOT NULL,
  nombre varchar(200) NOT NULL,
  direccion_id uuid REFERENCES mae_direcciones(id),
  compania_defecto_id uuid REFERENCES mae_companias(id),
  idioma char(2) DEFAULT 'es',
  activo boolean NOT NULL DEFAULT true,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_sis_usuarios_1 UNIQUE NULLS NOT DISTINCT (suscriptor_id, correo),
  CONSTRAINT uq_sis_usuarios_2 UNIQUE NULLS NOT DISTINCT (firebase_uid)
);
CREATE INDEX ix_sis_usuarios_direccion_id ON sis_usuarios (direccion_id);
CREATE INDEX ix_sis_usuarios_compania_defecto_id ON sis_usuarios (compania_defecto_id);
COMMENT ON TABLE sis_usuarios IS 'Persona que inicia sesión, ligada a su cuenta de Firebase';
COMMENT ON COLUMN sis_usuarios.firebase_uid IS 'Identificador en Firebase Authentication';
COMMENT ON COLUMN sis_usuarios.correo IS 'Correo de inicio de sesión';
COMMENT ON COLUMN sis_usuarios.nombre IS 'Nombre para mostrar';
COMMENT ON COLUMN sis_usuarios.direccion_id IS 'Dirección del empleado, si existe';
COMMENT ON COLUMN sis_usuarios.compania_defecto_id IS 'Compañía que abre por defecto';
COMMENT ON COLUMN sis_usuarios.idioma IS 'Idioma de la interfaz';
COMMENT ON COLUMN sis_usuarios.activo IS 'Registro activo';
CREATE TRIGGER tg_sis_usuarios_mod BEFORE UPDATE ON sis_usuarios FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE sis_usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_sis_usuarios_suscriptor ON sis_usuarios USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- sis_roles: Perfil de acceso
CREATE TABLE sis_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  codigo varchar(20) NOT NULL,
  descripcion varchar(200) NOT NULL,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_sis_roles_1 UNIQUE NULLS NOT DISTINCT (suscriptor_id, codigo)
);
COMMENT ON TABLE sis_roles IS 'Perfil de acceso';
COMMENT ON COLUMN sis_roles.codigo IS 'Código del rol';
COMMENT ON COLUMN sis_roles.descripcion IS 'Descripción';
CREATE TRIGGER tg_sis_roles_mod BEFORE UPDATE ON sis_roles FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE sis_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_sis_roles_suscriptor ON sis_roles USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- sis_roles_permisos: Acción permitida a un rol sobre un recurso
CREATE TABLE sis_roles_permisos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  rol_id uuid NOT NULL REFERENCES sis_roles(id),
  recurso varchar(100) NOT NULL,
  accion varchar(20) NOT NULL,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_sis_roles_permisos_1 UNIQUE NULLS NOT DISTINCT (rol_id, recurso, accion)
);
CREATE INDEX ix_sis_roles_permisos_rol_id ON sis_roles_permisos (rol_id);
COMMENT ON TABLE sis_roles_permisos IS 'Acción permitida a un rol sobre un recurso';
COMMENT ON COLUMN sis_roles_permisos.rol_id IS 'Rol';
COMMENT ON COLUMN sis_roles_permisos.recurso IS 'Recurso: pantalla, API o reporte';
COMMENT ON COLUMN sis_roles_permisos.accion IS 'VER, CREAR, MODIFICAR, ANULAR, APROBAR, CONTABILIZAR';
CREATE TRIGGER tg_sis_roles_permisos_mod BEFORE UPDATE ON sis_roles_permisos FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE sis_roles_permisos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_sis_roles_permisos_suscriptor ON sis_roles_permisos USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- sis_usuarios_roles: Roles de un usuario y la compañía donde los ejerce
CREATE TABLE sis_usuarios_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  usuario_id uuid NOT NULL REFERENCES sis_usuarios(id),
  rol_id uuid NOT NULL REFERENCES sis_roles(id),
  compania_id uuid REFERENCES mae_companias(id),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_sis_usuarios_roles_1 UNIQUE NULLS NOT DISTINCT (usuario_id, rol_id, compania_id)
);
CREATE INDEX ix_sis_usuarios_roles_usuario_id ON sis_usuarios_roles (usuario_id);
CREATE INDEX ix_sis_usuarios_roles_rol_id ON sis_usuarios_roles (rol_id);
CREATE INDEX ix_sis_usuarios_roles_compania_id ON sis_usuarios_roles (compania_id);
COMMENT ON TABLE sis_usuarios_roles IS 'Roles de un usuario y la compañía donde los ejerce';
COMMENT ON COLUMN sis_usuarios_roles.usuario_id IS 'Usuario';
COMMENT ON COLUMN sis_usuarios_roles.rol_id IS 'Rol';
COMMENT ON COLUMN sis_usuarios_roles.compania_id IS 'Compañía; nulo significa todas';
CREATE TRIGGER tg_sis_usuarios_roles_mod BEFORE UPDATE ON sis_usuarios_roles FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE sis_usuarios_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_sis_usuarios_roles_suscriptor ON sis_usuarios_roles USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- sis_tipos_documento: Tipo de documento con su módulo y comportamiento
CREATE TABLE sis_tipos_documento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  modulo varchar(20) NOT NULL,
  codigo varchar(20) NOT NULL,
  descripcion varchar(200) NOT NULL,
  clase varchar(20) NOT NULL,
  afecta_inventario boolean NOT NULL DEFAULT false,
  genera_contabilidad boolean NOT NULL DEFAULT false,
  estado_inicial smallint,
  activo boolean NOT NULL DEFAULT true,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_sis_tipos_documento_1 UNIQUE NULLS NOT DISTINCT (suscriptor_id, modulo, codigo)
);
COMMENT ON TABLE sis_tipos_documento IS 'Tipo de documento con su módulo y comportamiento';
COMMENT ON COLUMN sis_tipos_documento.modulo IS 'VEN, COM, INV, SRV, CXC, CXP, CON';
COMMENT ON COLUMN sis_tipos_documento.codigo IS 'Código del tipo, por ejemplo OV, CT, OC, RQ, AJ, FA';
COMMENT ON COLUMN sis_tipos_documento.descripcion IS 'Descripción';
COMMENT ON COLUMN sis_tipos_documento.clase IS 'Comportamiento base: COTIZACION, ORDEN, REQUISICION, DEVOLUCION, AJUSTE, TRANSFERENCIA, FACTURA, NOTA_CREDITO';
COMMENT ON COLUMN sis_tipos_documento.afecta_inventario IS 'Si sus líneas mueven kardex';
COMMENT ON COLUMN sis_tipos_documento.genera_contabilidad IS 'Si genera asientos';
COMMENT ON COLUMN sis_tipos_documento.estado_inicial IS 'Estado con que nace cada línea';
COMMENT ON COLUMN sis_tipos_documento.activo IS 'Registro activo';
CREATE TRIGGER tg_sis_tipos_documento_mod BEFORE UPDATE ON sis_tipos_documento FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE sis_tipos_documento ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_sis_tipos_documento_suscriptor ON sis_tipos_documento USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- sis_flujos_estado: Estados de línea por tipo de documento y transiciones permitidas
CREATE TABLE sis_flujos_estado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  tipo_documento_id uuid NOT NULL REFERENCES sis_tipos_documento(id),
  estado smallint NOT NULL,
  descripcion varchar(200) NOT NULL,
  estado_siguiente smallint,
  estados_alternos smallint[],
  accion varchar(100),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_sis_flujos_estado_1 UNIQUE NULLS NOT DISTINCT (tipo_documento_id, estado)
);
CREATE INDEX ix_sis_flujos_estado_tipo_documento_id ON sis_flujos_estado (tipo_documento_id);
COMMENT ON TABLE sis_flujos_estado IS 'Estados de línea por tipo de documento y transiciones permitidas';
COMMENT ON COLUMN sis_flujos_estado.tipo_documento_id IS 'Tipo de documento';
COMMENT ON COLUMN sis_flujos_estado.estado IS 'Estado actual';
COMMENT ON COLUMN sis_flujos_estado.descripcion IS 'Qué significa';
COMMENT ON COLUMN sis_flujos_estado.estado_siguiente IS 'Estado al que pasa normalmente';
COMMENT ON COLUMN sis_flujos_estado.estados_alternos IS 'Otros estados a los que puede saltar';
COMMENT ON COLUMN sis_flujos_estado.accion IS 'Proceso que la ejecuta, por ejemplo aprobar o facturar';
CREATE TRIGGER tg_sis_flujos_estado_mod BEFORE UPDATE ON sis_flujos_estado FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE sis_flujos_estado ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_sis_flujos_estado_suscriptor ON sis_flujos_estado USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- sis_numeradores: Siguiente número por compañía, tipo de documento y año
CREATE TABLE sis_numeradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  tipo_documento_id uuid NOT NULL REFERENCES sis_tipos_documento(id),
  anio smallint NOT NULL DEFAULT 0,
  siguiente bigint NOT NULL DEFAULT 1,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_sis_numeradores_1 UNIQUE NULLS NOT DISTINCT (compania_id, tipo_documento_id, anio)
);
CREATE INDEX ix_sis_numeradores_compania_id ON sis_numeradores (compania_id);
CREATE INDEX ix_sis_numeradores_tipo_documento_id ON sis_numeradores (tipo_documento_id);
COMMENT ON TABLE sis_numeradores IS 'Siguiente número por compañía, tipo de documento y año';
COMMENT ON COLUMN sis_numeradores.compania_id IS 'Compañía';
COMMENT ON COLUMN sis_numeradores.tipo_documento_id IS 'Tipo de documento';
COMMENT ON COLUMN sis_numeradores.anio IS 'Año, o 0 si la numeración no reinicia';
COMMENT ON COLUMN sis_numeradores.siguiente IS 'Siguiente número a asignar';
CREATE TRIGGER tg_sis_numeradores_mod BEFORE UPDATE ON sis_numeradores FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE sis_numeradores ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_sis_numeradores_suscriptor ON sis_numeradores USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- sis_auditoria: Historial de cambios de cualquier tabla
CREATE TABLE sis_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  tabla varchar(63) NOT NULL,
  registro_id uuid NOT NULL,
  operacion char(1) NOT NULL,
  valores_anteriores jsonb,
  valores_nuevos jsonb,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100)
);
CREATE INDEX ix_sis_auditoria_1 ON sis_auditoria (suscriptor_id, tabla, registro_id);
COMMENT ON TABLE sis_auditoria IS 'Historial de cambios de cualquier tabla';
COMMENT ON COLUMN sis_auditoria.tabla IS 'Tabla modificada';
COMMENT ON COLUMN sis_auditoria.registro_id IS 'Registro modificado';
COMMENT ON COLUMN sis_auditoria.operacion IS 'I, U o D';
COMMENT ON COLUMN sis_auditoria.valores_anteriores IS 'Valores antes del cambio';
COMMENT ON COLUMN sis_auditoria.valores_nuevos IS 'Valores después del cambio';
CREATE TRIGGER tg_sis_auditoria_mod BEFORE UPDATE ON sis_auditoria FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE sis_auditoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_sis_auditoria_suscriptor ON sis_auditoria USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- mae_unidades_negocio: Sucursal, bodega, planta o centro de costo
CREATE TABLE mae_unidades_negocio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  codigo varchar(20) NOT NULL,
  descripcion varchar(200) NOT NULL,
  tipo varchar(20) NOT NULL,
  unidad_padre_id uuid REFERENCES mae_unidades_negocio(id),
  activo boolean NOT NULL DEFAULT true,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_mae_unidades_negocio_1 UNIQUE NULLS NOT DISTINCT (suscriptor_id, codigo)
);
CREATE INDEX ix_mae_unidades_negocio_compania_id ON mae_unidades_negocio (compania_id);
CREATE INDEX ix_mae_unidades_negocio_unidad_padre_id ON mae_unidades_negocio (unidad_padre_id);
COMMENT ON TABLE mae_unidades_negocio IS 'Sucursal, bodega, planta o centro de costo';
COMMENT ON COLUMN mae_unidades_negocio.compania_id IS 'Compañía';
COMMENT ON COLUMN mae_unidades_negocio.codigo IS 'Código de la unidad';
COMMENT ON COLUMN mae_unidades_negocio.descripcion IS 'Descripción';
COMMENT ON COLUMN mae_unidades_negocio.tipo IS 'Catálogo: BODEGA, SUCURSAL, PLANTA, CENTRO_COSTO, PROYECTO';
COMMENT ON COLUMN mae_unidades_negocio.unidad_padre_id IS 'Unidad superior para consolidar';
COMMENT ON COLUMN mae_unidades_negocio.activo IS 'Registro activo';
CREATE TRIGGER tg_mae_unidades_negocio_mod BEFORE UPDATE ON mae_unidades_negocio FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE mae_unidades_negocio ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_mae_unidades_negocio_suscriptor ON mae_unidades_negocio USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- con_clases_contables: Agrupación contable de artículos, terceros, impuestos y bancos
CREATE TABLE con_clases_contables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  codigo varchar(20) NOT NULL,
  descripcion varchar(200) NOT NULL,
  aplica_a varchar(20) NOT NULL,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_con_clases_contables_1 UNIQUE NULLS NOT DISTINCT (suscriptor_id, codigo)
);
COMMENT ON TABLE con_clases_contables IS 'Agrupación contable de artículos, terceros, impuestos y bancos';
COMMENT ON COLUMN con_clases_contables.codigo IS 'Código de la clase';
COMMENT ON COLUMN con_clases_contables.descripcion IS 'Descripción';
COMMENT ON COLUMN con_clases_contables.aplica_a IS 'ARTICULO, CLIENTE, PROVEEDOR, IMPUESTO, BANCO, GENERAL';
CREATE TRIGGER tg_con_clases_contables_mod BEFORE UPDATE ON con_clases_contables FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE con_clases_contables ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_con_clases_contables_suscriptor ON con_clases_contables USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- con_cuentas: Plan de cuentas jerárquico por compañía
CREATE TABLE con_cuentas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  codigo varchar(30) NOT NULL,
  descripcion varchar(200) NOT NULL,
  nivel smallint NOT NULL,
  cuenta_padre_id uuid REFERENCES con_cuentas(id),
  naturaleza char(1) NOT NULL,
  tipo varchar(20) NOT NULL,
  grupo varchar(20),
  acepta_movimiento boolean NOT NULL DEFAULT false,
  exige_centro_costo boolean NOT NULL DEFAULT false,
  exige_tercero boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_con_cuentas_1 UNIQUE NULLS NOT DISTINCT (compania_id, codigo)
);
CREATE INDEX ix_con_cuentas_compania_id ON con_cuentas (compania_id);
CREATE INDEX ix_con_cuentas_cuenta_padre_id ON con_cuentas (cuenta_padre_id);
COMMENT ON TABLE con_cuentas IS 'Plan de cuentas jerárquico por compañía';
COMMENT ON COLUMN con_cuentas.compania_id IS 'Compañía';
COMMENT ON COLUMN con_cuentas.codigo IS 'Código de la cuenta';
COMMENT ON COLUMN con_cuentas.descripcion IS 'Nombre de la cuenta';
COMMENT ON COLUMN con_cuentas.nivel IS 'Nivel en la jerarquía';
COMMENT ON COLUMN con_cuentas.cuenta_padre_id IS 'Cuenta superior';
COMMENT ON COLUMN con_cuentas.naturaleza IS 'D deudora o A acreedora';
COMMENT ON COLUMN con_cuentas.tipo IS 'BALANCE o RESULTADOS';
COMMENT ON COLUMN con_cuentas.grupo IS 'Activo, pasivo, patrimonio, ingreso, costo, gasto';
COMMENT ON COLUMN con_cuentas.acepta_movimiento IS 'Solo las cuentas de último nivel aceptan asientos';
COMMENT ON COLUMN con_cuentas.exige_centro_costo IS 'Si cada línea debe llevar unidad de negocio';
COMMENT ON COLUMN con_cuentas.exige_tercero IS 'Si cada línea debe llevar dirección';
COMMENT ON COLUMN con_cuentas.activo IS 'Registro activo';
CREATE TRIGGER tg_con_cuentas_mod BEFORE UPDATE ON con_cuentas FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE con_cuentas ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_con_cuentas_suscriptor ON con_cuentas USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- con_tipos_transaccion: Evento de negocio que genera asiento
CREATE TABLE con_tipos_transaccion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  codigo varchar(20) NOT NULL,
  descripcion varchar(200) NOT NULL,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_con_tipos_transaccion_1 UNIQUE NULLS NOT DISTINCT (suscriptor_id, codigo)
);
COMMENT ON TABLE con_tipos_transaccion IS 'Evento de negocio que genera asiento';
COMMENT ON COLUMN con_tipos_transaccion.codigo IS 'VENTA, COSTO_VENTA, RECEPCION, PROVISION_CXP, AJUSTE_INV, COBRO, PAGO, RET_EMITIDA, RET_RECIBIDA, IVA_VENTAS, IVA_COMPRAS';
COMMENT ON COLUMN con_tipos_transaccion.descripcion IS 'Descripción';
CREATE TRIGGER tg_con_tipos_transaccion_mod BEFORE UPDATE ON con_tipos_transaccion FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE con_tipos_transaccion ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_con_tipos_transaccion_suscriptor ON con_tipos_transaccion USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- con_reglas_contables: Cuenta a usar según compañía, transacción, clase y unidad; nulos funcionan como comodín
CREATE TABLE con_reglas_contables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  tipo_transaccion_id uuid NOT NULL REFERENCES con_tipos_transaccion(id),
  clase_contable_id uuid REFERENCES con_clases_contables(id),
  unidad_negocio_id uuid REFERENCES mae_unidades_negocio(id),
  cuenta_id uuid NOT NULL REFERENCES con_cuentas(id),
  centro_costo_id uuid REFERENCES mae_unidades_negocio(id),
  prioridad smallint NOT NULL DEFAULT 0,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_con_reglas_contables_1 UNIQUE NULLS NOT DISTINCT (compania_id, tipo_transaccion_id, clase_contable_id, unidad_negocio_id)
);
CREATE INDEX ix_con_reglas_contables_compania_id ON con_reglas_contables (compania_id);
CREATE INDEX ix_con_reglas_contables_tipo_transaccion_id ON con_reglas_contables (tipo_transaccion_id);
CREATE INDEX ix_con_reglas_contables_clase_contable_id ON con_reglas_contables (clase_contable_id);
CREATE INDEX ix_con_reglas_contables_unidad_negocio_id ON con_reglas_contables (unidad_negocio_id);
CREATE INDEX ix_con_reglas_contables_cuenta_id ON con_reglas_contables (cuenta_id);
CREATE INDEX ix_con_reglas_contables_centro_costo_id ON con_reglas_contables (centro_costo_id);
COMMENT ON TABLE con_reglas_contables IS 'Cuenta a usar según compañía, transacción, clase y unidad; nulos funcionan como comodín';
COMMENT ON COLUMN con_reglas_contables.compania_id IS 'Compañía';
COMMENT ON COLUMN con_reglas_contables.tipo_transaccion_id IS 'Tipo de transacción';
COMMENT ON COLUMN con_reglas_contables.clase_contable_id IS 'Clase contable; nulo aplica a todas';
COMMENT ON COLUMN con_reglas_contables.unidad_negocio_id IS 'Unidad de negocio; nula aplica a todas';
COMMENT ON COLUMN con_reglas_contables.cuenta_id IS 'Cuenta resultante';
COMMENT ON COLUMN con_reglas_contables.centro_costo_id IS 'Centro de costo fijo; nulo toma el del documento';
COMMENT ON COLUMN con_reglas_contables.prioridad IS 'Desempate entre reglas igual de específicas';
CREATE TRIGGER tg_con_reglas_contables_mod BEFORE UPDATE ON con_reglas_contables FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE con_reglas_contables ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_con_reglas_contables_suscriptor ON con_reglas_contables USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- con_periodos: Período contable con estado por módulo
CREATE TABLE con_periodos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  anio smallint NOT NULL,
  periodo smallint NOT NULL,
  fecha_desde date NOT NULL,
  fecha_hasta date NOT NULL,
  estado_ventas varchar(20) NOT NULL DEFAULT 'ABIERTO',
  estado_compras varchar(20) NOT NULL DEFAULT 'ABIERTO',
  estado_inventario varchar(20) NOT NULL DEFAULT 'ABIERTO',
  estado_contabilidad varchar(20) NOT NULL DEFAULT 'ABIERTO',
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_con_periodos_1 UNIQUE NULLS NOT DISTINCT (compania_id, anio, periodo)
);
CREATE INDEX ix_con_periodos_compania_id ON con_periodos (compania_id);
COMMENT ON TABLE con_periodos IS 'Período contable con estado por módulo';
COMMENT ON COLUMN con_periodos.compania_id IS 'Compañía';
COMMENT ON COLUMN con_periodos.anio IS 'Año fiscal';
COMMENT ON COLUMN con_periodos.periodo IS 'Número de período, 1 a 12 más ajustes';
COMMENT ON COLUMN con_periodos.fecha_desde IS 'Inicio';
COMMENT ON COLUMN con_periodos.fecha_hasta IS 'Fin';
COMMENT ON COLUMN con_periodos.estado_ventas IS 'ABIERTO o CERRADO';
COMMENT ON COLUMN con_periodos.estado_compras IS 'ABIERTO o CERRADO';
COMMENT ON COLUMN con_periodos.estado_inventario IS 'ABIERTO o CERRADO';
COMMENT ON COLUMN con_periodos.estado_contabilidad IS 'ABIERTO o CERRADO';
CREATE TRIGGER tg_con_periodos_mod BEFORE UPDATE ON con_periodos FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE con_periodos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_con_periodos_suscriptor ON con_periodos USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- mae_tipos_cambio: Cotización de una moneda por fecha
CREATE TABLE mae_tipos_cambio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  moneda_id uuid NOT NULL REFERENCES mae_monedas(id),
  fecha date NOT NULL,
  tasa numeric(18,6) NOT NULL,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_mae_tipos_cambio_1 UNIQUE NULLS NOT DISTINCT (moneda_id, fecha)
);
CREATE INDEX ix_mae_tipos_cambio_moneda_id ON mae_tipos_cambio (moneda_id);
COMMENT ON TABLE mae_tipos_cambio IS 'Cotización de una moneda por fecha';
COMMENT ON COLUMN mae_tipos_cambio.moneda_id IS 'Moneda';
COMMENT ON COLUMN mae_tipos_cambio.fecha IS 'Fecha de la cotización';
COMMENT ON COLUMN mae_tipos_cambio.tasa IS 'Unidades de moneda base por unidad de esta moneda';
CREATE TRIGGER tg_mae_tipos_cambio_mod BEFORE UPDATE ON mae_tipos_cambio FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE mae_tipos_cambio ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_mae_tipos_cambio_suscriptor ON mae_tipos_cambio USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- mae_direcciones_ubicaciones: Direcciones físicas de un tercero
CREATE TABLE mae_direcciones_ubicaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  direccion_id uuid NOT NULL REFERENCES mae_direcciones(id),
  secuencia smallint NOT NULL,
  tipo varchar(20) NOT NULL,
  linea1 varchar(200) NOT NULL,
  linea2 varchar(200),
  ciudad varchar(100),
  provincia varchar(100),
  pais char(2) NOT NULL DEFAULT 'EC',
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_mae_direcciones_ubicaciones_1 UNIQUE NULLS NOT DISTINCT (direccion_id, secuencia)
);
CREATE INDEX ix_mae_direcciones_ubicaciones_direccion_id ON mae_direcciones_ubicaciones (direccion_id);
COMMENT ON TABLE mae_direcciones_ubicaciones IS 'Direcciones físicas de un tercero';
COMMENT ON COLUMN mae_direcciones_ubicaciones.direccion_id IS 'Tercero';
COMMENT ON COLUMN mae_direcciones_ubicaciones.secuencia IS 'Secuencia';
COMMENT ON COLUMN mae_direcciones_ubicaciones.tipo IS 'MATRIZ, ENTREGA, FACTURACION';
COMMENT ON COLUMN mae_direcciones_ubicaciones.linea1 IS 'Calle principal y número';
COMMENT ON COLUMN mae_direcciones_ubicaciones.linea2 IS 'Referencia';
COMMENT ON COLUMN mae_direcciones_ubicaciones.ciudad IS 'Ciudad';
COMMENT ON COLUMN mae_direcciones_ubicaciones.provincia IS 'Provincia';
COMMENT ON COLUMN mae_direcciones_ubicaciones.pais IS 'País ISO 3166';
CREATE TRIGGER tg_mae_direcciones_ubicaciones_mod BEFORE UPDATE ON mae_direcciones_ubicaciones FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE mae_direcciones_ubicaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_mae_direcciones_ubicaciones_suscriptor ON mae_direcciones_ubicaciones USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- mae_contactos: Persona de contacto de un tercero
CREATE TABLE mae_contactos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  direccion_id uuid NOT NULL REFERENCES mae_direcciones(id),
  secuencia smallint NOT NULL,
  nombre varchar(200) NOT NULL,
  cargo varchar(100),
  telefono varchar(30),
  correo varchar(200),
  recibe_comprobantes boolean NOT NULL DEFAULT false,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_mae_contactos_1 UNIQUE NULLS NOT DISTINCT (direccion_id, secuencia)
);
CREATE INDEX ix_mae_contactos_direccion_id ON mae_contactos (direccion_id);
COMMENT ON TABLE mae_contactos IS 'Persona de contacto de un tercero';
COMMENT ON COLUMN mae_contactos.direccion_id IS 'Tercero';
COMMENT ON COLUMN mae_contactos.secuencia IS 'Secuencia';
COMMENT ON COLUMN mae_contactos.nombre IS 'Nombre';
COMMENT ON COLUMN mae_contactos.cargo IS 'Cargo';
COMMENT ON COLUMN mae_contactos.telefono IS 'Teléfono';
COMMENT ON COLUMN mae_contactos.correo IS 'Correo';
COMMENT ON COLUMN mae_contactos.recibe_comprobantes IS 'Si recibe los comprobantes electrónicos';
CREATE TRIGGER tg_mae_contactos_mod BEFORE UPDATE ON mae_contactos FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE mae_contactos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_mae_contactos_suscriptor ON mae_contactos USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- mae_condiciones_pago: Plazos y cuotas de pago
CREATE TABLE mae_condiciones_pago (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  codigo varchar(20) NOT NULL,
  descripcion varchar(200) NOT NULL,
  cuotas smallint NOT NULL DEFAULT 1,
  dias_primera smallint NOT NULL DEFAULT 0,
  dias_entre_cuotas smallint NOT NULL DEFAULT 30,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_mae_condiciones_pago_1 UNIQUE NULLS NOT DISTINCT (suscriptor_id, codigo)
);
COMMENT ON TABLE mae_condiciones_pago IS 'Plazos y cuotas de pago';
COMMENT ON COLUMN mae_condiciones_pago.codigo IS 'Código';
COMMENT ON COLUMN mae_condiciones_pago.descripcion IS 'Descripción';
COMMENT ON COLUMN mae_condiciones_pago.cuotas IS 'Número de cuotas';
COMMENT ON COLUMN mae_condiciones_pago.dias_primera IS 'Días hasta la primera cuota';
COMMENT ON COLUMN mae_condiciones_pago.dias_entre_cuotas IS 'Días entre cuotas';
CREATE TRIGGER tg_mae_condiciones_pago_mod BEFORE UPDATE ON mae_condiciones_pago FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE mae_condiciones_pago ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_mae_condiciones_pago_suscriptor ON mae_condiciones_pago USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- mae_listas_precios: Lista de precios
CREATE TABLE mae_listas_precios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  codigo varchar(20) NOT NULL,
  descripcion varchar(200) NOT NULL,
  moneda_id uuid NOT NULL REFERENCES mae_monedas(id),
  incluye_impuestos boolean NOT NULL DEFAULT false,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_mae_listas_precios_1 UNIQUE NULLS NOT DISTINCT (suscriptor_id, codigo)
);
CREATE INDEX ix_mae_listas_precios_moneda_id ON mae_listas_precios (moneda_id);
COMMENT ON TABLE mae_listas_precios IS 'Lista de precios';
COMMENT ON COLUMN mae_listas_precios.codigo IS 'Código';
COMMENT ON COLUMN mae_listas_precios.descripcion IS 'Descripción';
COMMENT ON COLUMN mae_listas_precios.moneda_id IS 'Moneda';
COMMENT ON COLUMN mae_listas_precios.incluye_impuestos IS 'Si los precios incluyen IVA';
CREATE TRIGGER tg_mae_listas_precios_mod BEFORE UPDATE ON mae_listas_precios FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE mae_listas_precios ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_mae_listas_precios_suscriptor ON mae_listas_precios USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- mae_impuestos: Tarifa de impuesto con vigencia
CREATE TABLE mae_impuestos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  codigo varchar(20) NOT NULL,
  tipo varchar(20) NOT NULL,
  codigo_sri varchar(10),
  porcentaje numeric(7,4) NOT NULL,
  vigente_desde date NOT NULL,
  vigente_hasta date,
  clase_contable_id uuid REFERENCES con_clases_contables(id),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_mae_impuestos_1 UNIQUE NULLS NOT DISTINCT (suscriptor_id, codigo, vigente_desde)
);
CREATE INDEX ix_mae_impuestos_clase_contable_id ON mae_impuestos (clase_contable_id);
COMMENT ON TABLE mae_impuestos IS 'Tarifa de impuesto con vigencia';
COMMENT ON COLUMN mae_impuestos.codigo IS 'Código interno';
COMMENT ON COLUMN mae_impuestos.tipo IS 'IVA, ICE u otro';
COMMENT ON COLUMN mae_impuestos.codigo_sri IS 'Código de tarifa en el SRI';
COMMENT ON COLUMN mae_impuestos.porcentaje IS 'Porcentaje';
COMMENT ON COLUMN mae_impuestos.vigente_desde IS 'Inicio de vigencia';
COMMENT ON COLUMN mae_impuestos.vigente_hasta IS 'Fin de vigencia';
COMMENT ON COLUMN mae_impuestos.clase_contable_id IS 'Clase para resolver la cuenta';
CREATE TRIGGER tg_mae_impuestos_mod BEFORE UPDATE ON mae_impuestos FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE mae_impuestos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_mae_impuestos_suscriptor ON mae_impuestos USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- mae_clientes: Datos de cliente de una dirección en una compañía
CREATE TABLE mae_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  direccion_id uuid NOT NULL REFERENCES mae_direcciones(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  condicion_pago_id uuid REFERENCES mae_condiciones_pago(id),
  lista_precios_id uuid REFERENCES mae_listas_precios(id),
  clase_contable_id uuid NOT NULL REFERENCES con_clases_contables(id),
  limite_credito numeric(18,2) NOT NULL DEFAULT 0,
  vendedor_id uuid REFERENCES mae_direcciones(id),
  bloqueado boolean NOT NULL DEFAULT false,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_mae_clientes_1 UNIQUE NULLS NOT DISTINCT (direccion_id, compania_id)
);
CREATE INDEX ix_mae_clientes_direccion_id ON mae_clientes (direccion_id);
CREATE INDEX ix_mae_clientes_compania_id ON mae_clientes (compania_id);
CREATE INDEX ix_mae_clientes_condicion_pago_id ON mae_clientes (condicion_pago_id);
CREATE INDEX ix_mae_clientes_lista_precios_id ON mae_clientes (lista_precios_id);
CREATE INDEX ix_mae_clientes_clase_contable_id ON mae_clientes (clase_contable_id);
CREATE INDEX ix_mae_clientes_vendedor_id ON mae_clientes (vendedor_id);
COMMENT ON TABLE mae_clientes IS 'Datos de cliente de una dirección en una compañía';
COMMENT ON COLUMN mae_clientes.direccion_id IS 'Tercero';
COMMENT ON COLUMN mae_clientes.compania_id IS 'Compañía';
COMMENT ON COLUMN mae_clientes.condicion_pago_id IS 'Condición de pago';
COMMENT ON COLUMN mae_clientes.lista_precios_id IS 'Lista de precios';
COMMENT ON COLUMN mae_clientes.clase_contable_id IS 'Clase contable de cuentas por cobrar';
COMMENT ON COLUMN mae_clientes.limite_credito IS 'Límite de crédito';
COMMENT ON COLUMN mae_clientes.vendedor_id IS 'Vendedor asignado';
COMMENT ON COLUMN mae_clientes.bloqueado IS 'Bloqueo de crédito';
CREATE TRIGGER tg_mae_clientes_mod BEFORE UPDATE ON mae_clientes FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE mae_clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_mae_clientes_suscriptor ON mae_clientes USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- mae_proveedores: Datos de proveedor de una dirección en una compañía
CREATE TABLE mae_proveedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  direccion_id uuid NOT NULL REFERENCES mae_direcciones(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  condicion_pago_id uuid REFERENCES mae_condiciones_pago(id),
  clase_contable_id uuid NOT NULL REFERENCES con_clases_contables(id),
  codigo_ret_renta varchar(10),
  codigo_ret_iva varchar(10),
  moneda_id uuid REFERENCES mae_monedas(id),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_mae_proveedores_1 UNIQUE NULLS NOT DISTINCT (direccion_id, compania_id)
);
CREATE INDEX ix_mae_proveedores_direccion_id ON mae_proveedores (direccion_id);
CREATE INDEX ix_mae_proveedores_compania_id ON mae_proveedores (compania_id);
CREATE INDEX ix_mae_proveedores_condicion_pago_id ON mae_proveedores (condicion_pago_id);
CREATE INDEX ix_mae_proveedores_clase_contable_id ON mae_proveedores (clase_contable_id);
CREATE INDEX ix_mae_proveedores_moneda_id ON mae_proveedores (moneda_id);
COMMENT ON TABLE mae_proveedores IS 'Datos de proveedor de una dirección en una compañía';
COMMENT ON COLUMN mae_proveedores.direccion_id IS 'Tercero';
COMMENT ON COLUMN mae_proveedores.compania_id IS 'Compañía';
COMMENT ON COLUMN mae_proveedores.condicion_pago_id IS 'Condición de pago';
COMMENT ON COLUMN mae_proveedores.clase_contable_id IS 'Clase contable de cuentas por pagar';
COMMENT ON COLUMN mae_proveedores.codigo_ret_renta IS 'Código de retención de renta por defecto';
COMMENT ON COLUMN mae_proveedores.codigo_ret_iva IS 'Código de retención de IVA por defecto';
COMMENT ON COLUMN mae_proveedores.moneda_id IS 'Moneda habitual';
CREATE TRIGGER tg_mae_proveedores_mod BEFORE UPDATE ON mae_proveedores FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE mae_proveedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_mae_proveedores_suscriptor ON mae_proveedores USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- mae_articulos: Artículo o servicio
CREATE TABLE mae_articulos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  codigo varchar(30) NOT NULL,
  descripcion varchar(200) NOT NULL,
  tipo_existencia varchar(20) NOT NULL,
  unidad_primaria varchar(20) NOT NULL,
  impuesto_id uuid REFERENCES mae_impuestos(id),
  clase_contable_id uuid NOT NULL REFERENCES con_clases_contables(id),
  controla_lote boolean NOT NULL DEFAULT false,
  categoria varchar(20),
  campos jsonb,
  activo boolean NOT NULL DEFAULT true,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_mae_articulos_1 UNIQUE NULLS NOT DISTINCT (suscriptor_id, codigo)
);
CREATE INDEX ix_mae_articulos_impuesto_id ON mae_articulos (impuesto_id);
CREATE INDEX ix_mae_articulos_clase_contable_id ON mae_articulos (clase_contable_id);
COMMENT ON TABLE mae_articulos IS 'Artículo o servicio';
COMMENT ON COLUMN mae_articulos.codigo IS 'Código del artículo';
COMMENT ON COLUMN mae_articulos.descripcion IS 'Descripción';
COMMENT ON COLUMN mae_articulos.tipo_existencia IS 'INVENTARIABLE, NO_INVENTARIABLE, SERVICIO';
COMMENT ON COLUMN mae_articulos.unidad_primaria IS 'Catálogo de unidades de medida';
COMMENT ON COLUMN mae_articulos.impuesto_id IS 'Impuesto por defecto';
COMMENT ON COLUMN mae_articulos.clase_contable_id IS 'Clase contable';
COMMENT ON COLUMN mae_articulos.controla_lote IS 'Si exige lote o serie';
COMMENT ON COLUMN mae_articulos.categoria IS 'Catálogo de categorías';
COMMENT ON COLUMN mae_articulos.campos IS 'Campos personalizados';
COMMENT ON COLUMN mae_articulos.activo IS 'Registro activo';
CREATE TRIGGER tg_mae_articulos_mod BEFORE UPDATE ON mae_articulos FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE mae_articulos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_mae_articulos_suscriptor ON mae_articulos USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- mae_articulos_sucursal: Artículo en una unidad de negocio
CREATE TABLE mae_articulos_sucursal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  articulo_id uuid NOT NULL REFERENCES mae_articulos(id),
  unidad_negocio_id uuid NOT NULL REFERENCES mae_unidades_negocio(id),
  metodo_costo varchar(20) NOT NULL DEFAULT 'PROMEDIO',
  punto_reorden numeric(18,4),
  comprador_id uuid REFERENCES mae_direcciones(id),
  clase_contable_id uuid REFERENCES con_clases_contables(id),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_mae_articulos_sucursal_1 UNIQUE NULLS NOT DISTINCT (articulo_id, unidad_negocio_id)
);
CREATE INDEX ix_mae_articulos_sucursal_articulo_id ON mae_articulos_sucursal (articulo_id);
CREATE INDEX ix_mae_articulos_sucursal_unidad_negocio_id ON mae_articulos_sucursal (unidad_negocio_id);
CREATE INDEX ix_mae_articulos_sucursal_comprador_id ON mae_articulos_sucursal (comprador_id);
CREATE INDEX ix_mae_articulos_sucursal_clase_contable_id ON mae_articulos_sucursal (clase_contable_id);
COMMENT ON TABLE mae_articulos_sucursal IS 'Artículo en una unidad de negocio';
COMMENT ON COLUMN mae_articulos_sucursal.articulo_id IS 'Artículo';
COMMENT ON COLUMN mae_articulos_sucursal.unidad_negocio_id IS 'Bodega o sucursal';
COMMENT ON COLUMN mae_articulos_sucursal.metodo_costo IS 'Método de costeo';
COMMENT ON COLUMN mae_articulos_sucursal.punto_reorden IS 'Cantidad de reorden';
COMMENT ON COLUMN mae_articulos_sucursal.comprador_id IS 'Comprador responsable';
COMMENT ON COLUMN mae_articulos_sucursal.clase_contable_id IS 'Clase que reemplaza la del artículo en esta unidad';
CREATE TRIGGER tg_mae_articulos_sucursal_mod BEFORE UPDATE ON mae_articulos_sucursal FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE mae_articulos_sucursal ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_mae_articulos_sucursal_suscriptor ON mae_articulos_sucursal USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- mae_conversiones_um: Factor entre unidades de medida
CREATE TABLE mae_conversiones_um (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  articulo_id uuid REFERENCES mae_articulos(id),
  desde varchar(20) NOT NULL,
  hasta varchar(20) NOT NULL,
  factor numeric(18,6) NOT NULL,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_mae_conversiones_um_1 UNIQUE NULLS NOT DISTINCT (suscriptor_id, articulo_id, desde, hasta)
);
CREATE INDEX ix_mae_conversiones_um_articulo_id ON mae_conversiones_um (articulo_id);
COMMENT ON TABLE mae_conversiones_um IS 'Factor entre unidades de medida';
COMMENT ON COLUMN mae_conversiones_um.articulo_id IS 'Artículo; nulo es conversión general';
COMMENT ON COLUMN mae_conversiones_um.desde IS 'Unidad origen';
COMMENT ON COLUMN mae_conversiones_um.hasta IS 'Unidad destino';
COMMENT ON COLUMN mae_conversiones_um.factor IS 'Unidades destino por unidad origen';
CREATE TRIGGER tg_mae_conversiones_um_mod BEFORE UPDATE ON mae_conversiones_um FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE mae_conversiones_um ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_mae_conversiones_um_suscriptor ON mae_conversiones_um USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- mae_precios: Precio de un artículo en una lista
CREATE TABLE mae_precios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  lista_precios_id uuid NOT NULL REFERENCES mae_listas_precios(id),
  articulo_id uuid NOT NULL REFERENCES mae_articulos(id),
  unidad varchar(20) NOT NULL,
  vigente_desde date NOT NULL,
  vigente_hasta date,
  precio numeric(18,6) NOT NULL,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_mae_precios_1 UNIQUE NULLS NOT DISTINCT (lista_precios_id, articulo_id, unidad, vigente_desde)
);
CREATE INDEX ix_mae_precios_lista_precios_id ON mae_precios (lista_precios_id);
CREATE INDEX ix_mae_precios_articulo_id ON mae_precios (articulo_id);
COMMENT ON TABLE mae_precios IS 'Precio de un artículo en una lista';
COMMENT ON COLUMN mae_precios.lista_precios_id IS 'Lista';
COMMENT ON COLUMN mae_precios.articulo_id IS 'Artículo';
COMMENT ON COLUMN mae_precios.unidad IS 'Unidad de medida';
COMMENT ON COLUMN mae_precios.vigente_desde IS 'Inicio de vigencia';
COMMENT ON COLUMN mae_precios.vigente_hasta IS 'Fin de vigencia';
COMMENT ON COLUMN mae_precios.precio IS 'Precio unitario';
CREATE TRIGGER tg_mae_precios_mod BEFORE UPDATE ON mae_precios FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE mae_precios ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_mae_precios_suscriptor ON mae_precios USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- inv_ubicaciones: Lugar físico dentro de una bodega
CREATE TABLE inv_ubicaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  unidad_negocio_id uuid NOT NULL REFERENCES mae_unidades_negocio(id),
  codigo varchar(30) NOT NULL,
  descripcion varchar(200),
  activo boolean NOT NULL DEFAULT true,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_inv_ubicaciones_1 UNIQUE NULLS NOT DISTINCT (unidad_negocio_id, codigo)
);
CREATE INDEX ix_inv_ubicaciones_unidad_negocio_id ON inv_ubicaciones (unidad_negocio_id);
COMMENT ON TABLE inv_ubicaciones IS 'Lugar físico dentro de una bodega';
COMMENT ON COLUMN inv_ubicaciones.unidad_negocio_id IS 'Bodega';
COMMENT ON COLUMN inv_ubicaciones.codigo IS 'Código de ubicación';
COMMENT ON COLUMN inv_ubicaciones.descripcion IS 'Descripción';
COMMENT ON COLUMN inv_ubicaciones.activo IS 'Registro activo';
CREATE TRIGGER tg_inv_ubicaciones_mod BEFORE UPDATE ON inv_ubicaciones FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE inv_ubicaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_inv_ubicaciones_suscriptor ON inv_ubicaciones USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- inv_lotes: Lote o serie de un artículo
CREATE TABLE inv_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  articulo_id uuid NOT NULL REFERENCES mae_articulos(id),
  unidad_negocio_id uuid NOT NULL REFERENCES mae_unidades_negocio(id),
  lote varchar(30) NOT NULL,
  fecha_vencimiento date,
  estado varchar(20) NOT NULL DEFAULT 'DISPONIBLE',
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_inv_lotes_1 UNIQUE NULLS NOT DISTINCT (articulo_id, unidad_negocio_id, lote)
);
CREATE INDEX ix_inv_lotes_articulo_id ON inv_lotes (articulo_id);
CREATE INDEX ix_inv_lotes_unidad_negocio_id ON inv_lotes (unidad_negocio_id);
COMMENT ON TABLE inv_lotes IS 'Lote o serie de un artículo';
COMMENT ON COLUMN inv_lotes.articulo_id IS 'Artículo';
COMMENT ON COLUMN inv_lotes.unidad_negocio_id IS 'Bodega';
COMMENT ON COLUMN inv_lotes.lote IS 'Número de lote o serie';
COMMENT ON COLUMN inv_lotes.fecha_vencimiento IS 'Vencimiento';
COMMENT ON COLUMN inv_lotes.estado IS 'DISPONIBLE, CUARENTENA, BLOQUEADO';
CREATE TRIGGER tg_inv_lotes_mod BEFORE UPDATE ON inv_lotes FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE inv_lotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_inv_lotes_suscriptor ON inv_lotes USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- inv_saldos: Existencia por artículo, bodega, ubicación y lote
CREATE TABLE inv_saldos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  articulo_id uuid NOT NULL REFERENCES mae_articulos(id),
  unidad_negocio_id uuid NOT NULL REFERENCES mae_unidades_negocio(id),
  ubicacion_id uuid REFERENCES inv_ubicaciones(id),
  lote_id uuid REFERENCES inv_lotes(id),
  en_mano numeric(18,4) NOT NULL DEFAULT 0,
  comprometido numeric(18,4) NOT NULL DEFAULT 0,
  en_transito numeric(18,4) NOT NULL DEFAULT 0,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_inv_saldos_1 UNIQUE NULLS NOT DISTINCT (articulo_id, unidad_negocio_id, ubicacion_id, lote_id)
);
CREATE INDEX ix_inv_saldos_articulo_id ON inv_saldos (articulo_id);
CREATE INDEX ix_inv_saldos_unidad_negocio_id ON inv_saldos (unidad_negocio_id);
CREATE INDEX ix_inv_saldos_ubicacion_id ON inv_saldos (ubicacion_id);
CREATE INDEX ix_inv_saldos_lote_id ON inv_saldos (lote_id);
COMMENT ON TABLE inv_saldos IS 'Existencia por artículo, bodega, ubicación y lote';
COMMENT ON COLUMN inv_saldos.articulo_id IS 'Artículo';
COMMENT ON COLUMN inv_saldos.unidad_negocio_id IS 'Bodega';
COMMENT ON COLUMN inv_saldos.ubicacion_id IS 'Ubicación';
COMMENT ON COLUMN inv_saldos.lote_id IS 'Lote';
COMMENT ON COLUMN inv_saldos.en_mano IS 'Cantidad física';
COMMENT ON COLUMN inv_saldos.comprometido IS 'Reservado por órdenes';
COMMENT ON COLUMN inv_saldos.en_transito IS 'En camino por transferencias';
CREATE TRIGGER tg_inv_saldos_mod BEFORE UPDATE ON inv_saldos FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE inv_saldos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_inv_saldos_suscriptor ON inv_saldos USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- inv_costos: Costo unitario vigente
CREATE TABLE inv_costos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  articulo_id uuid NOT NULL REFERENCES mae_articulos(id),
  unidad_negocio_id uuid NOT NULL REFERENCES mae_unidades_negocio(id),
  metodo varchar(20) NOT NULL,
  costo_unitario numeric(18,6) NOT NULL DEFAULT 0,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_inv_costos_1 UNIQUE NULLS NOT DISTINCT (articulo_id, unidad_negocio_id, metodo)
);
CREATE INDEX ix_inv_costos_articulo_id ON inv_costos (articulo_id);
CREATE INDEX ix_inv_costos_unidad_negocio_id ON inv_costos (unidad_negocio_id);
COMMENT ON TABLE inv_costos IS 'Costo unitario vigente';
COMMENT ON COLUMN inv_costos.articulo_id IS 'Artículo';
COMMENT ON COLUMN inv_costos.unidad_negocio_id IS 'Bodega';
COMMENT ON COLUMN inv_costos.metodo IS 'Método de costeo';
COMMENT ON COLUMN inv_costos.costo_unitario IS 'Costo unitario';
CREATE TRIGGER tg_inv_costos_mod BEFORE UPDATE ON inv_costos FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE inv_costos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_inv_costos_suscriptor ON inv_costos USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- con_asientos: Cabecera de asiento contable
CREATE TABLE con_asientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  tipo_documento_id uuid NOT NULL REFERENCES sis_tipos_documento(id),
  numero bigint NOT NULL,
  fecha date NOT NULL,
  periodo_id uuid NOT NULL REFERENCES con_periodos(id),
  glosa varchar(500),
  origen_modulo varchar(20),
  origen_id uuid,
  estado varchar(20) NOT NULL DEFAULT 'BORRADOR',
  asiento_reversa_id uuid REFERENCES con_asientos(id),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_con_asientos_1 UNIQUE NULLS NOT DISTINCT (compania_id, tipo_documento_id, numero)
);
CREATE INDEX ix_con_asientos_compania_id ON con_asientos (compania_id);
CREATE INDEX ix_con_asientos_tipo_documento_id ON con_asientos (tipo_documento_id);
CREATE INDEX ix_con_asientos_periodo_id ON con_asientos (periodo_id);
CREATE INDEX ix_con_asientos_asiento_reversa_id ON con_asientos (asiento_reversa_id);
COMMENT ON TABLE con_asientos IS 'Cabecera de asiento contable';
COMMENT ON COLUMN con_asientos.compania_id IS 'Compañía';
COMMENT ON COLUMN con_asientos.tipo_documento_id IS 'Tipo de asiento';
COMMENT ON COLUMN con_asientos.numero IS 'Número';
COMMENT ON COLUMN con_asientos.fecha IS 'Fecha contable';
COMMENT ON COLUMN con_asientos.periodo_id IS 'Período';
COMMENT ON COLUMN con_asientos.glosa IS 'Descripción';
COMMENT ON COLUMN con_asientos.origen_modulo IS 'Módulo que lo generó';
COMMENT ON COLUMN con_asientos.origen_id IS 'Documento de origen';
COMMENT ON COLUMN con_asientos.estado IS 'BORRADOR, CONTABILIZADO, REVERSADO';
COMMENT ON COLUMN con_asientos.asiento_reversa_id IS 'Asiento que lo reversa';
CREATE TRIGGER tg_con_asientos_mod BEFORE UPDATE ON con_asientos FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE con_asientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_con_asientos_suscriptor ON con_asientos USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- con_asientos_lineas: Movimiento a una cuenta
CREATE TABLE con_asientos_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  asiento_id uuid NOT NULL REFERENCES con_asientos(id),
  linea integer NOT NULL,
  cuenta_id uuid NOT NULL REFERENCES con_cuentas(id),
  centro_costo_id uuid REFERENCES mae_unidades_negocio(id),
  tercero_id uuid REFERENCES mae_direcciones(id),
  debito numeric(18,2) NOT NULL DEFAULT 0,
  credito numeric(18,2) NOT NULL DEFAULT 0,
  moneda_id uuid REFERENCES mae_monedas(id),
  monto_moneda numeric(18,2),
  glosa varchar(500),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_con_asientos_lineas_1 UNIQUE NULLS NOT DISTINCT (asiento_id, linea),
  CONSTRAINT ck_con_asientos_lineas_1 CHECK (debito >= 0 AND credito >= 0 AND (debito = 0 OR credito = 0))
);
CREATE INDEX ix_con_asientos_lineas_asiento_id ON con_asientos_lineas (asiento_id);
CREATE INDEX ix_con_asientos_lineas_cuenta_id ON con_asientos_lineas (cuenta_id);
CREATE INDEX ix_con_asientos_lineas_centro_costo_id ON con_asientos_lineas (centro_costo_id);
CREATE INDEX ix_con_asientos_lineas_tercero_id ON con_asientos_lineas (tercero_id);
CREATE INDEX ix_con_asientos_lineas_moneda_id ON con_asientos_lineas (moneda_id);
COMMENT ON TABLE con_asientos_lineas IS 'Movimiento a una cuenta';
COMMENT ON COLUMN con_asientos_lineas.asiento_id IS 'Asiento';
COMMENT ON COLUMN con_asientos_lineas.linea IS 'Número de línea';
COMMENT ON COLUMN con_asientos_lineas.cuenta_id IS 'Cuenta';
COMMENT ON COLUMN con_asientos_lineas.centro_costo_id IS 'Centro de costo';
COMMENT ON COLUMN con_asientos_lineas.tercero_id IS 'Tercero';
COMMENT ON COLUMN con_asientos_lineas.debito IS 'Débito';
COMMENT ON COLUMN con_asientos_lineas.credito IS 'Crédito';
COMMENT ON COLUMN con_asientos_lineas.moneda_id IS 'Moneda original';
COMMENT ON COLUMN con_asientos_lineas.monto_moneda IS 'Monto en moneda original';
COMMENT ON COLUMN con_asientos_lineas.glosa IS 'Detalle';
CREATE TRIGGER tg_con_asientos_lineas_mod BEFORE UPDATE ON con_asientos_lineas FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE con_asientos_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_con_asientos_lineas_suscriptor ON con_asientos_lineas USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- con_saldos: Saldo por cuenta, centro de costo y período
CREATE TABLE con_saldos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  cuenta_id uuid NOT NULL REFERENCES con_cuentas(id),
  centro_costo_id uuid REFERENCES mae_unidades_negocio(id),
  periodo_id uuid NOT NULL REFERENCES con_periodos(id),
  debitos numeric(18,2) NOT NULL DEFAULT 0,
  creditos numeric(18,2) NOT NULL DEFAULT 0,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_con_saldos_1 UNIQUE NULLS NOT DISTINCT (cuenta_id, centro_costo_id, periodo_id)
);
CREATE INDEX ix_con_saldos_compania_id ON con_saldos (compania_id);
CREATE INDEX ix_con_saldos_cuenta_id ON con_saldos (cuenta_id);
CREATE INDEX ix_con_saldos_centro_costo_id ON con_saldos (centro_costo_id);
CREATE INDEX ix_con_saldos_periodo_id ON con_saldos (periodo_id);
COMMENT ON TABLE con_saldos IS 'Saldo por cuenta, centro de costo y período';
COMMENT ON COLUMN con_saldos.compania_id IS 'Compañía';
COMMENT ON COLUMN con_saldos.cuenta_id IS 'Cuenta';
COMMENT ON COLUMN con_saldos.centro_costo_id IS 'Centro de costo';
COMMENT ON COLUMN con_saldos.periodo_id IS 'Período';
COMMENT ON COLUMN con_saldos.debitos IS 'Total de débitos del período';
COMMENT ON COLUMN con_saldos.creditos IS 'Total de créditos del período';
CREATE TRIGGER tg_con_saldos_mod BEFORE UPDATE ON con_saldos FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE con_saldos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_con_saldos_suscriptor ON con_saldos USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- inv_kardex: Movimiento inmutable de inventario
CREATE TABLE inv_kardex (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  fecha date NOT NULL,
  articulo_id uuid NOT NULL REFERENCES mae_articulos(id),
  unidad_negocio_id uuid NOT NULL REFERENCES mae_unidades_negocio(id),
  ubicacion_id uuid REFERENCES inv_ubicaciones(id),
  lote_id uuid REFERENCES inv_lotes(id),
  tipo_documento_id uuid NOT NULL REFERENCES sis_tipos_documento(id),
  numero_documento bigint NOT NULL,
  origen_modulo varchar(20) NOT NULL,
  origen_linea_id uuid NOT NULL,
  cantidad numeric(18,4) NOT NULL,
  costo_unitario numeric(18,6) NOT NULL,
  costo_total numeric(18,2) NOT NULL,
  asiento_id uuid REFERENCES con_asientos(id),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100)
);
CREATE INDEX ix_inv_kardex_1 ON inv_kardex (articulo_id, unidad_negocio_id, fecha);
CREATE INDEX ix_inv_kardex_compania_id ON inv_kardex (compania_id);
CREATE INDEX ix_inv_kardex_articulo_id ON inv_kardex (articulo_id);
CREATE INDEX ix_inv_kardex_unidad_negocio_id ON inv_kardex (unidad_negocio_id);
CREATE INDEX ix_inv_kardex_ubicacion_id ON inv_kardex (ubicacion_id);
CREATE INDEX ix_inv_kardex_lote_id ON inv_kardex (lote_id);
CREATE INDEX ix_inv_kardex_tipo_documento_id ON inv_kardex (tipo_documento_id);
CREATE INDEX ix_inv_kardex_asiento_id ON inv_kardex (asiento_id);
COMMENT ON TABLE inv_kardex IS 'Movimiento inmutable de inventario';
COMMENT ON COLUMN inv_kardex.compania_id IS 'Compañía';
COMMENT ON COLUMN inv_kardex.fecha IS 'Fecha del movimiento';
COMMENT ON COLUMN inv_kardex.articulo_id IS 'Artículo';
COMMENT ON COLUMN inv_kardex.unidad_negocio_id IS 'Bodega';
COMMENT ON COLUMN inv_kardex.ubicacion_id IS 'Ubicación';
COMMENT ON COLUMN inv_kardex.lote_id IS 'Lote';
COMMENT ON COLUMN inv_kardex.tipo_documento_id IS 'Tipo de documento de origen';
COMMENT ON COLUMN inv_kardex.numero_documento IS 'Número del documento de origen';
COMMENT ON COLUMN inv_kardex.origen_modulo IS 'Módulo de origen';
COMMENT ON COLUMN inv_kardex.origen_linea_id IS 'Línea del documento de origen';
COMMENT ON COLUMN inv_kardex.cantidad IS 'Positiva entra, negativa sale, en unidad primaria';
COMMENT ON COLUMN inv_kardex.costo_unitario IS 'Costo unitario del movimiento';
COMMENT ON COLUMN inv_kardex.costo_total IS 'Cantidad por costo';
COMMENT ON COLUMN inv_kardex.asiento_id IS 'Asiento generado';
CREATE TRIGGER tg_inv_kardex_mod BEFORE UPDATE ON inv_kardex FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE inv_kardex ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_inv_kardex_suscriptor ON inv_kardex USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- inv_documentos: Ajustes, transferencias, conteos y consumos internos
CREATE TABLE inv_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  tipo_documento_id uuid NOT NULL REFERENCES sis_tipos_documento(id),
  numero bigint NOT NULL,
  fecha date NOT NULL,
  unidad_negocio_id uuid NOT NULL REFERENCES mae_unidades_negocio(id),
  unidad_destino_id uuid REFERENCES mae_unidades_negocio(id),
  motivo varchar(20),
  observacion varchar(500),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_inv_documentos_1 UNIQUE NULLS NOT DISTINCT (compania_id, tipo_documento_id, numero)
);
CREATE INDEX ix_inv_documentos_compania_id ON inv_documentos (compania_id);
CREATE INDEX ix_inv_documentos_tipo_documento_id ON inv_documentos (tipo_documento_id);
CREATE INDEX ix_inv_documentos_unidad_negocio_id ON inv_documentos (unidad_negocio_id);
CREATE INDEX ix_inv_documentos_unidad_destino_id ON inv_documentos (unidad_destino_id);
COMMENT ON TABLE inv_documentos IS 'Ajustes, transferencias, conteos y consumos internos';
COMMENT ON COLUMN inv_documentos.compania_id IS 'Compañía';
COMMENT ON COLUMN inv_documentos.tipo_documento_id IS 'Tipo de documento';
COMMENT ON COLUMN inv_documentos.numero IS 'Número';
COMMENT ON COLUMN inv_documentos.fecha IS 'Fecha';
COMMENT ON COLUMN inv_documentos.unidad_negocio_id IS 'Bodega origen';
COMMENT ON COLUMN inv_documentos.unidad_destino_id IS 'Bodega destino en transferencias';
COMMENT ON COLUMN inv_documentos.motivo IS 'Catálogo de motivos';
COMMENT ON COLUMN inv_documentos.observacion IS 'Observación';
CREATE TRIGGER tg_inv_documentos_mod BEFORE UPDATE ON inv_documentos FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE inv_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_inv_documentos_suscriptor ON inv_documentos USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- inv_documentos_lineas: Artículos del documento de inventario
CREATE TABLE inv_documentos_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  documento_id uuid NOT NULL REFERENCES inv_documentos(id),
  linea integer NOT NULL,
  articulo_id uuid NOT NULL REFERENCES mae_articulos(id),
  ubicacion_id uuid REFERENCES inv_ubicaciones(id),
  lote_id uuid REFERENCES inv_lotes(id),
  cantidad numeric(18,4) NOT NULL,
  unidad varchar(20) NOT NULL,
  costo_unitario numeric(18,6),
  estado_siguiente smallint,
  estado_ultimo smallint,
  kardex_id uuid REFERENCES inv_kardex(id),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_inv_documentos_lineas_1 UNIQUE NULLS NOT DISTINCT (documento_id, linea)
);
CREATE INDEX ix_inv_documentos_lineas_documento_id ON inv_documentos_lineas (documento_id);
CREATE INDEX ix_inv_documentos_lineas_articulo_id ON inv_documentos_lineas (articulo_id);
CREATE INDEX ix_inv_documentos_lineas_ubicacion_id ON inv_documentos_lineas (ubicacion_id);
CREATE INDEX ix_inv_documentos_lineas_lote_id ON inv_documentos_lineas (lote_id);
CREATE INDEX ix_inv_documentos_lineas_kardex_id ON inv_documentos_lineas (kardex_id);
COMMENT ON TABLE inv_documentos_lineas IS 'Artículos del documento de inventario';
COMMENT ON COLUMN inv_documentos_lineas.documento_id IS 'Documento';
COMMENT ON COLUMN inv_documentos_lineas.linea IS 'Línea';
COMMENT ON COLUMN inv_documentos_lineas.articulo_id IS 'Artículo';
COMMENT ON COLUMN inv_documentos_lineas.ubicacion_id IS 'Ubicación';
COMMENT ON COLUMN inv_documentos_lineas.lote_id IS 'Lote';
COMMENT ON COLUMN inv_documentos_lineas.cantidad IS 'Cantidad';
COMMENT ON COLUMN inv_documentos_lineas.unidad IS 'Unidad de medida';
COMMENT ON COLUMN inv_documentos_lineas.costo_unitario IS 'Costo, para ajustes de entrada';
COMMENT ON COLUMN inv_documentos_lineas.estado_siguiente IS 'Estado siguiente';
COMMENT ON COLUMN inv_documentos_lineas.estado_ultimo IS 'Último estado';
COMMENT ON COLUMN inv_documentos_lineas.kardex_id IS 'Movimiento generado';
CREATE TRIGGER tg_inv_documentos_lineas_mod BEFORE UPDATE ON inv_documentos_lineas FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE inv_documentos_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_inv_documentos_lineas_suscriptor ON inv_documentos_lineas USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- ven_contratos: Contrato de servicio recurrente
CREATE TABLE ven_contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  numero bigint NOT NULL,
  cliente_id uuid NOT NULL REFERENCES mae_direcciones(id),
  fecha_inicio date NOT NULL,
  fecha_fin date,
  frecuencia varchar(20) NOT NULL,
  dia_facturacion smallint,
  estado varchar(20) NOT NULL DEFAULT 'VIGENTE',
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_ven_contratos_1 UNIQUE NULLS NOT DISTINCT (compania_id, numero)
);
CREATE INDEX ix_ven_contratos_compania_id ON ven_contratos (compania_id);
CREATE INDEX ix_ven_contratos_cliente_id ON ven_contratos (cliente_id);
COMMENT ON TABLE ven_contratos IS 'Contrato de servicio recurrente';
COMMENT ON COLUMN ven_contratos.compania_id IS 'Compañía';
COMMENT ON COLUMN ven_contratos.numero IS 'Número de contrato';
COMMENT ON COLUMN ven_contratos.cliente_id IS 'Cliente';
COMMENT ON COLUMN ven_contratos.fecha_inicio IS 'Inicio';
COMMENT ON COLUMN ven_contratos.fecha_fin IS 'Fin';
COMMENT ON COLUMN ven_contratos.frecuencia IS 'MENSUAL, TRIMESTRAL, ANUAL';
COMMENT ON COLUMN ven_contratos.dia_facturacion IS 'Día del mes en que se factura';
COMMENT ON COLUMN ven_contratos.estado IS 'VIGENTE, SUSPENDIDO, TERMINADO';
CREATE TRIGGER tg_ven_contratos_mod BEFORE UPDATE ON ven_contratos FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE ven_contratos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_ven_contratos_suscriptor ON ven_contratos USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- ven_contratos_lineas: Servicio incluido en un contrato
CREATE TABLE ven_contratos_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  contrato_id uuid NOT NULL REFERENCES ven_contratos(id),
  linea integer NOT NULL,
  articulo_id uuid NOT NULL REFERENCES mae_articulos(id),
  cantidad numeric(18,4) NOT NULL DEFAULT 1,
  precio numeric(18,6) NOT NULL,
  proxima_facturacion date,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_ven_contratos_lineas_1 UNIQUE NULLS NOT DISTINCT (contrato_id, linea)
);
CREATE INDEX ix_ven_contratos_lineas_contrato_id ON ven_contratos_lineas (contrato_id);
CREATE INDEX ix_ven_contratos_lineas_articulo_id ON ven_contratos_lineas (articulo_id);
COMMENT ON TABLE ven_contratos_lineas IS 'Servicio incluido en un contrato';
COMMENT ON COLUMN ven_contratos_lineas.contrato_id IS 'Contrato';
COMMENT ON COLUMN ven_contratos_lineas.linea IS 'Línea';
COMMENT ON COLUMN ven_contratos_lineas.articulo_id IS 'Servicio';
COMMENT ON COLUMN ven_contratos_lineas.cantidad IS 'Cantidad por período';
COMMENT ON COLUMN ven_contratos_lineas.precio IS 'Precio unitario';
COMMENT ON COLUMN ven_contratos_lineas.proxima_facturacion IS 'Próxima fecha de facturación';
CREATE TRIGGER tg_ven_contratos_lineas_mod BEFORE UPDATE ON ven_contratos_lineas FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE ven_contratos_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_ven_contratos_lineas_suscriptor ON ven_contratos_lineas USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- srv_tipos_orden: Clase de orden de servicio
CREATE TABLE srv_tipos_orden (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  codigo varchar(20) NOT NULL,
  descripcion varchar(200) NOT NULL,
  tipo_documento_id uuid NOT NULL REFERENCES sis_tipos_documento(id),
  tipo_objeto varchar(20),
  plantilla_defecto_id uuid,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_srv_tipos_orden_1 UNIQUE NULLS NOT DISTINCT (suscriptor_id, codigo)
);
CREATE INDEX ix_srv_tipos_orden_tipo_documento_id ON srv_tipos_orden (tipo_documento_id);
COMMENT ON TABLE srv_tipos_orden IS 'Clase de orden de servicio';
COMMENT ON COLUMN srv_tipos_orden.codigo IS 'Código';
COMMENT ON COLUMN srv_tipos_orden.descripcion IS 'Descripción';
COMMENT ON COLUMN srv_tipos_orden.tipo_documento_id IS 'Tipo de documento y su flujo de estados';
COMMENT ON COLUMN srv_tipos_orden.tipo_objeto IS 'Qué se atiende: PACIENTE, EQUIPO, VEHICULO, INSTALACION';
COMMENT ON COLUMN srv_tipos_orden.plantilla_defecto_id IS 'Plantilla que se propone al crear la orden';
CREATE TRIGGER tg_srv_tipos_orden_mod BEFORE UPDATE ON srv_tipos_orden FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE srv_tipos_orden ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_srv_tipos_orden_suscriptor ON srv_tipos_orden USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- srv_campos: Campo personalizado de un tipo de orden
CREATE TABLE srv_campos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  tipo_orden_id uuid NOT NULL REFERENCES srv_tipos_orden(id),
  campo varchar(50) NOT NULL,
  etiqueta varchar(200) NOT NULL,
  tipo_dato varchar(20) NOT NULL,
  catalogo_id uuid REFERENCES cat_catalogos(id),
  obligatorio boolean NOT NULL DEFAULT false,
  orden smallint,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_srv_campos_1 UNIQUE NULLS NOT DISTINCT (tipo_orden_id, campo)
);
CREATE INDEX ix_srv_campos_tipo_orden_id ON srv_campos (tipo_orden_id);
CREATE INDEX ix_srv_campos_catalogo_id ON srv_campos (catalogo_id);
COMMENT ON TABLE srv_campos IS 'Campo personalizado de un tipo de orden';
COMMENT ON COLUMN srv_campos.tipo_orden_id IS 'Tipo de orden';
COMMENT ON COLUMN srv_campos.campo IS 'Nombre técnico del campo';
COMMENT ON COLUMN srv_campos.etiqueta IS 'Etiqueta en pantalla';
COMMENT ON COLUMN srv_campos.tipo_dato IS 'TEXTO, NUMERO, FECHA, SI_NO, CATALOGO';
COMMENT ON COLUMN srv_campos.catalogo_id IS 'Catálogo si el dato es una lista';
COMMENT ON COLUMN srv_campos.obligatorio IS 'Si es obligatorio';
COMMENT ON COLUMN srv_campos.orden IS 'Orden en pantalla';
CREATE TRIGGER tg_srv_campos_mod BEFORE UPDATE ON srv_campos FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE srv_campos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_srv_campos_suscriptor ON srv_campos USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- srv_objetos: Lo que se atiende: paciente, equipo, vehículo o instalación
CREATE TABLE srv_objetos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  codigo varchar(30) NOT NULL,
  descripcion varchar(200) NOT NULL,
  tipo_objeto varchar(20) NOT NULL,
  cliente_id uuid REFERENCES mae_direcciones(id),
  serie varchar(50),
  campos jsonb,
  activo boolean NOT NULL DEFAULT true,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_srv_objetos_1 UNIQUE NULLS NOT DISTINCT (suscriptor_id, codigo)
);
CREATE INDEX ix_srv_objetos_cliente_id ON srv_objetos (cliente_id);
COMMENT ON TABLE srv_objetos IS 'Lo que se atiende: paciente, equipo, vehículo o instalación';
COMMENT ON COLUMN srv_objetos.codigo IS 'Código';
COMMENT ON COLUMN srv_objetos.descripcion IS 'Descripción';
COMMENT ON COLUMN srv_objetos.tipo_objeto IS 'Tipo de objeto';
COMMENT ON COLUMN srv_objetos.cliente_id IS 'Cliente dueño';
COMMENT ON COLUMN srv_objetos.serie IS 'Serie, placa o historia clínica';
COMMENT ON COLUMN srv_objetos.campos IS 'Campos personalizados';
COMMENT ON COLUMN srv_objetos.activo IS 'Registro activo';
CREATE TRIGGER tg_srv_objetos_mod BEFORE UPDATE ON srv_objetos FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE srv_objetos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_srv_objetos_suscriptor ON srv_objetos USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- srv_recursos: Quien o lo que presta el servicio
CREATE TABLE srv_recursos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  codigo varchar(20) NOT NULL,
  descripcion varchar(200) NOT NULL,
  tipo varchar(20) NOT NULL,
  direccion_id uuid REFERENCES mae_direcciones(id),
  unidad_negocio_id uuid REFERENCES mae_unidades_negocio(id),
  costo_hora numeric(18,6),
  activo boolean NOT NULL DEFAULT true,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_srv_recursos_1 UNIQUE NULLS NOT DISTINCT (suscriptor_id, codigo)
);
CREATE INDEX ix_srv_recursos_direccion_id ON srv_recursos (direccion_id);
CREATE INDEX ix_srv_recursos_unidad_negocio_id ON srv_recursos (unidad_negocio_id);
COMMENT ON TABLE srv_recursos IS 'Quien o lo que presta el servicio';
COMMENT ON COLUMN srv_recursos.codigo IS 'Código';
COMMENT ON COLUMN srv_recursos.descripcion IS 'Descripción';
COMMENT ON COLUMN srv_recursos.tipo IS 'PERSONA, SALA, VEHICULO, EQUIPO';
COMMENT ON COLUMN srv_recursos.direccion_id IS 'Empleado, si es una persona';
COMMENT ON COLUMN srv_recursos.unidad_negocio_id IS 'Sucursal donde trabaja';
COMMENT ON COLUMN srv_recursos.costo_hora IS 'Costo por hora';
COMMENT ON COLUMN srv_recursos.activo IS 'Registro activo';
CREATE TRIGGER tg_srv_recursos_mod BEFORE UPDATE ON srv_recursos FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE srv_recursos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_srv_recursos_suscriptor ON srv_recursos USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- srv_plantillas: Trabajo estándar reutilizable
CREATE TABLE srv_plantillas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  codigo varchar(20) NOT NULL,
  descripcion varchar(200) NOT NULL,
  tipo_orden_id uuid REFERENCES srv_tipos_orden(id),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_srv_plantillas_1 UNIQUE NULLS NOT DISTINCT (suscriptor_id, codigo)
);
CREATE INDEX ix_srv_plantillas_tipo_orden_id ON srv_plantillas (tipo_orden_id);
COMMENT ON TABLE srv_plantillas IS 'Trabajo estándar reutilizable';
COMMENT ON COLUMN srv_plantillas.codigo IS 'Código';
COMMENT ON COLUMN srv_plantillas.descripcion IS 'Descripción';
COMMENT ON COLUMN srv_plantillas.tipo_orden_id IS 'Tipo de orden al que aplica';
CREATE TRIGGER tg_srv_plantillas_mod BEFORE UPDATE ON srv_plantillas FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE srv_plantillas ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_srv_plantillas_suscriptor ON srv_plantillas USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- srv_plantillas_lineas: Actividad o material previsto en la plantilla
CREATE TABLE srv_plantillas_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  plantilla_id uuid NOT NULL REFERENCES srv_plantillas(id),
  linea integer NOT NULL,
  tipo_linea varchar(20) NOT NULL,
  descripcion varchar(200),
  articulo_id uuid REFERENCES mae_articulos(id),
  cantidad numeric(18,4),
  horas numeric(18,4),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_srv_plantillas_lineas_1 UNIQUE NULLS NOT DISTINCT (plantilla_id, linea)
);
CREATE INDEX ix_srv_plantillas_lineas_plantilla_id ON srv_plantillas_lineas (plantilla_id);
CREATE INDEX ix_srv_plantillas_lineas_articulo_id ON srv_plantillas_lineas (articulo_id);
COMMENT ON TABLE srv_plantillas_lineas IS 'Actividad o material previsto en la plantilla';
COMMENT ON COLUMN srv_plantillas_lineas.plantilla_id IS 'Plantilla';
COMMENT ON COLUMN srv_plantillas_lineas.linea IS 'Línea';
COMMENT ON COLUMN srv_plantillas_lineas.tipo_linea IS 'ACTIVIDAD o MATERIAL';
COMMENT ON COLUMN srv_plantillas_lineas.descripcion IS 'Descripción de la actividad';
COMMENT ON COLUMN srv_plantillas_lineas.articulo_id IS 'Material o servicio';
COMMENT ON COLUMN srv_plantillas_lineas.cantidad IS 'Cantidad prevista';
COMMENT ON COLUMN srv_plantillas_lineas.horas IS 'Horas previstas';
CREATE TRIGGER tg_srv_plantillas_lineas_mod BEFORE UPDATE ON srv_plantillas_lineas FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE srv_plantillas_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_srv_plantillas_lineas_suscriptor ON srv_plantillas_lineas USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- srv_ordenes: Orden de servicio
CREATE TABLE srv_ordenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  tipo_documento_id uuid NOT NULL REFERENCES sis_tipos_documento(id),
  numero bigint NOT NULL,
  tipo_orden_id uuid NOT NULL REFERENCES srv_tipos_orden(id),
  unidad_negocio_id uuid NOT NULL REFERENCES mae_unidades_negocio(id),
  cliente_id uuid NOT NULL REFERENCES mae_direcciones(id),
  objeto_id uuid REFERENCES srv_objetos(id),
  contrato_id uuid REFERENCES ven_contratos(id),
  fecha_solicitud timestamptz NOT NULL,
  fecha_programada timestamptz,
  fecha_cierre timestamptz,
  descripcion varchar(1000),
  estado smallint NOT NULL,
  campos jsonb,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_srv_ordenes_1 UNIQUE NULLS NOT DISTINCT (compania_id, tipo_documento_id, numero)
);
CREATE INDEX ix_srv_ordenes_compania_id ON srv_ordenes (compania_id);
CREATE INDEX ix_srv_ordenes_tipo_documento_id ON srv_ordenes (tipo_documento_id);
CREATE INDEX ix_srv_ordenes_tipo_orden_id ON srv_ordenes (tipo_orden_id);
CREATE INDEX ix_srv_ordenes_unidad_negocio_id ON srv_ordenes (unidad_negocio_id);
CREATE INDEX ix_srv_ordenes_cliente_id ON srv_ordenes (cliente_id);
CREATE INDEX ix_srv_ordenes_objeto_id ON srv_ordenes (objeto_id);
CREATE INDEX ix_srv_ordenes_contrato_id ON srv_ordenes (contrato_id);
COMMENT ON TABLE srv_ordenes IS 'Orden de servicio';
COMMENT ON COLUMN srv_ordenes.compania_id IS 'Compañía';
COMMENT ON COLUMN srv_ordenes.tipo_documento_id IS 'Tipo de documento';
COMMENT ON COLUMN srv_ordenes.numero IS 'Número';
COMMENT ON COLUMN srv_ordenes.tipo_orden_id IS 'Tipo de orden';
COMMENT ON COLUMN srv_ordenes.unidad_negocio_id IS 'Sucursal';
COMMENT ON COLUMN srv_ordenes.cliente_id IS 'Cliente';
COMMENT ON COLUMN srv_ordenes.objeto_id IS 'Objeto atendido';
COMMENT ON COLUMN srv_ordenes.contrato_id IS 'Contrato que la cubre';
COMMENT ON COLUMN srv_ordenes.fecha_solicitud IS 'Fecha de solicitud';
COMMENT ON COLUMN srv_ordenes.fecha_programada IS 'Fecha programada';
COMMENT ON COLUMN srv_ordenes.fecha_cierre IS 'Fecha de cierre';
COMMENT ON COLUMN srv_ordenes.descripcion IS 'Problema o servicio solicitado';
COMMENT ON COLUMN srv_ordenes.estado IS 'Estado actual según el flujo';
COMMENT ON COLUMN srv_ordenes.campos IS 'Valores de los campos personalizados';
CREATE TRIGGER tg_srv_ordenes_mod BEFORE UPDATE ON srv_ordenes FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE srv_ordenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_srv_ordenes_suscriptor ON srv_ordenes USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- srv_ordenes_actividades: Tarea de una orden de servicio
CREATE TABLE srv_ordenes_actividades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  orden_id uuid NOT NULL REFERENCES srv_ordenes(id),
  linea integer NOT NULL,
  descripcion varchar(200) NOT NULL,
  recurso_id uuid REFERENCES srv_recursos(id),
  horas_previstas numeric(18,4),
  horas_reales numeric(18,4),
  estado_siguiente smallint,
  estado_ultimo smallint,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_srv_ordenes_actividades_1 UNIQUE NULLS NOT DISTINCT (orden_id, linea)
);
CREATE INDEX ix_srv_ordenes_actividades_orden_id ON srv_ordenes_actividades (orden_id);
CREATE INDEX ix_srv_ordenes_actividades_recurso_id ON srv_ordenes_actividades (recurso_id);
COMMENT ON TABLE srv_ordenes_actividades IS 'Tarea de una orden de servicio';
COMMENT ON COLUMN srv_ordenes_actividades.orden_id IS 'Orden';
COMMENT ON COLUMN srv_ordenes_actividades.linea IS 'Línea';
COMMENT ON COLUMN srv_ordenes_actividades.descripcion IS 'Actividad';
COMMENT ON COLUMN srv_ordenes_actividades.recurso_id IS 'Recurso asignado';
COMMENT ON COLUMN srv_ordenes_actividades.horas_previstas IS 'Horas previstas';
COMMENT ON COLUMN srv_ordenes_actividades.horas_reales IS 'Horas reales';
COMMENT ON COLUMN srv_ordenes_actividades.estado_siguiente IS 'Estado siguiente';
COMMENT ON COLUMN srv_ordenes_actividades.estado_ultimo IS 'Último estado';
CREATE TRIGGER tg_srv_ordenes_actividades_mod BEFORE UPDATE ON srv_ordenes_actividades FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE srv_ordenes_actividades ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_srv_ordenes_actividades_suscriptor ON srv_ordenes_actividades USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- srv_ordenes_consumos: Material o servicio usado en una orden
CREATE TABLE srv_ordenes_consumos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  orden_id uuid NOT NULL REFERENCES srv_ordenes(id),
  linea integer NOT NULL,
  articulo_id uuid NOT NULL REFERENCES mae_articulos(id),
  unidad_negocio_id uuid REFERENCES mae_unidades_negocio(id),
  lote_id uuid REFERENCES inv_lotes(id),
  cantidad numeric(18,4) NOT NULL,
  unidad varchar(20) NOT NULL,
  costo_unitario numeric(18,6),
  facturable boolean NOT NULL DEFAULT true,
  precio numeric(18,6),
  estado_siguiente smallint,
  estado_ultimo smallint,
  kardex_id uuid REFERENCES inv_kardex(id),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_srv_ordenes_consumos_1 UNIQUE NULLS NOT DISTINCT (orden_id, linea)
);
CREATE INDEX ix_srv_ordenes_consumos_orden_id ON srv_ordenes_consumos (orden_id);
CREATE INDEX ix_srv_ordenes_consumos_articulo_id ON srv_ordenes_consumos (articulo_id);
CREATE INDEX ix_srv_ordenes_consumos_unidad_negocio_id ON srv_ordenes_consumos (unidad_negocio_id);
CREATE INDEX ix_srv_ordenes_consumos_lote_id ON srv_ordenes_consumos (lote_id);
CREATE INDEX ix_srv_ordenes_consumos_kardex_id ON srv_ordenes_consumos (kardex_id);
COMMENT ON TABLE srv_ordenes_consumos IS 'Material o servicio usado en una orden';
COMMENT ON COLUMN srv_ordenes_consumos.orden_id IS 'Orden';
COMMENT ON COLUMN srv_ordenes_consumos.linea IS 'Línea';
COMMENT ON COLUMN srv_ordenes_consumos.articulo_id IS 'Artículo o servicio';
COMMENT ON COLUMN srv_ordenes_consumos.unidad_negocio_id IS 'Bodega de donde sale';
COMMENT ON COLUMN srv_ordenes_consumos.lote_id IS 'Lote';
COMMENT ON COLUMN srv_ordenes_consumos.cantidad IS 'Cantidad';
COMMENT ON COLUMN srv_ordenes_consumos.unidad IS 'Unidad de medida';
COMMENT ON COLUMN srv_ordenes_consumos.costo_unitario IS 'Costo unitario';
COMMENT ON COLUMN srv_ordenes_consumos.facturable IS 'Si se cobra al cliente';
COMMENT ON COLUMN srv_ordenes_consumos.precio IS 'Precio unitario a facturar';
COMMENT ON COLUMN srv_ordenes_consumos.estado_siguiente IS 'Estado siguiente';
COMMENT ON COLUMN srv_ordenes_consumos.estado_ultimo IS 'Último estado';
COMMENT ON COLUMN srv_ordenes_consumos.kardex_id IS 'Movimiento de inventario generado';
CREATE TRIGGER tg_srv_ordenes_consumos_mod BEFORE UPDATE ON srv_ordenes_consumos FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE srv_ordenes_consumos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_srv_ordenes_consumos_suscriptor ON srv_ordenes_consumos USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- srv_agenda: Reserva de un recurso en un horario
CREATE TABLE srv_agenda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  recurso_id uuid NOT NULL REFERENCES srv_recursos(id),
  inicio timestamptz NOT NULL,
  fin timestamptz NOT NULL,
  orden_id uuid REFERENCES srv_ordenes(id),
  cliente_id uuid REFERENCES mae_direcciones(id),
  estado varchar(20) NOT NULL DEFAULT 'RESERVADA',
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT ck_srv_agenda_1 CHECK (fin > inicio)
);
CREATE INDEX ix_srv_agenda_1 ON srv_agenda (recurso_id, inicio);
CREATE INDEX ix_srv_agenda_recurso_id ON srv_agenda (recurso_id);
CREATE INDEX ix_srv_agenda_orden_id ON srv_agenda (orden_id);
CREATE INDEX ix_srv_agenda_cliente_id ON srv_agenda (cliente_id);
COMMENT ON TABLE srv_agenda IS 'Reserva de un recurso en un horario';
COMMENT ON COLUMN srv_agenda.recurso_id IS 'Recurso';
COMMENT ON COLUMN srv_agenda.inicio IS 'Inicio';
COMMENT ON COLUMN srv_agenda.fin IS 'Fin';
COMMENT ON COLUMN srv_agenda.orden_id IS 'Orden asociada';
COMMENT ON COLUMN srv_agenda.cliente_id IS 'Cliente, si aún no hay orden';
COMMENT ON COLUMN srv_agenda.estado IS 'RESERVADA, CONFIRMADA, ATENDIDA, CANCELADA';
CREATE TRIGGER tg_srv_agenda_mod BEFORE UPDATE ON srv_agenda FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE srv_agenda ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_srv_agenda_suscriptor ON srv_agenda USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- ven_ordenes: Cotización u orden de venta
CREATE TABLE ven_ordenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  tipo_documento_id uuid NOT NULL REFERENCES sis_tipos_documento(id),
  numero bigint NOT NULL,
  unidad_negocio_id uuid NOT NULL REFERENCES mae_unidades_negocio(id),
  cliente_id uuid NOT NULL REFERENCES mae_direcciones(id),
  ubicacion_entrega_id uuid REFERENCES mae_direcciones_ubicaciones(id),
  fecha date NOT NULL,
  fecha_requerida date,
  condicion_pago_id uuid REFERENCES mae_condiciones_pago(id),
  moneda_id uuid NOT NULL REFERENCES mae_monedas(id),
  vendedor_id uuid REFERENCES mae_direcciones(id),
  referencia varchar(100),
  documento_origen_id uuid REFERENCES ven_ordenes(id),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_ven_ordenes_1 UNIQUE NULLS NOT DISTINCT (compania_id, tipo_documento_id, numero)
);
CREATE INDEX ix_ven_ordenes_compania_id ON ven_ordenes (compania_id);
CREATE INDEX ix_ven_ordenes_tipo_documento_id ON ven_ordenes (tipo_documento_id);
CREATE INDEX ix_ven_ordenes_unidad_negocio_id ON ven_ordenes (unidad_negocio_id);
CREATE INDEX ix_ven_ordenes_cliente_id ON ven_ordenes (cliente_id);
CREATE INDEX ix_ven_ordenes_ubicacion_entrega_id ON ven_ordenes (ubicacion_entrega_id);
CREATE INDEX ix_ven_ordenes_condicion_pago_id ON ven_ordenes (condicion_pago_id);
CREATE INDEX ix_ven_ordenes_moneda_id ON ven_ordenes (moneda_id);
CREATE INDEX ix_ven_ordenes_vendedor_id ON ven_ordenes (vendedor_id);
CREATE INDEX ix_ven_ordenes_documento_origen_id ON ven_ordenes (documento_origen_id);
COMMENT ON TABLE ven_ordenes IS 'Cotización u orden de venta';
COMMENT ON COLUMN ven_ordenes.compania_id IS 'Compañía';
COMMENT ON COLUMN ven_ordenes.tipo_documento_id IS 'Tipo de documento';
COMMENT ON COLUMN ven_ordenes.numero IS 'Número';
COMMENT ON COLUMN ven_ordenes.unidad_negocio_id IS 'Sucursal';
COMMENT ON COLUMN ven_ordenes.cliente_id IS 'Cliente';
COMMENT ON COLUMN ven_ordenes.ubicacion_entrega_id IS 'Dirección de entrega';
COMMENT ON COLUMN ven_ordenes.fecha IS 'Fecha de la orden';
COMMENT ON COLUMN ven_ordenes.fecha_requerida IS 'Fecha requerida';
COMMENT ON COLUMN ven_ordenes.condicion_pago_id IS 'Condición de pago';
COMMENT ON COLUMN ven_ordenes.moneda_id IS 'Moneda';
COMMENT ON COLUMN ven_ordenes.vendedor_id IS 'Vendedor';
COMMENT ON COLUMN ven_ordenes.referencia IS 'Orden de compra del cliente';
COMMENT ON COLUMN ven_ordenes.documento_origen_id IS 'Cotización de la que nace';
CREATE TRIGGER tg_ven_ordenes_mod BEFORE UPDATE ON ven_ordenes FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE ven_ordenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_ven_ordenes_suscriptor ON ven_ordenes USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- ven_ordenes_lineas: Línea de cotización u orden de venta
CREATE TABLE ven_ordenes_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  orden_id uuid NOT NULL REFERENCES ven_ordenes(id),
  linea integer NOT NULL,
  articulo_id uuid NOT NULL REFERENCES mae_articulos(id),
  descripcion varchar(200),
  unidad_negocio_id uuid NOT NULL REFERENCES mae_unidades_negocio(id),
  cantidad numeric(18,4) NOT NULL,
  cantidad_despachada numeric(18,4) NOT NULL DEFAULT 0,
  unidad varchar(20) NOT NULL,
  precio numeric(18,6) NOT NULL,
  descuento numeric(18,2) NOT NULL DEFAULT 0,
  impuesto_id uuid REFERENCES mae_impuestos(id),
  costo_unitario numeric(18,6),
  estado_siguiente smallint NOT NULL,
  estado_ultimo smallint NOT NULL,
  kardex_id uuid REFERENCES inv_kardex(id),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_ven_ordenes_lineas_1 UNIQUE NULLS NOT DISTINCT (orden_id, linea)
);
CREATE INDEX ix_ven_ordenes_lineas_orden_id ON ven_ordenes_lineas (orden_id);
CREATE INDEX ix_ven_ordenes_lineas_articulo_id ON ven_ordenes_lineas (articulo_id);
CREATE INDEX ix_ven_ordenes_lineas_unidad_negocio_id ON ven_ordenes_lineas (unidad_negocio_id);
CREATE INDEX ix_ven_ordenes_lineas_impuesto_id ON ven_ordenes_lineas (impuesto_id);
CREATE INDEX ix_ven_ordenes_lineas_kardex_id ON ven_ordenes_lineas (kardex_id);
COMMENT ON TABLE ven_ordenes_lineas IS 'Línea de cotización u orden de venta';
COMMENT ON COLUMN ven_ordenes_lineas.orden_id IS 'Orden';
COMMENT ON COLUMN ven_ordenes_lineas.linea IS 'Línea';
COMMENT ON COLUMN ven_ordenes_lineas.articulo_id IS 'Artículo o servicio';
COMMENT ON COLUMN ven_ordenes_lineas.descripcion IS 'Descripción';
COMMENT ON COLUMN ven_ordenes_lineas.unidad_negocio_id IS 'Bodega de despacho';
COMMENT ON COLUMN ven_ordenes_lineas.cantidad IS 'Cantidad pedida';
COMMENT ON COLUMN ven_ordenes_lineas.cantidad_despachada IS 'Cantidad despachada';
COMMENT ON COLUMN ven_ordenes_lineas.unidad IS 'Unidad de medida';
COMMENT ON COLUMN ven_ordenes_lineas.precio IS 'Precio unitario';
COMMENT ON COLUMN ven_ordenes_lineas.descuento IS 'Descuento';
COMMENT ON COLUMN ven_ordenes_lineas.impuesto_id IS 'Impuesto';
COMMENT ON COLUMN ven_ordenes_lineas.costo_unitario IS 'Costo al despachar';
COMMENT ON COLUMN ven_ordenes_lineas.estado_siguiente IS 'Estado siguiente';
COMMENT ON COLUMN ven_ordenes_lineas.estado_ultimo IS 'Último estado';
COMMENT ON COLUMN ven_ordenes_lineas.kardex_id IS 'Movimiento de despacho';
CREATE TRIGGER tg_ven_ordenes_lineas_mod BEFORE UPDATE ON ven_ordenes_lineas FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE ven_ordenes_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_ven_ordenes_lineas_suscriptor ON ven_ordenes_lineas USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- ven_facturas: Factura, nota de crédito o nota de débito emitida
CREATE TABLE ven_facturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  tipo_documento_id uuid NOT NULL REFERENCES sis_tipos_documento(id),
  establecimiento char(3) NOT NULL,
  punto_emision char(3) NOT NULL,
  secuencial bigint NOT NULL,
  fecha date NOT NULL,
  cliente_id uuid NOT NULL REFERENCES mae_direcciones(id),
  moneda_id uuid NOT NULL REFERENCES mae_monedas(id),
  subtotal numeric(18,2) NOT NULL,
  descuento numeric(18,2) NOT NULL DEFAULT 0,
  impuestos numeric(18,2) NOT NULL,
  total numeric(18,2) NOT NULL,
  factura_modificada_id uuid REFERENCES ven_facturas(id),
  estado varchar(20) NOT NULL DEFAULT 'EMITIDA',
  asiento_id uuid REFERENCES con_asientos(id),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_ven_facturas_1 UNIQUE NULLS NOT DISTINCT (compania_id, establecimiento, punto_emision, tipo_documento_id, secuencial)
);
CREATE INDEX ix_ven_facturas_compania_id ON ven_facturas (compania_id);
CREATE INDEX ix_ven_facturas_tipo_documento_id ON ven_facturas (tipo_documento_id);
CREATE INDEX ix_ven_facturas_cliente_id ON ven_facturas (cliente_id);
CREATE INDEX ix_ven_facturas_moneda_id ON ven_facturas (moneda_id);
CREATE INDEX ix_ven_facturas_factura_modificada_id ON ven_facturas (factura_modificada_id);
CREATE INDEX ix_ven_facturas_asiento_id ON ven_facturas (asiento_id);
COMMENT ON TABLE ven_facturas IS 'Factura, nota de crédito o nota de débito emitida';
COMMENT ON COLUMN ven_facturas.compania_id IS 'Compañía';
COMMENT ON COLUMN ven_facturas.tipo_documento_id IS 'Tipo de documento';
COMMENT ON COLUMN ven_facturas.establecimiento IS 'Establecimiento SRI';
COMMENT ON COLUMN ven_facturas.punto_emision IS 'Punto de emisión SRI';
COMMENT ON COLUMN ven_facturas.secuencial IS 'Secuencial';
COMMENT ON COLUMN ven_facturas.fecha IS 'Fecha de emisión';
COMMENT ON COLUMN ven_facturas.cliente_id IS 'Cliente';
COMMENT ON COLUMN ven_facturas.moneda_id IS 'Moneda';
COMMENT ON COLUMN ven_facturas.subtotal IS 'Subtotal sin impuestos';
COMMENT ON COLUMN ven_facturas.descuento IS 'Descuento total';
COMMENT ON COLUMN ven_facturas.impuestos IS 'Total de impuestos';
COMMENT ON COLUMN ven_facturas.total IS 'Total';
COMMENT ON COLUMN ven_facturas.factura_modificada_id IS 'Factura que modifica una nota';
COMMENT ON COLUMN ven_facturas.estado IS 'EMITIDA, AUTORIZADA, ANULADA';
COMMENT ON COLUMN ven_facturas.asiento_id IS 'Asiento de venta';
CREATE TRIGGER tg_ven_facturas_mod BEFORE UPDATE ON ven_facturas FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE ven_facturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_ven_facturas_suscriptor ON ven_facturas USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- ven_facturas_lineas: Línea facturada con su origen
CREATE TABLE ven_facturas_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  factura_id uuid NOT NULL REFERENCES ven_facturas(id),
  linea integer NOT NULL,
  articulo_id uuid NOT NULL REFERENCES mae_articulos(id),
  descripcion varchar(200) NOT NULL,
  cantidad numeric(18,4) NOT NULL,
  precio numeric(18,6) NOT NULL,
  descuento numeric(18,2) NOT NULL DEFAULT 0,
  impuesto_id uuid REFERENCES mae_impuestos(id),
  valor_impuesto numeric(18,2) NOT NULL DEFAULT 0,
  total numeric(18,2) NOT NULL,
  orden_linea_id uuid REFERENCES ven_ordenes_lineas(id),
  consumo_id uuid REFERENCES srv_ordenes_consumos(id),
  contrato_linea_id uuid REFERENCES ven_contratos_lineas(id),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_ven_facturas_lineas_1 UNIQUE NULLS NOT DISTINCT (factura_id, linea)
);
CREATE INDEX ix_ven_facturas_lineas_factura_id ON ven_facturas_lineas (factura_id);
CREATE INDEX ix_ven_facturas_lineas_articulo_id ON ven_facturas_lineas (articulo_id);
CREATE INDEX ix_ven_facturas_lineas_impuesto_id ON ven_facturas_lineas (impuesto_id);
CREATE INDEX ix_ven_facturas_lineas_orden_linea_id ON ven_facturas_lineas (orden_linea_id);
CREATE INDEX ix_ven_facturas_lineas_consumo_id ON ven_facturas_lineas (consumo_id);
CREATE INDEX ix_ven_facturas_lineas_contrato_linea_id ON ven_facturas_lineas (contrato_linea_id);
COMMENT ON TABLE ven_facturas_lineas IS 'Línea facturada con su origen';
COMMENT ON COLUMN ven_facturas_lineas.factura_id IS 'Factura';
COMMENT ON COLUMN ven_facturas_lineas.linea IS 'Línea';
COMMENT ON COLUMN ven_facturas_lineas.articulo_id IS 'Artículo o servicio';
COMMENT ON COLUMN ven_facturas_lineas.descripcion IS 'Descripción impresa';
COMMENT ON COLUMN ven_facturas_lineas.cantidad IS 'Cantidad';
COMMENT ON COLUMN ven_facturas_lineas.precio IS 'Precio unitario';
COMMENT ON COLUMN ven_facturas_lineas.descuento IS 'Descuento';
COMMENT ON COLUMN ven_facturas_lineas.impuesto_id IS 'Impuesto';
COMMENT ON COLUMN ven_facturas_lineas.valor_impuesto IS 'Valor del impuesto';
COMMENT ON COLUMN ven_facturas_lineas.total IS 'Total de la línea';
COMMENT ON COLUMN ven_facturas_lineas.orden_linea_id IS 'Línea de orden de venta de origen';
COMMENT ON COLUMN ven_facturas_lineas.consumo_id IS 'Consumo de orden de servicio de origen';
COMMENT ON COLUMN ven_facturas_lineas.contrato_linea_id IS 'Línea de contrato de origen';
CREATE TRIGGER tg_ven_facturas_lineas_mod BEFORE UPDATE ON ven_facturas_lineas FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE ven_facturas_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_ven_facturas_lineas_suscriptor ON ven_facturas_lineas USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- com_ordenes: Requisición, cotización u orden de compra
CREATE TABLE com_ordenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  tipo_documento_id uuid NOT NULL REFERENCES sis_tipos_documento(id),
  numero bigint NOT NULL,
  unidad_negocio_id uuid NOT NULL REFERENCES mae_unidades_negocio(id),
  proveedor_id uuid REFERENCES mae_direcciones(id),
  fecha date NOT NULL,
  fecha_requerida date,
  comprador_id uuid REFERENCES mae_direcciones(id),
  condicion_pago_id uuid REFERENCES mae_condiciones_pago(id),
  moneda_id uuid NOT NULL REFERENCES mae_monedas(id),
  documento_origen_id uuid REFERENCES com_ordenes(id),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_com_ordenes_1 UNIQUE NULLS NOT DISTINCT (compania_id, tipo_documento_id, numero)
);
CREATE INDEX ix_com_ordenes_compania_id ON com_ordenes (compania_id);
CREATE INDEX ix_com_ordenes_tipo_documento_id ON com_ordenes (tipo_documento_id);
CREATE INDEX ix_com_ordenes_unidad_negocio_id ON com_ordenes (unidad_negocio_id);
CREATE INDEX ix_com_ordenes_proveedor_id ON com_ordenes (proveedor_id);
CREATE INDEX ix_com_ordenes_comprador_id ON com_ordenes (comprador_id);
CREATE INDEX ix_com_ordenes_condicion_pago_id ON com_ordenes (condicion_pago_id);
CREATE INDEX ix_com_ordenes_moneda_id ON com_ordenes (moneda_id);
CREATE INDEX ix_com_ordenes_documento_origen_id ON com_ordenes (documento_origen_id);
COMMENT ON TABLE com_ordenes IS 'Requisición, cotización u orden de compra';
COMMENT ON COLUMN com_ordenes.compania_id IS 'Compañía';
COMMENT ON COLUMN com_ordenes.tipo_documento_id IS 'Tipo de documento';
COMMENT ON COLUMN com_ordenes.numero IS 'Número';
COMMENT ON COLUMN com_ordenes.unidad_negocio_id IS 'Sucursal';
COMMENT ON COLUMN com_ordenes.proveedor_id IS 'Proveedor; nulo en requisiciones';
COMMENT ON COLUMN com_ordenes.fecha IS 'Fecha';
COMMENT ON COLUMN com_ordenes.fecha_requerida IS 'Fecha requerida';
COMMENT ON COLUMN com_ordenes.comprador_id IS 'Comprador';
COMMENT ON COLUMN com_ordenes.condicion_pago_id IS 'Condición de pago';
COMMENT ON COLUMN com_ordenes.moneda_id IS 'Moneda';
COMMENT ON COLUMN com_ordenes.documento_origen_id IS 'Requisición o cotización de la que nace';
CREATE TRIGGER tg_com_ordenes_mod BEFORE UPDATE ON com_ordenes FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE com_ordenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_com_ordenes_suscriptor ON com_ordenes USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- com_ordenes_lineas: Línea de compra
CREATE TABLE com_ordenes_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  orden_id uuid NOT NULL REFERENCES com_ordenes(id),
  linea integer NOT NULL,
  articulo_id uuid REFERENCES mae_articulos(id),
  descripcion varchar(200) NOT NULL,
  cuenta_id uuid REFERENCES con_cuentas(id),
  unidad_negocio_id uuid NOT NULL REFERENCES mae_unidades_negocio(id),
  cantidad numeric(18,4) NOT NULL,
  cantidad_recibida numeric(18,4) NOT NULL DEFAULT 0,
  cantidad_facturada numeric(18,4) NOT NULL DEFAULT 0,
  unidad varchar(20) NOT NULL,
  costo_unitario numeric(18,6) NOT NULL,
  impuesto_id uuid REFERENCES mae_impuestos(id),
  estado_siguiente smallint NOT NULL,
  estado_ultimo smallint NOT NULL,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_com_ordenes_lineas_1 UNIQUE NULLS NOT DISTINCT (orden_id, linea)
);
CREATE INDEX ix_com_ordenes_lineas_orden_id ON com_ordenes_lineas (orden_id);
CREATE INDEX ix_com_ordenes_lineas_articulo_id ON com_ordenes_lineas (articulo_id);
CREATE INDEX ix_com_ordenes_lineas_cuenta_id ON com_ordenes_lineas (cuenta_id);
CREATE INDEX ix_com_ordenes_lineas_unidad_negocio_id ON com_ordenes_lineas (unidad_negocio_id);
CREATE INDEX ix_com_ordenes_lineas_impuesto_id ON com_ordenes_lineas (impuesto_id);
COMMENT ON TABLE com_ordenes_lineas IS 'Línea de compra';
COMMENT ON COLUMN com_ordenes_lineas.orden_id IS 'Orden';
COMMENT ON COLUMN com_ordenes_lineas.linea IS 'Línea';
COMMENT ON COLUMN com_ordenes_lineas.articulo_id IS 'Artículo o servicio';
COMMENT ON COLUMN com_ordenes_lineas.descripcion IS 'Descripción';
COMMENT ON COLUMN com_ordenes_lineas.cuenta_id IS 'Cuenta de gasto para compras directas';
COMMENT ON COLUMN com_ordenes_lineas.unidad_negocio_id IS 'Bodega o centro de costo destino';
COMMENT ON COLUMN com_ordenes_lineas.cantidad IS 'Cantidad pedida';
COMMENT ON COLUMN com_ordenes_lineas.cantidad_recibida IS 'Cantidad recibida';
COMMENT ON COLUMN com_ordenes_lineas.cantidad_facturada IS 'Cantidad facturada';
COMMENT ON COLUMN com_ordenes_lineas.unidad IS 'Unidad de medida';
COMMENT ON COLUMN com_ordenes_lineas.costo_unitario IS 'Costo unitario';
COMMENT ON COLUMN com_ordenes_lineas.impuesto_id IS 'Impuesto';
COMMENT ON COLUMN com_ordenes_lineas.estado_siguiente IS 'Estado siguiente';
COMMENT ON COLUMN com_ordenes_lineas.estado_ultimo IS 'Último estado';
CREATE TRIGGER tg_com_ordenes_lineas_mod BEFORE UPDATE ON com_ordenes_lineas FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE com_ordenes_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_com_ordenes_lineas_suscriptor ON com_ordenes_lineas USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- com_aprobaciones: Paso de aprobación de una orden de compra
CREATE TABLE com_aprobaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  orden_id uuid NOT NULL REFERENCES com_ordenes(id),
  nivel smallint NOT NULL,
  aprobador_id uuid NOT NULL REFERENCES sis_usuarios(id),
  resultado varchar(20),
  fecha timestamptz,
  comentario varchar(500),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_com_aprobaciones_1 UNIQUE NULLS NOT DISTINCT (orden_id, nivel)
);
CREATE INDEX ix_com_aprobaciones_orden_id ON com_aprobaciones (orden_id);
CREATE INDEX ix_com_aprobaciones_aprobador_id ON com_aprobaciones (aprobador_id);
COMMENT ON TABLE com_aprobaciones IS 'Paso de aprobación de una orden de compra';
COMMENT ON COLUMN com_aprobaciones.orden_id IS 'Orden';
COMMENT ON COLUMN com_aprobaciones.nivel IS 'Nivel de aprobación';
COMMENT ON COLUMN com_aprobaciones.aprobador_id IS 'Aprobador';
COMMENT ON COLUMN com_aprobaciones.resultado IS 'APROBADA, RECHAZADA o pendiente si es nulo';
COMMENT ON COLUMN com_aprobaciones.fecha IS 'Fecha de la decisión';
COMMENT ON COLUMN com_aprobaciones.comentario IS 'Comentario';
CREATE TRIGGER tg_com_aprobaciones_mod BEFORE UPDATE ON com_aprobaciones FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE com_aprobaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_com_aprobaciones_suscriptor ON com_aprobaciones USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- com_recepciones: Registro de lo recibido por línea
CREATE TABLE com_recepciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  orden_linea_id uuid NOT NULL REFERENCES com_ordenes_lineas(id),
  fecha date NOT NULL,
  cantidad numeric(18,4) NOT NULL,
  costo_unitario numeric(18,6) NOT NULL,
  ubicacion_id uuid REFERENCES inv_ubicaciones(id),
  lote_id uuid REFERENCES inv_lotes(id),
  cantidad_facturada numeric(18,4) NOT NULL DEFAULT 0,
  kardex_id uuid REFERENCES inv_kardex(id),
  asiento_id uuid REFERENCES con_asientos(id),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100)
);
CREATE INDEX ix_com_recepciones_orden_linea_id ON com_recepciones (orden_linea_id);
CREATE INDEX ix_com_recepciones_ubicacion_id ON com_recepciones (ubicacion_id);
CREATE INDEX ix_com_recepciones_lote_id ON com_recepciones (lote_id);
CREATE INDEX ix_com_recepciones_kardex_id ON com_recepciones (kardex_id);
CREATE INDEX ix_com_recepciones_asiento_id ON com_recepciones (asiento_id);
COMMENT ON TABLE com_recepciones IS 'Registro de lo recibido por línea';
COMMENT ON COLUMN com_recepciones.orden_linea_id IS 'Línea de orden de compra';
COMMENT ON COLUMN com_recepciones.fecha IS 'Fecha de recepción';
COMMENT ON COLUMN com_recepciones.cantidad IS 'Cantidad recibida';
COMMENT ON COLUMN com_recepciones.costo_unitario IS 'Costo unitario';
COMMENT ON COLUMN com_recepciones.ubicacion_id IS 'Ubicación';
COMMENT ON COLUMN com_recepciones.lote_id IS 'Lote';
COMMENT ON COLUMN com_recepciones.cantidad_facturada IS 'Cantidad ya cruzada con facturas';
COMMENT ON COLUMN com_recepciones.kardex_id IS 'Movimiento de entrada';
COMMENT ON COLUMN com_recepciones.asiento_id IS 'Asiento de recepción';
CREATE TRIGGER tg_com_recepciones_mod BEFORE UPDATE ON com_recepciones FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE com_recepciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_com_recepciones_suscriptor ON com_recepciones USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- com_facturas: Factura del proveedor
CREATE TABLE com_facturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  proveedor_id uuid NOT NULL REFERENCES mae_direcciones(id),
  tipo_comprobante varchar(2) NOT NULL,
  numero_factura varchar(17) NOT NULL,
  autorizacion varchar(49),
  fecha date NOT NULL,
  fecha_registro date NOT NULL,
  moneda_id uuid NOT NULL REFERENCES mae_monedas(id),
  subtotal numeric(18,2) NOT NULL,
  impuestos numeric(18,2) NOT NULL,
  total numeric(18,2) NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'REGISTRADA',
  asiento_id uuid REFERENCES con_asientos(id),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_com_facturas_1 UNIQUE NULLS NOT DISTINCT (compania_id, proveedor_id, tipo_comprobante, numero_factura)
);
CREATE INDEX ix_com_facturas_compania_id ON com_facturas (compania_id);
CREATE INDEX ix_com_facturas_proveedor_id ON com_facturas (proveedor_id);
CREATE INDEX ix_com_facturas_moneda_id ON com_facturas (moneda_id);
CREATE INDEX ix_com_facturas_asiento_id ON com_facturas (asiento_id);
COMMENT ON TABLE com_facturas IS 'Factura del proveedor';
COMMENT ON COLUMN com_facturas.compania_id IS 'Compañía';
COMMENT ON COLUMN com_facturas.proveedor_id IS 'Proveedor';
COMMENT ON COLUMN com_facturas.tipo_comprobante IS 'Código de tipo de comprobante del SRI';
COMMENT ON COLUMN com_facturas.numero_factura IS 'Establecimiento, punto y secuencial del proveedor';
COMMENT ON COLUMN com_facturas.autorizacion IS 'Clave de acceso o autorización';
COMMENT ON COLUMN com_facturas.fecha IS 'Fecha de emisión';
COMMENT ON COLUMN com_facturas.fecha_registro IS 'Fecha de registro contable';
COMMENT ON COLUMN com_facturas.moneda_id IS 'Moneda';
COMMENT ON COLUMN com_facturas.subtotal IS 'Subtotal';
COMMENT ON COLUMN com_facturas.impuestos IS 'Impuestos';
COMMENT ON COLUMN com_facturas.total IS 'Total';
COMMENT ON COLUMN com_facturas.estado IS 'REGISTRADA, CONTABILIZADA, ANULADA';
COMMENT ON COLUMN com_facturas.asiento_id IS 'Asiento de provisión';
CREATE TRIGGER tg_com_facturas_mod BEFORE UPDATE ON com_facturas FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE com_facturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_com_facturas_suscriptor ON com_facturas USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- com_facturas_lineas: Línea de factura de proveedor
CREATE TABLE com_facturas_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  factura_id uuid NOT NULL REFERENCES com_facturas(id),
  linea integer NOT NULL,
  recepcion_id uuid REFERENCES com_recepciones(id),
  orden_linea_id uuid REFERENCES com_ordenes_lineas(id),
  cuenta_id uuid REFERENCES con_cuentas(id),
  descripcion varchar(200) NOT NULL,
  cantidad numeric(18,4) NOT NULL,
  costo_unitario numeric(18,6) NOT NULL,
  impuesto_id uuid REFERENCES mae_impuestos(id),
  valor_impuesto numeric(18,2) NOT NULL DEFAULT 0,
  total numeric(18,2) NOT NULL,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_com_facturas_lineas_1 UNIQUE NULLS NOT DISTINCT (factura_id, linea)
);
CREATE INDEX ix_com_facturas_lineas_factura_id ON com_facturas_lineas (factura_id);
CREATE INDEX ix_com_facturas_lineas_recepcion_id ON com_facturas_lineas (recepcion_id);
CREATE INDEX ix_com_facturas_lineas_orden_linea_id ON com_facturas_lineas (orden_linea_id);
CREATE INDEX ix_com_facturas_lineas_cuenta_id ON com_facturas_lineas (cuenta_id);
CREATE INDEX ix_com_facturas_lineas_impuesto_id ON com_facturas_lineas (impuesto_id);
COMMENT ON TABLE com_facturas_lineas IS 'Línea de factura de proveedor';
COMMENT ON COLUMN com_facturas_lineas.factura_id IS 'Factura';
COMMENT ON COLUMN com_facturas_lineas.linea IS 'Línea';
COMMENT ON COLUMN com_facturas_lineas.recepcion_id IS 'Recepción que cruza';
COMMENT ON COLUMN com_facturas_lineas.orden_linea_id IS 'Línea de orden, para servicios sin recepción';
COMMENT ON COLUMN com_facturas_lineas.cuenta_id IS 'Cuenta de gasto directo';
COMMENT ON COLUMN com_facturas_lineas.descripcion IS 'Descripción';
COMMENT ON COLUMN com_facturas_lineas.cantidad IS 'Cantidad';
COMMENT ON COLUMN com_facturas_lineas.costo_unitario IS 'Costo unitario';
COMMENT ON COLUMN com_facturas_lineas.impuesto_id IS 'Impuesto';
COMMENT ON COLUMN com_facturas_lineas.valor_impuesto IS 'Valor del impuesto';
COMMENT ON COLUMN com_facturas_lineas.total IS 'Total de la línea';
CREATE TRIGGER tg_com_facturas_lineas_mod BEFORE UPDATE ON com_facturas_lineas FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE com_facturas_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_com_facturas_lineas_suscriptor ON com_facturas_lineas USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- ec_establecimientos: Establecimiento y punto de emisión del SRI
CREATE TABLE ec_establecimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  establecimiento char(3) NOT NULL,
  punto_emision char(3) NOT NULL,
  unidad_negocio_id uuid REFERENCES mae_unidades_negocio(id),
  direccion varchar(300) NOT NULL,
  ambiente char(1) NOT NULL DEFAULT '1',
  activo boolean NOT NULL DEFAULT true,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_ec_establecimientos_1 UNIQUE NULLS NOT DISTINCT (compania_id, establecimiento, punto_emision)
);
CREATE INDEX ix_ec_establecimientos_compania_id ON ec_establecimientos (compania_id);
CREATE INDEX ix_ec_establecimientos_unidad_negocio_id ON ec_establecimientos (unidad_negocio_id);
COMMENT ON TABLE ec_establecimientos IS 'Establecimiento y punto de emisión del SRI';
COMMENT ON COLUMN ec_establecimientos.compania_id IS 'Compañía';
COMMENT ON COLUMN ec_establecimientos.establecimiento IS 'Código de establecimiento';
COMMENT ON COLUMN ec_establecimientos.punto_emision IS 'Código de punto de emisión';
COMMENT ON COLUMN ec_establecimientos.unidad_negocio_id IS 'Sucursal asociada';
COMMENT ON COLUMN ec_establecimientos.direccion IS 'Dirección del establecimiento';
COMMENT ON COLUMN ec_establecimientos.ambiente IS '1 pruebas, 2 producción';
COMMENT ON COLUMN ec_establecimientos.activo IS 'Registro activo';
CREATE TRIGGER tg_ec_establecimientos_mod BEFORE UPDATE ON ec_establecimientos FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE ec_establecimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_ec_establecimientos_suscriptor ON ec_establecimientos USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- ec_certificados: Certificado de firma electrónica
CREATE TABLE ec_certificados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  titular varchar(200) NOT NULL,
  vigente_desde date NOT NULL,
  vigente_hasta date NOT NULL,
  referencia_secreto varchar(300) NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_ec_certificados_1 UNIQUE NULLS NOT DISTINCT (compania_id, vigente_desde)
);
CREATE INDEX ix_ec_certificados_compania_id ON ec_certificados (compania_id);
COMMENT ON TABLE ec_certificados IS 'Certificado de firma electrónica';
COMMENT ON COLUMN ec_certificados.compania_id IS 'Compañía';
COMMENT ON COLUMN ec_certificados.titular IS 'Titular del certificado';
COMMENT ON COLUMN ec_certificados.vigente_desde IS 'Inicio de vigencia';
COMMENT ON COLUMN ec_certificados.vigente_hasta IS 'Fin de vigencia';
COMMENT ON COLUMN ec_certificados.referencia_secreto IS 'Nombre del secreto en Secret Manager';
COMMENT ON COLUMN ec_certificados.activo IS 'Registro activo';
CREATE TRIGGER tg_ec_certificados_mod BEFORE UPDATE ON ec_certificados FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE ec_certificados ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_ec_certificados_suscriptor ON ec_certificados USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- ec_codigos_retencion: Código de retención de renta o IVA
CREATE TABLE ec_codigos_retencion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  tipo varchar(20) NOT NULL,
  codigo varchar(10) NOT NULL,
  descripcion varchar(300) NOT NULL,
  porcentaje numeric(7,4) NOT NULL,
  vigente_desde date NOT NULL,
  vigente_hasta date,
  clase_contable_id uuid REFERENCES con_clases_contables(id),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_ec_codigos_retencion_1 UNIQUE NULLS NOT DISTINCT (suscriptor_id, tipo, codigo, vigente_desde)
);
CREATE INDEX ix_ec_codigos_retencion_clase_contable_id ON ec_codigos_retencion (clase_contable_id);
COMMENT ON TABLE ec_codigos_retencion IS 'Código de retención de renta o IVA';
COMMENT ON COLUMN ec_codigos_retencion.tipo IS 'RENTA o IVA';
COMMENT ON COLUMN ec_codigos_retencion.codigo IS 'Código del SRI';
COMMENT ON COLUMN ec_codigos_retencion.descripcion IS 'Concepto';
COMMENT ON COLUMN ec_codigos_retencion.porcentaje IS 'Porcentaje';
COMMENT ON COLUMN ec_codigos_retencion.vigente_desde IS 'Inicio de vigencia';
COMMENT ON COLUMN ec_codigos_retencion.vigente_hasta IS 'Fin de vigencia';
COMMENT ON COLUMN ec_codigos_retencion.clase_contable_id IS 'Clase para resolver la cuenta';
CREATE TRIGGER tg_ec_codigos_retencion_mod BEFORE UPDATE ON ec_codigos_retencion FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE ec_codigos_retencion ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_ec_codigos_retencion_suscriptor ON ec_codigos_retencion USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- ec_retenciones: Comprobante de retención emitido o recibido
CREATE TABLE ec_retenciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  sentido varchar(20) NOT NULL,
  establecimiento char(3),
  punto_emision char(3),
  secuencial varchar(17) NOT NULL,
  fecha date NOT NULL,
  tercero_id uuid NOT NULL REFERENCES mae_direcciones(id),
  compra_id uuid REFERENCES com_facturas(id),
  venta_id uuid REFERENCES ven_facturas(id),
  total numeric(18,2) NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'EMITIDA',
  asiento_id uuid REFERENCES con_asientos(id),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_ec_retenciones_1 UNIQUE NULLS NOT DISTINCT (compania_id, sentido, tercero_id, secuencial)
);
CREATE INDEX ix_ec_retenciones_compania_id ON ec_retenciones (compania_id);
CREATE INDEX ix_ec_retenciones_tercero_id ON ec_retenciones (tercero_id);
CREATE INDEX ix_ec_retenciones_compra_id ON ec_retenciones (compra_id);
CREATE INDEX ix_ec_retenciones_venta_id ON ec_retenciones (venta_id);
CREATE INDEX ix_ec_retenciones_asiento_id ON ec_retenciones (asiento_id);
COMMENT ON TABLE ec_retenciones IS 'Comprobante de retención emitido o recibido';
COMMENT ON COLUMN ec_retenciones.compania_id IS 'Compañía';
COMMENT ON COLUMN ec_retenciones.sentido IS 'EMITIDA a proveedor o RECIBIDA de cliente';
COMMENT ON COLUMN ec_retenciones.establecimiento IS 'Establecimiento, en emitidas';
COMMENT ON COLUMN ec_retenciones.punto_emision IS 'Punto de emisión, en emitidas';
COMMENT ON COLUMN ec_retenciones.secuencial IS 'Secuencial propio o del cliente';
COMMENT ON COLUMN ec_retenciones.fecha IS 'Fecha de emisión';
COMMENT ON COLUMN ec_retenciones.tercero_id IS 'Proveedor o cliente';
COMMENT ON COLUMN ec_retenciones.compra_id IS 'Factura de compra sustento';
COMMENT ON COLUMN ec_retenciones.venta_id IS 'Factura de venta sustento';
COMMENT ON COLUMN ec_retenciones.total IS 'Total retenido';
COMMENT ON COLUMN ec_retenciones.estado IS 'EMITIDA, AUTORIZADA, ANULADA, REGISTRADA';
COMMENT ON COLUMN ec_retenciones.asiento_id IS 'Asiento';
CREATE TRIGGER tg_ec_retenciones_mod BEFORE UPDATE ON ec_retenciones FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE ec_retenciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_ec_retenciones_suscriptor ON ec_retenciones USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- ec_retenciones_lineas: Detalle de una retención
CREATE TABLE ec_retenciones_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  retencion_id uuid NOT NULL REFERENCES ec_retenciones(id),
  linea integer NOT NULL,
  codigo_retencion_id uuid NOT NULL REFERENCES ec_codigos_retencion(id),
  base numeric(18,2) NOT NULL,
  porcentaje numeric(7,4) NOT NULL,
  valor numeric(18,2) NOT NULL,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_ec_retenciones_lineas_1 UNIQUE NULLS NOT DISTINCT (retencion_id, linea)
);
CREATE INDEX ix_ec_retenciones_lineas_retencion_id ON ec_retenciones_lineas (retencion_id);
CREATE INDEX ix_ec_retenciones_lineas_codigo_retencion_id ON ec_retenciones_lineas (codigo_retencion_id);
COMMENT ON TABLE ec_retenciones_lineas IS 'Detalle de una retención';
COMMENT ON COLUMN ec_retenciones_lineas.retencion_id IS 'Retención';
COMMENT ON COLUMN ec_retenciones_lineas.linea IS 'Línea';
COMMENT ON COLUMN ec_retenciones_lineas.codigo_retencion_id IS 'Código de retención';
COMMENT ON COLUMN ec_retenciones_lineas.base IS 'Base imponible';
COMMENT ON COLUMN ec_retenciones_lineas.porcentaje IS 'Porcentaje aplicado';
COMMENT ON COLUMN ec_retenciones_lineas.valor IS 'Valor retenido';
CREATE TRIGGER tg_ec_retenciones_lineas_mod BEFORE UPDATE ON ec_retenciones_lineas FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE ec_retenciones_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_ec_retenciones_lineas_suscriptor ON ec_retenciones_lineas USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- ec_comprobantes: Comprobante electrónico y su estado ante el SRI
CREATE TABLE ec_comprobantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  tipo_comprobante varchar(2) NOT NULL,
  origen_tabla varchar(63) NOT NULL,
  origen_id uuid NOT NULL,
  clave_acceso char(49) NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'GENERADO',
  numero_autorizacion varchar(49),
  fecha_autorizacion timestamptz,
  ruta_xml varchar(500),
  ruta_pdf varchar(500),
  mensajes jsonb,
  intentos smallint NOT NULL DEFAULT 0,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_ec_comprobantes_1 UNIQUE NULLS NOT DISTINCT (clave_acceso)
);
CREATE INDEX ix_ec_comprobantes_1 ON ec_comprobantes (origen_tabla, origen_id);
CREATE INDEX ix_ec_comprobantes_compania_id ON ec_comprobantes (compania_id);
COMMENT ON TABLE ec_comprobantes IS 'Comprobante electrónico y su estado ante el SRI';
COMMENT ON COLUMN ec_comprobantes.compania_id IS 'Compañía';
COMMENT ON COLUMN ec_comprobantes.tipo_comprobante IS '01 factura, 04 nota de crédito, 05 nota de débito, 07 retención, 03 liquidación';
COMMENT ON COLUMN ec_comprobantes.origen_tabla IS 'Tabla del documento de origen';
COMMENT ON COLUMN ec_comprobantes.origen_id IS 'Documento de origen';
COMMENT ON COLUMN ec_comprobantes.clave_acceso IS 'Clave de acceso de 49 dígitos';
COMMENT ON COLUMN ec_comprobantes.estado IS 'GENERADO, FIRMADO, RECIBIDO, DEVUELTO, AUTORIZADO, NO_AUTORIZADO';
COMMENT ON COLUMN ec_comprobantes.numero_autorizacion IS 'Número de autorización';
COMMENT ON COLUMN ec_comprobantes.fecha_autorizacion IS 'Fecha de autorización';
COMMENT ON COLUMN ec_comprobantes.ruta_xml IS 'Ubicación del XML en Cloud Storage';
COMMENT ON COLUMN ec_comprobantes.ruta_pdf IS 'Ubicación del RIDE en PDF';
COMMENT ON COLUMN ec_comprobantes.mensajes IS 'Mensajes devueltos por el SRI';
COMMENT ON COLUMN ec_comprobantes.intentos IS 'Intentos de envío';
CREATE TRIGGER tg_ec_comprobantes_mod BEFORE UPDATE ON ec_comprobantes FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE ec_comprobantes ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_ec_comprobantes_suscriptor ON ec_comprobantes USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- ec_ats_periodos: Generación del ATS mensual
CREATE TABLE ec_ats_periodos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  anio smallint NOT NULL,
  mes smallint NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'PENDIENTE',
  ruta_archivo varchar(500),
  fecha_generacion timestamptz,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_ec_ats_periodos_1 UNIQUE NULLS NOT DISTINCT (compania_id, anio, mes)
);
CREATE INDEX ix_ec_ats_periodos_compania_id ON ec_ats_periodos (compania_id);
COMMENT ON TABLE ec_ats_periodos IS 'Generación del ATS mensual';
COMMENT ON COLUMN ec_ats_periodos.compania_id IS 'Compañía';
COMMENT ON COLUMN ec_ats_periodos.anio IS 'Año';
COMMENT ON COLUMN ec_ats_periodos.mes IS 'Mes';
COMMENT ON COLUMN ec_ats_periodos.estado IS 'PENDIENTE, GENERADO, PRESENTADO';
COMMENT ON COLUMN ec_ats_periodos.ruta_archivo IS 'Ubicación del XML generado';
COMMENT ON COLUMN ec_ats_periodos.fecha_generacion IS 'Fecha de generación';
CREATE TRIGGER tg_ec_ats_periodos_mod BEFORE UPDATE ON ec_ats_periodos FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE ec_ats_periodos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_ec_ats_periodos_suscriptor ON ec_ats_periodos USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- con_cuentas_bancarias: Cuenta en un banco
CREATE TABLE con_cuentas_bancarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  codigo varchar(20) NOT NULL,
  banco_id uuid NOT NULL REFERENCES mae_direcciones(id),
  numero varchar(30) NOT NULL,
  tipo varchar(20) NOT NULL,
  moneda_id uuid NOT NULL REFERENCES mae_monedas(id),
  cuenta_id uuid NOT NULL REFERENCES con_cuentas(id),
  activo boolean NOT NULL DEFAULT true,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_con_cuentas_bancarias_1 UNIQUE NULLS NOT DISTINCT (compania_id, codigo)
);
CREATE INDEX ix_con_cuentas_bancarias_compania_id ON con_cuentas_bancarias (compania_id);
CREATE INDEX ix_con_cuentas_bancarias_banco_id ON con_cuentas_bancarias (banco_id);
CREATE INDEX ix_con_cuentas_bancarias_moneda_id ON con_cuentas_bancarias (moneda_id);
CREATE INDEX ix_con_cuentas_bancarias_cuenta_id ON con_cuentas_bancarias (cuenta_id);
COMMENT ON TABLE con_cuentas_bancarias IS 'Cuenta en un banco';
COMMENT ON COLUMN con_cuentas_bancarias.compania_id IS 'Compañía';
COMMENT ON COLUMN con_cuentas_bancarias.codigo IS 'Código interno';
COMMENT ON COLUMN con_cuentas_bancarias.banco_id IS 'Banco';
COMMENT ON COLUMN con_cuentas_bancarias.numero IS 'Número de cuenta';
COMMENT ON COLUMN con_cuentas_bancarias.tipo IS 'CORRIENTE o AHORROS';
COMMENT ON COLUMN con_cuentas_bancarias.moneda_id IS 'Moneda';
COMMENT ON COLUMN con_cuentas_bancarias.cuenta_id IS 'Cuenta contable';
COMMENT ON COLUMN con_cuentas_bancarias.activo IS 'Registro activo';
CREATE TRIGGER tg_con_cuentas_bancarias_mod BEFORE UPDATE ON con_cuentas_bancarias FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE con_cuentas_bancarias ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_con_cuentas_bancarias_suscriptor ON con_cuentas_bancarias USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- con_movimientos_bancarios: Línea del extracto bancario
CREATE TABLE con_movimientos_bancarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  cuenta_bancaria_id uuid NOT NULL REFERENCES con_cuentas_bancarias(id),
  fecha date NOT NULL,
  referencia varchar(100),
  descripcion varchar(300),
  monto numeric(18,2) NOT NULL,
  conciliado boolean NOT NULL DEFAULT false,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100)
);
CREATE INDEX ix_con_movimientos_bancarios_1 ON con_movimientos_bancarios (cuenta_bancaria_id, fecha);
CREATE INDEX ix_con_movimientos_bancarios_cuenta_bancaria_id ON con_movimientos_bancarios (cuenta_bancaria_id);
COMMENT ON TABLE con_movimientos_bancarios IS 'Línea del extracto bancario';
COMMENT ON COLUMN con_movimientos_bancarios.cuenta_bancaria_id IS 'Cuenta bancaria';
COMMENT ON COLUMN con_movimientos_bancarios.fecha IS 'Fecha';
COMMENT ON COLUMN con_movimientos_bancarios.referencia IS 'Referencia del banco';
COMMENT ON COLUMN con_movimientos_bancarios.descripcion IS 'Descripción';
COMMENT ON COLUMN con_movimientos_bancarios.monto IS 'Positivo depósito, negativo retiro';
COMMENT ON COLUMN con_movimientos_bancarios.conciliado IS 'Si ya está conciliado';
CREATE TRIGGER tg_con_movimientos_bancarios_mod BEFORE UPDATE ON con_movimientos_bancarios FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE con_movimientos_bancarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_con_movimientos_bancarios_suscriptor ON con_movimientos_bancarios USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- con_conciliaciones: Cruce entre banco y contabilidad
CREATE TABLE con_conciliaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  movimiento_id uuid NOT NULL REFERENCES con_movimientos_bancarios(id),
  asiento_linea_id uuid NOT NULL REFERENCES con_asientos_lineas(id),
  monto numeric(18,2) NOT NULL,
  fecha date NOT NULL,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_con_conciliaciones_1 UNIQUE NULLS NOT DISTINCT (movimiento_id, asiento_linea_id)
);
CREATE INDEX ix_con_conciliaciones_movimiento_id ON con_conciliaciones (movimiento_id);
CREATE INDEX ix_con_conciliaciones_asiento_linea_id ON con_conciliaciones (asiento_linea_id);
COMMENT ON TABLE con_conciliaciones IS 'Cruce entre banco y contabilidad';
COMMENT ON COLUMN con_conciliaciones.movimiento_id IS 'Movimiento del banco';
COMMENT ON COLUMN con_conciliaciones.asiento_linea_id IS 'Línea de asiento';
COMMENT ON COLUMN con_conciliaciones.monto IS 'Monto conciliado';
COMMENT ON COLUMN con_conciliaciones.fecha IS 'Fecha de conciliación';
CREATE TRIGGER tg_con_conciliaciones_mod BEFORE UPDATE ON con_conciliaciones FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE con_conciliaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_con_conciliaciones_suscriptor ON con_conciliaciones USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- cxc_documentos: Cuota por cobrar
CREATE TABLE cxc_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  tipo_documento_id uuid NOT NULL REFERENCES sis_tipos_documento(id),
  numero bigint NOT NULL,
  cuota smallint NOT NULL DEFAULT 1,
  cliente_id uuid NOT NULL REFERENCES mae_direcciones(id),
  factura_id uuid REFERENCES ven_facturas(id),
  fecha date NOT NULL,
  vencimiento date NOT NULL,
  moneda_id uuid NOT NULL REFERENCES mae_monedas(id),
  monto numeric(18,2) NOT NULL,
  saldo numeric(18,2) NOT NULL,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_cxc_documentos_1 UNIQUE NULLS NOT DISTINCT (compania_id, tipo_documento_id, numero, cuota)
);
CREATE INDEX ix_cxc_documentos_1 ON cxc_documentos (cliente_id, vencimiento);
CREATE INDEX ix_cxc_documentos_compania_id ON cxc_documentos (compania_id);
CREATE INDEX ix_cxc_documentos_tipo_documento_id ON cxc_documentos (tipo_documento_id);
CREATE INDEX ix_cxc_documentos_cliente_id ON cxc_documentos (cliente_id);
CREATE INDEX ix_cxc_documentos_factura_id ON cxc_documentos (factura_id);
CREATE INDEX ix_cxc_documentos_moneda_id ON cxc_documentos (moneda_id);
COMMENT ON TABLE cxc_documentos IS 'Cuota por cobrar';
COMMENT ON COLUMN cxc_documentos.compania_id IS 'Compañía';
COMMENT ON COLUMN cxc_documentos.tipo_documento_id IS 'Tipo de documento';
COMMENT ON COLUMN cxc_documentos.numero IS 'Número';
COMMENT ON COLUMN cxc_documentos.cuota IS 'Número de cuota';
COMMENT ON COLUMN cxc_documentos.cliente_id IS 'Cliente';
COMMENT ON COLUMN cxc_documentos.factura_id IS 'Factura de origen';
COMMENT ON COLUMN cxc_documentos.fecha IS 'Fecha del documento';
COMMENT ON COLUMN cxc_documentos.vencimiento IS 'Vencimiento';
COMMENT ON COLUMN cxc_documentos.moneda_id IS 'Moneda';
COMMENT ON COLUMN cxc_documentos.monto IS 'Monto original';
COMMENT ON COLUMN cxc_documentos.saldo IS 'Saldo pendiente';
CREATE TRIGGER tg_cxc_documentos_mod BEFORE UPDATE ON cxc_documentos FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE cxc_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_cxc_documentos_suscriptor ON cxc_documentos USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- cxc_cobros: Dinero recibido de un cliente
CREATE TABLE cxc_cobros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  numero bigint NOT NULL,
  cliente_id uuid NOT NULL REFERENCES mae_direcciones(id),
  fecha date NOT NULL,
  forma_pago varchar(20) NOT NULL,
  cuenta_bancaria_id uuid REFERENCES con_cuentas_bancarias(id),
  monto numeric(18,2) NOT NULL,
  referencia varchar(100),
  asiento_id uuid REFERENCES con_asientos(id),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_cxc_cobros_1 UNIQUE NULLS NOT DISTINCT (compania_id, numero)
);
CREATE INDEX ix_cxc_cobros_compania_id ON cxc_cobros (compania_id);
CREATE INDEX ix_cxc_cobros_cliente_id ON cxc_cobros (cliente_id);
CREATE INDEX ix_cxc_cobros_cuenta_bancaria_id ON cxc_cobros (cuenta_bancaria_id);
CREATE INDEX ix_cxc_cobros_asiento_id ON cxc_cobros (asiento_id);
COMMENT ON TABLE cxc_cobros IS 'Dinero recibido de un cliente';
COMMENT ON COLUMN cxc_cobros.compania_id IS 'Compañía';
COMMENT ON COLUMN cxc_cobros.numero IS 'Número de recibo';
COMMENT ON COLUMN cxc_cobros.cliente_id IS 'Cliente';
COMMENT ON COLUMN cxc_cobros.fecha IS 'Fecha';
COMMENT ON COLUMN cxc_cobros.forma_pago IS 'Catálogo: efectivo, transferencia, cheque, tarjeta';
COMMENT ON COLUMN cxc_cobros.cuenta_bancaria_id IS 'Cuenta donde ingresa';
COMMENT ON COLUMN cxc_cobros.monto IS 'Monto recibido';
COMMENT ON COLUMN cxc_cobros.referencia IS 'Referencia';
COMMENT ON COLUMN cxc_cobros.asiento_id IS 'Asiento';
CREATE TRIGGER tg_cxc_cobros_mod BEFORE UPDATE ON cxc_cobros FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE cxc_cobros ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_cxc_cobros_suscriptor ON cxc_cobros USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- cxc_aplicaciones: Cancelación de una cuota por cobro o retención
CREATE TABLE cxc_aplicaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  documento_id uuid NOT NULL REFERENCES cxc_documentos(id),
  cobro_id uuid REFERENCES cxc_cobros(id),
  retencion_id uuid REFERENCES ec_retenciones(id),
  monto numeric(18,2) NOT NULL,
  fecha date NOT NULL,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT ck_cxc_aplicaciones_1 CHECK ((cobro_id IS NOT NULL) <> (retencion_id IS NOT NULL))
);
CREATE INDEX ix_cxc_aplicaciones_documento_id ON cxc_aplicaciones (documento_id);
CREATE INDEX ix_cxc_aplicaciones_cobro_id ON cxc_aplicaciones (cobro_id);
CREATE INDEX ix_cxc_aplicaciones_retencion_id ON cxc_aplicaciones (retencion_id);
COMMENT ON TABLE cxc_aplicaciones IS 'Cancelación de una cuota por cobro o retención';
COMMENT ON COLUMN cxc_aplicaciones.documento_id IS 'Cuota que se cancela';
COMMENT ON COLUMN cxc_aplicaciones.cobro_id IS 'Cobro aplicado';
COMMENT ON COLUMN cxc_aplicaciones.retencion_id IS 'Retención recibida aplicada';
COMMENT ON COLUMN cxc_aplicaciones.monto IS 'Monto aplicado';
COMMENT ON COLUMN cxc_aplicaciones.fecha IS 'Fecha';
CREATE TRIGGER tg_cxc_aplicaciones_mod BEFORE UPDATE ON cxc_aplicaciones FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE cxc_aplicaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_cxc_aplicaciones_suscriptor ON cxc_aplicaciones USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- cxp_documentos: Cuota por pagar
CREATE TABLE cxp_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  tipo_documento_id uuid NOT NULL REFERENCES sis_tipos_documento(id),
  numero bigint NOT NULL,
  cuota smallint NOT NULL DEFAULT 1,
  proveedor_id uuid NOT NULL REFERENCES mae_direcciones(id),
  factura_id uuid REFERENCES com_facturas(id),
  fecha date NOT NULL,
  vencimiento date NOT NULL,
  moneda_id uuid NOT NULL REFERENCES mae_monedas(id),
  monto numeric(18,2) NOT NULL,
  saldo numeric(18,2) NOT NULL,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_cxp_documentos_1 UNIQUE NULLS NOT DISTINCT (compania_id, tipo_documento_id, numero, cuota)
);
CREATE INDEX ix_cxp_documentos_1 ON cxp_documentos (proveedor_id, vencimiento);
CREATE INDEX ix_cxp_documentos_compania_id ON cxp_documentos (compania_id);
CREATE INDEX ix_cxp_documentos_tipo_documento_id ON cxp_documentos (tipo_documento_id);
CREATE INDEX ix_cxp_documentos_proveedor_id ON cxp_documentos (proveedor_id);
CREATE INDEX ix_cxp_documentos_factura_id ON cxp_documentos (factura_id);
CREATE INDEX ix_cxp_documentos_moneda_id ON cxp_documentos (moneda_id);
COMMENT ON TABLE cxp_documentos IS 'Cuota por pagar';
COMMENT ON COLUMN cxp_documentos.compania_id IS 'Compañía';
COMMENT ON COLUMN cxp_documentos.tipo_documento_id IS 'Tipo de documento';
COMMENT ON COLUMN cxp_documentos.numero IS 'Número';
COMMENT ON COLUMN cxp_documentos.cuota IS 'Número de cuota';
COMMENT ON COLUMN cxp_documentos.proveedor_id IS 'Proveedor';
COMMENT ON COLUMN cxp_documentos.factura_id IS 'Factura de origen';
COMMENT ON COLUMN cxp_documentos.fecha IS 'Fecha';
COMMENT ON COLUMN cxp_documentos.vencimiento IS 'Vencimiento';
COMMENT ON COLUMN cxp_documentos.moneda_id IS 'Moneda';
COMMENT ON COLUMN cxp_documentos.monto IS 'Monto original';
COMMENT ON COLUMN cxp_documentos.saldo IS 'Saldo pendiente';
CREATE TRIGGER tg_cxp_documentos_mod BEFORE UPDATE ON cxp_documentos FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE cxp_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_cxp_documentos_suscriptor ON cxp_documentos USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- cxp_pagos: Dinero pagado a un proveedor
CREATE TABLE cxp_pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  numero bigint NOT NULL,
  proveedor_id uuid NOT NULL REFERENCES mae_direcciones(id),
  fecha date NOT NULL,
  forma_pago varchar(20) NOT NULL,
  cuenta_bancaria_id uuid REFERENCES con_cuentas_bancarias(id),
  monto numeric(18,2) NOT NULL,
  referencia varchar(100),
  asiento_id uuid REFERENCES con_asientos(id),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_cxp_pagos_1 UNIQUE NULLS NOT DISTINCT (compania_id, numero)
);
CREATE INDEX ix_cxp_pagos_compania_id ON cxp_pagos (compania_id);
CREATE INDEX ix_cxp_pagos_proveedor_id ON cxp_pagos (proveedor_id);
CREATE INDEX ix_cxp_pagos_cuenta_bancaria_id ON cxp_pagos (cuenta_bancaria_id);
CREATE INDEX ix_cxp_pagos_asiento_id ON cxp_pagos (asiento_id);
COMMENT ON TABLE cxp_pagos IS 'Dinero pagado a un proveedor';
COMMENT ON COLUMN cxp_pagos.compania_id IS 'Compañía';
COMMENT ON COLUMN cxp_pagos.numero IS 'Número de pago';
COMMENT ON COLUMN cxp_pagos.proveedor_id IS 'Proveedor';
COMMENT ON COLUMN cxp_pagos.fecha IS 'Fecha';
COMMENT ON COLUMN cxp_pagos.forma_pago IS 'Catálogo de formas de pago';
COMMENT ON COLUMN cxp_pagos.cuenta_bancaria_id IS 'Cuenta de donde sale';
COMMENT ON COLUMN cxp_pagos.monto IS 'Monto pagado';
COMMENT ON COLUMN cxp_pagos.referencia IS 'Referencia';
COMMENT ON COLUMN cxp_pagos.asiento_id IS 'Asiento';
CREATE TRIGGER tg_cxp_pagos_mod BEFORE UPDATE ON cxp_pagos FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE cxp_pagos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_cxp_pagos_suscriptor ON cxp_pagos USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- cxp_aplicaciones: Cancelación de una cuota por pago o retención
CREATE TABLE cxp_aplicaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  documento_id uuid NOT NULL REFERENCES cxp_documentos(id),
  pago_id uuid REFERENCES cxp_pagos(id),
  retencion_id uuid REFERENCES ec_retenciones(id),
  monto numeric(18,2) NOT NULL,
  fecha date NOT NULL,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT ck_cxp_aplicaciones_1 CHECK ((pago_id IS NOT NULL) <> (retencion_id IS NOT NULL))
);
CREATE INDEX ix_cxp_aplicaciones_documento_id ON cxp_aplicaciones (documento_id);
CREATE INDEX ix_cxp_aplicaciones_pago_id ON cxp_aplicaciones (pago_id);
CREATE INDEX ix_cxp_aplicaciones_retencion_id ON cxp_aplicaciones (retencion_id);
COMMENT ON TABLE cxp_aplicaciones IS 'Cancelación de una cuota por pago o retención';
COMMENT ON COLUMN cxp_aplicaciones.documento_id IS 'Cuota que se cancela';
COMMENT ON COLUMN cxp_aplicaciones.pago_id IS 'Pago aplicado';
COMMENT ON COLUMN cxp_aplicaciones.retencion_id IS 'Retención emitida aplicada';
COMMENT ON COLUMN cxp_aplicaciones.monto IS 'Monto aplicado';
COMMENT ON COLUMN cxp_aplicaciones.fecha IS 'Fecha';
CREATE TRIGGER tg_cxp_aplicaciones_mod BEFORE UPDATE ON cxp_aplicaciones FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE cxp_aplicaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_cxp_aplicaciones_suscriptor ON cxp_aplicaciones USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- ia_sesiones: Conversación del asesor de configuración con un usuario
CREATE TABLE ia_sesiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  usuario_id uuid NOT NULL REFERENCES sis_usuarios(id),
  inicio timestamptz NOT NULL DEFAULT now(),
  objetivo varchar(500),
  estado varchar(20) NOT NULL DEFAULT 'ABIERTA',
  historial jsonb,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100)
);
CREATE INDEX ix_ia_sesiones_usuario_id ON ia_sesiones (usuario_id);
COMMENT ON TABLE ia_sesiones IS 'Conversación del asesor de configuración con un usuario';
COMMENT ON COLUMN ia_sesiones.usuario_id IS 'Usuario del cliente';
COMMENT ON COLUMN ia_sesiones.inicio IS 'Inicio';
COMMENT ON COLUMN ia_sesiones.objetivo IS 'Qué se quiere configurar';
COMMENT ON COLUMN ia_sesiones.estado IS 'ABIERTA o CERRADA';
COMMENT ON COLUMN ia_sesiones.historial IS 'Mensajes de la conversación';
CREATE TRIGGER tg_ia_sesiones_mod BEFORE UPDATE ON ia_sesiones FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE ia_sesiones ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_ia_sesiones_suscriptor ON ia_sesiones USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- ia_archivos: Archivo entregado al asesor
CREATE TABLE ia_archivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  sesion_id uuid NOT NULL REFERENCES ia_sesiones(id),
  nombre varchar(300) NOT NULL,
  tipo_mime varchar(100) NOT NULL,
  ruta varchar(500) NOT NULL,
  extraccion jsonb,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100)
);
CREATE INDEX ix_ia_archivos_sesion_id ON ia_archivos (sesion_id);
COMMENT ON TABLE ia_archivos IS 'Archivo entregado al asesor';
COMMENT ON COLUMN ia_archivos.sesion_id IS 'Sesión';
COMMENT ON COLUMN ia_archivos.nombre IS 'Nombre del archivo';
COMMENT ON COLUMN ia_archivos.tipo_mime IS 'Tipo de archivo';
COMMENT ON COLUMN ia_archivos.ruta IS 'Ubicación en Cloud Storage';
COMMENT ON COLUMN ia_archivos.extraccion IS 'Datos que la IA extrajo';
CREATE TRIGGER tg_ia_archivos_mod BEFORE UPDATE ON ia_archivos FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE ia_archivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_ia_archivos_suscriptor ON ia_archivos USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- ia_propuestas: Conjunto de cambios propuesto por la IA
CREATE TABLE ia_propuestas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  sesion_id uuid NOT NULL REFERENCES ia_sesiones(id),
  resumen varchar(1000) NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'BORRADOR',
  requiere_contador boolean NOT NULL DEFAULT false,
  aprobado_por uuid REFERENCES sis_usuarios(id),
  aprobado_en timestamptz,
  aplicado_en timestamptz,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100)
);
CREATE INDEX ix_ia_propuestas_sesion_id ON ia_propuestas (sesion_id);
CREATE INDEX ix_ia_propuestas_aprobado_por ON ia_propuestas (aprobado_por);
COMMENT ON TABLE ia_propuestas IS 'Conjunto de cambios propuesto por la IA';
COMMENT ON COLUMN ia_propuestas.sesion_id IS 'Sesión';
COMMENT ON COLUMN ia_propuestas.resumen IS 'Qué cambia y por qué';
COMMENT ON COLUMN ia_propuestas.estado IS 'BORRADOR, APROBADA, APLICADA, RECHAZADA, REVERTIDA';
COMMENT ON COLUMN ia_propuestas.requiere_contador IS 'Si toca contabilidad o impuestos';
COMMENT ON COLUMN ia_propuestas.aprobado_por IS 'Quien aprobó';
COMMENT ON COLUMN ia_propuestas.aprobado_en IS 'Cuándo';
COMMENT ON COLUMN ia_propuestas.aplicado_en IS 'Cuándo se aplicó';
CREATE TRIGGER tg_ia_propuestas_mod BEFORE UPDATE ON ia_propuestas FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE ia_propuestas ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_ia_propuestas_suscriptor ON ia_propuestas USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- ----------------------------------------------------------------------
-- ia_propuestas_cambios: Cambio individual de una propuesta
CREATE TABLE ia_propuestas_cambios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  propuesta_id uuid NOT NULL REFERENCES ia_propuestas(id),
  secuencia integer NOT NULL,
  tabla varchar(63) NOT NULL,
  operacion char(1) NOT NULL,
  registro_id uuid,
  datos_nuevos jsonb,
  datos_anteriores jsonb,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128),
  modificado_en timestamptz,
  programa varchar(100),
  CONSTRAINT uq_ia_propuestas_cambios_1 UNIQUE NULLS NOT DISTINCT (propuesta_id, secuencia)
);
CREATE INDEX ix_ia_propuestas_cambios_propuesta_id ON ia_propuestas_cambios (propuesta_id);
COMMENT ON TABLE ia_propuestas_cambios IS 'Cambio individual de una propuesta';
COMMENT ON COLUMN ia_propuestas_cambios.propuesta_id IS 'Propuesta';
COMMENT ON COLUMN ia_propuestas_cambios.secuencia IS 'Orden de aplicación';
COMMENT ON COLUMN ia_propuestas_cambios.tabla IS 'Tabla destino';
COMMENT ON COLUMN ia_propuestas_cambios.operacion IS 'I, U o D';
COMMENT ON COLUMN ia_propuestas_cambios.registro_id IS 'Registro afectado';
COMMENT ON COLUMN ia_propuestas_cambios.datos_nuevos IS 'Valores a aplicar';
COMMENT ON COLUMN ia_propuestas_cambios.datos_anteriores IS 'Valores previos, para revertir';
CREATE TRIGGER tg_ia_propuestas_cambios_mod BEFORE UPDATE ON ia_propuestas_cambios FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion();
ALTER TABLE ia_propuestas_cambios ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_ia_propuestas_cambios_suscriptor ON ia_propuestas_cambios USING (suscriptor_id = erp.fn_suscriptor_actual()) WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual());

-- Llaves foráneas entre tablas creadas en distinto orden
ALTER TABLE srv_tipos_orden ADD CONSTRAINT fk_srv_tipos_orden_plantilla_defecto_id FOREIGN KEY (plantilla_defecto_id) REFERENCES srv_plantillas(id);

