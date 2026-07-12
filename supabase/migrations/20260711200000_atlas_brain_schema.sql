-- Atlas AT-1: business brain and coverage manifest.
-- Additive only. Worker/service-role writes bypass RLS; authenticated users read
-- only rows belonging to accounts they can access.

create table if not exists public.brain_variables (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  path text not null,
  value jsonb not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  source text not null check (
    source in ('user_stated', 'user_override', 'scraped')
    or source ~ '^(mcp_pull|workflow):[^[:space:]]+$'
  ),
  source_artifact text,
  staleness_policy text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (account_id, path)
);

create table if not exists public.brain_variable_history (
  id uuid primary key default gen_random_uuid(),
  variable_id uuid not null references public.brain_variables(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  path text not null,
  value jsonb not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  source text not null check (
    source in ('user_stated', 'user_override', 'scraped')
    or source ~ '^(mcp_pull|workflow):[^[:space:]]+$'
  ),
  source_artifact text,
  staleness_policy text,
  change_reason text not null check (
    change_reason in ('initial', 'update', 'user_override', 'contradiction_resolution')
  ),
  updated_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.coverage_manifest (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  path text not null,
  section_key text,
  title text not null,
  value_weight integer not null check (value_weight > 0),
  fill_actions jsonb not null check (jsonb_typeof(fill_actions) = 'array'),
  freshness text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists brain_variables_account_path_unique
  on public.brain_variables(account_id, path);
create index if not exists brain_variables_account_path_idx
  on public.brain_variables(account_id, path);
create index if not exists brain_variable_history_account_path_created_idx
  on public.brain_variable_history(account_id, path, created_at desc);
create index if not exists brain_variable_history_variable_created_idx
  on public.brain_variable_history(variable_id, created_at desc);
create unique index if not exists coverage_manifest_global_path_unique
  on public.coverage_manifest(path) where account_id is null;
create unique index if not exists coverage_manifest_account_path_unique
  on public.coverage_manifest(account_id, path) where account_id is not null;
create index if not exists coverage_manifest_account_sort_idx
  on public.coverage_manifest(account_id, sort_order, path);

alter table public.brain_variables enable row level security;
alter table public.brain_variable_history enable row level security;
alter table public.coverage_manifest enable row level security;

-- Members may read. There are deliberately no authenticated write policies:
-- the worker/service role and the future AT-4 RPC are the write paths.
drop policy if exists "brain_variables_select_member" on public.brain_variables;
create policy "brain_variables_select_member" on public.brain_variables
  for select to authenticated using (public.is_account_member(account_id));

drop policy if exists "brain_variable_history_select_member" on public.brain_variable_history;
create policy "brain_variable_history_select_member" on public.brain_variable_history
  for select to authenticated using (public.is_account_member(account_id));

drop policy if exists "coverage_manifest_select" on public.coverage_manifest;
create policy "coverage_manifest_select" on public.coverage_manifest
  for select to authenticated
  using (account_id is null or public.is_account_member(account_id));

-- History rows are never edited, even by privileged callers. Deletes stay
-- allowed so account deletion (and the brain_variables cascade) keeps working —
-- every table in this schema must cascade cleanly from accounts.
create or replace function public.reject_brain_variable_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'brain_variable_history is append-only';
end;
$$;

drop trigger if exists brain_variable_history_append_only on public.brain_variable_history;
create trigger brain_variable_history_append_only
  before update on public.brain_variable_history
  for each row execute function public.reject_brain_variable_history_mutation();

-- One service-role RPC is the transaction boundary for trust evaluation,
-- variable upserts, and append-only history. Lock paths in deterministic order
-- so concurrent worker jobs cannot race a user-authored value.
create or replace function public.write_brain_variables(
  p_account_id uuid,
  p_writes jsonb,
  p_source text,
  p_source_artifact text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_write jsonb;
  v_path text;
  v_value jsonb;
  v_confidence text;
  v_staleness_policy text;
  v_existing public.brain_variables;
  v_saved public.brain_variables;
  v_reason text;
  v_contradiction_path text;
  v_variables jsonb := '[]'::jsonb;
  v_contradictions jsonb := '[]'::jsonb;
  v_history jsonb := '[]'::jsonb;
  v_is_machine boolean;
begin
  if jsonb_typeof(p_writes) <> 'array' then
    raise exception 'p_writes must be a JSON array';
  end if;
  if not (
    p_source in ('user_stated', 'user_override', 'scraped')
    or p_source ~ '^(mcp_pull|workflow):[^[:space:]]+$'
  ) then
    raise exception 'invalid brain variable source: %', p_source;
  end if;

  v_is_machine := p_source = 'scraped'
    or p_source like 'mcp_pull:%'
    or p_source like 'workflow:%';

  -- Advisory locks cover paths that do not exist yet; row locks below cover
  -- existing records. Sorting prevents deadlocks for overlapping batches.
  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text || ':' || value, 0))
  from (
    select distinct item->>'path' as value
    from jsonb_array_elements(p_writes) item
    order by value
  ) locked_paths;

  for v_write in select value from jsonb_array_elements(p_writes)
  loop
    v_path := nullif(btrim(v_write->>'path'), '');
    v_value := v_write->'value';
    v_confidence := v_write->>'confidence';
    v_staleness_policy := v_write->>'staleness_policy';
    if v_path is null or v_value is null then
      raise exception 'each brain write requires path and value';
    end if;
    if v_confidence not in ('high', 'medium', 'low') then
      raise exception 'invalid confidence for %: %', v_path, v_confidence;
    end if;

    select * into v_existing
    from public.brain_variables
    where account_id = p_account_id and path = v_path
    for update;

    if found
      and v_existing.source in ('user_stated', 'user_override')
      and v_is_machine then
      v_contradiction_path := 'contradiction.' || v_path;
      insert into public.brain_variables (
        account_id, path, value, confidence, source, source_artifact,
        staleness_policy, updated_at
      ) values (
        p_account_id,
        v_contradiction_path,
        jsonb_build_object(
          'existing', v_existing.value,
          'incoming', v_value,
          'detected_at', now()
        ),
        v_confidence,
        p_source,
        p_source_artifact,
        null,
        now()
      )
      on conflict (account_id, path) do update set
        value = excluded.value,
        confidence = excluded.confidence,
        source = excluded.source,
        source_artifact = excluded.source_artifact,
        staleness_policy = excluded.staleness_policy,
        updated_at = excluded.updated_at
      returning * into v_saved;
      v_reason := 'contradiction_resolution';
      v_contradictions := v_contradictions || jsonb_build_array(jsonb_build_object(
        'path', v_path,
        'existing', to_jsonb(v_existing),
        'incoming', v_write || jsonb_build_object('source', p_source),
        'contradictionPath', v_contradiction_path
      ));
    else
      insert into public.brain_variables (
        account_id, path, value, confidence, source, source_artifact,
        staleness_policy, updated_at
      ) values (
        p_account_id, v_path, v_value, v_confidence, p_source,
        p_source_artifact, v_staleness_policy, now()
      )
      on conflict (account_id, path) do update set
        value = excluded.value,
        confidence = excluded.confidence,
        source = excluded.source,
        source_artifact = excluded.source_artifact,
        staleness_policy = coalesce(excluded.staleness_policy, public.brain_variables.staleness_policy),
        updated_at = excluded.updated_at
      returning * into v_saved;
      v_reason := case
        when v_existing.id is null then 'initial'
        when p_source in ('user_stated', 'user_override') then 'user_override'
        else 'update'
      end;
    end if;

    insert into public.brain_variable_history (
      variable_id, account_id, path, value, confidence, source,
      source_artifact, staleness_policy, change_reason, updated_at, created_at
    ) values (
      v_saved.id, v_saved.account_id, v_saved.path, v_saved.value,
      v_saved.confidence, v_saved.source, v_saved.source_artifact,
      v_saved.staleness_policy, v_reason, v_saved.updated_at, v_saved.created_at
    );
    v_variables := v_variables || jsonb_build_array(to_jsonb(v_saved));
    v_history := v_history || jsonb_build_array(
      to_jsonb(v_saved) || jsonb_build_object('variable_id', v_saved.id, 'change_reason', v_reason)
    );
    v_existing := null;
  end loop;

  return jsonb_build_object(
    'variables', v_variables,
    'contradictions', v_contradictions,
    'history', v_history
  );
end;
$$;

revoke all on function public.write_brain_variables(uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.write_brain_variables(uuid, jsonb, text, text) to service_role;

-- Global coverage templates: exactly the nine BMC slots and eight authored
-- Positioning Sprint outputs. Keep this seed in sync with the authored specs.
insert into public.coverage_manifest
  (account_id, path, section_key, title, value_weight, fill_actions, freshness, sort_order)
values
  (null, 'canvas.customer_segments', 'customer_segments', 'Customer Segments', 10,
    '[{"action":"ask","prompt":"Who are the highest-value customer segments, and what jobs do they need done?"},{"action":"scrape"}]'::jsonb, '90 days', 10),
  (null, 'canvas.value_propositions', 'value_propositions', 'Value Propositions', 9,
    '[{"action":"ask","prompt":"What concrete pains do you solve and gains do you create for each target segment?"},{"action":"scrape"}]'::jsonb, '90 days', 20),
  (null, 'canvas.channels', 'channels', 'Channels', 7,
    '[{"action":"ask","prompt":"How do customers discover, evaluate, buy, and receive your offering?"},{"action":"scrape"}]'::jsonb, '90 days', 30),
  (null, 'canvas.customer_relationships', 'customer_relationships', 'Customer Relationships', 6,
    '[{"action":"ask","prompt":"What relationship does each segment expect across acquisition, retention, and expansion?"},{"action":"scrape"}]'::jsonb, '90 days', 40),
  (null, 'canvas.revenue_streams', 'revenue_streams', 'Revenue Streams', 8,
    '[{"action":"ask","prompt":"How do you charge, and what are the main revenue models and unit economics?"},{"action":"scrape"}]'::jsonb, '90 days', 50),
  (null, 'canvas.key_resources', 'key_resources', 'Key Resources', 7,
    '[{"action":"ask","prompt":"Which physical, intellectual, human, and financial resources are critical to delivery?"},{"action":"scrape"}]'::jsonb, '180 days', 60),
  (null, 'canvas.key_activities', 'key_activities', 'Key Activities', 7,
    '[{"action":"ask","prompt":"Which production, problem-solving, or platform activities create the value?"},{"action":"scrape"}]'::jsonb, '180 days', 70),
  (null, 'canvas.key_partners', 'key_partners', 'Key Partners', 6,
    '[{"action":"ask","prompt":"Who are the strategic partners, suppliers, distributors, or coopetitors you rely on?"},{"action":"scrape"}]'::jsonb, '180 days', 80),
  (null, 'canvas.cost_structure', 'cost_structure', 'Cost Structure', 8,
    '[{"action":"ask","prompt":"What are the fixed, variable, and largest cost drivers of this business model?"},{"action":"scrape"}]'::jsonb, '90 days', 90),
  (null, 'positioning.competitive_alternatives', null, 'Competitive Alternatives', 8,
    '[{"action":"ask","prompt":"What would customers actually do if this product did not exist?"},{"action":"workflow","workflow_id":"positioning-sprint"}]'::jsonb, null, 100),
  (null, 'positioning.unique_attributes', null, 'Unique Attributes', 8,
    '[{"action":"ask","prompt":"Which attributes are meaningfully different and which alternatives lack them?"},{"action":"workflow","workflow_id":"positioning-sprint"}]'::jsonb, null, 110),
  (null, 'positioning.value_themes', null, 'Value Themes', 8,
    '[{"action":"ask","prompt":"What customer value themes do the differentiated attributes create?"},{"action":"workflow","workflow_id":"positioning-sprint"}]'::jsonb, null, 120),
  (null, 'positioning.best_fit_segment', null, 'Best-Fit Segment', 9,
    '[{"action":"ask","prompt":"Which customers care most about the differentiated value, and why?"},{"action":"workflow","workflow_id":"positioning-sprint"}]'::jsonb, null, 130),
  (null, 'positioning.category_frame', null, 'Category Frame', 7,
    '[{"action":"ask","prompt":"Should the product compete head-on, define a subcategory, or create a new game?"},{"action":"workflow","workflow_id":"positioning-sprint"}]'::jsonb, null, 140),
  (null, 'positioning.statement', null, 'Positioning Statement', 9,
    '[{"action":"ask","prompt":"What is the canonical positioning statement grounded in the canvas and sprint evidence?"},{"action":"workflow","workflow_id":"positioning-sprint"}]'::jsonb, null, 150),
  (null, 'positioning.one_liner', null, 'Positioning One-Liner', 7,
    '[{"action":"ask","prompt":"Summarize the positioning in no more than 20 words."},{"action":"workflow","workflow_id":"positioning-sprint"}]'::jsonb, null, 160),
  (null, 'positioning.confidence', null, 'Positioning Confidence', 5,
    '[{"action":"ask","prompt":"How confident is the positioning, and what evidence would raise confidence?"},{"action":"workflow","workflow_id":"positioning-sprint"}]'::jsonb, null, 170)
on conflict (path) where account_id is null do nothing;
