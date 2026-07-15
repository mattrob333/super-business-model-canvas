-- Interactive workflow steps: a run can pause for the user's answer.
-- New status 'awaiting_input' + the active-run index covers it so every
-- surface discovers paused runs the same way it discovers running ones.

alter table public.workflow_runs drop constraint if exists workflow_runs_status_check;
alter table public.workflow_runs add constraint workflow_runs_status_check
  check (status in ('queued', 'running', 'awaiting_input', 'completed', 'failed'));

drop index if exists public.workflow_runs_active_idx;
create index if not exists workflow_runs_active_idx
  on public.workflow_runs(account_id, created_at desc)
  where status in ('queued', 'running', 'awaiting_input');
