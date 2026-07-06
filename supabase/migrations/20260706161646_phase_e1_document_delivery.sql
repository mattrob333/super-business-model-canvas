-- Phase E.1: documents that travel.
-- Adds explicit artifact share records and account brand color for document
-- letterhead. Public reads are intentionally handled through the
-- shared-artifact Edge Function, not direct anon table access.

alter table public.accounts
  add column if not exists brand_color text;

drop policy if exists "accounts_update_member" on public.accounts;
create policy "accounts_update_member" on public.accounts
  for update to authenticated
  using (public.is_account_member(id))
  with check (public.is_account_member(id));

create table if not exists public.artifact_shares (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  artifact_id uuid not null references public.skill_artifacts(id) on delete cascade,
  token text not null unique,
  created_by uuid,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  constraint artifact_shares_token_length check (char_length(token) >= 32)
);

create index if not exists idx_artifact_shares_account
  on public.artifact_shares(account_id, created_at desc);

create index if not exists idx_artifact_shares_artifact
  on public.artifact_shares(artifact_id, revoked, created_at desc);

create unique index if not exists idx_artifact_shares_active_artifact
  on public.artifact_shares(artifact_id)
  where revoked = false;

alter table public.artifact_shares enable row level security;

drop policy if exists "artifact_shares_select_account" on public.artifact_shares;
create policy "artifact_shares_select_account" on public.artifact_shares
  for select to authenticated
  using (public.is_account_member(account_id));

drop policy if exists "artifact_shares_insert_account" on public.artifact_shares;
create policy "artifact_shares_insert_account" on public.artifact_shares
  for insert to authenticated
  with check (
    public.is_account_member(account_id)
    and exists (
      select 1
      from public.skill_artifacts artifact
      where artifact.id = artifact_shares.artifact_id
        and artifact.account_id = artifact_shares.account_id
    )
  );

drop policy if exists "artifact_shares_update_account" on public.artifact_shares;
create policy "artifact_shares_update_account" on public.artifact_shares
  for update to authenticated
  using (public.is_account_member(account_id))
  with check (public.is_account_member(account_id));

drop policy if exists "artifact_shares_delete_account" on public.artifact_shares;
create policy "artifact_shares_delete_account" on public.artifact_shares
  for delete to authenticated
  using (public.is_account_member(account_id));

grant select, insert, update, delete on public.artifact_shares to authenticated;
grant select, update on public.accounts to authenticated;
