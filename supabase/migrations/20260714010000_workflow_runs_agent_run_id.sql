-- Atlas AT-8 (live-run fix): job retries were creating a NEW workflow_runs
-- row (and therefore a new chat surface) per attempt — the first production
-- run left three failed run cards in one thread. Link runs to their queue
-- job's agent_run so a retry reuses the same durable run and surface.

alter table public.workflow_runs
  add column if not exists agent_run_id uuid references public.agent_runs(id) on delete set null;

create index if not exists workflow_runs_agent_run_idx
  on public.workflow_runs(agent_run_id) where agent_run_id is not null;
