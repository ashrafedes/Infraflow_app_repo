-- ============================================================================
-- INFRAFLOW — RLS Fix: All company members can see all company data
-- Migration 020
-- ============================================================================
--
-- Previously, only company_admin could see all work orders, projects, and
-- work locations. Other roles (warehouse_man, inspector, project_control,
-- project_manager) could only see records matching their
-- user_scope_assignments. If they had no scopes, they saw nothing.
--
-- Now: ALL company members can SELECT all work orders, projects, and work
-- locations for their company. Scope assignments are still used for UI
-- filtering, not RLS restriction. Insert/update/delete remains
-- company_admin only.
-- ============================================================================

-- WORK_ORDERS
DROP POLICY IF EXISTS work_orders_select ON work_orders;
CREATE POLICY work_orders_select ON work_orders
    FOR SELECT USING (company_id = public.company_id());

-- PROJECTS
DROP POLICY IF EXISTS projects_select ON projects;
CREATE POLICY projects_select ON projects
    FOR SELECT USING (company_id = public.company_id());

-- WORK_LOCATIONS
DROP POLICY IF EXISTS work_locations_select ON work_locations;
CREATE POLICY work_locations_select ON work_locations
    FOR SELECT USING (company_id = public.company_id());

-- WORK_ORDER_BOQ — all company members can view and edit BOQ items
DROP POLICY IF EXISTS boq_select ON work_order_boq;
CREATE POLICY boq_select ON work_order_boq
    FOR SELECT USING (company_id = public.company_id());

DROP POLICY IF EXISTS boq_insert ON work_order_boq;
CREATE POLICY boq_insert ON work_order_boq
    FOR INSERT WITH CHECK (company_id = public.company_id());

DROP POLICY IF EXISTS boq_update ON work_order_boq;
CREATE POLICY boq_update ON work_order_boq
    FOR UPDATE USING (company_id = public.company_id());

DROP POLICY IF EXISTS boq_delete ON work_order_boq;
CREATE POLICY boq_delete ON work_order_boq
    FOR DELETE USING (company_id = public.company_id());
