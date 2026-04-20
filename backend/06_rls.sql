ALTER TABLE mascotas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE citas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacunas_aplicadas ENABLE ROW LEVEL SECURITY;

ALTER TABLE mascotas          FORCE ROW LEVEL SECURITY;
ALTER TABLE citas             FORCE ROW LEVEL SECURITY;
ALTER TABLE vacunas_aplicadas FORCE ROW LEVEL SECURITY;

-- MASCOTAS
CREATE POLICY pol_mascotas_vet
ON mascotas FOR SELECT TO rol_veterinario
USING (
    id IN (
        SELECT mascota_id FROM vet_atiende_mascota
        WHERE vet_id = NULLIF(current_setting('app.vet_id', true), '')::INT
    )
);

CREATE POLICY pol_mascotas_vet_insert
ON mascotas FOR INSERT TO rol_veterinario
WITH CHECK (true);

CREATE POLICY pol_mascotas_recepcion
ON mascotas FOR SELECT TO rol_recepcion
USING (true);

CREATE POLICY pol_mascotas_admin
ON mascotas FOR ALL TO rol_admin
USING (true) WITH CHECK (true);

-- CITAS
CREATE POLICY pol_citas_vet
ON citas FOR SELECT TO rol_veterinario
USING (
    veterinario_id = NULLIF(current_setting('app.vet_id', true), '')::INT
);

CREATE POLICY pol_citas_vet_insert
ON citas FOR INSERT TO rol_veterinario
WITH CHECK (
    veterinario_id = NULLIF(current_setting('app.vet_id', true), '')::INT
);

CREATE POLICY pol_citas_recepcion
ON citas FOR SELECT TO rol_recepcion
USING (true);

CREATE POLICY pol_citas_recepcion_insert
ON citas FOR INSERT TO rol_recepcion
WITH CHECK (true);

CREATE POLICY pol_citas_admin
ON citas FOR ALL TO rol_admin
USING (true) WITH CHECK (true);

-- VACUNAS APLICADAS
CREATE POLICY pol_vacunas_vet
ON vacunas_aplicadas FOR SELECT TO rol_veterinario
USING (
    mascota_id IN (
        SELECT mascota_id FROM vet_atiende_mascota
        WHERE vet_id = NULLIF(current_setting('app.vet_id', true), '')::INT
    )
);

CREATE POLICY pol_vacunas_vet_insert
ON vacunas_aplicadas FOR INSERT TO rol_veterinario
WITH CHECK (
    mascota_id IN (
        SELECT mascota_id FROM vet_atiende_mascota
        WHERE vet_id = NULLIF(current_setting('app.vet_id', true), '')::INT
    )
);

CREATE POLICY pol_vacunas_admin
ON vacunas_aplicadas FOR ALL TO rol_admin
USING (true) WITH CHECK (true);