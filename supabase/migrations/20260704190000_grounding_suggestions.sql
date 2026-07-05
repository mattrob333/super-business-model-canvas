-- Spec 08 section 3a: agent-proposed grounding candidates with evidence.
-- Agents suggest the real name behind a generic canvas item; the owner
-- confirms/edits/dismisses in the grounding wizard. Suggestions are only
-- written after passing the adversarial verifier against their evidence.

do $$ begin create type public.grounding_suggestion_status as enum ('open', 'accepted', 'dismissed'); exception when duplicate_object then null; end $$;

create table if not exists public.grounding_suggestions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  section_key text not null,
  item_text text not null,
  suggested_text text not null,
  rationale text,
  evidence_id uuid references public.evidence_items(id) on delete set null,
  status public.grounding_suggestion_status not null default 'open',
  resolved_at timestamptz,
  created_by_agent_run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, section_key, item_text, suggested_text)
);

create index if not exists idx_grounding_suggestions_account_status
  on public.grounding_suggestions(account_id, status, section_key, created_at desc);

alter table public.grounding_suggestions enable row level security;

drop policy if exists "grounding_suggestions_select_account" on public.grounding_suggestions;
create policy "grounding_suggestions_select_account" on public.grounding_suggestions
  for select to authenticated using (public.is_account_member(account_id));

drop policy if exists "grounding_suggestions_update_account" on public.grounding_suggestions;
create policy "grounding_suggestions_update_account" on public.grounding_suggestions
  for update to authenticated using (public.is_account_member(account_id))
  with check (public.is_account_member(account_id));

drop trigger if exists set_updated_at on public.grounding_suggestions;
create trigger set_updated_at before update on public.grounding_suggestions
  for each row execute function public.set_updated_at();

insert into public.model_routes
  (account_id, route_key, label, provider, model_name, params, is_default, task_class, cost_per_1k_in, cost_per_1k_out, updated_by)
values
  (null, 'grounding_suggest', 'Grounding Suggestions (budget)', 'openrouter', 'anthropic/claude-haiku-4.5',
   '{"temperature":0.2,"max_tokens":2200}'::jsonb, false, 'grounding_suggest', 0.001, 0.005, 'human')
on conflict (route_key) where account_id is null do update set
  label = excluded.label,
  provider = excluded.provider,
  model_name = excluded.model_name,
  params = excluded.params,
  task_class = excluded.task_class,
  cost_per_1k_in = excluded.cost_per_1k_in,
  cost_per_1k_out = excluded.cost_per_1k_out,
  updated_by = excluded.updated_by;
