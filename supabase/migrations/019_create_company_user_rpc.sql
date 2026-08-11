-- ============================================================================
-- INFRAFLOW — create_company_user RPC
-- Migration 019
-- ============================================================================

-- Ensure pgcrypto is available for gen_random_bytes and gen_salt
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--
-- Replaces the create-company-user Edge Function with a database RPC.
-- This eliminates CORS issues since RPCs are called via PostgREST which
-- already has CORS configured.
--
-- SECURITY MODEL:
--   * SECURITY DEFINER with search_path = public, auth
--   * Only company admins can call this function
--   * company_id is loaded from the caller's profile (never from frontend)
--   * User limit is enforced (DB trigger is also authoritative)
--   * Auth user is created directly in auth.users with bcrypt password
--   * Identity is created in auth.identities
--   * user_profile is created in public.user_profiles
--   * All operations are atomic (single transaction)
--   * Password reset email is sent separately by the frontend via
--     supabase.auth.resetPasswordForEmail()
--
-- No dynamic SQL. All table references are schema-qualified.
-- ============================================================================


-- ============================================================================
-- RPC: create_company_user(p_email, p_full_name, p_role, p_scopes JSONB)
-- ----------------------------------------------------------------------------
-- Creates a new auth user + user_profile for the caller's company.
-- Returns: JSONB { success, user_id, error }
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_company_user(
    p_email     TEXT,
    p_full_name TEXT,
    p_role      TEXT,
    p_scopes    JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_caller_id        UUID;
    v_company_id       UUID;
    v_caller_role      TEXT;
    v_caller_active    BOOLEAN;
    v_max_users        INTEGER;
    v_active_count     INTEGER;
    v_new_user_id      UUID;
    v_temp_password    TEXT;
    v_scope_row        RECORD;
BEGIN
    -- Get caller identity
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    -- Load caller's profile — NEVER trust company_id from frontend
    SELECT company_id, role, is_active
    INTO v_company_id, v_caller_role, v_caller_active
    FROM public.user_profiles
    WHERE id = v_caller_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
    END IF;

    IF NOT v_caller_active THEN
        RETURN jsonb_build_object('success', false, 'error', 'Your account is inactive');
    END IF;

    IF v_caller_role != 'company_admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only company admins can create users');
    END IF;

    -- Validate input
    IF p_email IS NULL OR trim(p_email) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Email is required');
    END IF;
    IF p_full_name IS NULL OR trim(p_full_name) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Full name is required');
    END IF;
    IF p_role NOT IN ('company_admin', 'warehouse_man', 'inspector', 'project_control', 'project_manager') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid role');
    END IF;

    -- Check for duplicate email in auth.users
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email AND deleted_at IS NULL) THEN
        RETURN jsonb_build_object('success', false, 'error', 'A user with this email already exists');
    END IF;

    -- Pre-check user limit (DB trigger is also authoritative)
    SELECT public.get_max_users() INTO v_max_users;
    SELECT public.get_active_user_count() INTO v_active_count;

    IF v_max_users IS NOT NULL AND v_active_count IS NOT NULL AND v_active_count >= v_max_users THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('User limit reached: %s active users out of %s allowed. Deactivate a user or upgrade your plan.', v_active_count, v_max_users),
            'max_users', v_max_users,
            'active_count', v_active_count
        );
    END IF;

    -- Generate a random temporary password (32 chars)
    v_temp_password := encode(gen_random_bytes(24), 'base64');
    v_new_user_id := gen_random_uuid();

    -- Insert into auth.users
    INSERT INTO auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        phone, is_sso_user, is_anonymous,
        confirmation_token, recovery_token, email_change_token_new,
        email_change, phone_change, phone_change_token,
        email_change_token_current, email_change_confirm_status,
        reauthentication_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_new_user_id,
        'authenticated',
        'authenticated',
        p_email,
        crypt(v_temp_password, gen_salt('bf')),
        now(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object(
            'sub', v_new_user_id::text,
            'email', p_email,
            'full_name', p_full_name,
            'email_verified', true,
            'phone_verified', false
        ),
        now(), now(),
        NULL, false, false,
        '', '', '',
        '', '', '',
        '', 0,
        ''
    );

    -- Insert into auth.identities (email column is generated, don't insert it)
    INSERT INTO auth.identities (
        provider_id, user_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
    ) VALUES (
        v_new_user_id::text,
        v_new_user_id,
        jsonb_build_object(
            'sub', v_new_user_id::text,
            'email', p_email,
            'full_name', p_full_name,
            'email_verified', true,
            'phone_verified', false
        ),
        'email',
        now(), now(), now()
    );

    -- Insert user_profiles row (trigger enforces user limit as backup)
    -- Use ON CONFLICT DO UPDATE because the auth trigger (handle_new_user)
    -- already creates a placeholder profile row on auth.users insert
    INSERT INTO public.user_profiles (
        id, company_id, full_name, email, role, is_active
    ) VALUES (
        v_new_user_id, v_company_id, p_full_name, p_email, p_role, true
    )
    ON CONFLICT (id) DO UPDATE SET
        company_id = EXCLUDED.company_id,
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        is_active = EXCLUDED.is_active;

    -- Insert scope assignments if provided
    IF p_scopes IS NOT NULL AND jsonb_array_length(p_scopes) > 0 THEN
        FOR v_scope_row IN SELECT * FROM jsonb_array_elements(p_scopes)
        LOOP
            INSERT INTO public.user_scope_assignments (
                user_id, company_id,
                project_id, work_location_id, warehouse_id, work_order_id
            ) VALUES (
                v_new_user_id, v_company_id,
                NULLIF(v_scope_row->>'project_id', '')::uuid,
                NULLIF(v_scope_row->>'work_location_id', '')::uuid,
                NULLIF(v_scope_row->>'warehouse_id', '')::uuid,
                NULLIF(v_scope_row->>'work_order_id', '')::uuid
            );
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_new_user_id,
        'error', null
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_company_user(TEXT, TEXT, TEXT, JSONB) TO authenticated;
