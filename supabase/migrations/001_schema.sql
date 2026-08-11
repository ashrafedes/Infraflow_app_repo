-- ============================================================================
-- INFRAFLOW — Material Control & Work Order System
-- Migration 001: Schema, Constraints, Indexes
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- COMPANIES (Tenant root)
-- ============================================================================
CREATE TABLE companies (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- USER_PROFILES
-- ============================================================================
CREATE TABLE user_profiles (
    id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    full_name   TEXT        NOT NULL,
    email       TEXT        NOT NULL,
    role        TEXT        NOT NULL CHECK (role IN ('company_admin','warehouse_man','inspector','project_control','project_manager')),
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- UNIQUE for composite FK references
CREATE UNIQUE INDEX uq_profiles_company_id ON user_profiles(company_id, id);
-- Business uniqueness
CREATE UNIQUE INDEX uq_profiles_company_email ON user_profiles(company_id, email);

-- ============================================================================
-- PROJECTS
-- ============================================================================
CREATE TABLE projects (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    code        TEXT        NOT NULL,
    name        TEXT        NOT NULL,
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_projects_company_id ON projects(company_id, id);
CREATE UNIQUE INDEX uq_projects_company_code ON projects(company_id, code);

-- ============================================================================
-- WORK_LOCATIONS
-- ============================================================================
CREATE TABLE work_locations (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    code        TEXT        NOT NULL,
    name        TEXT        NOT NULL,
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_work_locations_company_id ON work_locations(company_id, id);
CREATE UNIQUE INDEX uq_work_locations_company_code ON work_locations(company_id, code);

-- ============================================================================
-- WAREHOUSES
-- ============================================================================
CREATE TABLE warehouses (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        UUID        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    code              TEXT        NOT NULL,
    name              TEXT        NOT NULL,
    warehouse_type    TEXT        NOT NULL CHECK (warehouse_type IN ('main','sub')),
    work_location_id  UUID        NULL,
    is_active         BOOLEAN     NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_warehouses_company_id ON warehouses(company_id, id);
CREATE UNIQUE INDEX uq_warehouses_company_code ON warehouses(company_id, code);

-- Composite FK to work_locations (added after table creation via ALTER)
ALTER TABLE warehouses
    ADD CONSTRAINT fk_warehouses_work_location
    FOREIGN KEY (company_id, work_location_id)
    REFERENCES work_locations(company_id, id)
    ON DELETE SET NULL;

-- Warehouse rule: sub-warehouses must have a work location
ALTER TABLE warehouses
    ADD CONSTRAINT chk_warehouse_location
    CHECK (warehouse_type = 'main' OR work_location_id IS NOT NULL);

-- ============================================================================
-- MATERIAL_CATEGORIES
-- ============================================================================
CREATE TABLE material_categories (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    name        TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_material_categories_company_id ON material_categories(company_id, id);
CREATE UNIQUE INDEX uq_material_categories_company_name ON material_categories(company_id, name);

-- ============================================================================
-- MATERIALS
-- ============================================================================
CREATE TABLE materials (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    item_number         TEXT        NOT NULL,
    short_description   TEXT        NOT NULL,
    long_description    TEXT        NULL,
    category_id         UUID        NULL,
    uom                 TEXT        NOT NULL,
    is_active           BOOLEAN     NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_materials_company_id ON materials(company_id, id);
CREATE UNIQUE INDEX uq_materials_company_item_number ON materials(company_id, item_number);

-- Composite FK to material_categories
ALTER TABLE materials
    ADD CONSTRAINT fk_materials_category
    FOREIGN KEY (company_id, category_id)
    REFERENCES material_categories(company_id, id)
    ON DELETE SET NULL;

-- ============================================================================
-- SUPPLIERS
-- ============================================================================
CREATE TABLE suppliers (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    code          TEXT        NOT NULL,
    name          TEXT        NOT NULL,
    contact_info  TEXT        NULL,
    is_active     BOOLEAN     NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_suppliers_company_id ON suppliers(company_id, id);
CREATE UNIQUE INDEX uq_suppliers_company_code ON suppliers(company_id, code);

-- ============================================================================
-- CONTRACTORS
-- ============================================================================
CREATE TABLE contractors (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    name          TEXT        NOT NULL,
    contact_info  TEXT        NULL,
    is_active     BOOLEAN     NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_contractors_company_id ON contractors(company_id, id);
CREATE UNIQUE INDEX uq_contractors_company_name ON contractors(company_id, name);

-- ============================================================================
-- WORK_ORDERS
-- ============================================================================
CREATE TABLE work_orders (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    work_order_number   TEXT        NOT NULL,
    site_code           TEXT        NULL,
    project_id          UUID        NOT NULL,
    work_location_id    UUID        NOT NULL,
    supervisor          TEXT        NOT NULL,
    contractor_id       UUID        NULL,
    status              TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled','on_hold')),
    start_date          DATE        NULL,
    end_date            DATE        NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_work_orders_company_id ON work_orders(company_id, id);
CREATE UNIQUE INDEX uq_work_orders_company_number ON work_orders(company_id, work_order_number);

-- Composite FKs
ALTER TABLE work_orders
    ADD CONSTRAINT fk_wo_project
    FOREIGN KEY (company_id, project_id)
    REFERENCES projects(company_id, id)
    ON DELETE RESTRICT;

ALTER TABLE work_orders
    ADD CONSTRAINT fk_wo_work_location
    FOREIGN KEY (company_id, work_location_id)
    REFERENCES work_locations(company_id, id)
    ON DELETE RESTRICT;

ALTER TABLE work_orders
    ADD CONSTRAINT fk_wo_contractor
    FOREIGN KEY (company_id, contractor_id)
    REFERENCES contractors(company_id, id)
    ON DELETE SET NULL;

-- ============================================================================
-- WORK_ORDER_BOQ
-- ============================================================================
CREATE TABLE work_order_boq (
    id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        UUID           NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    work_order_id     UUID           NOT NULL,
    material_id       UUID           NOT NULL,
    planned_quantity  NUMERIC(14,3)  NOT NULL CHECK (planned_quantity > 0),
    created_at        TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_boq_company_id ON work_order_boq(company_id, id);
CREATE UNIQUE INDEX uq_boq_company_wo_material ON work_order_boq(company_id, work_order_id, material_id);

-- Composite FKs
ALTER TABLE work_order_boq
    ADD CONSTRAINT fk_boq_work_order
    FOREIGN KEY (company_id, work_order_id)
    REFERENCES work_orders(company_id, id)
    ON DELETE CASCADE;

ALTER TABLE work_order_boq
    ADD CONSTRAINT fk_boq_material
    FOREIGN KEY (company_id, material_id)
    REFERENCES materials(company_id, id)
    ON DELETE RESTRICT;

-- ============================================================================
-- MOVEMENT_NUMBER_COUNTER
-- ============================================================================
CREATE TABLE movement_number_counter (
    company_id    UUID     PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    last_number   BIGINT   NOT NULL DEFAULT 0
);

-- ============================================================================
-- MATERIAL_MOVEMENTS
-- ============================================================================
CREATE TABLE material_movements (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id                  UUID        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    movement_number             TEXT        NOT NULL,
    movement_date               DATE        NOT NULL DEFAULT CURRENT_DATE,
    movement_type               TEXT        NOT NULL CHECK (movement_type IN ('RECEIPT','ISSUE','USAGE','TRANSFER','RETURN','ADJUSTMENT')),

    -- Typed source references (nullable, constrained by movement_type CHECK)
    supplier_id                 UUID        NULL,
    source_warehouse_id         UUID        NULL,
    source_work_order_id        UUID        NULL,

    -- Typed destination references (nullable, constrained by movement_type CHECK)
    destination_warehouse_id    UUID        NULL,
    destination_work_order_id   UUID        NULL,
    contractor_id               UUID        NULL,

    -- Responsible user (NOT NULL — always the authenticated user)
    responsible_user_id         UUID        NOT NULL,

    -- Adjustment-specific fields
    adjustment_type             TEXT        NULL CHECK (adjustment_type IS NULL OR adjustment_type IN ('increase','decrease')),
    adjustment_reason           TEXT        NULL,

    notes                       TEXT        NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_movements_company_id ON material_movements(company_id, id);
CREATE UNIQUE INDEX uq_movements_company_number ON material_movements(company_id, movement_number);

-- Composite FKs for all references
ALTER TABLE material_movements
    ADD CONSTRAINT fk_mv_supplier
    FOREIGN KEY (company_id, supplier_id)
    REFERENCES suppliers(company_id, id)
    ON DELETE RESTRICT;

ALTER TABLE material_movements
    ADD CONSTRAINT fk_mv_source_warehouse
    FOREIGN KEY (company_id, source_warehouse_id)
    REFERENCES warehouses(company_id, id)
    ON DELETE RESTRICT;

ALTER TABLE material_movements
    ADD CONSTRAINT fk_mv_source_work_order
    FOREIGN KEY (company_id, source_work_order_id)
    REFERENCES work_orders(company_id, id)
    ON DELETE RESTRICT;

ALTER TABLE material_movements
    ADD CONSTRAINT fk_mv_dest_warehouse
    FOREIGN KEY (company_id, destination_warehouse_id)
    REFERENCES warehouses(company_id, id)
    ON DELETE RESTRICT;

ALTER TABLE material_movements
    ADD CONSTRAINT fk_mv_dest_work_order
    FOREIGN KEY (company_id, destination_work_order_id)
    REFERENCES work_orders(company_id, id)
    ON DELETE RESTRICT;

ALTER TABLE material_movements
    ADD CONSTRAINT fk_mv_contractor
    FOREIGN KEY (company_id, contractor_id)
    REFERENCES contractors(company_id, id)
    ON DELETE RESTRICT;

ALTER TABLE material_movements
    ADD CONSTRAINT fk_mv_responsible_user
    FOREIGN KEY (company_id, responsible_user_id)
    REFERENCES user_profiles(company_id, id)
    ON DELETE RESTRICT;

-- Movement type validity CHECK constraint
ALTER TABLE material_movements
    ADD CONSTRAINT chk_movement_type_validity CHECK (
        CASE
            -- RECEIPT: supplier → warehouse
            WHEN movement_type = 'RECEIPT' THEN
                supplier_id IS NOT NULL
                AND destination_warehouse_id IS NOT NULL
                AND source_warehouse_id IS NULL
                AND source_work_order_id IS NULL
                AND destination_work_order_id IS NULL
                AND contractor_id IS NULL
                AND adjustment_type IS NULL
                AND adjustment_reason IS NULL

            -- ISSUE: warehouse → work order
            WHEN movement_type = 'ISSUE' THEN
                source_warehouse_id IS NOT NULL
                AND destination_work_order_id IS NOT NULL
                AND supplier_id IS NULL
                AND source_work_order_id IS NULL
                AND destination_warehouse_id IS NULL
                AND contractor_id IS NULL
                AND adjustment_type IS NULL
                AND adjustment_reason IS NULL

            -- USAGE: work order → consumed (no physical destination)
            WHEN movement_type = 'USAGE' THEN
                source_work_order_id IS NOT NULL
                AND supplier_id IS NULL
                AND source_warehouse_id IS NULL
                AND destination_warehouse_id IS NULL
                AND destination_work_order_id IS NULL
                AND contractor_id IS NULL
                AND adjustment_type IS NULL
                AND adjustment_reason IS NULL

            -- TRANSFER: valid source→destination combinations
            WHEN movement_type = 'TRANSFER' THEN
                supplier_id IS NULL
                AND adjustment_type IS NULL
                AND adjustment_reason IS NULL
                AND (
                    -- Warehouse → Warehouse
                    (source_warehouse_id IS NOT NULL AND destination_warehouse_id IS NOT NULL
                     AND source_work_order_id IS NULL AND destination_work_order_id IS NULL
                     AND contractor_id IS NULL)
                    -- Work Order → Work Order
                    OR (source_work_order_id IS NOT NULL AND destination_work_order_id IS NOT NULL
                        AND source_warehouse_id IS NULL AND destination_warehouse_id IS NULL
                        AND contractor_id IS NULL)
                    -- Work Order → Contractor
                    OR (source_work_order_id IS NOT NULL AND contractor_id IS NOT NULL
                        AND source_warehouse_id IS NULL AND destination_warehouse_id IS NULL
                        AND destination_work_order_id IS NULL)
                )

            -- RETURN: WO or Contractor → Warehouse
            WHEN movement_type = 'RETURN' THEN
                destination_warehouse_id IS NOT NULL
                AND supplier_id IS NULL
                AND source_warehouse_id IS NULL
                AND destination_work_order_id IS NULL
                AND adjustment_type IS NULL
                AND adjustment_reason IS NULL
                AND (
                    (source_work_order_id IS NOT NULL AND contractor_id IS NULL)
                    OR (source_work_order_id IS NULL AND contractor_id IS NOT NULL)
                )

            -- ADJUSTMENT: warehouse only, reason + type required
            WHEN movement_type = 'ADJUSTMENT' THEN
                source_warehouse_id IS NOT NULL
                AND adjustment_type IS NOT NULL
                AND adjustment_reason IS NOT NULL
                AND supplier_id IS NULL
                AND source_work_order_id IS NULL
                AND destination_warehouse_id IS NULL
                AND destination_work_order_id IS NULL
                AND contractor_id IS NULL

            ELSE FALSE
        END
    );

-- ============================================================================
-- MATERIAL_MOVEMENT_LINES
-- ============================================================================
CREATE TABLE material_movement_lines (
    id            UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    movement_id   UUID           NOT NULL,
    company_id    UUID           NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    material_id   UUID           NOT NULL,
    quantity      NUMERIC(14,3)  NOT NULL CHECK (quantity > 0),
    notes         TEXT           NULL
);

CREATE UNIQUE INDEX uq_movement_lines_company_id ON material_movement_lines(company_id, id);

-- Composite FKs
ALTER TABLE material_movement_lines
    ADD CONSTRAINT fk_ml_movement
    FOREIGN KEY (company_id, movement_id)
    REFERENCES material_movements(company_id, id)
    ON DELETE CASCADE;

ALTER TABLE material_movement_lines
    ADD CONSTRAINT fk_ml_material
    FOREIGN KEY (company_id, material_id)
    REFERENCES materials(company_id, id)
    ON DELETE RESTRICT;

-- ============================================================================
-- USER_SCOPE_ASSIGNMENTS
-- ============================================================================
CREATE TABLE user_scope_assignments (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID        NOT NULL,
    company_id        UUID        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    project_id        UUID        NULL,
    work_location_id  UUID        NULL,
    warehouse_id      UUID        NULL,
    work_order_id     UUID        NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Exactly one scope FK must be non-null
ALTER TABLE user_scope_assignments
    ADD CONSTRAINT chk_scope_exactly_one CHECK (
        (CASE WHEN project_id IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN work_location_id IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN warehouse_id IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN work_order_id IS NOT NULL THEN 1 ELSE 0 END) = 1
    );

-- Composite FKs
ALTER TABLE user_scope_assignments
    ADD CONSTRAINT fk_scope_user
    FOREIGN KEY (company_id, user_id)
    REFERENCES user_profiles(company_id, id)
    ON DELETE CASCADE;

ALTER TABLE user_scope_assignments
    ADD CONSTRAINT fk_scope_project
    FOREIGN KEY (company_id, project_id)
    REFERENCES projects(company_id, id)
    ON DELETE CASCADE;

ALTER TABLE user_scope_assignments
    ADD CONSTRAINT fk_scope_work_location
    FOREIGN KEY (company_id, work_location_id)
    REFERENCES work_locations(company_id, id)
    ON DELETE CASCADE;

ALTER TABLE user_scope_assignments
    ADD CONSTRAINT fk_scope_warehouse
    FOREIGN KEY (company_id, warehouse_id)
    REFERENCES warehouses(company_id, id)
    ON DELETE CASCADE;

ALTER TABLE user_scope_assignments
    ADD CONSTRAINT fk_scope_work_order
    FOREIGN KEY (company_id, work_order_id)
    REFERENCES work_orders(company_id, id)
    ON DELETE CASCADE;

-- Partial unique indexes to prevent duplicate scope assignments
CREATE UNIQUE INDEX uq_scope_project ON user_scope_assignments(user_id, project_id) WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX uq_scope_work_location ON user_scope_assignments(user_id, work_location_id) WHERE work_location_id IS NOT NULL;
CREATE UNIQUE INDEX uq_scope_warehouse ON user_scope_assignments(user_id, warehouse_id) WHERE warehouse_id IS NOT NULL;
CREATE UNIQUE INDEX uq_scope_work_order ON user_scope_assignments(user_id, work_order_id) WHERE work_order_id IS NOT NULL;

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

-- Tenant filtering
CREATE INDEX idx_profiles_company ON user_profiles(company_id);
CREATE INDEX idx_projects_company ON projects(company_id);
CREATE INDEX idx_work_locations_company ON work_locations(company_id);
CREATE INDEX idx_warehouses_company ON warehouses(company_id);
CREATE INDEX idx_materials_company ON materials(company_id);
CREATE INDEX idx_suppliers_company ON suppliers(company_id);
CREATE INDEX idx_contractors_company ON contractors(company_id);
CREATE INDEX idx_work_orders_company ON work_orders(company_id);
CREATE INDEX idx_boq_company ON work_order_boq(company_id);
CREATE INDEX idx_movements_company ON material_movements(company_id);
CREATE INDEX idx_movement_lines_company ON material_movement_lines(company_id);

-- FK lookups
CREATE INDEX idx_work_orders_project ON work_orders(company_id, project_id);
CREATE INDEX idx_work_orders_location ON work_orders(company_id, work_location_id);
CREATE INDEX idx_boq_work_order ON work_order_boq(company_id, work_order_id);
CREATE INDEX idx_boq_material ON work_order_boq(company_id, material_id);

-- Movement balance calculations (critical for performance)
CREATE INDEX idx_movements_type ON material_movements(company_id, movement_type);
CREATE INDEX idx_movements_date ON material_movements(company_id, movement_date);
CREATE INDEX idx_movements_source_wh ON material_movements(company_id, source_warehouse_id) WHERE source_warehouse_id IS NOT NULL;
CREATE INDEX idx_movements_dest_wh ON material_movements(company_id, destination_warehouse_id) WHERE destination_warehouse_id IS NOT NULL;
CREATE INDEX idx_movements_source_wo ON material_movements(company_id, source_work_order_id) WHERE source_work_order_id IS NOT NULL;
CREATE INDEX idx_movements_dest_wo ON material_movements(company_id, destination_work_order_id) WHERE destination_work_order_id IS NOT NULL;
CREATE INDEX idx_movements_contractor ON material_movements(company_id, contractor_id) WHERE contractor_id IS NOT NULL;
CREATE INDEX idx_movements_supplier ON material_movements(company_id, supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX idx_movement_lines_movement ON material_movement_lines(movement_id);
CREATE INDEX idx_movement_lines_material ON material_movement_lines(company_id, material_id);

-- Scope assignments
CREATE INDEX idx_scope_user ON user_scope_assignments(user_id);
CREATE INDEX idx_scope_company ON user_scope_assignments(company_id);
