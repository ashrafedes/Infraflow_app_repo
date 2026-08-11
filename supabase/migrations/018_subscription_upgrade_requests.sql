-- ============================================================================
-- INFRAFLOW — Subscription Upgrade Request Workflow
-- Migration 018
-- ============================================================================
--
-- This migration implements the company-admin → super-admin upgrade request
-- workflow:
--   1. Company Admin views available plans and requests an upgrade.
--   2. Request is stored in subscription_upgrade_requests (pending).
--   3. Super Admin reviews the request and approves or rejects it.
--   4. On approval: subscription is updated server-side, audit log written,
--      request marked approved — all atomically in one transaction.
--   5. On rejection: request marked rejected, no subscription change.
--
-- SECURITY MODEL:
--   * All RPCs are SECURITY DEFINER with explicit search_path = public, auth
--   * All table references schema-qualified with public. prefix
--   * Company admins can only create/view/cancel requests for their own company
--   * Only super admins can approve/reject requests
--   * No direct subscription UPDATE from the frontend — only via RPC
--   * Approval is atomic with SELECT FOR UPDATE to prevent double-approval
--   * No dynamic SQL; all functions are explicit
--
-- FUTURE: This architecture is ready for Stripe integration. A future
-- migration can add a stripe_checkout_session_id column and insert a
-- Stripe checkout step between request creation and approval.
-- ============================================================================


-- ============================================================================
-- 1. Enable btree_gist extension (for EXCLUDE constraint)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS btree_gist;


-- ============================================================================
-- 2. subscription_upgrade_requests table
-- ============================================================================
CREATE TABLE public.subscription_upgrade_requests (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    requested_by      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    current_plan_id   UUID        NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
    requested_plan_id UUID        NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
    status            TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by       UUID        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at       TIMESTAMPTZ NULL,
    admin_notes       TEXT        NULL,
    rejection_reason  TEXT        NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Prevent duplicate pending requests for the same company
    CONSTRAINT one_pending_per_company EXCLUDE (
        company_id WITH =
    ) WHERE (status = 'pending')
);

CREATE INDEX idx_upgrade_requests_company
    ON public.subscription_upgrade_requests(company_id, requested_at DESC);

CREATE INDEX idx_upgrade_requests_pending
    ON public.subscription_upgrade_requests(status)
    WHERE status = 'pending';


-- ============================================================================
-- 3. updated_at trigger (reuse existing update_updated_at function)
-- ============================================================================
CREATE TRIGGER trg_upgrade_requests_updated_at
    BEFORE UPDATE ON public.subscription_upgrade_requests
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ============================================================================
-- 4. RLS Policies
-- ============================================================================
ALTER TABLE public.subscription_upgrade_requests ENABLE ROW LEVEL SECURITY;

-- SELECT: company admin sees own company's requests; super admin sees all
CREATE POLICY upgrade_requests_select ON public.subscription_upgrade_requests
    FOR SELECT USING (
        company_id = public.company_id()
        OR public.is_super_admin()
    );

-- INSERT: company admin can insert only for own company, only pending,
-- only if requested_by = auth.uid()
CREATE POLICY upgrade_requests_insert ON public.subscription_upgrade_requests
    FOR INSERT WITH CHECK (
        company_id = public.company_id()
        AND requested_by = auth.uid()
        AND status = 'pending'
    );

-- UPDATE: super admin can update (approve/reject).
-- Company admin can update only to cancel own pending requests.
CREATE POLICY upgrade_requests_update ON public.subscription_upgrade_requests
    FOR UPDATE USING (
        public.is_super_admin()
        OR (
            company_id = public.company_id()
            AND requested_by = auth.uid()
        )
    ) WITH CHECK (
        public.is_super_admin()
        OR (
            company_id = public.company_id()
            AND requested_by = auth.uid()
            AND status = 'cancelled'
        )
    );

-- No DELETE policy — append-only audit trail
-- (RLS enabled with no DELETE policy = DELETE denied for all)


-- ============================================================================
-- 5. Grants
-- ============================================================================
GRANT SELECT, INSERT, UPDATE ON public.subscription_upgrade_requests TO authenticated;


-- ============================================================================
-- 6. RPC: request_plan_upgrade(p_requested_plan_id UUID)
-- ----------------------------------------------------------------------------
-- Company admin requests an upgrade to a higher-tier plan.
-- Validates: plan exists, is active, has higher sort_order than current plan,
-- and no existing pending request for this company.
-- Returns: JSONB { success: boolean, request_id: uuid | null, error: text | null }
-- ============================================================================
CREATE OR REPLACE FUNCTION public.request_plan_upgrade(p_requested_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_company_id        UUID;
    v_current_plan_id   UUID;
    v_current_sort      INTEGER;
    v_requested_sort    INTEGER;
    v_requested_active  BOOLEAN;
    v_existing_pending  UUID;
    v_new_id            UUID;
BEGIN
    -- Super admins cannot request upgrades (they manage subscriptions directly)
    IF public.is_super_admin() THEN
        RETURN jsonb_build_object('success', false, 'request_id', null, 'error', 'Super admins cannot request upgrades');
    END IF;

    v_company_id := public.company_id();
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'request_id', null, 'error', 'No company associated with this user');
    END IF;

    -- Get current subscription's plan
    SELECT plan_id INTO v_current_plan_id
    FROM public.subscriptions
    WHERE company_id = v_company_id;

    IF v_current_plan_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'request_id', null, 'error', 'No subscription found');
    END IF;

    -- Get current plan sort_order
    SELECT sort_order INTO v_current_sort
    FROM public.subscription_plans
    WHERE id = v_current_plan_id;

    -- Validate requested plan exists, is active, and is an upgrade
    SELECT is_active, sort_order INTO v_requested_active, v_requested_sort
    FROM public.subscription_plans
    WHERE id = p_requested_plan_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'request_id', null, 'error', 'Requested plan not found');
    END IF;

    IF NOT v_requested_active THEN
        RETURN jsonb_build_object('success', false, 'request_id', null, 'error', 'Requested plan is not active');
    END IF;

    IF v_requested_sort <= v_current_sort THEN
        RETURN jsonb_build_object('success', false, 'request_id', null, 'error', 'Requested plan must be a higher tier than current plan');
    END IF;

    -- Check for existing pending request (double safety on top of EXCLUDE constraint)
    SELECT id INTO v_existing_pending
    FROM public.subscription_upgrade_requests
    WHERE company_id = v_company_id AND status = 'pending';

    IF v_existing_pending IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'request_id', null, 'error', 'You already have a pending upgrade request');
    END IF;

    -- Insert the request
    INSERT INTO public.subscription_upgrade_requests
        (company_id, requested_by, current_plan_id, requested_plan_id, status)
    VALUES
        (v_company_id, auth.uid(), v_current_plan_id, p_requested_plan_id, 'pending')
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('success', true, 'request_id', v_new_id, 'error', null);
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_plan_upgrade(UUID) TO authenticated;


-- ============================================================================
-- 7. RPC: cancel_plan_upgrade(p_request_id UUID)
-- ----------------------------------------------------------------------------
-- Company admin cancels their own pending upgrade request.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cancel_plan_upgrade(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_company_id    UUID;
    v_status        TEXT;
BEGIN
    IF public.is_super_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Super admins cannot cancel requests via this RPC');
    END IF;

    v_company_id := public.company_id();
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No company associated with this user');
    END IF;

    -- Lock the row and validate ownership + status
    SELECT company_id, status INTO v_company_id, v_status
    FROM public.subscription_upgrade_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found');
    END IF;

    IF v_company_id != public.company_id() THEN
        RETURN jsonb_build_object('success', false, 'error', 'You can only cancel your own requests');
    END IF;

    IF v_status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only pending requests can be cancelled');
    END IF;

    UPDATE public.subscription_upgrade_requests
    SET status = 'cancelled'
    WHERE id = p_request_id;

    RETURN jsonb_build_object('success', true, 'error', null);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_plan_upgrade(UUID) TO authenticated;


-- ============================================================================
-- 8. RPC: approve_plan_upgrade(p_request_id UUID, p_admin_notes TEXT)
-- ----------------------------------------------------------------------------
-- Super Admin approves a pending upgrade request.
-- ATOMIC: locks request row, validates, updates subscription, writes audit
-- log, marks request approved — all in one transaction.
-- Concurrency-safe: SELECT FOR UPDATE prevents double-approval.
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
    SELECT is_active INTO v_requested_active
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
            WHEN v_subscription.current_period_start IS NULL THEN now()
            ELSE v_subscription.current_period_start
        END
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
            'request_id', v_request.id
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


-- ============================================================================
-- 9. RPC: reject_plan_upgrade(p_request_id UUID, p_rejection_reason TEXT)
-- ----------------------------------------------------------------------------
-- Super Admin rejects a pending upgrade request.
-- No subscription change is made.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reject_plan_upgrade(
    p_request_id        UUID,
    p_rejection_reason  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_status    TEXT;
BEGIN
    IF NOT public.is_super_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only super admins can reject upgrade requests');
    END IF;

    -- Lock the row
    SELECT status INTO v_status
    FROM public.subscription_upgrade_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found');
    END IF;

    IF v_status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request is no longer pending (status: ' || v_status || ')');
    END IF;

    IF p_rejection_reason IS NULL OR trim(p_rejection_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Rejection reason is required');
    END IF;

    UPDATE public.subscription_upgrade_requests
    SET
        status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        rejection_reason = p_rejection_reason
    WHERE id = p_request_id;

    RETURN jsonb_build_object('success', true, 'error', null);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_plan_upgrade(UUID, TEXT) TO authenticated;
