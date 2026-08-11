-- ============================================================================
-- INFRAFLOW — Auto-confirm new user emails
-- Migration 022
-- ============================================================================
--
-- By default Supabase requires email confirmation before a user can sign in.
-- This trigger automatically confirms every newly registered email so users
-- can sign in immediately after creating an account (no email link needed).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_confirm_user_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF NEW.email_confirmed_at IS NULL THEN
        NEW.email_confirmed_at := now();
    END IF;
    IF NEW.confirmation_sent_at IS NULL THEN
        NEW.confirmation_sent_at := now();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_confirm_user_email_trigger ON auth.users;
CREATE TRIGGER auto_confirm_user_email_trigger
    BEFORE INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_confirm_user_email();
