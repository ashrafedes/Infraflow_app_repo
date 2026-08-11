-- ============================================================================
-- Fix: enforce_user_limit trigger must skip when company_id is NULL
-- (auth trigger creates user_profiles with NULL company_id during signup)
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
