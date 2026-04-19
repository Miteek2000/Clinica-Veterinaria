CREATE oR REPLACE PROCEDURE sp_agendar_cita(
    p_mascota_id INT,
    P_veterinario_id INT,
    p_fecha_hora TIMESTAMP,
    p_motivo TEXT,
    OUT p_cita_id INT
)

LANGUAGE plpgsql AS $$
DECLARE 
    v_activo BOOLEAN;
    V_conflicto INT; 
BEGIN
    
    SELECT activo INTO v_activo 
    FROM veterinarios
    WHERE id = p_veterinario_id;

    IF v_activo IS NULL THEN 
        RAISE EXCEPTION 'Veterinario con id% no existe', p_veterinario_id;
    END IF;

    IF NOT v_activo THEN
        RAISE EXCEPTION 'Veterinario con id% no esta activo', p_veterinario_id;
    END IF;



    SELECT COUNT(*) INTO V_conflicto
    FROM citas
    WHERE veterinario_id = p_veterinario_id
    AND estado = 'AGENDADA'
    AND ABS(EXTRACT(EPOCH FROM (fecha_hora - p_fecha_hora))) < 18000;
    
    IF v_conflicto > 0 THEN
        RAISE EXCEPTION 'El veterinario ya tiene una cita agendada en ese horario';
    END IF;


    INSERT INTO citas (mascota_id, veterinario_id, fecha_hora, motivo, estado)
    VALUES (p_mascota_id, p_veterinario_id, p_fecha_hora, p_motivo, 'AGENDADA')
    RETURNING id INTO p_cita_id;

EXCEPTION 
    WHEN OTHERS THEN
        RAISE;
END;
$$;