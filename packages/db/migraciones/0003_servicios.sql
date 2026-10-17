-- Módulo de gestión de servicios: cobertura, temparios ampliados, horas, terceros, garantías,
-- contratos con cobertura y preventivos, mesa de ayuda y reclamos de garantía al proveedor.
-- Ver docs/especificaciones/srv-gestion-de-servicios.md

SET search_path TO erp;

-- Prepara una tabla nueva con las reglas comunes: seguridad por suscriptor, auditoría y permisos.
CREATE OR REPLACE FUNCTION erp.fn_tabla_estandar(p_tabla text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE erp.%I ENABLE ROW LEVEL SECURITY', p_tabla);
  EXECUTE format('CREATE POLICY pl_%s_suscriptor ON erp.%I USING (suscriptor_id = erp.fn_suscriptor_actual())
                  WITH CHECK (suscriptor_id = erp.fn_suscriptor_actual())', p_tabla, p_tabla);
  EXECUTE format('CREATE TRIGGER tg_%s_mod BEFORE UPDATE ON erp.%I FOR EACH ROW EXECUTE FUNCTION erp.fn_marcar_modificacion()',
                 p_tabla, p_tabla);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON erp.%I TO erp_app', p_tabla);
END $$;

-- ---------------------------------------------------------------------------
-- Flujos de estado: la fase da el significado; los números de estado siguen siendo configurables.
ALTER TABLE sis_flujos_estado ADD COLUMN fase varchar(20)
  CHECK (fase IN ('REGISTRADA','PROGRAMADA','EJECUCION','TERMINADA','REVISADA','FACTURADA','CERRADA','CANCELADA'));
COMMENT ON COLUMN sis_flujos_estado.fase IS 'Significado del estado para la lógica del sistema';

-- ---------------------------------------------------------------------------
-- Perfiles, recursos y tarifas
CREATE TABLE srv_perfiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  codigo varchar(20) NOT NULL,
  descripcion varchar(200) NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128), modificado_en timestamptz, programa varchar(100),
  CONSTRAINT uq_srv_perfiles_1 UNIQUE NULLS NOT DISTINCT (suscriptor_id, codigo)
);
COMMENT ON TABLE srv_perfiles IS 'Perfil o especialidad que pide una actividad: odontólogo, cirujano, técnico';
SELECT erp.fn_tabla_estandar('srv_perfiles');

CREATE TABLE srv_recursos_perfiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  recurso_id uuid NOT NULL REFERENCES srv_recursos(id),
  perfil_id uuid NOT NULL REFERENCES srv_perfiles(id),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128), modificado_en timestamptz, programa varchar(100),
  CONSTRAINT uq_srv_recursos_perfiles_1 UNIQUE (recurso_id, perfil_id)
);
COMMENT ON TABLE srv_recursos_perfiles IS 'Perfiles que puede cubrir cada recurso';
SELECT erp.fn_tabla_estandar('srv_recursos_perfiles');

CREATE TABLE srv_tarifas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  perfil_id uuid REFERENCES srv_perfiles(id),
  recurso_id uuid REFERENCES srv_recursos(id),
  lista_precios_id uuid REFERENCES mae_listas_precios(id),
  costo_hora numeric(18,6) NOT NULL DEFAULT 0,
  venta_hora numeric(18,6) NOT NULL DEFAULT 0,
  vigente_desde date NOT NULL,
  vigente_hasta date,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128), modificado_en timestamptz, programa varchar(100),
  CONSTRAINT ck_srv_tarifas_1 CHECK (perfil_id IS NOT NULL OR recurso_id IS NOT NULL)
);
COMMENT ON TABLE srv_tarifas IS 'Tarifa por hora de costo y de venta por perfil o recurso, con vigencia';
SELECT erp.fn_tabla_estandar('srv_tarifas');

-- ---------------------------------------------------------------------------
-- Tipos de orden, objetos y campos
ALTER TABLE srv_tipos_orden
  ADD COLUMN cobertura_defecto varchar(20) NOT NULL DEFAULT 'FACTURABLE'
    CHECK (cobertura_defecto IN ('FACTURABLE','GARANTIA','CONTRATO','INTERNO')),
  ADD COLUMN clase_contable_id uuid REFERENCES con_clases_contables(id),
  ADD COLUMN margen_terceros numeric(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN modo_horas varchar(10) NOT NULL DEFAULT 'AMBOS' CHECK (modo_horas IN ('RANGO','TOTAL','AMBOS')),
  ADD COLUMN articulo_mano_obra_id uuid REFERENCES mae_articulos(id),
  ADD COLUMN activo boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN srv_tipos_orden.articulo_mano_obra_id IS 'Servicio con que se factura la mano de obra si la actividad no indica otro';

ALTER TABLE srv_objetos
  ADD COLUMN articulo_origen_id uuid REFERENCES mae_articulos(id),
  ADD COLUMN fecha_venta date,
  ADD COLUMN fabricante_id uuid REFERENCES mae_direcciones(id);

ALTER TABLE srv_campos ADD COLUMN sensible boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN srv_campos.sensible IS 'Dato sensible: solo lo ven usuarios con permiso de datos sensibles';

-- ---------------------------------------------------------------------------
-- Temparios
ALTER TABLE srv_plantillas
  ADD COLUMN precio_cerrado numeric(18,6),
  ADD COLUMN articulo_id uuid REFERENCES mae_articulos(id),
  ADD COLUMN activo boolean NOT NULL DEFAULT true;
ALTER TABLE srv_plantillas_lineas
  ADD COLUMN perfil_id uuid REFERENCES srv_perfiles(id),
  ADD COLUMN personas smallint NOT NULL DEFAULT 1,
  ADD COLUMN facturable boolean NOT NULL DEFAULT true,
  ADD COLUMN costo_estimado numeric(18,6),
  ADD CONSTRAINT ck_srv_plantillas_lineas_tipo CHECK (tipo_linea IN ('ACTIVIDAD','MATERIAL','TERCERO'));

-- ---------------------------------------------------------------------------
-- Garantías
CREATE TABLE srv_garantias_definicion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  codigo varchar(20) NOT NULL,
  descripcion varchar(200) NOT NULL,
  articulo_id uuid REFERENCES mae_articulos(id),
  categoria varchar(20),
  meses smallint NOT NULL,
  pct_mano_obra numeric(7,4) NOT NULL DEFAULT 100,
  pct_materiales numeric(7,4) NOT NULL DEFAULT 100,
  respaldo_fabricante boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128), modificado_en timestamptz, programa varchar(100),
  CONSTRAINT uq_srv_garantias_definicion_1 UNIQUE NULLS NOT DISTINCT (suscriptor_id, codigo),
  CONSTRAINT ck_srv_garantias_definicion_1 CHECK (articulo_id IS NOT NULL OR categoria IS NOT NULL)
);
COMMENT ON TABLE srv_garantias_definicion IS 'Regla de garantía por artículo o por categoría';
SELECT erp.fn_tabla_estandar('srv_garantias_definicion');

CREATE TABLE srv_garantias_objeto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  objeto_id uuid NOT NULL REFERENCES srv_objetos(id),
  definicion_id uuid REFERENCES srv_garantias_definicion(id),
  fecha_inicio date NOT NULL,
  fecha_fin date NOT NULL,
  pct_mano_obra numeric(7,4) NOT NULL,
  pct_materiales numeric(7,4) NOT NULL,
  fabricante_id uuid REFERENCES mae_direcciones(id),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128), modificado_en timestamptz, programa varchar(100),
  CONSTRAINT ck_srv_garantias_objeto_1 CHECK (fecha_fin >= fecha_inicio)
);
COMMENT ON TABLE srv_garantias_objeto IS 'Garantía calculada de cada objeto atendido';
CREATE INDEX ix_srv_garantias_objeto_objeto ON srv_garantias_objeto (objeto_id);
SELECT erp.fn_tabla_estandar('srv_garantias_objeto');

-- ---------------------------------------------------------------------------
-- Contratos: cobertura y preventivos
ALTER TABLE ven_contratos_lineas
  ADD COLUMN tipo_orden_id uuid REFERENCES srv_tipos_orden(id),
  ADD COLUMN pct_mano_obra numeric(7,4) NOT NULL DEFAULT 100,
  ADD COLUMN pct_materiales numeric(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN tope_ordenes integer;
COMMENT ON COLUMN ven_contratos_lineas.tipo_orden_id IS 'Tipo de orden que cubre la línea; nulo cubre todos';

CREATE TABLE ven_contratos_preventivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  contrato_id uuid NOT NULL REFERENCES ven_contratos(id),
  objeto_id uuid REFERENCES srv_objetos(id),
  tipo_orden_id uuid NOT NULL REFERENCES srv_tipos_orden(id),
  plantilla_id uuid REFERENCES srv_plantillas(id),
  frecuencia_meses smallint NOT NULL,
  proxima_fecha date NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128), modificado_en timestamptz, programa varchar(100),
  CONSTRAINT ck_ven_contratos_preventivos_1 CHECK (frecuencia_meses > 0)
);
COMMENT ON TABLE ven_contratos_preventivos IS 'Mantenimientos preventivos programados de un contrato';
SELECT erp.fn_tabla_estandar('ven_contratos_preventivos');

-- ---------------------------------------------------------------------------
-- Mesa de ayuda
CREATE TABLE srv_casos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  numero bigint NOT NULL,
  cliente_id uuid NOT NULL REFERENCES mae_direcciones(id),
  contacto_id uuid REFERENCES mae_contactos(id),
  objeto_id uuid REFERENCES srv_objetos(id),
  canal varchar(20),
  tipo varchar(20),
  prioridad varchar(20) NOT NULL,
  asunto varchar(200) NOT NULL,
  descripcion varchar(2000),
  estado varchar(20) NOT NULL DEFAULT 'ABIERTO'
    CHECK (estado IN ('ABIERTO','EN_PROCESO','ESPERA_CLIENTE','RESUELTO','CERRADO')),
  asignado_id uuid REFERENCES srv_recursos(id),
  fecha_apertura timestamptz NOT NULL DEFAULT now(),
  fecha_compromiso timestamptz,
  fecha_cierre timestamptz,
  solucion varchar(2000),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128), modificado_en timestamptz, programa varchar(100),
  CONSTRAINT uq_srv_casos_1 UNIQUE (compania_id, numero)
);
COMMENT ON TABLE srv_casos IS 'Caso de la mesa de ayuda: solicitud del cliente antes de la orden';
CREATE INDEX ix_srv_casos_estado ON srv_casos (estado, fecha_compromiso);
SELECT erp.fn_tabla_estandar('srv_casos');

CREATE TABLE srv_casos_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  caso_id uuid NOT NULL REFERENCES srv_casos(id),
  nota varchar(2000) NOT NULL,
  visible_cliente boolean NOT NULL DEFAULT false,
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128), modificado_en timestamptz, programa varchar(100)
);
COMMENT ON TABLE srv_casos_notas IS 'Bitácora de un caso';
CREATE INDEX ix_srv_casos_notas_caso ON srv_casos_notas (caso_id);
SELECT erp.fn_tabla_estandar('srv_casos_notas');

-- ---------------------------------------------------------------------------
-- Órdenes de servicio
ALTER TABLE srv_ordenes
  ADD COLUMN cobertura varchar(20) NOT NULL DEFAULT 'FACTURABLE'
    CHECK (cobertura IN ('FACTURABLE','GARANTIA','CONTRATO','INTERNO')),
  ADD COLUMN cobertura_fijada boolean NOT NULL DEFAULT false,
  ADD COLUMN motivo_cobertura varchar(500),
  ADD COLUMN garantia_objeto_id uuid REFERENCES srv_garantias_objeto(id),
  ADD COLUMN contrato_linea_id uuid REFERENCES ven_contratos_lineas(id),
  ADD COLUMN plantilla_id uuid REFERENCES srv_plantillas(id),
  ADD COLUMN centro_costo_id uuid REFERENCES mae_unidades_negocio(id),
  ADD COLUMN caso_id uuid REFERENCES srv_casos(id),
  ADD COLUMN preventivo_id uuid REFERENCES ven_contratos_preventivos(id),
  ADD COLUMN fecha_preventivo date,
  ADD COLUMN factura_id uuid REFERENCES ven_facturas(id),
  ADD COLUMN asiento_cierre_id uuid REFERENCES con_asientos(id),
  ADD CONSTRAINT uq_srv_ordenes_preventivo UNIQUE (preventivo_id, fecha_preventivo);

ALTER TABLE srv_ordenes_actividades
  ADD COLUMN perfil_id uuid REFERENCES srv_perfiles(id),
  ADD COLUMN articulo_id uuid REFERENCES mae_articulos(id),
  ADD COLUMN personas smallint NOT NULL DEFAULT 1,
  ADD COLUMN precio_cerrado numeric(18,6),
  ADD COLUMN facturable boolean NOT NULL DEFAULT true;

ALTER TABLE srv_ordenes_consumos
  ADD COLUMN cantidad_prevista numeric(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN reversado boolean NOT NULL DEFAULT false,
  ADD COLUMN asiento_id uuid REFERENCES con_asientos(id);
COMMENT ON COLUMN srv_ordenes_consumos.cantidad IS 'Cantidad consumida real; cero mientras solo está prevista';

CREATE TABLE srv_ordenes_horas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  orden_id uuid NOT NULL REFERENCES srv_ordenes(id),
  actividad_id uuid NOT NULL REFERENCES srv_ordenes_actividades(id),
  recurso_id uuid NOT NULL REFERENCES srv_recursos(id),
  fecha date NOT NULL,
  inicio timestamptz,
  fin timestamptz,
  horas numeric(18,4) NOT NULL,
  costo_hora numeric(18,6) NOT NULL DEFAULT 0,
  costo_total numeric(18,2) NOT NULL DEFAULT 0,
  asiento_id uuid REFERENCES con_asientos(id),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128), modificado_en timestamptz, programa varchar(100),
  CONSTRAINT ck_srv_ordenes_horas_1 CHECK (horas > 0),
  CONSTRAINT ck_srv_ordenes_horas_2 CHECK (fin IS NULL OR inicio IS NULL OR fin > inicio)
);
COMMENT ON TABLE srv_ordenes_horas IS 'Horas reales registradas por recurso en una actividad';
CREATE INDEX ix_srv_ordenes_horas_orden ON srv_ordenes_horas (orden_id);
SELECT erp.fn_tabla_estandar('srv_ordenes_horas');

CREATE TABLE srv_ordenes_terceros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  orden_id uuid NOT NULL REFERENCES srv_ordenes(id),
  linea integer NOT NULL,
  descripcion varchar(200) NOT NULL,
  proveedor_id uuid REFERENCES mae_direcciones(id),
  articulo_id uuid REFERENCES mae_articulos(id),
  costo numeric(18,2) NOT NULL,
  precio numeric(18,6),
  facturable boolean NOT NULL DEFAULT true,
  compra_factura_id uuid REFERENCES com_facturas(id),
  asiento_id uuid REFERENCES con_asientos(id),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128), modificado_en timestamptz, programa varchar(100),
  CONSTRAINT uq_srv_ordenes_terceros_1 UNIQUE (orden_id, linea)
);
COMMENT ON TABLE srv_ordenes_terceros IS 'Servicios de terceros usados en una orden';
SELECT erp.fn_tabla_estandar('srv_ordenes_terceros');

ALTER TABLE ven_facturas_lineas
  ADD COLUMN orden_servicio_id uuid REFERENCES srv_ordenes(id),
  ADD COLUMN actividad_id uuid REFERENCES srv_ordenes_actividades(id),
  ADD COLUMN tercero_id uuid REFERENCES srv_ordenes_terceros(id);

-- ---------------------------------------------------------------------------
-- Reclamos de garantía al fabricante o proveedor
CREATE TABLE srv_reclamos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscriptor_id uuid NOT NULL DEFAULT erp.fn_suscriptor_actual() REFERENCES sis_suscriptores(id),
  compania_id uuid NOT NULL REFERENCES mae_companias(id),
  numero bigint NOT NULL,
  orden_id uuid NOT NULL REFERENCES srv_ordenes(id),
  proveedor_id uuid NOT NULL REFERENCES mae_direcciones(id),
  fecha date NOT NULL,
  monto_reclamado numeric(18,2) NOT NULL,
  monto_aprobado numeric(18,2),
  estado varchar(20) NOT NULL DEFAULT 'BORRADOR'
    CHECK (estado IN ('BORRADOR','ENVIADO','APROBADO','RECHAZADO','CERRADO')),
  referencia_proveedor varchar(100),
  observacion varchar(1000),
  asiento_id uuid REFERENCES con_asientos(id),
  creado_por varchar(128) NOT NULL DEFAULT coalesce(nullif(current_setting('app.usuario', true), ''), current_user),
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por varchar(128), modificado_en timestamptz, programa varchar(100),
  CONSTRAINT uq_srv_reclamos_1 UNIQUE (compania_id, numero),
  CONSTRAINT ck_srv_reclamos_1 CHECK (monto_aprobado IS NULL OR monto_aprobado <= monto_reclamado)
);
COMMENT ON TABLE srv_reclamos IS 'Reclamo de garantía al fabricante o proveedor por el costo de una orden';
SELECT erp.fn_tabla_estandar('srv_reclamos');
