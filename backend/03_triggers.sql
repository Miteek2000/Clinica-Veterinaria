CREATE OR REPLACE FUNCTION fn_trg_historial_cita()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO historial_movimientos (tipo, referencia_id, descripcion, fecha) 
    VALUES (
        'CITA_AGENDADA',
        NEW.id,
        FORMAT(
            'Cita agendada para mascota_id=%s, con veterinario_id=%s, para el %s. Motivo: %s',
            NEW.mascota_id,
            NEW.veterinario_id,
            NEW.fecha_hora,
            COALESCE(NEW.motivo, 'Sin motivo')
        ),
        NOW()
    );
    RETURN NEW;
END;
$$;


CREATE OR REPLACE TRIGGER trg_historial_cita
AFTER INSERT ON citas
FOR EACH ROW EXECUTE FUNCTION fn_trg_historial_cita();

CREATE OR REPLACE FUNCTION fn_trg_alerta_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stock_actual INT;
    v_stock_minimo INT;
    v_nombre_vacuna TEXT;
BEGIN
    UPDATE inventario_vacunas
    SET stock_actual = stock_actual - 1
    WHERE id = NEW.vacuna_id
    RETURNING stock_actual, stock_minimo, nombre 
    INTO v_stock_actual, v_stock_minimo, v_nombre_vacuna;

    IF v_stock_actual <= v_stock_minimo THEN
        INSERT INTO alertas (tipo, descripcion, fecha)
        VALUES (
            'STOCK_BAJO',
            FORMAT(
                'Vacuna %s con stock bajo: %s unidades existente (el stock mínimo es %s)', 
                v_nombre_vacuna, v_stock_actual, v_stock_minimo),
            NOW()
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_alerta_stock
AFTER INSERT ON vacunas_aplicadas
FOR EACH ROW EXECUTE FUNCTION fn_trg_alerta_stock();
