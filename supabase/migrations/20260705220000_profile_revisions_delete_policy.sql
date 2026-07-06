-- =============================================================================
-- agent_profile_revisions: allow members to DELETE revisions of their own
-- account's profiles.
--
-- RF-5B3-2: the AgentSettingsSheet prunes revision history to the last 10 per
-- profile from the client, but the table only had SELECT + INSERT policies —
-- deletes silently matched zero rows and history grew unbounded. Scope matches
-- the INSERT policy exactly: only revisions whose parent profile is
-- account-scoped and owned by the member's account. Revisions of the shared
-- template profiles (account_id null) stay undeletable by clients.
-- =============================================================================

drop policy if exists "agent_profile_revisions_delete" on public.agent_profile_revisions;
create policy "agent_profile_revisions_delete" on public.agent_profile_revisions
  for delete to authenticated
  using (
    exists (
      select 1 from public.agent_profiles ap
      where ap.id = agent_profile_id
        and ap.account_id is not null
        and public.is_account_member(ap.account_id)
    )
  );
