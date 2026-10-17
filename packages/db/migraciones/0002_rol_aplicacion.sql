-- Rol de la aplicación y funciones de soporte para la seguridad por suscriptor.
-- La aplicación se conecta como erp_app, que no es dueño de las tablas: la seguridad a nivel de fila siempre aplica.
-- La contraseña de erp_app la fija el migrador desde la variable APP_DB_PASSWORD; nunca se escribe aquí.

SET search_path TO erp;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    CREATE ROLE erp_app NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA erp TO erp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA erp TO erp_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA erp TO erp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA erp GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO erp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA erp GRANT EXECUTE ON FUNCTIONS TO erp_app;

-- El kardex es inmutable: la aplicación solo puede insertar y leer.
REVOKE UPDATE, DELETE ON inv_kardex FROM erp_app;

-- sis_suscriptores no tiene suscriptor_id; se protege por su propio id.
-- Se permite insertar (alta de un cliente nuevo) pero solo se ve el suscriptor de la sesión.
ALTER TABLE sis_suscriptores ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_sis_suscriptores_ver ON sis_suscriptores FOR SELECT USING (id = erp.fn_suscriptor_actual());
CREATE POLICY pl_sis_suscriptores_modificar ON sis_suscriptores FOR UPDATE
  USING (id = erp.fn_suscriptor_actual()) WITH CHECK (id = erp.fn_suscriptor_actual());
CREATE POLICY pl_sis_suscriptores_alta ON sis_suscriptores FOR INSERT WITH CHECK (true);

-- Resuelve el usuario a partir de su identificador de autenticación, antes de conocer el suscriptor.
-- Es SECURITY DEFINER porque la seguridad por fila todavía no sabe a qué suscriptor pertenece.
CREATE OR REPLACE FUNCTION erp.fn_resolver_usuario(p_uid varchar)
RETURNS TABLE (usuario_id uuid, suscriptor_id uuid, nombre varchar, correo varchar, activo boolean,
               compania_defecto_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = erp AS $$
  SELECT u.id, u.suscriptor_id, u.nombre, u.correo, u.activo AND s.activo, u.compania_defecto_id
  FROM sis_usuarios u JOIN sis_suscriptores s ON s.id = u.suscriptor_id
  WHERE u.firebase_uid = p_uid
$$;
REVOKE ALL ON FUNCTION erp.fn_resolver_usuario(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.fn_resolver_usuario(varchar) TO erp_app;
