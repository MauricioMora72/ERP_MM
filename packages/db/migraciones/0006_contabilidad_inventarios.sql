-- Contabilidad general (asientos manuales, reversa, cierre, bancos) y complemento de inventarios
-- (transferencias, conteo físico, lotes). Ver docs/especificaciones/con-contabilidad-general.md
-- y docs/especificaciones/inv-inventarios-complemento.md

SET search_path TO erp;

COMMENT ON COLUMN con_asientos.estado IS 'CONTABILIZADO o REVERSADO';

ALTER TABLE inv_documentos ADD COLUMN estado varchar(20) NOT NULL DEFAULT 'CONTABILIZADO';
COMMENT ON COLUMN inv_documentos.estado IS 'ABIERTO mientras se cuenta; CONTABILIZADO cuando ya movió el kardex';

ALTER TABLE inv_documentos_lineas
  ADD COLUMN cantidad_sistema numeric(18,4),
  ADD COLUMN cantidad_contada numeric(18,4);
COMMENT ON COLUMN inv_documentos_lineas.cantidad_sistema IS 'Existencia al crear el conteo físico';
COMMENT ON COLUMN inv_documentos_lineas.cantidad_contada IS 'Cantidad contada en el conteo físico';

CREATE INDEX IF NOT EXISTS ix_con_asientos_lineas_cuenta_id ON con_asientos_lineas (cuenta_id);
CREATE INDEX IF NOT EXISTS ix_con_asientos_fecha ON con_asientos (compania_id, fecha);
CREATE INDEX IF NOT EXISTS ix_inv_kardex_articulo_fecha ON inv_kardex (articulo_id, unidad_negocio_id, fecha);
CREATE INDEX IF NOT EXISTS ix_inv_kardex_origen ON inv_kardex (origen_linea_id);
