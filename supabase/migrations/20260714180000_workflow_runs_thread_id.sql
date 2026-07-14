-- Live-run visibility (owner finding 2026-07-14): run-watching lived in
-- component state, so a dock remount or a second surface was blind to an
-- in-flight workflow — no progress, no double-launch guard, duplicate runs.
-- Stamp the launch thread on the durable run so ANY surface can discover an
-- active run, open its thread, and resume watching.

alter table public.workflow_runs
  add column if not exists thread_id uuid references public.workspace_threads(id) on delete set null;

create index if not exists workflow_runs_active_idx
  on public.workflow_runs(account_id, created_at desc)
  where status in ('queued', 'running');
