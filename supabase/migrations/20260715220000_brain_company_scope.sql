-- =============================================================================
-- BRAIN COMPANY SCOPING (build plan DECISION-NEEDED #4 — owner bug 2026-07-15)
-- =============================================================================
-- brain_variables was account-scoped only, so switching companies left the new
-- company reading the old one's variables: AcquiPortal surfaced Wesco's
-- positioning.one_liner. Machine writes self-correct (next run overwrites),
-- but user_stated answers outrank machines by design and would leak across
-- companies permanently.
--
-- The fix: the brain (and workflow runs/artifacts) carries the same company
-- identity every other table scopes by — the company KEY (website domain,
-- else normalized name) of the business_context_versions era. Steady-state
-- keys are computed in JS (company-scope.ts, both mirrors) and passed
-- explicitly; the SQL mirrors below exist for backfill and for
-- legacy-signature RPC calls during the deploy window.

-- 1 · SQL mirrors of the company-key normalizers ------------------------------

create or replace function public.normalize_company_domain(p_website text)
returns text
language sql
immutable
as $$
  select case when candidate like '%.%' then candidate end
  from (
    select regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(lower(btrim(coalesce(p_website, ''))), '^[a-z][a-z0-9+.-]*://', ''),
                 '[/?#].*$', ''),
               '^www\.', ''),
             ':[0-9]+$', '') as candidate
  ) normalized;
$$;

create or replace function public.normalize_company_name(p_name text)
returns text
language sql
immutable
as $$
  select nullif(btrim(regexp_replace(
    regexp_replace(
      regexp_replace(lower(coalesce(p_name, '')), '[^[:alnum:]]+', ' ', 'g'),
      '\y(inc|llc|ltd|corp|corporation|co|company|gmbh|sa|plc)\y', ' ', 'g'),
    '\s+', ' ', 'g')), '');
$$;

create or replace function public.company_key_of(p_name text, p_website text)
returns text
language sql
immutable
as $$
  select coalesce(public.normalize_company_domain(p_website), public.normalize_company_name(p_name));
$$;

-- The company era active at a moment in time: the newest NAMED context at or
-- before p_at opens the era (anonymous ensure-rows inherit it); rows older
-- than every named context belong to the first era; '' for accounts with no
-- named context at all.
create or replace function public.company_key_at(p_account_id uuid, p_at timestamptz)
returns text
language sql
stable
as $$
  select coalesce(
    (select public.company_key_of(company_name, website)
       from public.business_context_versions
      where account_id = p_account_id
        and created_at <= p_at
        and public.company_key_of(company_name, website) is not null
      order by created_at desc
      limit 1),
    (select public.company_key_of(company_name, website)
       from public.business_context_versions
      where account_id = p_account_id
        and public.company_key_of(company_name, website) is not null
      order by created_at asc
      limit 1),
    '');
$$;

-- 2 · Columns -----------------------------------------------------------------

alter table public.brain_variables add column if not exists company_key text not null default '';
alter table public.brain_variable_history add column if not exists company_key text not null default '';
alter table public.workflow_runs add column if not exists company_key text not null default '';
alter table public.workflow_artifacts add column if not exists company_key text not null default '';

-- 3 · Era-at-timestamp backfill -------------------------------------------------
-- Each row belongs to the company whose era was active when it was written.
-- For brain_variables that is updated_at (the current value's write time), so
-- a Wesco-era value that was already overwritten by AcquiPortal research is
-- correctly assigned to AcquiPortal — the key follows the DATA, not the row's
-- birth.

update public.brain_variables
   set company_key = public.company_key_at(account_id, updated_at)
 where company_key = '';

-- History is append-only by trigger; this one-time identity backfill is the
-- sanctioned exception (values/paths untouched — only the new scoping column).
alter table public.brain_variable_history disable trigger brain_variable_history_append_only;
update public.brain_variable_history
   set company_key = public.company_key_at(account_id, created_at)
 where company_key = '';
alter table public.brain_variable_history enable trigger brain_variable_history_append_only;

update public.workflow_runs
   set company_key = public.company_key_at(account_id, created_at)
 where company_key = '';

update public.workflow_artifacts
   set company_key = public.company_key_at(account_id, created_at)
 where company_key = '';

-- 4 · Identity becomes (account, company, path) --------------------------------

create unique index if not exists brain_variables_account_company_path_unique
  on public.brain_variables(account_id, company_key, path);
alter table public.brain_variables drop constraint if exists brain_variables_account_id_path_key;
drop index if exists public.brain_variables_account_path_unique;
drop index if exists public.brain_variables_account_path_idx;

create index if not exists brain_variable_history_account_company_path_idx
  on public.brain_variable_history(account_id, company_key, path, created_at desc);

drop index if exists public.workflow_runs_active_idx;
create index if not exists workflow_runs_active_idx
  on public.workflow_runs(account_id, company_key, created_at desc)
  where status in ('queued', 'running', 'awaiting_input');

create index if not exists workflow_artifacts_account_company_created_idx
  on public.workflow_artifacts(account_id, company_key, created_at desc);

-- 5 · Company-scoped write RPCs -------------------------------------------------
-- New 5-arg signatures carry the key explicitly (NO defaults on p_company_key,
-- so PostgREST named-argument resolution never sees an ambiguous call). The
-- old signatures remain as delegates that resolve the ACTIVE company key in
-- SQL — they keep the already-deployed worker and frontend writing to the
-- right bucket until the new build ships.

create or replace function public.write_brain_variables(
  p_account_id uuid,
  p_writes jsonb,
  p_source text,
  p_source_artifact text,
  p_company_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_key text := coalesce(btrim(p_company_key), '');
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
  v_written_paths text[] := '{}';
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
  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text || ':' || v_company_key || ':' || value, 0))
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
    where account_id = p_account_id and company_key = v_company_key and path = v_path
    for update;

    if found
      and v_existing.source in ('user_stated', 'user_override')
      and v_is_machine then
      v_contradiction_path := 'contradiction.' || v_path;
      insert into public.brain_variables (
        account_id, company_key, path, value, confidence, source, source_artifact,
        staleness_policy, updated_at
      ) values (
        p_account_id,
        v_company_key,
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
      on conflict (account_id, company_key, path) do update set
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
        account_id, company_key, path, value, confidence, source, source_artifact,
        staleness_policy, updated_at
      ) values (
        p_account_id, v_company_key, v_path, v_value, v_confidence, p_source,
        p_source_artifact, v_staleness_policy, now()
      )
      on conflict (account_id, company_key, path) do update set
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
      -- Only ACCEPTED writes cascade: a contradiction-diverted write changed
      -- nothing that artifacts consume.
      v_written_paths := v_written_paths || v_saved.path;
    end if;

    insert into public.brain_variable_history (
      variable_id, account_id, company_key, path, value, confidence, source,
      source_artifact, staleness_policy, change_reason, updated_at, created_at
    ) values (
      v_saved.id, v_saved.account_id, v_saved.company_key, v_saved.path, v_saved.value,
      v_saved.confidence, v_saved.source, v_saved.source_artifact,
      v_saved.staleness_policy, v_reason, v_saved.updated_at, v_saved.created_at
    );
    v_variables := v_variables || jsonb_build_array(to_jsonb(v_saved));
    v_history := v_history || jsonb_build_array(
      to_jsonb(v_saved) || jsonb_build_object('variable_id', v_saved.id, 'change_reason', v_reason)
    );
    v_existing := null;
  end loop;

  -- AT-6 cascade invalidation: consuming artifacts go stale on upstream change
  -- — within the same company only.
  if array_length(v_written_paths, 1) > 0 then
    update public.workflow_artifacts
    set stale = true
    where account_id = p_account_id
      and company_key = v_company_key
      and stale = false
      and frontmatter->'consumed' ?| v_written_paths;
  end if;

  return jsonb_build_object(
    'variables', v_variables,
    'contradictions', v_contradictions,
    'history', v_history
  );
end;
$$;

revoke all on function public.write_brain_variables(uuid, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.write_brain_variables(uuid, jsonb, text, text, text) to service_role;

-- Legacy 4-arg signature: delegate with the account's ACTIVE company key.
-- Keeps in-flight workers correct during the deploy window; safe to leave.
create or replace function public.write_brain_variables(
  p_account_id uuid,
  p_writes jsonb,
  p_source text,
  p_source_artifact text default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.write_brain_variables(
    p_account_id, p_writes, p_source, p_source_artifact,
    public.company_key_at(p_account_id, now())
  );
$$;

revoke all on function public.write_brain_variables(uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.write_brain_variables(uuid, jsonb, text, text) to service_role;

create or replace function public.write_brain_variable(
  p_account_id uuid,
  p_path text,
  p_value jsonb,
  p_company_key text,
  p_source text default 'user_override'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_key text := coalesce(btrim(p_company_key), '');
  v_path text;
  v_saved public.brain_variables;
  v_existing_id uuid;
begin
  if not public.is_account_member(p_account_id) then
    raise exception 'not a member of this account';
  end if;
  if p_source not in ('user_stated', 'user_override') then
    raise exception 'authenticated writes must be user_stated or user_override';
  end if;
  v_path := nullif(btrim(p_path), '');
  if v_path is null then
    raise exception 'path is required';
  end if;
  if v_path like 'contradiction.%' then
    raise exception 'contradiction records are system-managed';
  end if;
  if p_value is null then
    raise exception 'value is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text || ':' || v_company_key || ':' || v_path, 0));

  select id into v_existing_id
  from public.brain_variables
  where account_id = p_account_id and company_key = v_company_key and path = v_path
  for update;

  insert into public.brain_variables (
    account_id, company_key, path, value, confidence, source, source_artifact,
    staleness_policy, updated_at
  ) values (
    p_account_id, v_company_key, v_path, p_value, 'high', p_source, null, null, now()
  )
  on conflict (account_id, company_key, path) do update set
    value = excluded.value,
    confidence = excluded.confidence,
    source = excluded.source,
    updated_at = excluded.updated_at
  returning * into v_saved;

  insert into public.brain_variable_history (
    variable_id, account_id, company_key, path, value, confidence, source,
    source_artifact, staleness_policy, change_reason, updated_at, created_at
  ) values (
    v_saved.id, v_saved.account_id, v_saved.company_key, v_saved.path, v_saved.value,
    v_saved.confidence, v_saved.source, v_saved.source_artifact,
    v_saved.staleness_policy,
    case when v_existing_id is null then 'initial' else 'user_override' end,
    v_saved.updated_at, v_saved.created_at
  );

  -- AT-6 cascade invalidation, company-scoped like the write itself.
  update public.workflow_artifacts
  set stale = true
  where account_id = p_account_id
    and company_key = v_company_key
    and stale = false
    and frontmatter->'consumed' ? v_path;

  return to_jsonb(v_saved);
end;
$$;

revoke all on function public.write_brain_variable(uuid, text, jsonb, text, text) from public, anon;
grant execute on function public.write_brain_variable(uuid, text, jsonb, text, text) to authenticated, service_role;

-- Legacy 4-arg signature: delegate with the ACTIVE company key (already-open
-- frontend tabs keep working until they pick up the new build).
create or replace function public.write_brain_variable(
  p_account_id uuid,
  p_path text,
  p_value jsonb,
  p_source text default 'user_override'
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.write_brain_variable(
    p_account_id, p_path, p_value,
    public.company_key_at(p_account_id, now()),
    p_source
  );
$$;

revoke all on function public.write_brain_variable(uuid, text, jsonb, text) from public, anon;
grant execute on function public.write_brain_variable(uuid, text, jsonb, text) to authenticated, service_role;

-- NOTE (deliberate follow-up, NOT in this migration): past companies whose
-- current values were overwritten in place (e.g. Wesco's canvas.* rows, which
-- AcquiPortal's scrape replaced) can be restored per era from
-- brain_variable_history via
--   insert ... select distinct on (account_id, company_key, path) ...
--   on conflict do nothing
-- That resurrection is applied manually AFTER the scoped worker deploys, so
-- the deploy-window worker (which reads without a company filter) never sees
-- two rows for one path.
