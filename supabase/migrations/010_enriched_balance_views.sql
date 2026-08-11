-- ============================================================================
-- Enriched balance views with descriptive fields directly included
-- so the frontend can query them without PostgREST FK joins on views.
-- ============================================================================

-- WAREHOUSE BALANCE VIEW (enriched)
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
    - COALESCE(o.issued, 0) - COALESCE(o.transfer_out, 0) - COALESCE(a.adjustment_negative, 0) AS current_balance,
    -- Enriched fields
    wh.code AS warehouse_code,
    wh.name AS warehouse_name,
    mat.item_number,
    mat.short_description,
    mat.uom,
    mc.name AS category_name
FROM wh_in i
FULL OUTER JOIN wh_out o
    ON i.company_id = o.company_id AND i.warehouse_id = o.warehouse_id AND i.material_id = o.material_id
FULL OUTER JOIN wh_adj a
    ON COALESCE(i.company_id, o.company_id) = a.company_id
    AND COALESCE(i.warehouse_id, o.warehouse_id) = a.warehouse_id
    AND COALESCE(i.material_id, o.material_id) = a.material_id
JOIN warehouses wh ON wh.id = COALESCE(i.warehouse_id, o.warehouse_id, a.warehouse_id)
    AND wh.company_id = COALESCE(i.company_id, o.company_id, a.company_id)
JOIN materials mat ON mat.id = COALESCE(i.material_id, o.material_id, a.material_id)
    AND mat.company_id = COALESCE(i.company_id, o.company_id, a.company_id)
LEFT JOIN material_categories mc ON mc.id = mat.category_id
    AND mc.company_id = mat.company_id;

-- WORK ORDER BALANCE VIEW (enriched)
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
    COALESCE(i.issued, 0) + COALESCE(i.transfer_in, 0)
    - COALESCE(o.used, 0) - COALESCE(o.transfer_out, 0) - COALESCE(o.returned_out, 0) AS on_hand,
    COALESCE(o.used, 0) AS consumed,
    -- Enriched fields
    mat.item_number,
    mat.short_description,
    mat.uom
FROM wo_in i
FULL OUTER JOIN wo_out o
    ON i.company_id = o.company_id AND i.work_order_id = o.work_order_id AND i.material_id = o.material_id
JOIN materials mat ON mat.id = COALESCE(i.material_id, o.material_id)
    AND mat.company_id = COALESCE(i.company_id, o.company_id);

-- CONTRACTOR BALANCE VIEW (enriched)
CREATE OR REPLACE VIEW v_contractor_balance AS
SELECT
    m.company_id,
    m.contractor_id,
    ml.material_id,
    SUM(CASE WHEN m.movement_type = 'TRANSFER' THEN ml.quantity ELSE 0 END) AS transferred_in,
    SUM(CASE WHEN m.movement_type = 'RETURN'   THEN ml.quantity ELSE 0 END) AS returned_out,
    SUM(CASE WHEN m.movement_type = 'TRANSFER' THEN ml.quantity ELSE 0 END)
    - SUM(CASE WHEN m.movement_type = 'RETURN' THEN ml.quantity ELSE 0 END) AS current_balance,
    -- Enriched fields
    con.name AS contractor_name,
    mat.item_number,
    mat.short_description,
    mat.uom
FROM material_movements m
JOIN material_movement_lines ml ON ml.movement_id = m.id
JOIN contractors con ON con.id = m.contractor_id AND con.company_id = m.company_id
JOIN materials mat ON mat.id = ml.material_id AND mat.company_id = m.company_id
WHERE m.contractor_id IS NOT NULL
GROUP BY m.company_id, m.contractor_id, ml.material_id, con.name, mat.item_number, mat.short_description, mat.uom;
