-- ============================================================================
-- Fix: get_warehouse_balance() used simple CASE with boolean expressions
-- which caused "invalid input syntax for type boolean: ADJUSTMENT" error
-- when called during ISSUE movements.
-- Fix: convert simple CASE to searched CASE for ADJUSTMENT clauses.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_warehouse_balance(
    p_company_id UUID,
    p_warehouse_id UUID,
    p_material_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_balance NUMERIC := 0;
BEGIN
    SELECT COALESCE(SUM(
        CASE
            -- Incoming to this warehouse
            WHEN m.destination_warehouse_id = p_warehouse_id THEN
                CASE
                    WHEN m.movement_type = 'RECEIPT'   THEN ml.quantity
                    WHEN m.movement_type = 'TRANSFER'  THEN ml.quantity
                    WHEN m.movement_type = 'RETURN'    THEN ml.quantity
                    WHEN m.movement_type = 'ADJUSTMENT' AND m.adjustment_type = 'increase' THEN ml.quantity
                    ELSE 0
                END
            -- Outgoing from this warehouse
            WHEN m.source_warehouse_id = p_warehouse_id THEN
                CASE
                    WHEN m.movement_type = 'ISSUE'     THEN -ml.quantity
                    WHEN m.movement_type = 'TRANSFER'  THEN -ml.quantity
                    WHEN m.movement_type = 'ADJUSTMENT' AND m.adjustment_type = 'decrease' THEN -ml.quantity
                    ELSE 0
                END
            ELSE 0
        END
    ), 0)
    INTO v_balance
    FROM material_movements m
    JOIN material_movement_lines ml ON ml.movement_id = m.id
    WHERE m.company_id = p_company_id
      AND (m.destination_warehouse_id = p_warehouse_id OR m.source_warehouse_id = p_warehouse_id)
      AND ml.material_id = p_material_id;

    RETURN v_balance;
END;
$$;
