-- ============================================================================
-- INFRAFLOW — Performance fix for MovementsPage slow loading
-- Migration 028
--
-- ROOT CAUSE:
--   MovementsPage queries v_movement_details ORDER BY created_at DESC LIMIT 200.
--   The view joins material_movements with material_movement_lines and 7 other
--   tables. There is NO index on material_movements(created_at), so Postgres
--   must join ALL movements+lines, sort the entire result set, then take 200.
--   With security_invoker=true, RLS also adds per-table overhead.
--
-- FIX:
--   1. Add a composite index on (company_id, created_at DESC) so the ORDER BY
--      + LIMIT can use an index scan instead of a full sort.
--   2. Add an index on material_movement_lines(movement_id, material_id) to
--      speed up the join between movements and lines.
-- ============================================================================

-- Critical: index for ORDER BY created_at DESC + company_id filter
CREATE INDEX IF NOT EXISTS idx_movements_company_created
    ON material_movements (company_id, created_at DESC);

-- Speed up the movement→lines join (the existing idx_movement_lines_movement
-- covers movement_id only; this also covers the material_id lookup)
CREATE INDEX IF NOT EXISTS idx_movement_lines_movement_material
    ON material_movement_lines (movement_id, material_id);
