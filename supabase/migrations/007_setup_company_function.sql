-- ============================================================================
-- Company setup function: creates company + updates user profile in one call
-- Bypasses RLS issues with SECURITY DEFINER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.setup_company(p_company_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_company_id UUID;
    v_user_id UUID := auth.uid();
BEGIN
    -- Create the company
    INSERT INTO public.companies (name)
    VALUES (p_company_name)
    RETURNING id INTO v_company_id;

    -- Update the user's profile with the new company_id
    UPDATE public.user_profiles
    SET company_id = v_company_id
    WHERE id = v_user_id AND company_id IS NULL;

    RETURN v_company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.setup_company(TEXT) TO authenticated;
