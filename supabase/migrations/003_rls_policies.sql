-- ============================================================================
-- INFRAFLOW — Material Control & Work Order System
-- Migration 003: Row Level Security (RLS) Policies
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTION: Get current user's company_id
-- ============================================================================
CREATE OR REPLACE FUNCTION public.company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT company_id FROM user_profiles WHERE id = auth.uid();
$$;

-- ============================================================================
-- HELPER FUNCTION: Get current user's role
-- ============================================================================
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT role FROM user_profiles WHERE id = auth.uid();
$$;

-- ============================================================================
-- COMPANIES — RLS
-- ============================================================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY companies_select ON companies
    FOR SELECT USING (
        id = public.company_id()
    );

CREATE POLICY companies_update ON companies
    FOR UPDATE USING (
        id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

-- ============================================================================
-- USER_PROFILES — RLS
-- ============================================================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select ON user_profiles
    FOR SELECT USING (
        company_id = public.company_id()
    );

CREATE POLICY profiles_insert ON user_profiles
    FOR INSERT WITH CHECK (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

CREATE POLICY profiles_update ON user_profiles
    FOR UPDATE USING (
        company_id = public.company_id()
        AND (
            id = auth.uid()
            OR public.user_role() = 'company_admin'
        )
    );

CREATE POLICY profiles_delete ON user_profiles
    FOR DELETE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

-- ============================================================================
-- USER_SCOPE_ASSIGNMENTS — RLS
-- ============================================================================
ALTER TABLE user_scope_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY scope_select ON user_scope_assignments
    FOR SELECT USING (
        company_id = public.company_id()
        AND (
            public.user_role() = 'company_admin'
            OR user_id = auth.uid()
        )
    );

CREATE POLICY scope_insert ON user_scope_assignments
    FOR INSERT WITH CHECK (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

CREATE POLICY scope_update ON user_scope_assignments
    FOR UPDATE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

CREATE POLICY scope_delete ON user_scope_assignments
    FOR DELETE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

-- ============================================================================
-- PROJECTS — RLS
-- ============================================================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_select ON projects
    FOR SELECT USING (
        company_id = public.company_id()
        AND (
            public.user_role() = 'company_admin'
            OR id IN (
                SELECT project_id FROM user_scope_assignments
                WHERE user_id = auth.uid() AND project_id IS NOT NULL
            )
            OR id IN (
                SELECT wo.project_id FROM work_orders wo
                JOIN user_scope_assignments usa ON usa.work_order_id = wo.id
                WHERE usa.user_id = auth.uid() AND usa.work_order_id IS NOT NULL
            )
            OR id IN (
                SELECT wo.project_id FROM work_orders wo
                JOIN user_scope_assignments usa ON usa.work_location_id = wo.work_location_id
                WHERE usa.user_id = auth.uid() AND usa.work_location_id IS NOT NULL
            )
        )
    );

CREATE POLICY projects_insert ON projects
    FOR INSERT WITH CHECK (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

CREATE POLICY projects_update ON projects
    FOR UPDATE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

CREATE POLICY projects_delete ON projects
    FOR DELETE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

-- ============================================================================
-- WORK_LOCATIONS — RLS
-- ============================================================================
ALTER TABLE work_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_locations_select ON work_locations
    FOR SELECT USING (
        company_id = public.company_id()
        AND (
            public.user_role() = 'company_admin'
            OR id IN (
                SELECT work_location_id FROM user_scope_assignments
                WHERE user_id = auth.uid() AND work_location_id IS NOT NULL
            )
            OR id IN (
                SELECT wo.work_location_id FROM work_orders wo
                JOIN user_scope_assignments usa ON usa.work_order_id = wo.id
                WHERE usa.user_id = auth.uid() AND usa.work_order_id IS NOT NULL
            )
            OR id IN (
                SELECT wh.work_location_id FROM warehouses wh
                JOIN user_scope_assignments usa ON usa.warehouse_id = wh.id
                WHERE usa.user_id = auth.uid() AND usa.warehouse_id IS NOT NULL
            )
        )
    );

CREATE POLICY work_locations_insert ON work_locations
    FOR INSERT WITH CHECK (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

CREATE POLICY work_locations_update ON work_locations
    FOR UPDATE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

CREATE POLICY work_locations_delete ON work_locations
    FOR DELETE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

-- ============================================================================
-- WAREHOUSES — RLS
-- ============================================================================
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY warehouses_select ON warehouses
    FOR SELECT USING (
        company_id = public.company_id()
        AND (
            public.user_role() = 'company_admin'
            OR id IN (
                SELECT warehouse_id FROM user_scope_assignments
                WHERE user_id = auth.uid() AND warehouse_id IS NOT NULL
            )
            OR work_location_id IN (
                SELECT work_location_id FROM user_scope_assignments
                WHERE user_id = auth.uid() AND work_location_id IS NOT NULL
            )
        )
    );

CREATE POLICY warehouses_insert ON warehouses
    FOR INSERT WITH CHECK (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

CREATE POLICY warehouses_update ON warehouses
    FOR UPDATE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

CREATE POLICY warehouses_delete ON warehouses
    FOR DELETE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

-- ============================================================================
-- MATERIAL_CATEGORIES — RLS
-- ============================================================================
ALTER TABLE material_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY material_categories_select ON material_categories
    FOR SELECT USING (company_id = public.company_id());

CREATE POLICY material_categories_insert ON material_categories
    FOR INSERT WITH CHECK (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

CREATE POLICY material_categories_update ON material_categories
    FOR UPDATE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

CREATE POLICY material_categories_delete ON material_categories
    FOR DELETE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

-- ============================================================================
-- MATERIALS — RLS
-- ============================================================================
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY materials_select ON materials
    FOR SELECT USING (company_id = public.company_id());

CREATE POLICY materials_insert ON materials
    FOR INSERT WITH CHECK (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

CREATE POLICY materials_update ON materials
    FOR UPDATE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

CREATE POLICY materials_delete ON materials
    FOR DELETE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

-- ============================================================================
-- SUPPLIERS — RLS
-- ============================================================================
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY suppliers_select ON suppliers
    FOR SELECT USING (company_id = public.company_id());

CREATE POLICY suppliers_insert ON suppliers
    FOR INSERT WITH CHECK (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

CREATE POLICY suppliers_update ON suppliers
    FOR UPDATE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

CREATE POLICY suppliers_delete ON suppliers
    FOR DELETE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

-- ============================================================================
-- CONTRACTORS — RLS
-- ============================================================================
ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY contractors_select ON contractors
    FOR SELECT USING (company_id = public.company_id());

CREATE POLICY contractors_insert ON contractors
    FOR INSERT WITH CHECK (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

CREATE POLICY contractors_update ON contractors
    FOR UPDATE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

CREATE POLICY contractors_delete ON contractors
    FOR DELETE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

-- ============================================================================
-- WORK_ORDERS — RLS
-- ============================================================================
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_orders_select ON work_orders
    FOR SELECT USING (
        company_id = public.company_id()
        AND (
            public.user_role() = 'company_admin'
            OR id IN (
                SELECT work_order_id FROM user_scope_assignments
                WHERE user_id = auth.uid() AND work_order_id IS NOT NULL
            )
            OR project_id IN (
                SELECT project_id FROM user_scope_assignments
                WHERE user_id = auth.uid() AND project_id IS NOT NULL
            )
            OR work_location_id IN (
                SELECT work_location_id FROM user_scope_assignments
                WHERE user_id = auth.uid() AND work_location_id IS NOT NULL
            )
        )
    );

CREATE POLICY work_orders_insert ON work_orders
    FOR INSERT WITH CHECK (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

CREATE POLICY work_orders_update ON work_orders
    FOR UPDATE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

CREATE POLICY work_orders_delete ON work_orders
    FOR DELETE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

-- ============================================================================
-- WORK_ORDER_BOQ — RLS
-- ============================================================================
ALTER TABLE work_order_boq ENABLE ROW LEVEL SECURITY;

CREATE POLICY boq_select ON work_order_boq
    FOR SELECT USING (
        company_id = public.company_id()
        AND (
            public.user_role() = 'company_admin'
            OR work_order_id IN (
                SELECT work_order_id FROM user_scope_assignments
                WHERE user_id = auth.uid() AND work_order_id IS NOT NULL
            )
            OR work_order_id IN (
                SELECT wo.id FROM work_orders wo
                JOIN user_scope_assignments usa ON usa.project_id = wo.project_id
                WHERE usa.user_id = auth.uid() AND usa.project_id IS NOT NULL
            )
            OR work_order_id IN (
                SELECT wo.id FROM work_orders wo
                JOIN user_scope_assignments usa ON usa.work_location_id = wo.work_location_id
                WHERE usa.user_id = auth.uid() AND usa.work_location_id IS NOT NULL
            )
        )
    );

CREATE POLICY boq_insert ON work_order_boq
    FOR INSERT WITH CHECK (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

CREATE POLICY boq_update ON work_order_boq
    FOR UPDATE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

CREATE POLICY boq_delete ON work_order_boq
    FOR DELETE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

-- ============================================================================
-- MATERIAL_MOVEMENTS — RLS
-- ============================================================================
ALTER TABLE material_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY movements_select ON material_movements
    FOR SELECT USING (
        company_id = public.company_id()
        AND (
            public.user_role() = 'company_admin'
            -- Warehouse man sees movements involving their warehouses
            OR source_warehouse_id IN (
                SELECT warehouse_id FROM user_scope_assignments
                WHERE user_id = auth.uid() AND warehouse_id IS NOT NULL
            )
            OR destination_warehouse_id IN (
                SELECT warehouse_id FROM user_scope_assignments
                WHERE user_id = auth.uid() AND warehouse_id IS NOT NULL
            )
            -- Inspector/Project roles see movements involving their work orders
            OR source_work_order_id IN (
                SELECT work_order_id FROM user_scope_assignments
                WHERE user_id = auth.uid() AND work_order_id IS NOT NULL
            )
            OR destination_work_order_id IN (
                SELECT work_order_id FROM user_scope_assignments
                WHERE user_id = auth.uid() AND work_order_id IS NOT NULL
            )
            -- Project assignment: sees movements for WOs in their projects
            OR source_work_order_id IN (
                SELECT wo.id FROM work_orders wo
                JOIN user_scope_assignments usa ON usa.project_id = wo.project_id
                WHERE usa.user_id = auth.uid() AND usa.project_id IS NOT NULL
            )
            OR destination_work_order_id IN (
                SELECT wo.id FROM work_orders wo
                JOIN user_scope_assignments usa ON usa.project_id = wo.project_id
                WHERE usa.user_id = auth.uid() AND usa.project_id IS NOT NULL
            )
            -- Work location assignment: sees movements for WOs in their locations
            OR source_work_order_id IN (
                SELECT wo.id FROM work_orders wo
                JOIN user_scope_assignments usa ON usa.work_location_id = wo.work_location_id
                WHERE usa.user_id = auth.uid() AND usa.work_location_id IS NOT NULL
            )
            OR destination_work_order_id IN (
                SELECT wo.id FROM work_orders wo
                JOIN user_scope_assignments usa ON usa.work_location_id = wo.work_location_id
                WHERE usa.user_id = auth.uid() AND usa.work_location_id IS NOT NULL
            )
        )
    );

CREATE POLICY movements_insert ON material_movements
    FOR INSERT WITH CHECK (
        company_id = public.company_id()
        AND (
            public.user_role() = 'company_admin'
            OR (
                public.user_role() = 'warehouse_man'
                AND (
                    -- Warehouse man can create RECEIPT, ISSUE, TRANSFER(WH), RETURN, ADJUSTMENT
                    -- for their assigned warehouses
                    source_warehouse_id IN (
                        SELECT warehouse_id FROM user_scope_assignments
                        WHERE user_id = auth.uid() AND warehouse_id IS NOT NULL
                    )
                    OR destination_warehouse_id IN (
                        SELECT warehouse_id FROM user_scope_assignments
                        WHERE user_id = auth.uid() AND warehouse_id IS NOT NULL
                    )
                )
            )
            OR (
                public.user_role() = 'inspector'
                AND source_work_order_id IN (
                    SELECT work_order_id FROM user_scope_assignments
                    WHERE user_id = auth.uid() AND work_order_id IS NOT NULL
                )
            )
        )
    );

CREATE POLICY movements_update ON material_movements
    FOR UPDATE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

CREATE POLICY movements_delete ON material_movements
    FOR DELETE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

-- ============================================================================
-- MATERIAL_MOVEMENT_LINES — RLS
-- ============================================================================
ALTER TABLE material_movement_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY movement_lines_select ON material_movement_lines
    FOR SELECT USING (
        company_id = public.company_id()
        AND movement_id IN (
            SELECT id FROM material_movements
            WHERE company_id = public.company_id()
        )
    );

CREATE POLICY movement_lines_insert ON material_movement_lines
    FOR INSERT WITH CHECK (
        company_id = public.company_id()
        AND movement_id IN (
            SELECT id FROM material_movements
            WHERE company_id = public.company_id()
        )
    );

CREATE POLICY movement_lines_update ON material_movement_lines
    FOR UPDATE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

CREATE POLICY movement_lines_delete ON material_movement_lines
    FOR DELETE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

-- ============================================================================
-- MOVEMENT_NUMBER_COUNTER — RLS
-- ============================================================================
ALTER TABLE movement_number_counter ENABLE ROW LEVEL SECURITY;

CREATE POLICY counter_select ON movement_number_counter
    FOR SELECT USING (company_id = public.company_id());

-- No direct INSERT/UPDATE/DELETE policies — only the SECURITY DEFINER
-- function generate_movement_number() can modify this table.

-- ============================================================================
-- VIEWS — RLS (views inherit RLS from underlying tables)
-- Views automatically respect RLS of their base tables, so no separate
-- policies are needed. The auth.uid() context is preserved through views.
-- ============================================================================

-- ============================================================================
-- GRANT SELECT ON VIEWS
-- ============================================================================
GRANT SELECT ON v_warehouse_balance TO authenticated;
GRANT SELECT ON v_work_order_balance TO authenticated;
GRANT SELECT ON v_contractor_balance TO authenticated;
GRANT SELECT ON v_movement_details TO authenticated;
GRANT SELECT ON v_wo_material_summary TO authenticated;

-- ============================================================================
-- GRANT EXECUTE ON HELPER FUNCTIONS
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION generate_movement_number(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_warehouse_balance(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_wo_on_hand(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_contractor_balance(UUID, UUID, UUID) TO authenticated;
