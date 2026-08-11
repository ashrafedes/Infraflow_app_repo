-- ============================================================================
-- INFRAFLOW — SaaS Subscription Layer
-- Migration 012: Functions, Triggers, Entitlement Logic
-- ============================================================================

-- ============================================================================
-- HELPER: is_super_admin() — Check if current user is a platform Super Admin
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT EXISTS (
        SELECT 1 FROM super_admins
        WHERE id = auth.uid() AND is_active = true
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- ============================================================================
-- HELPER: has_feature(key) — Check if caller's company has a feature enabled
-- Resolution priority: subscription_feature_overrides > plan_features > denied
-- ============================================================================
CREATE OR REPLACE FUNCTION public.has_feature(p_feature_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_company_id    UUID;
    v_subscription  RECORD;
    v_override      BOOLEAN;
    v_plan_default  BOOLEAN;
BEGIN
    -- Super admins have all features
    IF public.is_super_admin() THEN
        RETURN true;
    END IF;

    v_company_id := public.company_id();
    IF v_company_id IS NULL THEN
        RETURN false;
    END IF;

    -- Get subscription
    SELECT * INTO v_subscription
    FROM subscriptions
    WHERE company_id = v_company_id;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- Suspended or cancelled subscriptions: no features
    IF v_subscription.status IN ('suspended', 'cancelled') THEN
        RETURN false;
    END IF;

    -- Check override first (highest priority)
    SELECT is_enabled INTO v_override
    FROM subscription_feature_overrides
    WHERE subscription_id = v_subscription.id
      AND feature_key = p_feature_key;

    IF v_override IS NOT NULL THEN
        RETURN v_override;
    END IF;

    -- Fall back to plan default
    SELECT is_enabled INTO v_plan_default
    FROM plan_features
    WHERE plan_id = v_subscription.plan_id
      AND feature_key = p_feature_key;

    RETURN COALESCE(v_plan_default, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_feature(TEXT) TO authenticated;

-- ============================================================================
-- HELPER: get_max_users() — Effective user limit for caller's company
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_max_users()
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_result INTEGER;
BEGIN
    SELECT COALESCE(
        CASE WHEN s.max_users_override THEN s.max_users ELSE sp.default_max_users END,
        sp.default_max_users
    )
    INTO v_result
    FROM subscriptions s
    JOIN subscription_plans sp ON sp.id = s.plan_id
    WHERE s.company_id = public.company_id();

    RETURN COALESCE(v_result, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_max_users() TO authenticated;

-- ============================================================================
-- HELPER: get_active_user_count() — Current active user count for caller's company
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_active_user_count()
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_result INTEGER;
BEGIN
    SELECT count(*) INTO v_result
    FROM user_profiles
    WHERE company_id = public.company_id()
      AND is_active = true;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_user_count() TO authenticated;

-- ============================================================================
-- HELPER: subscription_status() — Current subscription status for caller's company
-- ============================================================================
CREATE OR REPLACE FUNCTION public.subscription_status()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_status TEXT;
BEGIN
    SELECT status INTO v_status
    FROM subscriptions
    WHERE company_id = public.company_id();

    RETURN COALESCE(v_status, 'none');
END;
$$;

GRANT EXECUTE ON FUNCTION public.subscription_status() TO authenticated;

-- ============================================================================
-- HELPER: get_subscription_info() — Full subscription info for caller's company
-- Returns: plan_code, plan_name, status, max_users, active_users, trial_ends_at
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_subscription_info()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'plan_code', sp.plan_code,
        'plan_name', sp.plan_name,
        'status', s.status,
        'max_users', COALESCE(
            CASE WHEN s.max_users_override THEN s.max_users ELSE sp.default_max_users END,
            sp.default_max_users
        ),
        'active_users', (
            SELECT count(*) FROM user_profiles
            WHERE company_id = s.company_id AND is_active = true
        ),
        'trial_ends_at', s.trial_ends_at,
        'current_period_start', s.current_period_start,
        'current_period_end', s.current_period_end,
        'suspended_reason', s.suspended_reason
    )
    INTO v_result
    FROM subscriptions s
    JOIN subscription_plans sp ON sp.id = s.plan_id
    WHERE s.company_id = public.company_id();

    RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_subscription_info() TO authenticated;

-- ============================================================================
-- HELPER: get_company_features() — All effective features for caller's company
-- Returns array of feature_keys that are enabled
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_company_features()
RETURNS TABLE (feature_key TEXT, is_enabled BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_company_id UUID;
    v_sub_id    UUID;
BEGIN
    IF public.is_super_admin() THEN
        RETURN QUERY
        SELECT f.feature_key, true::boolean
        FROM features f;
        RETURN;
    END IF;

    v_company_id := public.company_id();
    IF v_company_id IS NULL THEN
        RETURN;
    END IF;

    SELECT id INTO v_sub_id
    FROM subscriptions
    WHERE company_id = v_company_id
      AND status NOT IN ('suspended', 'cancelled');

    IF v_sub_id IS NULL THEN
        RETURN;
    END IF;

    -- Combine plan_features with overrides (overrides take precedence)
    RETURN QUERY
    SELECT
        f.feature_key,
        COALESCE(sfo.is_enabled, pf.is_enabled, false) AS is_enabled
    FROM features f
    LEFT JOIN plan_features pf
        ON pf.feature_key = f.feature_key
        AND pf.plan_id = (SELECT plan_id FROM subscriptions WHERE id = v_sub_id)
    LEFT JOIN subscription_feature_overrides sfo
        ON sfo.feature_key = f.feature_key
        AND sfo.subscription_id = v_sub_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_company_features() TO authenticated;

-- ============================================================================
-- TRIGGER: enforce_user_limit() — BEFORE INSERT on user_profiles
-- Concurrency-safe: locks the subscription row FOR UPDATE
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_user_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_max_users      INTEGER;
    v_active_count   INTEGER;
    v_sub_id         UUID;
BEGIN
    -- Skip enforcement when company_id is NULL (initial signup before company setup)
    IF NEW.company_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Lock the subscription row FOR UPDATE to serialize concurrent inserts
    SELECT id INTO v_sub_id
    FROM subscriptions
    WHERE company_id = NEW.company_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No subscription found for company %', NEW.company_id;
    END IF;

    -- Count active users (safe now — concurrent triggers are blocked)
    SELECT count(*) INTO v_active_count
    FROM user_profiles
    WHERE company_id = NEW.company_id
      AND is_active = true;

    -- Get effective max users
    SELECT COALESCE(
        CASE WHEN s.max_users_override THEN s.max_users ELSE sp.default_max_users END,
        sp.default_max_users
    )
    INTO v_max_users
    FROM subscriptions s
    JOIN subscription_plans sp ON sp.id = s.plan_id
    WHERE s.company_id = NEW.company_id;

    IF v_active_count >= v_max_users THEN
        RAISE EXCEPTION
            'User limit reached: % active users out of % allowed. Deactivate a user or upgrade your plan.',
            v_active_count, v_max_users;
    END IF;

    RETURN NEW;
END;
$$;

-- No EXECUTE grant — trigger only

CREATE TRIGGER trg_enforce_user_limit
    BEFORE INSERT ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.enforce_user_limit();

-- ============================================================================
-- TRIGGER: enforce_user_limit_on_reactivate() — BEFORE UPDATE on user_profiles
-- Prevents reactivating a user when the limit would be exceeded
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_user_limit_on_reactivate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_max_users      INTEGER;
    v_active_count   INTEGER;
BEGIN
    -- Only check when reactivating (is_active changes from false to true)
    IF OLD.is_active = false AND NEW.is_active = true THEN
        -- Lock subscription row to serialize
        PERFORM 1
        FROM subscriptions
        WHERE company_id = NEW.company_id
        FOR UPDATE;

        SELECT count(*) INTO v_active_count
        FROM user_profiles
        WHERE company_id = NEW.company_id
          AND is_active = true;

        SELECT COALESCE(
            CASE WHEN s.max_users_override THEN s.max_users ELSE sp.default_max_users END,
            sp.default_max_users
        )
        INTO v_max_users
        FROM subscriptions s
        JOIN subscription_plans sp ON sp.id = s.plan_id
        WHERE s.company_id = NEW.company_id;

        IF v_active_count >= v_max_users THEN
            RAISE EXCEPTION
                'User limit reached: cannot reactivate user. % active users out of % allowed.',
                v_active_count, v_max_users;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- No EXECUTE grant — trigger only

CREATE TRIGGER trg_enforce_user_limit_on_reactivate
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.enforce_user_limit_on_reactivate();

-- ============================================================================
-- TRIGGER: prevent_super_admin_company_user() — BEFORE INSERT on super_admins
-- Ensures mutual exclusivity: a user cannot be both a company user and super admin
-- ============================================================================
CREATE OR REPLACE FUNCTION public.prevent_super_admin_company_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM user_profiles WHERE id = NEW.id) THEN
        RAISE EXCEPTION 'User % is already a company user. Cannot be a Super Admin.', NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

-- No EXECUTE grant — trigger only

CREATE TRIGGER trg_prevent_super_admin_company_user
    BEFORE INSERT ON super_admins
    FOR EACH ROW EXECUTE FUNCTION public.prevent_super_admin_company_user();

-- ============================================================================
-- TRIGGER: update_updated_at on subscriptions
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_subscription_feature_overrides_updated_at
    BEFORE UPDATE ON subscription_feature_overrides
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_subscription_plans_updated_at
    BEFORE UPDATE ON subscription_plans
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
