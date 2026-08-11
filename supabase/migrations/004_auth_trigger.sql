-- ============================================================================
-- INFRAFLOW — Material Control & Work Order System
-- Migration 004: Auth Trigger — Auto-create user_profile on signup
-- ============================================================================

-- Trigger function to handle new user registration
-- This is called when a new user signs up via Supabase Auth
-- Note: company_id and role must be set by the application after signup
-- The profile row is created with a placeholder that the app will update
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    -- Insert a minimal profile row. The application will update
    -- company_id and role after the user completes company setup.
    INSERT INTO public.user_profiles (id, email, full_name, company_id, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        -- Placeholder: will be updated by app after company creation/join
        '00000000-0000-0000-0000-000000000000'::uuid,
        'company_admin'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

-- Grant execute to the auth role (supabase_auth_admin) so the trigger can run
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
-- Grant insert on user_profiles to supabase_auth_admin for the trigger
GRANT INSERT ON public.user_profiles TO supabase_auth_admin;
-- Also need USAGE on the sequence if any
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO supabase_auth_admin;

-- Drop existing trigger if any and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
