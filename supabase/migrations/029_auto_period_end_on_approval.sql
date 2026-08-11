-- ============================================================================
-- INFRAFLOW — Auto-set current_period_end on plan approval
-- Migration 029
-- ============================================================================
--
-- When a super admin approves a plan upgrade, the approve_plan_upgrade()
-- function sets current_period_start = now() but never sets
-- current_period_end. This means active (premium/basic) subscriptions
-- have no expiration date, and the subscription page shows nothing.
--
-- FIX: Update approve_plan_upgrade() to also set current_period_end
-- based on the new plan's billing_period:
--   - yearly  → current_period_start + 1 year
--   - monthly → current_period_start + 1 month
--   - NULL/other → current_period_start + 1 year (default)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.approve_plan_upgrade(
    p_request_id   UUID,
    p_admin_notes  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_request            RECORD;
    v_subscription       RECORD;
    v_old_plan_code      TEXT;
    v_new_plan_code      TEXT;
    v_requested_active   BOOLEAN;
    v_new_billing_period TEXT;
    v_new_period_end     TIMESTAMPTZ;
BEGIN
    -- Guard: only super admins may approve
    IF NOT public.is_super_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only super admins can approve upgrade requests');
    END IF;

    -- Lock the request row to prevent concurrent approval
    SELECT * INTO v_request
    FROM public.subscription_upgrade_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found');
    END IF;

    IF v_request.status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request is no longer pending (status: ' || v_request.status || ')');
    END IF;

    -- Validate requested plan is still active
    SELECT is_active, billing_period INTO v_requested_active, v_new_billing_period
    FROM public.subscription_plans
    WHERE id = v_request.requested_plan_id;

    IF NOT FOUND OR NOT v_requested_active THEN
        RETURN jsonb_build_object('success', false, 'error', 'Requested plan is no longer available');
    END IF;

    -- Lock the subscription row for update
    SELECT * INTO v_subscription
    FROM public.subscriptions
    WHERE company_id = v_request.company_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'No subscription found for this company');
    END IF;

    -- Capture old plan code for audit
    SELECT plan_code INTO v_old_plan_code
    FROM public.subscription_plans
    WHERE id = v_subscription.plan_id;

    SELECT plan_code INTO v_new_plan_code
    FROM public.subscription_plans
    WHERE id = v_request.requested_plan_id;

    -- Compute new period end based on billing period
    v_new_period_end := CASE
        WHEN v_new_billing_period = 'monthly' THEN now() + interval '1 month'
        ELSE now() + interval '1 year'  -- yearly or NULL defaults to 1 year
    END;

    -- Update the subscription
    UPDATE public.subscriptions
    SET
        plan_id = v_request.requested_plan_id,
        status = CASE
            WHEN v_subscription.status = 'trial' THEN 'active'
            ELSE v_subscription.status
        END,
        trial_started_at = CASE
            WHEN v_subscription.status = 'trial' THEN NULL
            ELSE v_subscription.trial_started_at
        END,
        trial_ends_at = CASE
            WHEN v_subscription.status = 'trial' THEN NULL
            ELSE v_subscription.trial_ends_at
        END,
        current_period_start = CASE
            WHEN v_subscription.status = 'trial' THEN now()
            ELSE v_subscription.current_period_start
        END,
        current_period_end = v_new_period_end
    WHERE company_id = v_request.company_id;

    -- Write audit log
    INSERT INTO public.subscription_audit_log
        (company_id, action, old_value, new_value, performed_by)
    VALUES (
        v_request.company_id,
        'plan_changed',
        jsonb_build_object(
            'plan_code', v_old_plan_code,
            'status', v_subscription.status,
            'max_users_override', v_subscription.max_users_override,
            'max_users', v_subscription.max_users,
            'source', 'upgrade_request'
        ),
        jsonb_build_object(
            'plan_code', v_new_plan_code,
            'status', CASE WHEN v_subscription.status = 'trial' THEN 'active' ELSE v_subscription.status END,
            'max_users_override', v_subscription.max_users_override,
            'max_users', v_subscription.max_users,
            'source', 'upgrade_request',
            'request_id', v_request.id,
            'period_end', v_new_period_end
        ),
        auth.uid()
    );

    -- Mark request as approved
    UPDATE public.subscription_upgrade_requests
    SET
        status = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        admin_notes = p_admin_notes
    WHERE id = p_request_id;

    RETURN jsonb_build_object(
        'success', true,
        'error', null,
        'new_plan_code', v_new_plan_code
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_plan_upgrade(UUID, TEXT) TO authenticated;
