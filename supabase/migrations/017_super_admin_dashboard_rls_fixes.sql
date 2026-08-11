-- ============================================================================
-- INFRAFLOW — Super Admin Dashboard: RLS Fixes + Platform KPI RPCs
-- Migration 017
-- ============================================================================
--
-- This migration:
--   1. Fixes RLS gap on subscription_plans and plan_features (write policies
--      were missing, so super admin plan/feature editing was silently denied).
--   2. Hardens is_super_admin() — schema-qualifies the privileged table
--      reference to prevent search_path shadowing in SECURITY DEFINER context.
--   3. Adds get_platform_kpis() — server-side aggregation of platform metrics
--      for the Super Admin Dashboard. All tier/threshold logic is centralized
--      here so the UI only renders what the server returns.
--   4. Adds get_company_features_for(p_company_id) — admin-scoped version of
--      get_company_features() that inspects an arbitrary company's entitlements.
--
-- SECURITY MODEL:
--   All SECURITY DEFINER functions use an explicit locked search_path and
--   schema-qualify ALL privileged table references (public.table_name) so that
--   a mutable search_path cannot redirect object resolution to a shadow table.
--   auth.uid() is already schema-qualified by Supabase.
--   All new RPCs explicitly check is_super_admin(). Non-super-admin callers
--   receive empty / no-op results. No client-supplied tenant context is
--   trusted. No dynamic SQL is used. All functions are read-only (STABLE).
-- ============================================================================


-- ============================================================================
-- 1. FIX RLS: subscription_plans and plan_features write policies
-- ----------------------------------------------------------------------------
-- Migration 013 enabled RLS and granted INSERT/UPDATE/DELETE to authenticated,
-- but created ONLY SELECT policies. With RLS enabled and no write policies,
-- ALL writes are denied — including for super admins. This made plan editing
-- and feature toggling in SuperAdminPlans.tsx silently fail.
--
-- These policies are additive — the existing SELECT policies remain, and
-- these new FOR ALL policies cover INSERT/UPDATE/DELETE for super admins only.
-- Company users are still denied writes (is_super_admin() returns false).
-- ============================================================================

CREATE POLICY plans_write ON public.subscription_plans
    FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY plan_features_write ON public.plan_features
    FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


-- ============================================================================
-- 2. HARDEN is_super_admin() — schema-qualify privileged table reference
-- ----------------------------------------------------------------------------
-- The original (migration 012) references the bare table name `super_admins`.
-- In a SECURITY DEFINER function, an unqualified table name is resolved via
-- search_path, which could be manipulated. Schema-qualify as
-- `public.super_admins` to eliminate this attack surface.
-- auth.uid() is already schema-qualified by Supabase and is safe.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.super_admins
        WHERE id = auth.uid() AND is_active = true
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;


-- ============================================================================
-- 3. get_platform_kpis() — Platform-level KPIs for Super Admin Dashboard
-- ----------------------------------------------------------------------------
-- SECURITY:
--   * SECURITY DEFINER with explicit search_path = public, auth
--   * STABLE (read-only — no INSERT/UPDATE/DELETE anywhere in the body)
--   * No dynamic SQL (all queries are static)
--   * All table references schema-qualified with public. prefix
--   * No client-supplied parameters (no tenant context trusted from caller)
--   * Guard: returns '{}' for non-super-admin callers
--
-- Returns a JSONB object with:
--   total_companies           INTEGER
--   active_companies          INTEGER  (subscription status = 'active')
--   free_trials               INTEGER  (subscription status = 'trial')
--   basic_companies           INTEGER  (plan_code = 'basic')
--   premium_companies         INTEGER  (plan_code = 'premium')
--   suspended_companies       INTEGER  (subscription status = 'suspended')
--   expiring_trials           INTEGER  (status='trial' AND trial_ends_at
--                                       between now and now() + 3 days)
--   total_active_users        INTEGER  (active user_profiles across all cos)
--   companies_near_user_limit JSONB    (array of operational companies at
--                                       >=80% utilization; suspended/cancelled
--                                       excluded)
--                                       each item: {company_id, name,
--                                       active_users, max_users, pct, tier}
--                                       tier: 'warning' | 'critical' | 'limit_reached'
--   recent_subscription_changes JSONB  (last 10 subscription_audit_log rows
--                                        with company name)
--
-- Tier thresholds (centralized here, not in UI):
--   80-89%   -> 'warning'
--   90-99%   -> 'critical'
--   100%     -> 'limit_reached'
--   effective_max_users = override if max_users_override=true, else plan default
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_platform_kpis()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_result         JSONB;
    v_near_limit     JSONB;
    v_recent_changes JSONB;
BEGIN
    -- Guard: only super admins may read platform-wide KPIs.
    -- Non-super-admin callers get an empty object — no platform data leaks.
    IF NOT public.is_super_admin() THEN
        RETURN '{}'::jsonb;
    END IF;

    -- ------------------------------------------------------------------
    -- Companies near their effective user limit (>= 80% utilization)
    -- effective_max_users = override when max_users_override=true, else
    -- plan default.
    -- Tier is computed server-side; the UI only renders the returned tier.
    -- Suspended/cancelled companies are excluded — they are not operational
    -- and should not appear as "approaching their user limit".
    -- ------------------------------------------------------------------
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'company_id',   c.id,
        'name',         c.name,
        'active_users', COALESCE(uc.active_users, 0),
        'max_users',    COALESCE(eff.max_users, 0),
        'pct',          CASE
                            WHEN COALESCE(eff.max_users, 0) = 0 THEN 0
                            ELSE ROUND(
                                COALESCE(uc.active_users, 0)::numeric
                                / eff.max_users * 100, 1
                            )
                        END,
        'tier',         CASE
                            WHEN COALESCE(eff.max_users, 0) = 0 THEN NULL
                            WHEN COALESCE(uc.active_users, 0) >= eff.max_users
                                THEN 'limit_reached'
                            WHEN COALESCE(uc.active_users, 0)::numeric / eff.max_users >= 0.90
                                THEN 'critical'
                            WHEN COALESCE(uc.active_users, 0)::numeric / eff.max_users >= 0.80
                                THEN 'warning'
                            ELSE NULL
                        END
    ) ORDER BY
        -- Sort: limit_reached first, then critical, then warning;
        -- within each tier, highest utilization first.
        CASE
            WHEN COALESCE(uc.active_users, 0) >= COALESCE(eff.max_users, 0) THEN 0
            WHEN COALESCE(uc.active_users, 0)::numeric / NULLIF(eff.max_users, 0) >= 0.90 THEN 1
            ELSE 2
        END,
        COALESCE(uc.active_users, 0)::numeric / NULLIF(eff.max_users, 0) DESC
    ), '[]'::jsonb)
    INTO v_near_limit
    FROM public.companies c
    JOIN public.subscriptions s ON s.company_id = c.id
    JOIN public.subscription_plans sp ON sp.id = s.plan_id
    LEFT JOIN LATERAL (
        SELECT COALESCE(
            CASE WHEN s.max_users_override THEN s.max_users ELSE sp.default_max_users END,
            sp.default_max_users
        ) AS max_users
    ) eff ON true
    LEFT JOIN LATERAL (
        SELECT count(*)::int AS active_users
        FROM public.user_profiles up
        WHERE up.company_id = c.id AND up.is_active = true
    ) uc ON true
    WHERE COALESCE(eff.max_users, 0) > 0
      AND COALESCE(uc.active_users, 0)::numeric / eff.max_users >= 0.80
      AND s.status NOT IN ('suspended', 'cancelled');

    -- ------------------------------------------------------------------
    -- Recent subscription changes (last 10 audit log entries with company name)
    -- The LIMIT must be in a subquery — without GROUP BY, jsonb_agg produces
    -- a single row, so LIMIT on the outer SELECT would be a no-op.
    -- ------------------------------------------------------------------
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',           sub.id,
        'company_id',   sub.company_id,
        'company_name', sub.company_name,
        'action',       sub.action,
        'old_value',    sub.old_value,
        'new_value',    sub.new_value,
        'performed_by', sub.performed_by,
        'performed_at', sub.performed_at
    ) ORDER BY sub.performed_at DESC), '[]'::jsonb)
    INTO v_recent_changes
    FROM (
        SELECT
            al.id,
            al.company_id,
            c.name AS company_name,
            al.action,
            al.old_value,
            al.new_value,
            al.performed_by,
            al.performed_at
        FROM public.subscription_audit_log al
        JOIN public.companies c ON c.id = al.company_id
        ORDER BY al.performed_at DESC
        LIMIT 10
    ) sub;

    -- ------------------------------------------------------------------
    -- Assemble final result
    -- ------------------------------------------------------------------
    SELECT jsonb_build_object(
        'total_companies',     (SELECT count(*) FROM public.companies),
        'active_companies',    (SELECT count(*) FROM public.subscriptions WHERE status = 'active'),
        'free_trials',         (SELECT count(*) FROM public.subscriptions WHERE status = 'trial'),
        'basic_companies',     (SELECT count(*) FROM public.subscriptions s JOIN public.subscription_plans sp ON sp.id = s.plan_id WHERE sp.plan_code = 'basic'),
        'premium_companies',   (SELECT count(*) FROM public.subscriptions s JOIN public.subscription_plans sp ON sp.id = s.plan_id WHERE sp.plan_code = 'premium'),
        'suspended_companies', (SELECT count(*) FROM public.subscriptions WHERE status = 'suspended'),
        'expiring_trials',     (
            SELECT count(*) FROM public.subscriptions
            WHERE status = 'trial'
              AND trial_ends_at IS NOT NULL
              AND trial_ends_at BETWEEN now() AND now() + INTERVAL '3 days'
        ),
        'total_active_users',  (SELECT count(*) FROM public.user_profiles WHERE is_active = true),
        'companies_near_user_limit',  v_near_limit,
        'recent_subscription_changes', v_recent_changes
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_kpis() TO authenticated;


-- ============================================================================
-- 4. get_company_features_for(p_company_id) — Admin-scoped feature inspection
-- ----------------------------------------------------------------------------
-- SECURITY:
--   * SECURITY DEFINER with explicit search_path = public, auth
--   * STABLE (read-only)
--   * No dynamic SQL
--   * All table references schema-qualified with public. prefix
--   * Guard: returns empty set for non-super-admin callers
--   * p_company_id is the only parameter and is used solely to scope a SELECT;
--     it cannot inject into any write path.
--
-- Same resolution logic as get_company_features() but targets an explicit
-- company_id instead of the caller's own company. Super admin only.
-- Returns: TABLE (feature_key TEXT, is_enabled BOOLEAN)
--
-- UNIQUENESS GUARANTEE:
--   The subscriptions table has a UNIQUE constraint on company_id
--   (migration 011, line 52: `company_id UUID NOT NULL UNIQUE`).
--   Each company can have at most ONE subscription row total — not just one
--   "current" subscription. Therefore the SELECT INTO v_sub_id below can
--   match at most one row; no additional constraint or LIMIT 1 is needed.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_company_features_for(p_company_id UUID)
RETURNS TABLE (feature_key TEXT, is_enabled BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_sub_id UUID;
BEGIN
    -- Guard: only super admins may inspect another company's features.
    IF NOT public.is_super_admin() THEN
        RETURN;
    END IF;

    IF p_company_id IS NULL THEN
        RETURN;
    END IF;

    SELECT id INTO v_sub_id
    FROM public.subscriptions
    WHERE company_id = p_company_id
      AND status NOT IN ('suspended', 'cancelled');

    IF v_sub_id IS NULL THEN
        -- No active subscription: return all features as disabled
        RETURN QUERY
        SELECT f.feature_key, false::boolean
        FROM public.features f;
        RETURN;
    END IF;

    -- Combine plan_features with overrides (overrides take precedence)
    RETURN QUERY
    SELECT
        f.feature_key,
        COALESCE(sfo.is_enabled, pf.is_enabled, false) AS is_enabled
    FROM public.features f
    LEFT JOIN public.plan_features pf
        ON pf.feature_key = f.feature_key
        AND pf.plan_id = (SELECT plan_id FROM public.subscriptions WHERE id = v_sub_id)
    LEFT JOIN public.subscription_feature_overrides sfo
        ON sfo.feature_key = f.feature_key
        AND sfo.subscription_id = v_sub_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_company_features_for(UUID) TO authenticated;
