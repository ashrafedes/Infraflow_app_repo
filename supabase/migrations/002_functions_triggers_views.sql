-- ============================================================================
-- INFRAFLOW — Material Control & Work Order System
-- Migration 002: Functions, Triggers, Views
-- ============================================================================

-- ============================================================================
-- MOVEMENT NUMBER GENERATION (concurrency-safe)
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_movement_number(p_company_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_next BIGINT;
BEGIN
    INSERT INTO movement_number_counter (company_id, last_number)
    VALUES (p_company_id, 1)
    ON CONFLICT (company_id)
    DO UPDATE SET last_number = movement_number_counter.last_number + 1
    RETURNING last_number INTO v_next;

    RETURN 'MOV-' || LPAD(v_next::TEXT, 6, '0');
END;
$$;

-- ============================================================================
-- AUTO-SET RESPONSIBLE_USER_ID FROM AUTH CONTEXT
-- Ensures responsible_user_id is always the authenticated user
-- ============================================================================
CREATE OR REPLACE FUNCTION set_responsible_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    NEW.responsible_user_id := auth.uid();
    NEW.company_id := (
        SELECT company_id FROM user_profiles WHERE id = auth.uid()
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_responsible_user
    BEFORE INSERT ON material_movements
    FOR EACH ROW
    EXECUTE FUNCTION set_responsible_user();

-- ============================================================================
-- AUTO-GENERATE MOVEMENT NUMBER ON INSERT
-- ============================================================================
CREATE OR REPLACE FUNCTION auto_generate_movement_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.movement_number IS NULL OR NEW.movement_number = '' THEN
        NEW.movement_number := generate_movement_number(NEW.company_id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_movement_number
    BEFORE INSERT ON material_movements
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_movement_number();

-- ============================================================================
-- AUTO-SET COMPANY_ID ON MOVEMENT LINES FROM MOVEMENT HEADER
-- ============================================================================
CREATE OR REPLACE FUNCTION set_line_company_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.company_id IS NULL THEN
        SELECT company_id INTO NEW.company_id
        FROM material_movements
        WHERE id = NEW.movement_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_line_company
    BEFORE INSERT ON material_movement_lines
    FOR EACH ROW
    EXECUTE FUNCTION set_line_company_id();

-- ============================================================================
-- INVENTORY BALANCE VALIDATION TRIGGERS
-- ============================================================================

-- Helper: get warehouse balance for a material
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
                CASE m.movement_type
                    WHEN 'RECEIPT'   THEN ml.quantity
                    WHEN 'TRANSFER'  THEN ml.quantity
                    WHEN 'RETURN'    THEN ml.quantity
                    WHEN 'ADJUSTMENT' AND m.adjustment_type = 'increase' THEN ml.quantity
                    ELSE 0
                END
            -- Outgoing from this warehouse
            WHEN m.source_warehouse_id = p_warehouse_id THEN
                CASE m.movement_type
                    WHEN 'ISSUE'     THEN -ml.quantity
                    WHEN 'TRANSFER'  THEN -ml.quantity
                    WHEN 'ADJUSTMENT' AND m.adjustment_type = 'decrease' THEN -ml.quantity
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

-- Helper: get work order on-hand balance for a material
CREATE OR REPLACE FUNCTION get_wo_on_hand(
    p_company_id UUID,
    p_work_order_id UUID,
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
            -- Incoming to this WO
            WHEN m.destination_work_order_id = p_work_order_id THEN
                CASE m.movement_type
                    WHEN 'ISSUE'    THEN ml.quantity
                    WHEN 'TRANSFER' THEN ml.quantity
                    ELSE 0
                END
            -- Outgoing from this WO
            WHEN m.source_work_order_id = p_work_order_id THEN
                CASE m.movement_type
                    WHEN 'USAGE'    THEN -ml.quantity
                    WHEN 'TRANSFER' THEN -ml.quantity
                    WHEN 'RETURN'   THEN -ml.quantity
                    ELSE 0
                END
            ELSE 0
        END
    ), 0)
    INTO v_balance
    FROM material_movements m
    JOIN material_movement_lines ml ON ml.movement_id = m.id
    WHERE m.company_id = p_company_id
      AND (m.destination_work_order_id = p_work_order_id OR m.source_work_order_id = p_work_order_id)
      AND ml.material_id = p_material_id;

    RETURN v_balance;
END;
$$;

-- Helper: get contractor on-hand balance for a material
CREATE OR REPLACE FUNCTION get_contractor_balance(
    p_company_id UUID,
    p_contractor_id UUID,
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
        CASE m.movement_type
            WHEN 'TRANSFER' THEN ml.quantity
            WHEN 'RETURN'   THEN -ml.quantity
            ELSE 0
        END
    ), 0)
    INTO v_balance
    FROM material_movements m
    JOIN material_movement_lines ml ON ml.movement_id = m.id
    WHERE m.company_id = p_company_id
      AND m.contractor_id = p_contractor_id
      AND ml.material_id = p_material_id;

    RETURN v_balance;
END;
$$;

-- Validate movement line: prevent negative balances
CREATE OR REPLACE FUNCTION validate_movement_line()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_movement  material_movements%ROWTYPE;
    v_available NUMERIC;
BEGIN
    SELECT * INTO v_movement FROM material_movements WHERE id = NEW.movement_id;

    -- ISSUE: check warehouse has enough stock
    IF v_movement.movement_type = 'ISSUE' THEN
        v_available := get_warehouse_balance(v_movement.company_id, v_movement.source_warehouse_id, NEW.material_id);
        IF v_available < NEW.quantity THEN
            RAISE EXCEPTION 'Issue quantity % exceeds available warehouse stock % for this material', NEW.quantity, v_available;
        END IF;
    END IF;

    -- USAGE: check WO has enough on-hand
    IF v_movement.movement_type = 'USAGE' THEN
        v_available := get_wo_on_hand(v_movement.company_id, v_movement.source_work_order_id, NEW.material_id);
        IF v_available < NEW.quantity THEN
            RAISE EXCEPTION 'Usage quantity % exceeds available work order on-hand % for this material', NEW.quantity, v_available;
        END IF;
    END IF;

    -- TRANSFER: check source has enough
    IF v_movement.movement_type = 'TRANSFER' THEN
        IF v_movement.source_warehouse_id IS NOT NULL THEN
            v_available := get_warehouse_balance(v_movement.company_id, v_movement.source_warehouse_id, NEW.material_id);
        ELSIF v_movement.source_work_order_id IS NOT NULL THEN
            v_available := get_wo_on_hand(v_movement.company_id, v_movement.source_work_order_id, NEW.material_id);
        END IF;

        IF v_available < NEW.quantity THEN
            RAISE EXCEPTION 'Transfer quantity % exceeds available source balance %', NEW.quantity, v_available;
        END IF;
    END IF;

    -- RETURN: check source has enough
    IF v_movement.movement_type = 'RETURN' THEN
        IF v_movement.source_work_order_id IS NOT NULL THEN
            v_available := get_wo_on_hand(v_movement.company_id, v_movement.source_work_order_id, NEW.material_id);
        ELSIF v_movement.contractor_id IS NOT NULL THEN
            v_available := get_contractor_balance(v_movement.company_id, v_movement.contractor_id, NEW.material_id);
        END IF;

        IF v_available < NEW.quantity THEN
            RAISE EXCEPTION 'Return quantity % exceeds available source balance %', NEW.quantity, v_available;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_movement_line
    BEFORE INSERT ON material_movement_lines
    FOR EACH ROW
    EXECUTE FUNCTION validate_movement_line();

-- ============================================================================
-- VIEWS: INVENTORY BALANCES (derived from movement history)
-- ============================================================================

-- WAREHOUSE BALANCE VIEW
CREATE OR REPLACE VIEW v_warehouse_balance AS
WITH wh_in AS (
    SELECT
        m.company_id,
        m.destination_warehouse_id AS warehouse_id,
        ml.material_id,
        SUM(CASE WHEN m.movement_type = 'RECEIPT'  THEN ml.quantity ELSE 0 END) AS received,
        SUM(CASE WHEN m.movement_type = 'TRANSFER' THEN ml.quantity ELSE 0 END) AS transfer_in,
        SUM(CASE WHEN m.movement_type = 'RETURN'   THEN ml.quantity ELSE 0 END) AS returned_in
    FROM material_movements m
    JOIN material_movement_lines ml ON ml.movement_id = m.id
    WHERE m.destination_warehouse_id IS NOT NULL
    GROUP BY m.company_id, m.destination_warehouse_id, ml.material_id
),
wh_out AS (
    SELECT
        m.company_id,
        m.source_warehouse_id AS warehouse_id,
        ml.material_id,
        SUM(CASE WHEN m.movement_type = 'ISSUE'     THEN ml.quantity ELSE 0 END) AS issued,
        SUM(CASE WHEN m.movement_type = 'TRANSFER'  THEN ml.quantity ELSE 0 END) AS transfer_out
    FROM material_movements m
    JOIN material_movement_lines ml ON ml.movement_id = m.id
    WHERE m.source_warehouse_id IS NOT NULL
      AND m.movement_type IN ('ISSUE', 'TRANSFER')
    GROUP BY m.company_id, m.source_warehouse_id, ml.material_id
),
wh_adj AS (
    SELECT
        m.company_id,
        m.source_warehouse_id AS warehouse_id,
        ml.material_id,
        SUM(CASE WHEN m.adjustment_type = 'increase' THEN ml.quantity ELSE 0 END) AS adjustment_positive,
        SUM(CASE WHEN m.adjustment_type = 'decrease' THEN ml.quantity ELSE 0 END) AS adjustment_negative
    FROM material_movements m
    JOIN material_movement_lines ml ON ml.movement_id = m.id
    WHERE m.movement_type = 'ADJUSTMENT' AND m.source_warehouse_id IS NOT NULL
    GROUP BY m.company_id, m.source_warehouse_id, ml.material_id
)
SELECT
    COALESCE(i.company_id, o.company_id, a.company_id) AS company_id,
    COALESCE(i.warehouse_id, o.warehouse_id, a.warehouse_id) AS warehouse_id,
    COALESCE(i.material_id, o.material_id, a.material_id) AS material_id,
    COALESCE(i.received, 0)        AS received,
    COALESCE(i.transfer_in, 0)     AS transfer_in,
    COALESCE(i.returned_in, 0)     AS returned_in,
    COALESCE(a.adjustment_positive, 0)  AS adjustment_positive,
    COALESCE(o.issued, 0)          AS issued,
    COALESCE(o.transfer_out, 0)    AS transfer_out,
    COALESCE(a.adjustment_negative, 0)  AS adjustment_negative,
    COALESCE(i.received, 0) + COALESCE(i.transfer_in, 0) + COALESCE(i.returned_in, 0) + COALESCE(a.adjustment_positive, 0)
    - COALESCE(o.issued, 0) - COALESCE(o.transfer_out, 0) - COALESCE(a.adjustment_negative, 0) AS current_balance
FROM wh_in i
FULL OUTER JOIN wh_out o
    ON i.company_id = o.company_id AND i.warehouse_id = o.warehouse_id AND i.material_id = o.material_id
FULL OUTER JOIN wh_adj a
    ON COALESCE(i.company_id, o.company_id) = a.company_id
    AND COALESCE(i.warehouse_id, o.warehouse_id) = a.warehouse_id
    AND COALESCE(i.material_id, o.material_id) = a.material_id;

-- WORK ORDER BALANCE VIEW (on-hand + consumed)
CREATE OR REPLACE VIEW v_work_order_balance AS
WITH wo_in AS (
    SELECT
        m.company_id,
        m.destination_work_order_id AS work_order_id,
        ml.material_id,
        SUM(CASE WHEN m.movement_type = 'ISSUE'    THEN ml.quantity ELSE 0 END) AS issued,
        SUM(CASE WHEN m.movement_type = 'TRANSFER' THEN ml.quantity ELSE 0 END) AS transfer_in
    FROM material_movements m
    JOIN material_movement_lines ml ON ml.movement_id = m.id
    WHERE m.destination_work_order_id IS NOT NULL
    GROUP BY m.company_id, m.destination_work_order_id, ml.material_id
),
wo_out AS (
    SELECT
        m.company_id,
        m.source_work_order_id AS work_order_id,
        ml.material_id,
        SUM(CASE WHEN m.movement_type = 'USAGE'    THEN ml.quantity ELSE 0 END) AS used,
        SUM(CASE WHEN m.movement_type = 'TRANSFER' THEN ml.quantity ELSE 0 END) AS transfer_out,
        SUM(CASE WHEN m.movement_type = 'RETURN'   THEN ml.quantity ELSE 0 END) AS returned_out
    FROM material_movements m
    JOIN material_movement_lines ml ON ml.movement_id = m.id
    WHERE m.source_work_order_id IS NOT NULL
      AND m.movement_type IN ('USAGE', 'TRANSFER', 'RETURN')
    GROUP BY m.company_id, m.source_work_order_id, ml.material_id
)
SELECT
    COALESCE(i.company_id, o.company_id) AS company_id,
    COALESCE(i.work_order_id, o.work_order_id) AS work_order_id,
    COALESCE(i.material_id, o.material_id) AS material_id,
    COALESCE(i.issued, 0)          AS issued,
    COALESCE(i.transfer_in, 0)     AS transfer_in,
    COALESCE(o.used, 0)            AS used,
    COALESCE(o.transfer_out, 0)    AS transfer_out,
    COALESCE(o.returned_out, 0)    AS returned_out,
    -- On-hand (unused, still available for transfer/return)
    COALESCE(i.issued, 0) + COALESCE(i.transfer_in, 0)
    - COALESCE(o.used, 0) - COALESCE(o.transfer_out, 0) - COALESCE(o.returned_out, 0) AS on_hand,
    -- Consumed (irreversible)
    COALESCE(o.used, 0) AS consumed
FROM wo_in i
FULL OUTER JOIN wo_out o
    ON i.company_id = o.company_id AND i.work_order_id = o.work_order_id AND i.material_id = o.material_id;

-- CONTRACTOR BALANCE VIEW
CREATE OR REPLACE VIEW v_contractor_balance AS
SELECT
    m.company_id,
    m.contractor_id,
    ml.material_id,
    SUM(CASE WHEN m.movement_type = 'TRANSFER' THEN ml.quantity ELSE 0 END) AS transferred_in,
    SUM(CASE WHEN m.movement_type = 'RETURN'   THEN ml.quantity ELSE 0 END) AS returned_out,
    SUM(CASE WHEN m.movement_type = 'TRANSFER' THEN ml.quantity ELSE 0 END)
    - SUM(CASE WHEN m.movement_type = 'RETURN' THEN ml.quantity ELSE 0 END) AS current_balance
FROM material_movements m
JOIN material_movement_lines ml ON ml.movement_id = m.id
WHERE m.contractor_id IS NOT NULL
GROUP BY m.company_id, m.contractor_id, ml.material_id;

-- ============================================================================
-- MOVEMENT DETAIL VIEW (for reports — joins all relevant data)
-- ============================================================================
CREATE OR REPLACE VIEW v_movement_details AS
SELECT
    m.company_id,
    m.id AS movement_id,
    m.movement_number,
    m.movement_date,
    m.movement_type,
    m.adjustment_type,
    m.adjustment_reason,
    m.notes,
    m.created_at,
    -- Source descriptions
    src_wh.code  AS source_warehouse_code,
    src_wh.name  AS source_warehouse_name,
    src_wo.work_order_number AS source_work_order_number,
    src_wo.site_code AS source_site_code,
    sup.code     AS supplier_code,
    sup.name     AS supplier_name,
    -- Destination descriptions
    dst_wh.code  AS destination_warehouse_code,
    dst_wh.name  AS destination_warehouse_name,
    dst_wo.work_order_number AS destination_work_order_number,
    dst_wo.site_code AS destination_site_code,
    con.name     AS contractor_name,
    -- Responsible user
    up.full_name AS responsible_user_name,
    -- Line details
    ml.id AS line_id,
    ml.material_id,
    mat.item_number,
    mat.short_description,
    mat.uom,
    ml.quantity,
    ml.notes AS line_notes
FROM material_movements m
JOIN material_movement_lines ml ON ml.movement_id = m.id
LEFT JOIN warehouses src_wh  ON src_wh.id = m.source_warehouse_id AND src_wh.company_id = m.company_id
LEFT JOIN work_orders src_wo ON src_wo.id = m.source_work_order_id AND src_wo.company_id = m.company_id
LEFT JOIN suppliers sup      ON sup.id = m.supplier_id AND sup.company_id = m.company_id
LEFT JOIN warehouses dst_wh  ON dst_wh.id = m.destination_warehouse_id AND dst_wh.company_id = m.company_id
LEFT JOIN work_orders dst_wo ON dst_wo.id = m.destination_work_order_id AND dst_wo.company_id = m.company_id
LEFT JOIN contractors con    ON con.id = m.contractor_id AND con.company_id = m.company_id
LEFT JOIN materials mat      ON mat.id = ml.material_id AND mat.company_id = m.company_id
LEFT JOIN user_profiles up   ON up.id = m.responsible_user_id AND up.company_id = m.company_id;

-- ============================================================================
-- WORK ORDER MATERIAL SUMMARY VIEW (BOQ vs actuals)
-- ============================================================================
CREATE OR REPLACE VIEW v_wo_material_summary AS
SELECT
    wo.company_id,
    wo.id AS work_order_id,
    wo.work_order_number,
    wo.site_code,
    wo.work_location_id,
    wl.name AS work_location_name,
    wo.project_id,
    pr.name AS project_name,
    b.material_id,
    mat.item_number,
    mat.short_description,
    mat.uom,
    b.planned_quantity AS boq_quantity,
    COALESCE(wob.issued, 0)       AS issued_quantity,
    COALESCE(wob.used, 0)         AS used_quantity,
    COALESCE(wob.transfer_out, 0) AS transferred_quantity,
    COALESCE(wob.returned_out, 0) AS returned_quantity,
    COALESCE(wob.on_hand, 0)      AS remaining_quantity,
    COALESCE(wob.consumed, 0)     AS consumed_quantity
FROM work_orders wo
JOIN work_order_boq b ON b.work_order_id = wo.id AND b.company_id = wo.company_id
JOIN materials mat ON mat.id = b.material_id AND mat.company_id = wo.company_id
LEFT JOIN work_locations wl ON wl.id = wo.work_location_id AND wl.company_id = wo.company_id
LEFT JOIN projects pr ON pr.id = wo.project_id AND pr.company_id = wo.company_id
LEFT JOIN v_work_order_balance wob ON wob.work_order_id = wo.id AND wob.material_id = b.material_id AND wob.company_id = wo.company_id;
