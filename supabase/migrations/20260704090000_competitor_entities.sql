-- Phase 4.1: account-scoped company/competitor entities and linked canvas versions.

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  website_url text,
  description text,
  industry text,
  is_competitor boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.canvas_section_versions
  add column if not exists competitor_id uuid references public.companies(id) on delete cascade;

create unique index if not exists idx_companies_account_website
  on public.companies(account_id, lower(website_url))
  where website_url is not null;

create index if not exists idx_companies_account_competitor
  on public.companies(account_id, is_competitor, name);

create index if not exists idx_csv_competitor_latest
  on public.canvas_section_versions(account_id, competitor_id, section_key, created_at desc)
  where competitor_id is not null;

alter table public.companies enable row level security;

drop policy if exists "companies_select_account" on public.companies;
create policy "companies_select_account" on public.companies
  for select to authenticated using (public.is_account_member(account_id));

drop policy if exists "companies_insert_account" on public.companies;
create policy "companies_insert_account" on public.companies
  for insert to authenticated with check (public.is_account_member(account_id));

drop policy if exists "companies_update_account" on public.companies;
create policy "companies_update_account" on public.companies
  for update to authenticated using (public.is_account_member(account_id));

drop policy if exists "companies_delete_account" on public.companies;
create policy "companies_delete_account" on public.companies
  for delete to authenticated using (public.is_account_member(account_id));

