-- =============================================================================
-- PHASE 1 — work order 1.3: RLS on every new table
-- =============================================================================
-- Follows the exact patterns already established in schema.sql:
--   (a) the generic account-scoped CRUD loop (`is_account_member(account_id)`)
--   (b) the template-readable pattern used by agent_profiles / model_routes
--       (`account_id is null or is_account_member(account_id)`)
--   (c) explicit child-table policies that join to a parent's account_id
--       (mirrors mcp_server_tools_all_account's join-through pattern)
--
-- Per BUILD_PLAN 1.3 exceptions:
--   - insights, agenda_items: SELECT only for authenticated account members.
--     No insert/update/delete policy for `authenticated` — the worker writes
--     via the service role key, which bypasses RLS entirely.
--   - approvals: SELECT + UPDATE for account members (so a human can decide
--     pending approvals), no INSERT/DELETE for `authenticated` — only the
--     service role inserts new approval requests.

alter table public.workspace_threads          enable row level security;
alter table public.workspace_messages         enable row level security;
alter table public.context_sources            enable row level security;
alter table public.insights                   enable row level security;
alter table public.agenda_items               enable row level security;
alter table public.approvals                  enable row level security;
alter table public.agent_jobs                 enable row level security;
alter table public.cascades                   enable row level security;
alter table public.cascade_steps              enable row level security;
alter table public.cascade_runs               enable row level security;
alter table public.metric_snapshots           enable row level security;
alter table public.agent_profile_revisions    enable row level security;

-- ---- straightforward account-scoped CRUD (extend the existing loop pattern) ----
-- workspace_threads, context_sources, agent_jobs, metric_snapshots, and
-- cascade_runs all carry a direct account_id column and a plain
-- is_account_member CRUD policy is the correct, conservative default for
-- each (agent_jobs/cascade_runs/metric_snapshots are primarily written by
-- the worker via service role, which bypasses RLS regardless, so granting
-- authenticated CRUD here does not create a new write path in practice — it
-- only helps the frontend read/poll these tables and lets a human cancel a
-- job or dismiss a stale run if the worker exposes that later).
do $$
declare t text;
begin
  for t in select unnest(array[
    'workspace_threads', 'context_sources', 'agent_jobs',
    'metric_snapshots', 'cascade_runs'
  ]) loop
    execute format('drop policy if exists "%s_select_account" on public.%I', t, t);
    execute format(
      'create policy "%s_select_account" on public.%I
         for select to authenticated using (public.is_account_member(account_id))', t, t);

    execute format('drop policy if exists "%s_insert_account" on public.%I', t, t);
    execute format(
      'create policy "%s_insert_account" on public.%I
         for insert to authenticated with check (public.is_account_member(account_id))', t, t);

    execute format('drop policy if exists "%s_update_account" on public.%I', t, t);
    execute format(
      'create policy "%s_update_account" on public.%I
         for update to authenticated using (public.is_account_member(account_id))', t, t);

    execute format('drop policy if exists "%s_delete_account" on public.%I', t, t);
    execute format(
      'create policy "%s_delete_account" on public.%I
         for delete to authenticated using (public.is_account_member(account_id))', t, t);
  end loop;
end $$;

-- ---- insights (SELECT-only for members; writes are service-role only) ----
drop policy if exists "insights_select_account" on public.insights;
create policy "insights_select_account" on public.insights
  for select to authenticated using (public.is_account_member(account_id));

-- ---- agenda_items (SELECT-only for members; writes are service-role only) ----
drop policy if exists "agenda_items_select_account" on public.agenda_items;
create policy "agenda_items_select_account" on public.agenda_items
  for select to authenticated using (public.is_account_member(account_id));

-- ---- approvals (SELECT + UPDATE for members; INSERT/DELETE service-role only) ----
drop policy if exists "approvals_select_account" on public.approvals;
create policy "approvals_select_account" on public.approvals
  for select to authenticated using (public.is_account_member(account_id));

drop policy if exists "approvals_update_account" on public.approvals;
create policy "approvals_update_account" on public.approvals
  for update to authenticated using (public.is_account_member(account_id));

-- ---- cascades (template rows account_id IS NULL readable by everyone;
--       account rows follow is_account_member; template rows are not
--       writable by `authenticated` — they ship via seed migrations only) ----
drop policy if exists "cascades_select" on public.cascades;
create policy "cascades_select" on public.cascades
  for select to authenticated
  using (account_id is null or public.is_account_member(account_id));

drop policy if exists "cascades_insert_account" on public.cascades;
create policy "cascades_insert_account" on public.cascades
  for insert to authenticated with check (public.is_account_member(account_id));

drop policy if exists "cascades_update_account" on public.cascades;
create policy "cascades_update_account" on public.cascades
  for update to authenticated using (public.is_account_member(account_id));

drop policy if exists "cascades_delete_account" on public.cascades;
create policy "cascades_delete_account" on public.cascades
  for delete to authenticated using (public.is_account_member(account_id));

-- ---- cascade_steps (child of cascades; inherit access via parent's
--       account_id, which may be NULL for template cascades) ----
drop policy if exists "cascade_steps_select" on public.cascade_steps;
create policy "cascade_steps_select" on public.cascade_steps
  for select to authenticated
  using (
    exists (
      select 1 from public.cascades c
      where c.id = cascade_id
        and (c.account_id is null or public.is_account_member(c.account_id))
    )
  );

drop policy if exists "cascade_steps_all_account" on public.cascade_steps;
create policy "cascade_steps_all_account" on public.cascade_steps
  for all to authenticated
  using (
    exists (
      select 1 from public.cascades c
      where c.id = cascade_id and c.account_id is not null
        and public.is_account_member(c.account_id)
    )
  )
  with check (
    exists (
      select 1 from public.cascades c
      where c.id = cascade_id and c.account_id is not null
        and public.is_account_member(c.account_id)
    )
  );

-- ---- workspace_messages (child of workspace_threads; inherit access via
--       parent's account_id) ----
drop policy if exists "workspace_messages_all_account" on public.workspace_messages;
create policy "workspace_messages_all_account" on public.workspace_messages
  for all to authenticated
  using (
    exists (
      select 1 from public.workspace_threads wt
      where wt.id = thread_id and public.is_account_member(wt.account_id)
    )
  )
  with check (
    exists (
      select 1 from public.workspace_threads wt
      where wt.id = thread_id and public.is_account_member(wt.account_id)
    )
  );

-- ---- agent_profile_revisions (child of agent_profiles; inherit access via
--       parent's account_id, which may be NULL for template profiles — a
--       revision on a template profile should be readable by any
--       authenticated user, matching the agent_profiles template pattern) ----
drop policy if exists "agent_profile_revisions_select" on public.agent_profile_revisions;
create policy "agent_profile_revisions_select" on public.agent_profile_revisions
  for select to authenticated
  using (
    exists (
      select 1 from public.agent_profiles ap
      where ap.id = agent_profile_id
        and (ap.account_id is null or public.is_account_member(ap.account_id))
    )
  );

drop policy if exists "agent_profile_revisions_insert" on public.agent_profile_revisions;
create policy "agent_profile_revisions_insert" on public.agent_profile_revisions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.agent_profiles ap
      where ap.id = agent_profile_id
        and ap.account_id is not null
        and public.is_account_member(ap.account_id)
    )
  );
