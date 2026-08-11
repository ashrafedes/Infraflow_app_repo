-- ============================================================================
-- Fix: Make company_id nullable in user_profiles to allow signup before company setup
-- ============================================================================

-- Drop indexes that use company_id (they need to handle NULL)
-- Use CASCADE to drop dependent FK constraints, we'll recreate them
DROP INDEX IF EXISTS uq_profiles_company_id CASCADE;
DROP INDEX IF EXISTS uq_profiles_company_email CASCADE;

-- Make company_id nullable
ALTER TABLE user_profiles ALTER COLUMN company_id DROP NOT NULL;

-- Recreate indexes (NULLs are allowed in unique indexes, multiple NULLs are fine)
CREATE UNIQUE INDEX uq_profiles_company_id ON user_profiles(company_id, id);
CREATE UNIQUE INDEX uq_profiles_company_email ON user_profiles(company_id, email);

-- Recreate FK constraints that depended on uq_profiles_company_id
-- fk_mv_responsible_user on material_movements
ALTER TABLE material_movements
    ADD CONSTRAINT fk_mv_responsible_user
    FOREIGN KEY (company_id, responsible_user_id)
    REFERENCES user_profiles(company_id, id)
    ON DELETE SET NULL;

-- fk_scope_user on user_scope_assignments
ALTER TABLE user_scope_assignments
    ADD CONSTRAINT fk_scope_user
    FOREIGN KEY (company_id, user_id)
    REFERENCES user_profiles(company_id, id)
    ON DELETE CASCADE;

-- Update the trigger to insert NULL instead of placeholder UUID
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
GRANT INSERT ON public.user_profiles TO supabase_auth_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO supabase_auth_admin;

-- Update RLS policies for user_profiles to handle NULL company_id
-- The select policy needs to allow users with NULL company_id to see their own profile
DROP POLICY IF EXISTS profiles_select ON user_profiles;
CREATE POLICY profiles_select ON user_profiles
    FOR SELECT USING (
        company_id = public.company_id()
        OR (company_id IS NULL AND id = auth.uid())
    );

-- The insert policy needs to allow NULL company_id for new users (trigger handles this)
-- Actually the trigger uses SECURITY DEFINER so it bypasses RLS
-- But we should still allow it for consistency
DROP POLICY IF EXISTS profiles_insert ON user_profiles;
CREATE POLICY profiles_insert ON user_profiles
    FOR INSERT WITH CHECK (
        company_id = public.company_id()
        AND public.user_role() = 'company_admin'
    );

-- Update policy: allow user to update their own profile (for company setup)
DROP POLICY IF EXISTS profiles_update ON user_profiles;
CREATE POLICY profiles_update ON user_profiles
    FOR UPDATE USING (
        id = auth.uid()
        OR (
            company_id = public.company_id()
            AND public.user_role() = 'company_admin'
        )
    );

-- Allow users with NULL company_id to create their first company
DROP POLICY IF EXISTS companies_insert ON companies;
CREATE POLICY companies_insert ON companies
    FOR INSERT WITH CHECK (
        public.company_id() IS NULL
        OR (
            id = public.company_id()
            AND public.user_role() = 'company_admin'
        )
    );
