-- ============================================================================
-- Auto-set company_id on insert for all tenant-scoped tables
-- This trigger fires BEFORE INSERT and sets company_id from the user's profile
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_company_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF NEW.company_id IS NULL THEN
        NEW.company_id := public.company_id();
    END IF;
    RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_company_id() TO authenticated;

-- Apply trigger to all tenant-scoped tables
CREATE TRIGGER trg_set_company_projects
    BEFORE INSERT ON projects
    FOR EACH ROW EXECUTE FUNCTION public.set_company_id();

CREATE TRIGGER trg_set_company_work_locations
    BEFORE INSERT ON work_locations
    FOR EACH ROW EXECUTE FUNCTION public.set_company_id();

CREATE TRIGGER trg_set_company_warehouses
    BEFORE INSERT ON warehouses
    FOR EACH ROW EXECUTE FUNCTION public.set_company_id();

CREATE TRIGGER trg_set_company_material_categories
    BEFORE INSERT ON material_categories
    FOR EACH ROW EXECUTE FUNCTION public.set_company_id();

CREATE TRIGGER trg_set_company_materials
    BEFORE INSERT ON materials
    FOR EACH ROW EXECUTE FUNCTION public.set_company_id();

CREATE TRIGGER trg_set_company_suppliers
    BEFORE INSERT ON suppliers
    FOR EACH ROW EXECUTE FUNCTION public.set_company_id();

CREATE TRIGGER trg_set_company_contractors
    BEFORE INSERT ON contractors
    FOR EACH ROW EXECUTE FUNCTION public.set_company_id();

CREATE TRIGGER trg_set_company_work_orders
    BEFORE INSERT ON work_orders
    FOR EACH ROW EXECUTE FUNCTION public.set_company_id();

CREATE TRIGGER trg_set_company_work_order_boq
    BEFORE INSERT ON work_order_boq
    FOR EACH ROW EXECUTE FUNCTION public.set_company_id();

CREATE TRIGGER trg_set_company_material_movements
    BEFORE INSERT ON material_movements
    FOR EACH ROW EXECUTE FUNCTION public.set_company_id();

CREATE TRIGGER trg_set_company_material_movement_lines
    BEFORE INSERT ON material_movement_lines
    FOR EACH ROW EXECUTE FUNCTION public.set_company_id();

CREATE TRIGGER trg_set_company_movement_number_counter
    BEFORE INSERT ON movement_number_counter
    FOR EACH ROW EXECUTE FUNCTION public.set_company_id();

CREATE TRIGGER trg_set_company_user_scope_assignments
    BEFORE INSERT ON user_scope_assignments
    FOR EACH ROW EXECUTE FUNCTION public.set_company_id();
