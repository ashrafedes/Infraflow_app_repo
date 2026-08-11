-- ============================================================================
-- INFRAFLOW — Atomic Movement Creation RPC
-- Migration 016: create_movement_with_lines (SECURITY DEFINER, hardened)
-- ============================================================================
--
-- This RPC creates a material movement header + all its lines in a single
-- PostgreSQL transaction. It exists to prevent the orphan-header bug that
-- the previous two-insert client flow had (header inserted, then lines;
-- if lines failed, an orphan header remained).
--
-- SECURITY MODEL:
--   This function is SECURITY DEFINER. RLS is BYPASSED for the tables it
--   touches (material_movements, material_movement_lines, and the reference
--   tables it reads). The function therefore enforces ALL tenant,
--   authorization, and inventory boundaries EXPLICITLY inside the body.
--   Do NOT rely on RLS inside this function.
--
--   Invariant enforced:
--     AUTHENTICATED USER
--     → COMPANY (derived server-side)
--     → AUTHORIZED ROLE/SCOPE
--     → VALID MOVEMENT TYPE + SOURCE/DEST COMBINATION
--     → SAME-COMPANY ENTITIES
--     → VALID QUANTITIES
--     → ATOMIC STOCK CHECKS
--     → SINGLE TRANSACTION COMMIT
--
--   Nothing supplied by the frontend is trusted for tenant identity,
--   user identity, movement numbering, authorization, or inventory authority.
--
-- DEFENSE IN DEPTH:
--   The existing per-row triggers still fire on the RPC's INSERTs:
--     - set_responsible_user()      → forces responsible_user_id = auth.uid()
--     - auto_generate_movement_number() → generates MOV-NNNNNN
--     - set_line_company_id()       → forces line company_id from header
--     - validate_movement_line()    → stock availability per line
--   The function's own checks are ADDITIVE and run BEFORE the triggers,
--   providing defense in depth. A client calling the RPC directly cannot
--   bypass validation because both the function checks AND the triggers run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_movement_with_lines(
    p_header jsonb,
    p_lines  jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id            UUID;
    v_company_id         UUID;
    v_role               TEXT;
    v_movement_id        UUID;
    v_movement_type      TEXT;
    v_movement_date      DATE;
    v_supplier_id        UUID;
    v_source_warehouse_id    UUID;
    v_source_work_order_id   UUID;
    v_destination_warehouse_id UUID;
    v_destination_work_order_id UUID;
    v_contractor_id      UUID;
    v_adjustment_type    TEXT;
    v_adjustment_reason  TEXT;
    v_notes              TEXT;
    v_line               RECORD;
    v_line_material_id   UUID;
    v_line_quantity      NUMERIC;
    v_line_notes         TEXT;
    v_available          NUMERIC;
    v_line_count         INTEGER;
    v_idx                INTEGER;
BEGIN
    -- ========================================================================
    -- 1. AUTHENTICATION
    -- ========================================================================
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- ========================================================================
    -- 2. COMPANY + ROLE DERIVATION (server-side, never from client)
    -- ========================================================================
    SELECT company_id, role INTO v_company_id, v_role
    FROM user_profiles
    WHERE id = v_user_id;

    IF NOT FOUND OR v_company_id IS NULL THEN
        RAISE EXCEPTION 'Authenticated user has no company profile';
    END IF;

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Authenticated user has no role';
    END IF;

    -- ========================================================================
    -- 3. EXTRACT HEADER FIELDS (ignore client-supplied identity fields)
    --    company_id, responsible_user_id, movement_number are NEVER taken
    --    from p_header. They are derived/generated server-side.
    -- ========================================================================
    v_movement_type   := p_header->>'movement_type';
    v_movement_date   := COALESCE((p_header->>'movement_date')::DATE, CURRENT_DATE);
    v_supplier_id     := NULLIF(p_header->>'supplier_id', '')::UUID;
    v_source_warehouse_id    := NULLIF(p_header->>'source_warehouse_id', '')::UUID;
    v_source_work_order_id   := NULLIF(p_header->>'source_work_order_id', '')::UUID;
    v_destination_warehouse_id   := NULLIF(p_header->>'destination_warehouse_id', '')::UUID;
    v_destination_work_order_id  := NULLIF(p_header->>'destination_work_order_id', '')::UUID;
    v_contractor_id   := NULLIF(p_header->>'contractor_id', '')::UUID;
    v_adjustment_type := NULLIF(p_header->>'adjustment_type', '');
    v_adjustment_reason := NULLIF(p_header->>'adjustment_reason', '');
    v_notes           := NULLIF(p_header->>'notes', '');

    -- Validate movement_type
    IF v_movement_type NOT IN ('RECEIPT','ISSUE','USAGE','TRANSFER','RETURN','ADJUSTMENT') THEN
        RAISE EXCEPTION 'Invalid movement_type: %', v_movement_type;
    END IF;

    -- ========================================================================
    -- 4. MOVEMENT TYPE VALIDITY (server-side, mirrors chk_movement_type_validity)
    -- ========================================================================
    IF v_movement_type = 'RECEIPT' THEN
        IF NOT (v_supplier_id IS NOT NULL
                AND v_destination_warehouse_id IS NOT NULL
                AND v_source_warehouse_id IS NULL
                AND v_source_work_order_id IS NULL
                AND v_destination_work_order_id IS NULL
                AND v_contractor_id IS NULL
                AND v_adjustment_type IS NULL
                AND v_adjustment_reason IS NULL) THEN
            RAISE EXCEPTION 'RECEIPT requires supplier + destination warehouse only';
        END IF;
    ELSIF v_movement_type = 'ISSUE' THEN
        IF NOT (v_source_warehouse_id IS NOT NULL
                AND v_destination_work_order_id IS NOT NULL
                AND v_supplier_id IS NULL
                AND v_source_work_order_id IS NULL
                AND v_destination_warehouse_id IS NULL
                AND v_contractor_id IS NULL
                AND v_adjustment_type IS NULL
                AND v_adjustment_reason IS NULL) THEN
            RAISE EXCEPTION 'ISSUE requires source warehouse + destination work order only';
        END IF;
    ELSIF v_movement_type = 'USAGE' THEN
        IF NOT (v_source_work_order_id IS NOT NULL
                AND v_supplier_id IS NULL
                AND v_source_warehouse_id IS NULL
                AND v_destination_warehouse_id IS NULL
                AND v_destination_work_order_id IS NULL
                AND v_contractor_id IS NULL
                AND v_adjustment_type IS NULL
                AND v_adjustment_reason IS NULL) THEN
            RAISE EXCEPTION 'USAGE requires source work order only';
        END IF;
    ELSIF v_movement_type = 'TRANSFER' THEN
        IF NOT (v_supplier_id IS NULL
                AND v_adjustment_type IS NULL
                AND v_adjustment_reason IS NULL
                AND (
                    (v_source_warehouse_id IS NOT NULL AND v_destination_warehouse_id IS NOT NULL
                     AND v_source_work_order_id IS NULL AND v_destination_work_order_id IS NULL
                     AND v_contractor_id IS NULL)
                    OR (v_source_work_order_id IS NOT NULL AND v_destination_work_order_id IS NOT NULL
                        AND v_source_warehouse_id IS NULL AND v_destination_warehouse_id IS NULL
                        AND v_contractor_id IS NULL)
                    OR (v_source_work_order_id IS NOT NULL AND v_contractor_id IS NOT NULL
                        AND v_source_warehouse_id IS NULL AND v_destination_warehouse_id IS NULL
                        AND v_destination_work_order_id IS NULL)
                )) THEN
            RAISE EXCEPTION 'TRANSFER requires a valid source→destination combination';
        END IF;
    ELSIF v_movement_type = 'RETURN' THEN
        IF NOT (v_destination_warehouse_id IS NOT NULL
                AND v_supplier_id IS NULL
                AND v_source_warehouse_id IS NULL
                AND v_destination_work_order_id IS NULL
                AND v_adjustment_type IS NULL
                AND v_adjustment_reason IS NULL
                AND (
                    (v_source_work_order_id IS NOT NULL AND v_contractor_id IS NULL)
                    OR (v_source_work_order_id IS NULL AND v_contractor_id IS NOT NULL)
                )) THEN
            RAISE EXCEPTION 'RETURN requires destination warehouse + (source work order OR contractor)';
        END IF;
    ELSIF v_movement_type = 'ADJUSTMENT' THEN
        IF NOT (v_source_warehouse_id IS NOT NULL
                AND v_adjustment_type IN ('increase','decrease')
                AND v_adjustment_reason IS NOT NULL
                AND v_supplier_id IS NULL
                AND v_source_work_order_id IS NULL
                AND v_destination_warehouse_id IS NULL
                AND v_destination_work_order_id IS NULL
                AND v_contractor_id IS NULL) THEN
            RAISE EXCEPTION 'ADJUSTMENT requires warehouse + adjustment_type + reason';
        END IF;
    END IF;

    -- ========================================================================
    -- 5. SAME-COMPANY ENTITY VALIDATION
    --    Every referenced entity must belong to the caller's company.
    --    This prevents cross-company references via API manipulation.
    -- ========================================================================
    IF v_supplier_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM suppliers WHERE id = v_supplier_id AND company_id = v_company_id
    ) THEN
        RAISE EXCEPTION 'Supplier does not belong to your company';
    END IF;

    IF v_source_warehouse_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM warehouses WHERE id = v_source_warehouse_id AND company_id = v_company_id
    ) THEN
        RAISE EXCEPTION 'Source warehouse does not belong to your company';
    END IF;

    IF v_destination_warehouse_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM warehouses WHERE id = v_destination_warehouse_id AND company_id = v_company_id
    ) THEN
        RAISE EXCEPTION 'Destination warehouse does not belong to your company';
    END IF;

    IF v_source_work_order_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM work_orders WHERE id = v_source_work_order_id AND company_id = v_company_id
    ) THEN
        RAISE EXCEPTION 'Source work order does not belong to your company';
    END IF;

    IF v_destination_work_order_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM work_orders WHERE id = v_destination_work_order_id AND company_id = v_company_id
    ) THEN
        RAISE EXCEPTION 'Destination work order does not belong to your company';
    END IF;

    IF v_contractor_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM contractors WHERE id = v_contractor_id AND company_id = v_company_id
    ) THEN
        RAISE EXCEPTION 'Contractor does not belong to your company';
    END IF;

    -- ========================================================================
    -- 6. ROLE/SCOPE AUTHORIZATION
    --    company_admin: may create any movement within own company.
    --    Other roles: must have a scope assignment covering the source entity
    --    (warehouse or work order) they are moving material FROM.
    --    This prevents, e.g., a warehouse_man assigned to Warehouse A from
    --    creating an ISSUE from Warehouse B.
    -- ========================================================================
    IF v_role <> 'company_admin' THEN
        -- For ISSUE/TRANSFER(wh→wh)/RETURN/ADJUSTMENT: source is a warehouse
        IF v_source_warehouse_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM user_scope_assignments
                WHERE user_id = v_user_id
                  AND company_id = v_company_id
                  AND warehouse_id = v_source_warehouse_id
            ) THEN
                RAISE EXCEPTION 'You do not have scope access to the source warehouse';
            END IF;
        END IF;

        -- For USAGE/TRANSFER(wo→*)/RETURN(wo→wh): source is a work order
        IF v_source_work_order_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM user_scope_assignments
                WHERE user_id = v_user_id
                  AND company_id = v_company_id
                  AND work_order_id = v_source_work_order_id
            ) THEN
                RAISE EXCEPTION 'You do not have scope access to the source work order';
            END IF;
        END IF;

        -- For RECEIPT: no source entity, but require scope on destination warehouse
        IF v_movement_type = 'RECEIPT' AND v_destination_warehouse_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM user_scope_assignments
                WHERE user_id = v_user_id
                  AND company_id = v_company_id
                  AND warehouse_id = v_destination_warehouse_id
            ) THEN
                RAISE EXCEPTION 'You do not have scope access to the destination warehouse';
            END IF;
        END IF;
    END IF;

    -- ========================================================================
    -- 7. LINES VALIDATION
    --    - At least one line
    --    - Each material belongs to caller's company (cross-company prevention)
    --    - Each quantity > 0 and numeric
    -- ========================================================================
    v_line_count := jsonb_array_length(p_lines);
    IF v_line_count IS NULL OR v_line_count = 0 THEN
        RAISE EXCEPTION 'At least one movement line is required';
    END IF;

    -- ========================================================================
    -- 8. INSERT MOVEMENT HEADER
    --    company_id, responsible_user_id, movement_number are set by triggers,
    --    but we also set company_id explicitly for the composite-FK constraints.
    --    responsible_user_id is set to auth.uid() by the trigger; we pass it
    --    here too so the NOT NULL constraint is satisfied before the trigger.
    -- ========================================================================
    INSERT INTO material_movements (
        company_id,
        movement_number,
        movement_date,
        movement_type,
        supplier_id,
        source_warehouse_id,
        source_work_order_id,
        destination_warehouse_id,
        destination_work_order_id,
        contractor_id,
        responsible_user_id,
        adjustment_type,
        adjustment_reason,
        notes
    ) VALUES (
        v_company_id,
        generate_movement_number(v_company_id),
        v_movement_date,
        v_movement_type,
        v_supplier_id,
        v_source_warehouse_id,
        v_source_work_order_id,
        v_destination_warehouse_id,
        v_destination_work_order_id,
        v_contractor_id,
        v_user_id,
        v_adjustment_type,
        v_adjustment_reason,
        v_notes
    )
    RETURNING id INTO v_movement_id;

    -- ========================================================================
    -- 9. INSERT + VALIDATE EACH LINE
    --    We validate same-company material and quantity > 0 here (additive),
    --    then INSERT. The validate_movement_line() trigger fires on INSERT
    --    and performs the atomic stock availability check for ISSUE/USAGE/
    --    TRANSFER/RETURN. If any line fails, the whole transaction rolls back.
    -- ========================================================================
    FOR v_idx IN 0..(v_line_count - 1) LOOP
        v_line_material_id := NULLIF(p_lines->v_idx->>'material_id', '')::UUID;
        v_line_quantity    := NULLIF(p_lines->v_idx->>'quantity', '')::NUMERIC;
        v_line_notes       := NULLIF(p_lines->v_idx->>'notes', '');

        -- Material must be provided
        IF v_line_material_id IS NULL THEN
            RAISE EXCEPTION 'Line % has no material_id', v_idx + 1;
        END IF;

        -- Quantity must be positive numeric
        IF v_line_quantity IS NULL OR v_line_quantity <= 0 THEN
            RAISE EXCEPTION 'Line % has invalid quantity (must be > 0)', v_idx + 1;
        END IF;

        -- Material must belong to caller's company (cross-company prevention)
        IF NOT EXISTS (
            SELECT 1 FROM materials
            WHERE id = v_line_material_id AND company_id = v_company_id
        ) THEN
            RAISE EXCEPTION 'Line % material does not belong to your company', v_idx + 1;
        END IF;

        -- Insert the line (validate_movement_line trigger fires here)
        INSERT INTO material_movement_lines (
            movement_id,
            company_id,
            material_id,
            quantity,
            notes
        ) VALUES (
            v_movement_id,
            v_company_id,
            v_line_material_id,
            v_line_quantity,
            v_line_notes
        );
    END LOOP;

    -- ========================================================================
    -- 10. SUCCESS — return the new movement id
    --     The whole transaction commits atomically when the function returns.
    -- ========================================================================
    RETURN v_movement_id;
END;
$$;

-- Grant execute to authenticated users only
GRANT EXECUTE ON FUNCTION public.create_movement_with_lines(jsonb, jsonb) TO authenticated;
