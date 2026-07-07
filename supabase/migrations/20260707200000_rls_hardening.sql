-- Goal Phase 6 RLS hardening (security audit 2026-07-07). Four findings:
--
-- 1. CRITICAL: account_members INSERT only checked user_id = auth.uid() —
--    any authenticated user could join ANY account whose uuid they learned,
--    unlocking every account-scoped table (credentials, canvases, documents,
--    storage). Self-insert is now allowed ONLY to bootstrap an empty account
--    (the create-account flow); every later join must go through the service
--    role (a future invite RPC).
-- 2. HIGH: account_members UPDATE let a member rewrite their own row —
--    including role -> 'owner'. The frontend never updates memberships;
--    the policy is dropped (service role only).
-- 3. HIGH: agent_profiles INSERT/UPDATE accepted account_id IS NULL, letting
--    any authenticated user create or rewrite the GLOBAL template agents
--    (system prompts served to every tenant). Writes now require a non-null
--    account the caller belongs to; the NULL branch stays read-only in the
--    SELECT policy. The frontend already treats templates as read-only.
-- 4. LOW: data_feeds/feed_cache SELECT lacked a role clause, so anon could
--    read global feed configs and cached payloads. Now authenticated-only.

-- (1) account_members: bootstrap-only self-insert.
create or replace function public.account_has_members(_account_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.account_members where account_id = _account_id
  );
$$;

revoke execute on function public.account_has_members(uuid) from public, anon;
grant execute on function public.account_has_members(uuid) to authenticated, service_role;

drop policy if exists "account_members_insert_own" on public.account_members;
create policy "account_members_insert_bootstrap" on public.account_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and not public.account_has_members(account_id)
  );

-- (2) account_members: no self-service updates.
drop policy if exists "account_members_update_own" on public.account_members;

-- (3) agent_profiles: writes only on rows owned by an account the caller
-- belongs to; global templates (account_id is null) stay readable via the
-- untouched SELECT policy but are service-role-only to write.
drop policy if exists "agent_profiles_insert_account" on public.agent_profiles;
create policy "agent_profiles_insert_account" on public.agent_profiles
  for insert to authenticated
  with check (
    account_id is not null
    and public.is_account_member(account_id)
  );

drop policy if exists "agent_profiles_update_account" on public.agent_profiles;
create policy "agent_profiles_update_account" on public.agent_profiles
  for update to authenticated
  using (
    account_id is not null
    and public.is_account_member(account_id)
  )
  with check (
    account_id is not null
    and public.is_account_member(account_id)
  );

-- (4) feed config/cache reads: authenticated only.
drop policy if exists "data_feeds_select_account" on public.data_feeds;
create policy "data_feeds_select_account" on public.data_feeds
  for select to authenticated
  using (account_id is null or public.is_account_member(account_id));

drop policy if exists "feed_cache_select_account" on public.feed_cache;
create policy "feed_cache_select_account" on public.feed_cache
  for select to authenticated
  using (account_id is null or public.is_account_member(account_id));
