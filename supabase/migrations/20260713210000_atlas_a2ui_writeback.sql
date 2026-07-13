-- Atlas AT-3/AT-4: a2ui chat transport + user write-back RPC.
-- Additive only.
--
-- 1. workspace_messages gains kind 'a2ui': durable A2UI message batches the
--    workflow runner emits at step boundaries (handoff decision 7 fallback —
--    same message shapes, job-queue transport instead of SSE).
-- 2. write_brain_variable: the ONE authenticated write path into the brain.
--    Users editing a VariableCard (user_override) or answering a GapPrompt
--    (user_stated) call this; trust ordering stays server-side. Machine
--    writes keep using the service-role-only write_brain_variables.

alter type public.workspace_message_kind add value if not exists 'a2ui';

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

  -- User values are ground truth: they always win, and carry high confidence.
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

  return to_jsonb(v_saved);
end;
$$;

revoke all on function public.write_brain_variable(uuid, text, jsonb, text) from public, anon;
grant execute on function public.write_brain_variable(uuid, text, jsonb, text) to authenticated, service_role;
