-- ============================================================================
-- Migration 022: Add preferred_language column to user_profiles
-- ----------------------------------------------------------------------------
-- Supports EN/AR bilingual UI. Defaults to 'en'. Synced from client-side
-- language toggle. Used to persist user's language preference across devices.
-- ============================================================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en'
  CHECK (preferred_language IN ('en', 'ar'));

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.preferred_language IS
  'User UI language preference: en (English) or ar (Arabic). Defaults to en.';
