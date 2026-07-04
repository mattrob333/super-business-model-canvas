-- Phase 4.3: competitor-linked scored gaps for the gap engine.

alter type public.gap_type add value if not exists 'competitive';

alter table public.gaps
  add column if not exists competitor_id uuid references public.companies(id) on delete cascade,
  add column if not exists score numeric(6,2),
  add column if not exists score_inputs jsonb not null default '{}'::jsonb,
  add column if not exists formula_version text;

create index if not exists idx_gaps_competitor
  on public.gaps(account_id, competitor_id, status, created_at desc)
  where competitor_id is not null;
