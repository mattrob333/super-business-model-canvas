-- Documents join company scoping (owner report 2026-07-06 evening: the
-- AcquiPortal pitch deck still showed on the Knowledge page while working on
-- Tier 4 Intelligence). founder_documents rows get the same nullable
-- business_context_version_id discriminator as gaps/companies/skill_artifacts
-- (20260707120000_company_scoping.sql).
--
-- Existing rows stay NULL. Unlike research data, documents are USER UPLOADS
-- and must not silently vanish — the Knowledge page shows NULL-stamped rows
-- in an explicit "not linked to a company" group with a one-tap assign action.

ALTER TABLE public.founder_documents
  ADD COLUMN IF NOT EXISTS business_context_version_id uuid
    REFERENCES public.business_context_versions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_founder_documents_context
  ON public.founder_documents(business_context_version_id);
