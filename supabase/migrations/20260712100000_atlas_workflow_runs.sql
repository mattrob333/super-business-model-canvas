-- Atlas AT-2: durable workflow runs and frontmattered artifacts.
-- Workflow cards live in the worker repository; this migration deliberately
-- does not create a workflow catalog. The service worker is the only write
-- path; authenticated members may read their account's runs and artifacts.

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  workflow_id text not null,
  status text not null check (status in ('queued', 'running', 'completed', 'failed')),
  current_step text,
  step_state jsonb not null default '{}'::jsonb,
  artifact_id uuid,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table if not exists public.workflow_artifacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  workflow_id text not null,
  run_id uuid not null references public.workflow_runs(id) on delete cascade,
  title text not null,
  body_md text not null,
  frontmatter jsonb not null default '{}'::jsonb,
  stale boolean not null default false,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workflow_runs_artifact_id_fkey'
  ) then
    alter table public.workflow_runs
      add constraint workflow_runs_artifact_id_fkey
      foreign key (artifact_id) references public.workflow_artifacts(id) on delete set null;
  end if;
end $$;

create index if not exists workflow_runs_account_status_created_idx
  on public.workflow_runs(account_id, status, created_at desc);
create index if not exists workflow_runs_account_workflow_created_idx
  on public.workflow_runs(account_id, workflow_id, created_at desc);
create index if not exists workflow_artifacts_account_created_idx
  on public.workflow_artifacts(account_id, created_at desc);
create index if not exists workflow_artifacts_run_id_idx
  on public.workflow_artifacts(run_id);

alter table public.workflow_runs enable row level security;
alter table public.workflow_artifacts enable row level security;

drop policy if exists "workflow_runs_select_member" on public.workflow_runs;
create policy "workflow_runs_select_member" on public.workflow_runs
  for select to authenticated using (public.is_account_member(account_id));

drop policy if exists "workflow_artifacts_select_member" on public.workflow_artifacts;
create policy "workflow_artifacts_select_member" on public.workflow_artifacts
  for select to authenticated using (public.is_account_member(account_id));
