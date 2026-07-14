-- Atlas AT-6: cascade invalidation at write time (spec §4).
-- When a brain variable changes, every workflow artifact whose frontmatter
-- `consumed` includes that path goes STALE — computed in the write RPCs
-- themselves (one SQL statement at write time, not a polling job). A run's
-- own artifact is safe: it is inserted AFTER its variable writes.
--
-- Both brain write RPCs are re-created with the cascade appended; bodies are
-- otherwise identical to 20260711200000 / 20260713210000.

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
      -- Only ACCEPTED writes cascade: a contradiction-diverted write changed
      -- nothing that artifacts consume.
      v_written_paths := v_written_paths || v_saved.path;
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

  -- AT-6 cascade invalidation: consuming artifacts go stale on upstream change.
  if array_length(v_written_paths, 1) > 0 then
    update public.workflow_artifacts
    set stale = true
    where account_id = p_account_id
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

create or replace function public.write_brain_variable(
  p_account_id uuid,
  p_path text,
  p_value jsonb,
  p_source text default 'user_override'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
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

  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text || ':' || v_path, 0));

  select id into v_existing_id
  from public.brain_variables
  where account_id = p_account_id and path = v_path
  for update;

  insert into public.brain_variables (
    account_id, path, value, confidence, source, source_artifact,
    staleness_policy, updated_at
  ) values (
    p_account_id, v_path, p_value, 'high', p_source, null, null, now()
  )
  on conflict (account_id, path) do update set
    value = excluded.value,
    confidence = excluded.confidence,
    source = excluded.source,
    updated_at = excluded.updated_at
  returning * into v_saved;

  insert into public.brain_variable_history (
    variable_id, account_id, path, value, confidence, source,
    source_artifact, staleness_policy, change_reason, updated_at, created_at
  ) values (
    v_saved.id, v_saved.account_id, v_saved.path, v_saved.value,
    v_saved.confidence, v_saved.source, v_saved.source_artifact,
    v_saved.staleness_policy,
    case when v_existing_id is null then 'initial' else 'user_override' end,
    v_saved.updated_at, v_saved.created_at
  );

  -- AT-6 cascade invalidation: a user override stales every artifact that
  -- consumed the old value.
  update public.workflow_artifacts
  set stale = true
  where account_id = p_account_id
    and stale = false
    and frontmatter->'consumed' ? v_path;

  return to_jsonb(v_saved);
end;
$$;

revoke all on function public.write_brain_variables(uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.write_brain_variables(uuid, jsonb, text, text) to service_role;
revoke all on function public.write_brain_variable(uuid, text, jsonb, text) from public, anon;
grant execute on function public.write_brain_variable(uuid, text, jsonb, text) to authenticated, service_role;
