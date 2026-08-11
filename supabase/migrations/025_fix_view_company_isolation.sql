-- ============================================================================
-- INFRAFLOW — Fix cross-company data leak in views
-- Migration 025
-- ============================================================================
--
-- ROOT CAUSE:
--   Views in PostgreSQL run with the OWNER's privileges. In Supabase, views
--   are owned by `postgres` (a superuser), which BYPASSES Row Level Security
--   on the underlying tables. This means queries to v_movement_details,
--   v_warehouse_balance, v_work_order_balance, v_contractor_balance, and
--   v_wo_material_summary return data from ALL companies, not just the
--   caller's company.
--
-- FIX:
--   Recreate every view with an explicit WHERE clause:
--     company_id = public.company_id()
--   public.company_id() is a SECURITY DEFINER function that reads the
--   caller's company_id from user_profiles. It works correctly even when
--   called from a view owned by postgres, because auth.uid() still returns
--   the authenticated user's ID.
--
--   This is a belt-and-suspenders fix. If Supabase later supports
--   security_invoker views (PostgreSQL 15+), we can additionally set
--   that property, but the explicit filter is the reliable approach.
-- ============================================================================

-- ============================================================================
-- 1. v_movement_details — used by Dashboard, MovementsPage, MovementDetailPage
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
LEFT JOIN user_profiles up   ON up.id = m.responsible_user_id AND up.company_id = m.company_id
WHERE m.company_id = public.company_id();

-- ============================================================================
-- 2. v_warehouse_balance — used by Dashboard, ReportsPage, NewMovementPage
-- ============================================================================
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
    AND mc.company_id = mat.company_id
WHERE COALESCE(i.company_id, o.company_id, a.company_id) = public.company_id();

-- ============================================================================
-- 3. v_work_order_balance — used by ReportsPage, NewMovementPage
-- ============================================================================
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
    AND mat.company_id = COALESCE(i.company_id, o.company_id)
WHERE COALESCE(i.company_id, o.company_id) = public.company_id();

-- ============================================================================
-- 4. v_contractor_balance — used by ReportsPage
-- ============================================================================
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
  AND m.company_id = public.company_id()
GROUP BY m.company_id, m.contractor_id, ml.material_id, con.name, mat.item_number, mat.short_description, mat.uom;

-- ============================================================================
-- 5. v_wo_material_summary — used by ReportsPage
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
LEFT JOIN v_work_order_balance wob ON wob.work_order_id = wo.id AND wob.material_id = b.material_id AND wob.company_id = wo.company_id
WHERE wo.company_id = public.company_id();
