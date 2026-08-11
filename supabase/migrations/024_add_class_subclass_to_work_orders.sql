-- ============================================================================
-- INFRAFLOW — Add Class and Subclass columns to work_orders
-- Migration 024
-- ============================================================================

ALTER TABLE work_orders
    ADD COLUMN IF NOT EXISTS class TEXT NULL,
    ADD COLUMN IF NOT EXISTS subclass TEXT NULL;
