-- =============================================================================
-- PHASE 5A - Knowledge stack and grounding schema
-- Spec reference: docs/specs/08_KNOWLEDGE_AND_STRATEGY_ENGINE.md §§1, 3, 4, 9
-- =============================================================================

do $$ begin create type public.watched_source_kind as enum ('url', 'social_handle', 'search_query', 'feed_config'); exception when duplicate_object then null; end $$;
do $$ begin create type public.watch_cadence as enum ('daily', 'weekly', 'biweekly', 'monthly'); exception when duplicate_object then null; end $$;
do $$ begin create type public.watch_health as enum ('unknown', 'ok', 'degraded', 'failed', 'paused'); exception when duplicate_object then null; end $$;
do $$ begin create type public.watch_added_by as enum ('agent', 'user'); exception when duplicate_object then null; end $$;
do $$ begin create type public.knowledge_claim_source as enum ('researched', 'owner_provided'); exception when duplicate_object then null; end $$;
do $$ begin create type public.owner_question_status as enum ('open', 'answered', 'dismissed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.founder_document_status as enum ('uploaded', 'parsing', 'needs_review', 'distributed', 'failed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.company_logo_source as enum ('firecrawl_metadata', 'og_image', 'favicon', 'manual', 'fallback'); exception when duplicate_object then null; end $$;

create table if not exists public.watched_sources (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  agent_profile_id uuid not null references public.agent_profiles(id) on delete cascade,
  kind public.watched_source_kind not null,
  target text not null,
  label text not null,
  cadence public.watch_cadence not null default 'weekly',
  last_checked_at timestamptz,
  health public.watch_health not null default 'unknown',
  last_error text,
  added_by public.watch_added_by not null default 'user',
  entity jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.founder_documents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  title text not null,
  file_name text,
  storage_bucket text not null default 'founder-documents',
  storage_path text,
  content_type text,
  file_size_bytes bigint,
  status public.founder_document_status not null default 'uploaded',
  source_summary text,
  extracted_text text,
  section_claims jsonb not null default '{}'::jsonb,
  evidence_ids uuid[] not null default '{}',
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  uploaded_by uuid,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.founder_documents is
  'Owner-uploaded founder docs for deck-first onboarding. Items are owner-provided evidence and never silently merged.';

create table if not exists public.agent_documents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  agent_profile_id uuid not null references public.agent_profiles(id) on delete cascade,
  doc_key text not null,
  title text not null,
  body_md text not null default '',
  version integer not null default 1,
  refresh_cadence public.watch_cadence not null default 'weekly',
  last_refreshed_at timestamptz,
  freshness_status public.freshness_status not null default 'unverified',
  evidence_ids uuid[] not null default '{}',
  material_change boolean not null default false,
  claim_sources jsonb not null default '{}'::jsonb,
  founder_document_id uuid references public.founder_documents(id) on delete set null,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, agent_profile_id, doc_key)
);

create table if not exists public.agent_document_revisions (
  id uuid primary key default gen_random_uuid(),
  agent_document_id uuid not null references public.agent_documents(id) on delete cascade,
  version integer not null,
  title text not null,
  body_md text not null,
  evidence_ids uuid[] not null default '{}',
  material_change boolean not null default false,
  change_summary text,
  claim_sources jsonb not null default '{}'::jsonb,
  founder_document_id uuid references public.founder_documents(id) on delete set null,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (agent_document_id, version)
);

create table if not exists public.owner_questions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  agent_profile_id uuid not null references public.agent_profiles(id) on delete cascade,
  question text not null,
  why_needed text not null,
  doc_key text not null,
  status public.owner_question_status not null default 'open',
  answer text,
  answered_at timestamptz,
  dismissed_at timestamptz,
  evidence_id uuid references public.evidence_items(id) on delete set null,
  created_by_agent_run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.canvas_section_versions
  add column if not exists groundedness_score numeric(5,4)
    check (groundedness_score is null or (groundedness_score >= 0 and groundedness_score <= 1)),
  add column if not exists groundedness_inputs jsonb not null default '{}'::jsonb;

alter table public.companies
  add column if not exists logo_url text,
  add column if not exists logo_source public.company_logo_source,
  add column if not exists brand_assets jsonb not null default '{}'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'founder-documents',
  'founder-documents',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/markdown',
    'text/plain'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create index if not exists idx_watched_sources_account_agent on public.watched_sources(account_id, agent_profile_id, enabled);
create index if not exists idx_watched_sources_health on public.watched_sources(account_id, health, last_checked_at);
create index if not exists idx_founder_documents_account_status on public.founder_documents(account_id, status, created_at desc);
create index if not exists idx_agent_documents_account_agent on public.agent_documents(account_id, agent_profile_id, doc_key);
create index if not exists idx_agent_documents_freshness on public.agent_documents(account_id, freshness_status, last_refreshed_at);
create index if not exists idx_agent_document_revisions_document on public.agent_document_revisions(agent_document_id, version desc);
create index if not exists idx_owner_questions_account_agent on public.owner_questions(account_id, agent_profile_id, status, created_at desc);
create index if not exists idx_csv_groundedness on public.canvas_section_versions(account_id, section_key, groundedness_score);

create or replace function public.enforce_owner_question_open_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'open' and (
    select count(*)
    from public.owner_questions oq
    where oq.account_id = new.account_id
      and oq.agent_profile_id = new.agent_profile_id
      and oq.status = 'open'
      and oq.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) >= 3 then
    raise exception 'owner_questions allows at most 3 open questions per agent';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_owner_question_open_limit on public.owner_questions;
create trigger enforce_owner_question_open_limit
  before insert or update of status, account_id, agent_profile_id
  on public.owner_questions
  for each row execute function public.enforce_owner_question_open_limit();

alter table public.watched_sources enable row level security;
alter table public.founder_documents enable row level security;
alter table public.agent_documents enable row level security;
alter table public.agent_document_revisions enable row level security;
alter table public.owner_questions enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array[
    'watched_sources',
    'founder_documents',
    'agent_documents',
    'owner_questions'
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
         for update to authenticated using (public.is_account_member(account_id))
         with check (public.is_account_member(account_id))', t, t);

    execute format('drop policy if exists "%s_delete_account" on public.%I', t, t);
    execute format(
      'create policy "%s_delete_account" on public.%I
         for delete to authenticated using (public.is_account_member(account_id))', t, t);
  end loop;
end $$;

drop policy if exists "agent_document_revisions_select" on public.agent_document_revisions;
create policy "agent_document_revisions_select" on public.agent_document_revisions
  for select to authenticated
  using (
    exists (
      select 1 from public.agent_documents ad
      where ad.id = agent_document_id
        and public.is_account_member(ad.account_id)
    )
  );

drop policy if exists "agent_document_revisions_insert" on public.agent_document_revisions;
create policy "agent_document_revisions_insert" on public.agent_document_revisions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.agent_documents ad
      where ad.id = agent_document_id
        and public.is_account_member(ad.account_id)
    )
  );

drop policy if exists "founder_documents_storage_select" on storage.objects;
create policy "founder_documents_storage_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'founder-documents'
    and exists (
      select 1 from public.account_members am
      where am.user_id = auth.uid()
        and am.account_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "founder_documents_storage_insert" on storage.objects;
create policy "founder_documents_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'founder-documents'
    and exists (
      select 1 from public.account_members am
      where am.user_id = auth.uid()
        and am.account_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "founder_documents_storage_update" on storage.objects;
create policy "founder_documents_storage_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'founder-documents'
    and exists (
      select 1 from public.account_members am
      where am.user_id = auth.uid()
        and am.account_id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'founder-documents'
    and exists (
      select 1 from public.account_members am
      where am.user_id = auth.uid()
        and am.account_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "founder_documents_storage_delete" on storage.objects;
create policy "founder_documents_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'founder-documents'
    and exists (
      select 1 from public.account_members am
      where am.user_id = auth.uid()
        and am.account_id::text = (storage.foldername(name))[1]
    )
  );

do $$
declare t text;
begin
  for t in select unnest(array[
    'watched_sources',
    'founder_documents',
    'agent_documents',
    'owner_questions'
  ]) loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
