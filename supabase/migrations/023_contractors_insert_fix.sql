-- ============================================================================
-- INFRAFLOW — Allow all company members to add contractors
-- Migration 023
-- ============================================================================
--
-- Users need to create contractors directly from the work order contractor
-- dropdown. Previously only company_admin could insert contractors. Now any
-- authenticated company member can add a contractor for their company.
-- ============================================================================

DROP POLICY IF EXISTS contractors_insert ON contractors;
CREATE POLICY contractors_insert ON contractors
    FOR INSERT WITH CHECK (company_id = public.company_id());
