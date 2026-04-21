CREATE OR REPLACE VIEW v_resumen_mascotas_atencion AS
SELECT 
    m.id AS mascota_id,
    m.nombre AS mascota,
    m.especie,
    m.nombre AS dueno,
    d.telefono AS telefono_dueno,
    v.nombre AS veterinario_asignado,
    c.fecha_hora AS proxima_cita,
    c.motivo AS motivo_cita,
    COUNT(va.id) AS total_vacunas_aplicadas,
    MAX(va.fecha_aplicacion) AS ultima_vacuna
FROM mascotas m
JOIN duenos d ON d.id = m.dueno_id
JOIN vet_atiende_mascota vam ON vam.mascota_id = m.id AND vam.activa = TRUE
JOIN veterinarios v ON v.id = vam.vet_id
LEFT JOIN citas c ON c.mascota_id = m.id AND c.estado = 'AGENDADA' AND c.fecha_hora BETWEEN NOW() AND NOW() + INTERVAL '7 days'
LEFT JOIN vacunas_aplicadas va ON va.mascota_id = m.id
GROUP BY m.id, m.nombre, m.especie, d.nombre, d.telefono, v.nombre, c.fecha_hora, c.motivo
ORDER BY c.fecha_hora ASC NULLS LAST;



CREATE OR REPLACE VIEW v_historial_mascotas AS
SELECT
    m.id AS mascota_id,
    m.nombre AS mascota,
    m.especie,
    d.nombre AS dueno,
    'CITA' AS tipo_evento,
    c.fecha_hora::DATE AS fecha,
    c.motivo AS descripcion,
    c.costo AS costo,
    ve.nombre AS veterinario
FROM mascotas m
JOIN duenos d ON d.id = m.dueno_id
JOIN citas c ON c.mascota_id = m.id
JOIN veterinarios ve ON ve.id = c.veterinario_id

UNION ALL

SELECT
    m.id,
    m.nombre,
    m.especie,
    d.nombre,
    'VACUNA' AS tipo_evento,
    va.fecha_aplicacion AS fecha,
    iv.nombre AS descripcion,
    va.costo_cobrado AS costo,
    ve.nombre AS veterinario
FROM mascotas m
JOIN duenos d ON d.id = m.dueno_id
JOIN vacunas_aplicadas va ON va.mascota_id = m.id
JOIN inventario_vacunas iv ON iv.id = va.vacuna_id
JOIN veterinarios ve ON ve.id = va.veterinario_id

ORDER BY mascota_id, fecha DESC;


CREATE OR REPLACE VIEW v_mascotas_vacunacion_pendiente AS
SELECT
    m.id AS mascota_id,
    m.nombre AS mascota,
    m.especie,
    d.nombre AS dueno,
    iv.nombre AS vacuna,
    va.fecha_aplicacion AS ultima_aplicacion,
    va.fecha_aplicacion + INTERVAL '1 year' AS proxima_aplicacion
FROM mascotas m
JOIN duenos d ON d.id = m.dueno_id
LEFT JOIN vacunas_aplicadas va ON va.mascota_id = m.id
LEFT JOIN inventario_vacunas iv ON iv.id = va.vacuna_id
WHERE
    va.fecha_aplicacion IS NULL
    OR va.fecha_aplicacion < NOW() - INTERVAL '11 months'
ORDER BY proxima_aplicacion ASC NULLS FIRST;