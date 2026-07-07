-- Workspace threads join the company-scoping law (owner finding 2026-07-07:
-- a previous company's chat thread surfaced inside the new company's room).
-- Every thread is stamped with the business context era it belongs to; the
-- frontend lists only threads whose context id is in the active company's
-- chain. Legacy NULL rows predate scoping and stay invisible rather than
-- bleeding across companies — chat history starts clean per company.

alter table public.workspace_threads
  add column if not exists business_context_version_id uuid
    references public.business_context_versions(id) on delete set null;

create index if not exists idx_workspace_threads_context
  on public.workspace_threads(account_id, agent_profile_id, business_context_version_id, created_at desc);
