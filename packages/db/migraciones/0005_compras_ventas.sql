-- Ciclos de compras al pago y de ventas al cobro.
-- Ver docs/especificaciones/com-compras-al-pago.md y docs/especificaciones/ven-ventas-al-cobro.md

SET search_path TO erp;

-- Fases nuevas para los flujos por línea de compras y ventas.
ALTER TABLE sis_flujos_estado DROP CONSTRAINT IF EXISTS sis_flujos_estado_fase_check;
ALTER TABLE sis_flujos_estado ADD CONSTRAINT ck_sis_flujos_estado_fase
  CHECK (fase IN ('REGISTRADA','PROGRAMADA','EJECUCION','TERMINADA','REVISADA','FACTURADA','CERRADA','CANCELADA',
                  'APROBACION','APROBADA','RECIBIDA','RETENIDA','DESPACHADA'));

-- Compras
ALTER TABLE com_ordenes ADD COLUMN observacion varchar(500);
COMMENT ON COLUMN com_ordenes.observacion IS 'Observación';

ALTER TABLE com_facturas
  ADD COLUMN numero bigint,
  ADD COLUMN condicion_pago_id uuid REFERENCES mae_condiciones_pago(id),
  ADD COLUMN retenciones numeric(18,2) NOT NULL DEFAULT 0;
COMMENT ON COLUMN com_facturas.numero IS 'Número interno de registro';
COMMENT ON COLUMN com_facturas.condicion_pago_id IS 'Condición de pago';
COMMENT ON COLUMN com_facturas.retenciones IS 'Total retenido al proveedor';
CREATE INDEX ix_com_facturas_condicion_pago_id ON com_facturas (condicion_pago_id);

ALTER TABLE com_facturas_lineas
  ADD COLUMN articulo_id uuid REFERENCES mae_articulos(id),
  ADD COLUMN unidad_negocio_id uuid REFERENCES mae_unidades_negocio(id),
  ADD COLUMN ret_renta_id uuid REFERENCES ec_codigos_retencion(id),
  ADD COLUMN ret_iva_id uuid REFERENCES ec_codigos_retencion(id);
COMMENT ON COLUMN com_facturas_lineas.articulo_id IS 'Artículo o servicio';
COMMENT ON COLUMN com_facturas_lineas.unidad_negocio_id IS 'Centro de costo';
COMMENT ON COLUMN com_facturas_lineas.ret_renta_id IS 'Código de retención de renta';
COMMENT ON COLUMN com_facturas_lineas.ret_iva_id IS 'Código de retención de IVA';
CREATE INDEX ix_com_facturas_lineas_articulo_id ON com_facturas_lineas (articulo_id);
CREATE INDEX ix_com_facturas_lineas_ret_renta_id ON com_facturas_lineas (ret_renta_id);
CREATE INDEX ix_com_facturas_lineas_ret_iva_id ON com_facturas_lineas (ret_iva_id);

-- Ventas
ALTER TABLE ven_ordenes ADD COLUMN observacion varchar(500);
COMMENT ON COLUMN ven_ordenes.observacion IS 'Observación';

ALTER TABLE ven_ordenes_lineas ADD COLUMN cantidad_facturada numeric(18,4) NOT NULL DEFAULT 0;
COMMENT ON COLUMN ven_ordenes_lineas.cantidad_facturada IS 'Cantidad facturada';
COMMENT ON COLUMN ven_ordenes_lineas.costo_unitario IS 'Costo promedio de lo despachado';

ALTER TABLE ven_facturas_lineas ADD COLUMN cantidad_devuelta numeric(18,4) NOT NULL DEFAULT 0;
COMMENT ON COLUMN ven_facturas_lineas.cantidad_devuelta IS 'Cantidad ya devuelta con notas de crédito';

-- La nota de crédito también cancela cuotas por cobrar.
ALTER TABLE cxc_aplicaciones ADD COLUMN nota_credito_id uuid REFERENCES ven_facturas(id);
COMMENT ON COLUMN cxc_aplicaciones.nota_credito_id IS 'Nota de crédito aplicada';
CREATE INDEX ix_cxc_aplicaciones_nota_credito_id ON cxc_aplicaciones (nota_credito_id);
ALTER TABLE cxc_aplicaciones DROP CONSTRAINT ck_cxc_aplicaciones_1;
ALTER TABLE cxc_aplicaciones ADD CONSTRAINT ck_cxc_aplicaciones_1
  CHECK (num_nonnulls(cobro_id, retencion_id, nota_credito_id) = 1);

-- Retenciones
ALTER TABLE ec_retenciones ADD COLUMN autorizacion varchar(49);
COMMENT ON COLUMN ec_retenciones.autorizacion IS 'Clave de acceso o autorización';
