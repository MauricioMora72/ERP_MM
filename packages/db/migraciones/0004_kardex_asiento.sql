-- El kardex es inmutable para la aplicación. La única excepción controlada es ligar el asiento
-- contable que generó un movimiento, y solo si todavía no tiene uno.
SET search_path TO erp;

CREATE OR REPLACE FUNCTION erp.fn_kardex_ligar_asiento(p_kardex uuid, p_asiento uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = erp AS $$
BEGIN
  UPDATE inv_kardex SET asiento_id = p_asiento
  WHERE id = p_kardex AND asiento_id IS NULL AND suscriptor_id = erp.fn_suscriptor_actual();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo ligar el asiento al movimiento de kardex';
  END IF;
END $$;
REVOKE ALL ON FUNCTION erp.fn_kardex_ligar_asiento(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.fn_kardex_ligar_asiento(uuid, uuid) TO erp_app;
