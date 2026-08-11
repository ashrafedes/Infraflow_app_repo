-- ============================================================================
-- INFRAFLOW — Set security_invoker = true on all views
-- Migration 026
-- ============================================================================
--
-- PostgreSQL 15+ supports security_invoker = true on views. When set, the
-- view executes with the CALLER's privileges (the authenticated Supabase
-- user) instead of the OWNER's privileges (postgres superuser). This means
-- Row Level Security on the underlying tables is now RESPECTED when
-- querying through views.
--
-- This is a belt-and-suspenders fix alongside the explicit
-- WHERE company_id = company_id() filters added in migration 025.
-- With both in place, cross-company data isolation is enforced at two
-- levels: the view's WHERE clause AND RLS on the base tables.
-- ============================================================================

ALTER VIEW v_movement_details SET (security_invoker = true);
ALTER VIEW v_warehouse_balance SET (security_invoker = true);
ALTER VIEW v_work_order_balance SET (security_invoker = true);
ALTER VIEW v_contractor_balance SET (security_invoker = true);
ALTER VIEW v_wo_material_summary SET (security_invoker = true);
