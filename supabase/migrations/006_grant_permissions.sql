-- ============================================================================
-- Grant base table permissions to authenticated role
-- ============================================================================

-- Companies
GRANT SELECT, INSERT, UPDATE ON companies TO authenticated;

-- User profiles
GRANT SELECT, INSERT, UPDATE, DELETE ON user_profiles TO authenticated;

-- User scope assignments
GRANT SELECT, INSERT, UPDATE, DELETE ON user_scope_assignments TO authenticated;

-- Projects
GRANT SELECT, INSERT, UPDATE, DELETE ON projects TO authenticated;

-- Work locations
GRANT SELECT, INSERT, UPDATE, DELETE ON work_locations TO authenticated;

-- Warehouses
GRANT SELECT, INSERT, UPDATE, DELETE ON warehouses TO authenticated;

-- Material categories
GRANT SELECT, INSERT, UPDATE, DELETE ON material_categories TO authenticated;

-- Materials
GRANT SELECT, INSERT, UPDATE, DELETE ON materials TO authenticated;

-- Suppliers
GRANT SELECT, INSERT, UPDATE, DELETE ON suppliers TO authenticated;

-- Contractors
GRANT SELECT, INSERT, UPDATE, DELETE ON contractors TO authenticated;

-- Work orders
GRANT SELECT, INSERT, UPDATE, DELETE ON work_orders TO authenticated;

-- Work order BOQ
GRANT SELECT, INSERT, UPDATE, DELETE ON work_order_boq TO authenticated;

-- Material movements
GRANT SELECT, INSERT, UPDATE, DELETE ON material_movements TO authenticated;

-- Material movement lines
GRANT SELECT, INSERT, UPDATE, DELETE ON material_movement_lines TO authenticated;

-- Movement number counter (only SELECT, the function handles writes)
GRANT SELECT ON movement_number_counter TO authenticated;

-- Grant usage on sequences (for auto-increment if any)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
