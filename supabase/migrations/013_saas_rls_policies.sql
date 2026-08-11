-- ============================================================================
-- INFRAFLOW — SaaS Subscription Layer
-- Migration 013: RLS Policies for Subscription Tables
-- ============================================================================

-- ============================================================================
-- FEATURES — RLS
-- ============================================================================
ALTER TABLE features ENABLE ROW LEVEL SECURITY;

CREATE POLICY features_select ON features
    FOR SELECT USING (true);

-- ============================================================================
-- SUBSCRIPTION_PLANS — RLS
-- ============================================================================
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY plans_select ON subscription_plans
    FOR SELECT USING (true);

-- ============================================================================
-- PLAN_FEATURES — RLS
-- ============================================================================
ALTER TABLE plan_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY plan_features_select ON plan_features
    FOR SELECT USING (true);

-- ============================================================================
-- SUBSCRIPTIONS — RLS
-- Company Admin can SELECT own company's subscription
-- Super Admin can SELECT/UPDATE all subscriptions
-- No INSERT/DELETE via API (system + Super Admin only via service role)
-- ============================================================================
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_select ON subscriptions
    FOR SELECT USING (
        company_id = public.company_id()
        OR public.is_super_admin()
    );

CREATE POLICY subscriptions_update ON subscriptions
    FOR UPDATE USING (
        public.is_super_admin()
    );

-- ============================================================================
-- SUBSCRIPTION_FEATURE_OVERRIDES — RLS
-- Company Admin can SELECT own company's overrides
-- Super Admin can INSERT/UPDATE/DELETE all overrides
-- ============================================================================
ALTER TABLE subscription_feature_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY sub_overrides_select ON subscription_feature_overrides
    FOR SELECT USING (
        subscription_id IN (
            SELECT id FROM subscriptions WHERE company_id = public.company_id()
        )
        OR public.is_super_admin()
    );

CREATE POLICY sub_overrides_insert ON subscription_feature_overrides
    FOR INSERT WITH CHECK (public.is_super_admin());

CREATE POLICY sub_overrides_update ON subscription_feature_overrides
    FOR UPDATE USING (public.is_super_admin());

CREATE POLICY sub_overrides_delete ON subscription_feature_overrides
    FOR DELETE USING (public.is_super_admin());

-- ============================================================================
-- SUPER_ADMINS — RLS
-- Super Admin only — no company user access
-- ============================================================================
ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY super_admins_select ON super_admins
    FOR SELECT USING (public.is_super_admin());

CREATE POLICY super_admins_insert ON super_admins
    FOR INSERT WITH CHECK (public.is_super_admin());

CREATE POLICY super_admins_update ON super_admins
    FOR UPDATE USING (public.is_super_admin());

CREATE POLICY super_admins_delete ON super_admins
    FOR DELETE USING (public.is_super_admin());

-- ============================================================================
-- SUBSCRIPTION_AUDIT_LOG — RLS
-- Company Admin can SELECT own company's audit log (read-only)
-- Super Admin can SELECT/INSERT all
-- ============================================================================
ALTER TABLE subscription_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_select ON subscription_audit_log
    FOR SELECT USING (
        company_id = public.company_id()
        OR public.is_super_admin()
    );

CREATE POLICY audit_log_insert ON subscription_audit_log
    FOR INSERT WITH CHECK (public.is_super_admin());

-- ============================================================================
-- UPDATE EXISTING POLICIES — Add Super Admin access
-- ============================================================================

-- COMPANIES: Add super admin to SELECT and UPDATE
DROP POLICY IF EXISTS companies_select ON companies;
CREATE POLICY companies_select ON companies
    FOR SELECT USING (
        id = public.company_id()
        OR public.is_super_admin()
    );

DROP POLICY IF EXISTS companies_update ON companies;
CREATE POLICY companies_update ON companies
    FOR UPDATE USING (
        id = public.company_id()
        AND public.user_role() = 'company_admin'
        OR public.is_super_admin()
    );

-- USER_PROFILES: Add super admin to SELECT, UPDATE, DELETE
DROP POLICY IF EXISTS profiles_select ON user_profiles;
CREATE POLICY profiles_select ON user_profiles
    FOR SELECT USING (
        company_id = public.company_id()
        OR (company_id IS NULL AND id = auth.uid())
        OR public.is_super_admin()
    );

DROP POLICY IF EXISTS profiles_update ON user_profiles;
CREATE POLICY profiles_update ON user_profiles
    FOR UPDATE USING (
        id = auth.uid()
        OR (
            company_id = public.company_id()
            AND public.user_role() = 'company_admin'
        )
        OR public.is_super_admin()
    );

DROP POLICY IF EXISTS profiles_delete ON user_profiles;
CREATE POLICY profiles_delete ON user_profiles
    FOR DELETE USING (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
        OR public.is_super_admin()
    );

-- ============================================================================
-- GRANTS for Super Admin tables
-- ============================================================================
-- Super admin INSERT/UPDATE/DELETE on subscription tables
-- These are granted to authenticated but gated by RLS (is_super_admin check)
GRANT INSERT, UPDATE, DELETE ON subscription_plans TO authenticated;
GRANT INSERT, UPDATE, DELETE ON plan_features TO authenticated;
GRANT INSERT, UPDATE, DELETE ON subscriptions TO authenticated;
GRANT INSERT, DELETE ON subscription_feature_overrides TO authenticated;
GRANT INSERT, UPDATE, DELETE ON super_admins TO authenticated;
GRANT INSERT ON subscription_audit_log TO authenticated;
