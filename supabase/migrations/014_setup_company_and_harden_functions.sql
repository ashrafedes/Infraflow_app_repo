-- ============================================================================
-- INFRAFLOW — SaaS Subscription Layer
-- Migration 014: Update setup_company() + Harden Existing SECURITY DEFINER Functions
-- ============================================================================

-- ============================================================================
-- UPDATE: setup_company() — Now creates subscription + audit log atomically
-- ============================================================================
CREATE OR REPLACE FUNCTION public.setup_company(p_company_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_company_id   UUID;
    v_plan_id      UUID;
    v_trial_days   INTEGER;
    v_trial_ends   TIMESTAMPTZ;
    v_max_users    INTEGER;
BEGIN
    -- Step 1: Create the company
    INSERT INTO public.companies (name)
    VALUES (p_company_name)
    RETURNING id INTO v_company_id;

    -- Step 2: Assign the current user to the company
    UPDATE public.user_profiles
    SET company_id = v_company_id
    WHERE id = auth.uid()
      AND company_id IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User already has a company assigned or user profile not found';
    END IF;

    -- Step 3: Create the initial subscription (FREE TRIAL)
    SELECT id, trial_duration_days, default_max_users
    INTO v_plan_id, v_trial_days, v_max_users
    FROM subscription_plans
    WHERE plan_code = 'free_trial' AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Free trial plan not found in database';
    END IF;

    v_trial_ends := now() + v_trial_days * interval '1 day';

    INSERT INTO public.subscriptions (
        company_id,
        plan_id,
        status,
        trial_started_at,
        trial_ends_at
    )
    VALUES (
        v_company_id,
        v_plan_id,
        'trial',
        now(),
        v_trial_ends
    );

    -- Step 4: Audit log
    INSERT INTO public.subscription_audit_log (company_id, action, old_value, new_value, performed_by)
    VALUES (
        v_company_id,
        'subscription_created',
        NULL,
        jsonb_build_object(
            'plan_code', 'free_trial',
            'status', 'trial',
            'trial_ends_at', v_trial_ends,
            'max_users', v_max_users
        ),
        auth.uid()
    );

    -- Return the new company ID
    RETURN v_company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.setup_company(TEXT) TO authenticated;

-- ============================================================================
-- HARDEN: Existing SECURITY DEFINER functions — add SET search_path
-- These functions already exist from earlier migrations but may lack
-- explicit search_path. Recreate with SET search_path = public, auth.
-- ============================================================================

-- company_id() — already has search_path from 003, but ensure it
CREATE OR REPLACE FUNCTION public.company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT company_id FROM user_profiles WHERE id = auth.uid();
$$;

-- user_role() — already has search_path from 003, but ensure it
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT role FROM user_profiles WHERE id = auth.uid();
$$;

-- handle_new_user() — ensure search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email, full_name, company_id, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        NULL,
        'company_admin'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

-- set_company_id() — ensure search_path
CREATE OR REPLACE FUNCTION public.set_company_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF NEW.company_id IS NULL THEN
        NEW.company_id := public.company_id();
    END IF;
    RETURN NEW;
END;
$$;

-- set_responsible_user() — ensure search_path
CREATE OR REPLACE FUNCTION public.set_responsible_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF NEW.responsible_user_id IS NULL THEN
        NEW.responsible_user_id := auth.uid();
    END IF;
    RETURN NEW;
END;
$$;

-- auto_generate_movement_number() — ensure search_path
CREATE OR REPLACE FUNCTION public.auto_generate_movement_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_number TEXT;
BEGIN
    v_number := public.generate_movement_number(NEW.company_id);
    NEW.movement_number := v_number;
    RETURN NEW;
END;
$$;

-- set_line_company_id() — ensure search_path
CREATE OR REPLACE FUNCTION public.set_line_company_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF NEW.company_id IS NULL THEN
        SELECT company_id INTO NEW.company_id
        FROM material_movements
        WHERE id = NEW.movement_id;
    END IF;
    RETURN NEW;
END;
$$;

-- generate_movement_number() — ensure search_path
CREATE OR REPLACE FUNCTION public.generate_movement_number(p_company_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_next_val INTEGER;
    v_number   TEXT;
BEGIN
    INSERT INTO movement_number_counter (company_id, last_number)
    VALUES (p_company_id, 0)
    ON CONFLICT (company_id) DO UPDATE
        SET last_number = movement_number_counter.last_number + 1
    RETURNING last_number INTO v_next_val;

    v_number := 'MOV-' || lpad(v_next_val::text, 6, '0');
    RETURN v_number;
END;
$$;

-- get_warehouse_balance() — ensure search_path (already fixed in 009)
CREATE OR REPLACE FUNCTION public.get_warehouse_balance(
    p_company_id UUID,
    p_warehouse_id UUID,
    p_material_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_balance NUMERIC := 0;
BEGIN
    SELECT COALESCE(SUM(
        CASE
            WHEN m.destination_warehouse_id = p_warehouse_id THEN
                CASE
                    WHEN m.movement_type = 'RECEIPT'   THEN ml.quantity
                    WHEN m.movement_type = 'TRANSFER'  THEN ml.quantity
                    WHEN m.movement_type = 'RETURN'    THEN ml.quantity
                    WHEN m.movement_type = 'ADJUSTMENT' AND m.adjustment_type = 'increase' THEN ml.quantity
                    ELSE 0
                END
            WHEN m.source_warehouse_id = p_warehouse_id THEN
                CASE
                    WHEN m.movement_type = 'ISSUE'     THEN -ml.quantity
                    WHEN m.movement_type = 'TRANSFER'  THEN -ml.quantity
                    WHEN m.movement_type = 'ADJUSTMENT' AND m.adjustment_type = 'decrease' THEN -ml.quantity
                    ELSE 0
                END
            ELSE 0
        END
    ), 0)
    INTO v_balance
    FROM material_movements m
    JOIN material_movement_lines ml ON ml.movement_id = m.id
    WHERE m.company_id = p_company_id
      AND (m.destination_warehouse_id = p_warehouse_id OR m.source_warehouse_id = p_warehouse_id)
      AND ml.material_id = p_material_id;

    RETURN v_balance;
END;
$$;

-- get_wo_on_hand() — ensure search_path
CREATE OR REPLACE FUNCTION public.get_wo_on_hand(
    p_company_id UUID,
    p_work_order_id UUID,
    p_material_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_balance NUMERIC := 0;
BEGIN
    SELECT COALESCE(SUM(
        CASE
            WHEN m.destination_work_order_id = p_work_order_id THEN
                CASE
                    WHEN m.movement_type = 'ISSUE'    THEN ml.quantity
                    WHEN m.movement_type = 'TRANSFER' THEN ml.quantity
                    ELSE 0
                END
            WHEN m.source_work_order_id = p_work_order_id THEN
                CASE
                    WHEN m.movement_type = 'USAGE'    THEN -ml.quantity
                    WHEN m.movement_type = 'TRANSFER' THEN -ml.quantity
                    WHEN m.movement_type = 'RETURN'   THEN -ml.quantity
                    ELSE 0
                END
            ELSE 0
        END
    ), 0)
    INTO v_balance
    FROM material_movements m
    JOIN material_movement_lines ml ON ml.movement_id = m.id
    WHERE m.company_id = p_company_id
      AND (m.destination_work_order_id = p_work_order_id OR m.source_work_order_id = p_work_order_id)
      AND ml.material_id = p_material_id;

    RETURN v_balance;
END;
$$;

-- get_contractor_balance() — ensure search_path
CREATE OR REPLACE FUNCTION public.get_contractor_balance(
    p_company_id UUID,
    p_contractor_id UUID,
    p_material_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_balance NUMERIC := 0;
BEGIN
    SELECT COALESCE(SUM(
        CASE
            WHEN m.movement_type = 'TRANSFER' AND m.contractor_id = p_contractor_id THEN ml.quantity
            WHEN m.movement_type = 'RETURN'   AND m.contractor_id = p_contractor_id THEN -ml.quantity
            ELSE 0
        END
    ), 0)
    INTO v_balance
    FROM material_movements m
    JOIN material_movement_lines ml ON ml.movement_id = m.id
    WHERE m.company_id = p_company_id
      AND m.contractor_id = p_contractor_id
      AND ml.material_id = p_material_id;

    RETURN v_balance;
END;
$$;

-- validate_movement_line() — ensure search_path
CREATE OR REPLACE FUNCTION public.validate_movement_line()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_movement  material_movements%ROWTYPE;
    v_available NUMERIC;
BEGIN
    SELECT * INTO v_movement FROM material_movements WHERE id = NEW.movement_id;

    IF v_movement.movement_type = 'ISSUE' THEN
        v_available := get_warehouse_balance(v_movement.company_id, v_movement.source_warehouse_id, NEW.material_id);
        IF v_available < NEW.quantity THEN
            RAISE EXCEPTION 'Issue quantity % exceeds available warehouse stock % for this material', NEW.quantity, v_available;
        END IF;
    END IF;

    IF v_movement.movement_type = 'USAGE' THEN
        v_available := get_wo_on_hand(v_movement.company_id, v_movement.source_work_order_id, NEW.material_id);
        IF v_available < NEW.quantity THEN
            RAISE EXCEPTION 'Usage quantity % exceeds available work order on-hand % for this material', NEW.quantity, v_available;
        END IF;
    END IF;

    IF v_movement.movement_type = 'TRANSFER' THEN
        IF v_movement.source_warehouse_id IS NOT NULL THEN
            v_available := get_warehouse_balance(v_movement.company_id, v_movement.source_warehouse_id, NEW.material_id);
        ELSIF v_movement.source_work_order_id IS NOT NULL THEN
            v_available := get_wo_on_hand(v_movement.company_id, v_movement.source_work_order_id, NEW.material_id);
        END IF;

        IF v_available < NEW.quantity THEN
            RAISE EXCEPTION 'Transfer quantity % exceeds available source balance %', NEW.quantity, v_available;
        END IF;
    END IF;

    IF v_movement.movement_type = 'RETURN' THEN
        IF v_movement.source_work_order_id IS NOT NULL THEN
            v_available := get_wo_on_hand(v_movement.company_id, v_movement.source_work_order_id, NEW.material_id);
        ELSIF v_movement.contractor_id IS NOT NULL THEN
            v_available := get_contractor_balance(v_movement.company_id, v_movement.contractor_id, NEW.material_id);
        END IF;

        IF v_available < NEW.quantity THEN
            RAISE EXCEPTION 'Return quantity % exceeds available source balance %', NEW.quantity, v_available;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
