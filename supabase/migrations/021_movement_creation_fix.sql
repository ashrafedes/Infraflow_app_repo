-- ============================================================================
-- INFRAFLOW — Fix Movement Creation for All Company Members
-- Migration 021
-- ============================================================================
--
-- Previously, warehouse_man (and other non-admin roles) could not create
-- movements unless they had user_scope_assignments for the source/destination
-- warehouses or work orders. If they had no scopes, every movement creation
-- failed with "You do not have scope access to the source warehouse".
--
-- Now: ALL company members can create movements for any warehouse/work order
-- in their company. Scope assignments are for UI filtering, not RLS restriction.
-- ============================================================================

-- 1. WAREHOUSES — all company members can see all warehouses
DROP POLICY IF EXISTS warehouses_select ON warehouses;
CREATE POLICY warehouses_select ON warehouses
    FOR SELECT USING (company_id = public.company_id());

-- 2. MATERIAL_MOVEMENTS — all company members can see all movements
DROP POLICY IF EXISTS movements_select ON material_movements;
CREATE POLICY movements_select ON material_movements
    FOR SELECT USING (company_id = public.company_id());

-- 3. MATERIAL_MOVEMENTS — all company members can insert movements
DROP POLICY IF EXISTS movements_insert ON material_movements;
CREATE POLICY movements_insert ON material_movements
    FOR INSERT WITH CHECK (company_id = public.company_id());

-- 4. MATERIAL_MOVEMENTS — all company members can update movements
DROP POLICY IF EXISTS movements_update ON material_movements;
CREATE POLICY movements_update ON material_movements
    FOR UPDATE USING (company_id = public.company_id());

-- 5. MATERIAL_MOVEMENTS — all company members can delete movements
DROP POLICY IF EXISTS movements_delete ON material_movements;
CREATE POLICY movements_delete ON material_movements
    FOR DELETE USING (company_id = public.company_id());

-- 6. MATERIAL_MOVEMENT_LINES — all company members can update/delete lines
DROP POLICY IF EXISTS movement_lines_update ON material_movement_lines;
CREATE POLICY movement_lines_update ON material_movement_lines
    FOR UPDATE USING (company_id = public.company_id());

DROP POLICY IF EXISTS movement_lines_delete ON material_movement_lines;
CREATE POLICY movement_lines_delete ON material_movement_lines
    FOR DELETE USING (company_id = public.company_id());

-- 7. Update the create_movement_with_lines RPC to remove scope checks
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
    -- 4. MOVEMENT TYPE VALIDITY
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
    -- 6. LINES VALIDATION
    -- ========================================================================
    v_line_count := jsonb_array_length(p_lines);
    IF v_line_count IS NULL OR v_line_count = 0 THEN
        RAISE EXCEPTION 'At least one movement line is required';
    END IF;

    -- ========================================================================
    -- 7. INSERT MOVEMENT HEADER
    -- ========================================================================
    INSERT INTO material_movements (
        company_id, movement_date, movement_type,
        supplier_id, source_warehouse_id, source_work_order_id,
        destination_warehouse_id, destination_work_order_id,
        contractor_id, adjustment_type, adjustment_reason, notes
    ) VALUES (
        v_company_id, v_movement_date, v_movement_type,
        v_supplier_id, v_source_warehouse_id, v_source_work_order_id,
        v_destination_warehouse_id, v_destination_work_order_id,
        v_contractor_id, v_adjustment_type, v_adjustment_reason, v_notes
    )
    RETURNING id INTO v_movement_id;

    -- ========================================================================
    -- 8. INSERT MOVEMENT LINES
    -- ========================================================================
    v_idx := 0;
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_line_material_id := NULLIF(v_line.value->>'material_id', '')::UUID;
        v_line_quantity    := (v_line.value->>'quantity')::NUMERIC;
        v_line_notes       := NULLIF(v_line.value->>'notes', '');

        IF v_line_material_id IS NULL THEN
            RAISE EXCEPTION 'Line % has no material_id', v_idx;
        END IF;
        IF v_line_quantity IS NULL OR v_line_quantity <= 0 THEN
            RAISE EXCEPTION 'Line % has invalid quantity', v_idx;
        END IF;

        -- Verify material belongs to company
        IF NOT EXISTS (
            SELECT 1 FROM materials WHERE id = v_line_material_id AND company_id = v_company_id
        ) THEN
            RAISE EXCEPTION 'Material in line % does not belong to your company', v_idx;
        END IF;

        INSERT INTO material_movement_lines (
            movement_id, company_id, material_id, quantity, notes
        ) VALUES (
            v_movement_id, v_company_id, v_line_material_id, v_line_quantity, v_line_notes
        );

        v_idx := v_idx + 1;
    END LOOP;

    RETURN v_movement_id;
END;
$$;
