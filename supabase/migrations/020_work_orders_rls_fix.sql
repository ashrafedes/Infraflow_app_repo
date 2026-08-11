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
