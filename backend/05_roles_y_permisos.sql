DROP ROLE IF EXISTS rol_veterinario;
DROP ROLE IF EXISTS rol_recepcion;
DROP ROLE IF EXISTS rol_admin;

DROP USER IF EXISTS dr_lopez;
DROP USER IF EXISTS dra_garcia;
DROP USER IF EXISTS dr_mendez;
DROP USER IF EXISTS recepcion1;
DROP USER IF EXISTS admin_vet;


CREATE ROLE rol_veterinario;
CREATE ROLE rol_recepcion;
CREATE ROLE rol_admin;


CREATE USER dr_lopez   WITH PASSWORD 'lopez123'  IN ROLE rol_veterinario;
CREATE USER dra_garcia WITH PASSWORD 'garcia123' IN ROLE rol_veterinario;
CREATE USER dr_mendez  WITH PASSWORD 'mendez123' IN ROLE rol_veterinario;
CREATE USER recepcion1 WITH PASSWORD 'recep123'  IN ROLE rol_recepcion;
CREATE USER admin_vet  WITH PASSWORD 'admin123'  IN ROLE rol_admin;


GRANT SELECT, INSERT ON mascotas              TO rol_veterinario;
GRANT SELECT, INSERT ON citas                 TO rol_veterinario;
GRANT SELECT, INSERT ON vacunas_aplicadas     TO rol_veterinario;
GRANT SELECT         ON vet_atiende_mascota   TO rol_veterinario;
GRANT SELECT         ON inventario_vacunas    TO rol_veterinario;
GRANT SELECT         ON duenos                TO rol_veterinario;
GRANT SELECT         ON veterinarios          TO rol_veterinario;
GRANT SELECT         ON historial_movimientos TO rol_veterinario;
GRANT SELECT         ON v_resumen_mascotas_atencion TO rol_veterinario;
GRANT SELECT         ON v_historial_mascotas  TO rol_veterinario;


GRANT USAGE, SELECT ON SEQUENCE citas_id_seq                 TO rol_veterinario;
GRANT USAGE, SELECT ON SEQUENCE vacunas_aplicadas_id_seq     TO rol_veterinario;
GRANT USAGE, SELECT ON SEQUENCE historial_movimientos_id_seq TO rol_veterinario;
GRANT USAGE, SELECT ON SEQUENCE alertas_id_seq               TO rol_veterinario;


GRANT SELECT         ON mascotas             TO rol_recepcion;
GRANT SELECT         ON duenos               TO rol_recepcion;
GRANT SELECT         ON veterinarios         TO rol_recepcion;
GRANT SELECT, INSERT ON citas                TO rol_recepcion;
GRANT SELECT         ON v_resumen_mascotas_atencion TO rol_recepcion;


GRANT USAGE, SELECT ON SEQUENCE citas_id_seq TO rol_recepcion;


GRANT ALL ON ALL TABLES    IN SCHEMA public TO rol_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO rol_admin;