-- ============================================================================
-- INFRAFLOW — File Attachments for Work Orders & Movements
-- Migration 030
-- ============================================================================
--
-- Creates:
--   1. attachments table (metadata for uploaded files)
--   2. RLS policies on attachments (company isolation)
--   3. Auto-set company_id trigger (derives from entity)
--   4. Supabase Storage bucket "attachments" (private)
--   5. Storage RLS policies (company-isolated paths)
--
-- Storage path convention:
--   {company_id}/{entity_type}/{entity_id}/{filename}
--   e.g. 4fbace07-.../work_orders/abc123/site_photo.jpg
-- ============================================================================

-- ============================================================================
-- 1. ATTACHMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS attachments (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   UUID        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    entity_type  TEXT        NOT NULL CHECK (entity_type IN ('work_order', 'movement')),
    entity_id    UUID        NOT NULL,
    file_name    TEXT        NOT NULL,
    file_path    TEXT        NOT NULL,
    file_size    BIGINT      NOT NULL,
    mime_type    TEXT        NOT NULL,
    uploaded_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attachments_entity
    ON attachments(company_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_attachments_company
    ON attachments(company_id);

-- ============================================================================
-- 2. RLS POLICIES ON ATTACHMENTS
-- ============================================================================
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

-- SELECT: anyone in the company can see attachments
CREATE POLICY attachments_select ON attachments
    FOR SELECT USING (
        company_id = public.company_id()
    );

-- INSERT: company users can upload (company_id is auto-set by trigger)
CREATE POLICY attachments_insert ON attachments
    FOR INSERT WITH CHECK (
        company_id = public.company_id()
    );

-- DELETE: company_admin or the original uploader
CREATE POLICY attachments_delete ON attachments
    FOR DELETE USING (
        company_id = public.company_id()
        AND (
            public.user_role() = 'company_admin'
            OR uploaded_by = auth.uid()
        )
    );

-- ============================================================================
-- 3. AUTO-SET company_id TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_attachment_company_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_company_id UUID;
BEGIN
    -- Derive company_id from the entity being attached to
    IF NEW.entity_type = 'work_order' THEN
        SELECT company_id INTO v_company_id FROM work_orders WHERE id = NEW.entity_id;
    ELSIF NEW.entity_type = 'movement' THEN
        SELECT company_id INTO v_company_id FROM material_movements WHERE id = NEW.entity_id;
    END IF;

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Cannot find entity % with id %', NEW.entity_type, NEW.entity_id;
    END IF;

    NEW.company_id := v_company_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attachments_set_company_id ON attachments;
CREATE TRIGGER attachments_set_company_id
    BEFORE INSERT ON attachments
    FOR EACH ROW EXECUTE FUNCTION public.set_attachment_company_id();

-- ============================================================================
-- 4. STORAGE BUCKET
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'attachments',
    'attachments',
    false,  -- private: requires signed URLs for access
    10485760,  -- 10 MB
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================================
-- 5. STORAGE RLS POLICIES
-- Path convention: {company_id}/{entity_type}/{entity_id}/{filename}
-- The first path segment (storage.foldername(name)[1]) must match the
-- caller's company_id, ensuring cross-company isolation.
-- ============================================================================

-- INSERT (upload): only authenticated users, path must start with their company_id
DROP POLICY IF EXISTS attachments_storage_upload ON storage.objects;
CREATE POLICY attachments_storage_upload ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'attachments'
        AND (storage.foldername(name))[1] = public.company_id()::text
    );

-- SELECT (read/download): only authenticated users, path must start with their company_id
DROP POLICY IF EXISTS attachments_storage_read ON storage.objects;
CREATE POLICY attachments_storage_read ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'attachments'
        AND (storage.foldername(name))[1] = public.company_id()::text
    );

-- DELETE: only authenticated users, path must start with their company_id
DROP POLICY IF EXISTS attachments_storage_delete ON storage.objects;
CREATE POLICY attachments_storage_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'attachments'
        AND (storage.foldername(name))[1] = public.company_id()::text
    );

-- ============================================================================
-- 6. GRANTS
-- ============================================================================
GRANT SELECT, INSERT, DELETE ON attachments TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
