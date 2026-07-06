-- Company scoping (owner bug 2026-07-06): one account holds many companies
-- over time, but gaps, competitor entities and skill artifacts carried no
-- company discriminator — opening a new company (Salesforce) still surfaced
-- the previous company's (Tier4) gaps, competitors and artifacts everywhere,
-- including Atlas briefings.
--
-- canvas_section_versions already carries business_context_version_id; this
-- migration gives the other three account-scoped tables the same column so
-- readers can filter to the active company's context chain
-- (see src/lib/company-scope.ts and worker/src/db/company-scope.ts).
--
-- Existing rows stay NULL (their company is unknowable in SQL): scoped
-- readers exclude them, so stale cross-company rows drop out of view and a
-- fresh research run repopulates the active company cleanly.

ALTER TABLE public.gaps
  ADD COLUMN IF NOT EXISTS business_context_version_id uuid
    REFERENCES public.business_context_versions(id) ON DELETE SET NULL;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS business_context_version_id uuid
    REFERENCES public.business_context_versions(id) ON DELETE SET NULL;

ALTER TABLE public.skill_artifacts
  ADD COLUMN IF NOT EXISTS business_context_version_id uuid
    REFERENCES public.business_context_versions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_gaps_context
  ON public.gaps(business_context_version_id);
CREATE INDEX IF NOT EXISTS idx_companies_context
  ON public.companies(business_context_version_id);
CREATE INDEX IF NOT EXISTS idx_skill_artifacts_context
  ON public.skill_artifacts(business_context_version_id);
