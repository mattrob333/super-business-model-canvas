-- Phase 3.1: data feed registry and TTL cache.

do $$ begin
  create type public.data_feed_kind as enum ('api', 'scrape', 'search');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.data_feed_health as enum ('ok', 'degraded', 'failing');
exception when duplicate_object then null; end $$;

create table if not exists public.data_feeds (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  feed_key text not null,
  name text not null,
  kind public.data_feed_kind not null,
  tier text not null default 'T2',
  config jsonb not null default '{}'::jsonb,
  cadence text not null default 'weekly',
  ttl_seconds integer not null default 86400,
  last_run_at timestamptz,
  health public.data_feed_health not null default 'degraded',
  last_error text,
  cost_class text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct(account_id, feed_key)
);

comment on table public.data_feeds is
  'Phase 3 feed registry. account_id null rows are global defaults; account rows override by feed_key.';
comment on column public.data_feeds.config is
  'Fetcher-specific JSON config such as URL targets, FRED series IDs, Trends keywords, GDELT query, or GitHub repos.';

create table if not exists public.feed_cache (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  feed_key text not null,
  cache_key text not null,
  payload jsonb not null default '{}'::jsonb,
  evidence_candidates jsonb not null default '[]'::jsonb,
  metric_candidates jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  health public.data_feed_health not null default 'ok',
  error text,
  created_at timestamptz not null default now(),
  unique(account_id, feed_key, cache_key)
);

comment on table public.feed_cache is
  'TTL cache for Phase 3 feed fetches. Agents and fetchers read cached evidence before spending another scrape/search/API call.';

create index if not exists idx_data_feeds_account_key on public.data_feeds(account_id, feed_key);
create index if not exists idx_data_feeds_health on public.data_feeds(health);
create index if not exists idx_feed_cache_lookup on public.feed_cache(account_id, feed_key, cache_key, expires_at desc);
create index if not exists idx_scheduled_loops_action_key on public.scheduled_loops(action_key);

alter table public.data_feeds enable row level security;
alter table public.feed_cache enable row level security;

drop policy if exists "data_feeds_select_account" on public.data_feeds;
create policy "data_feeds_select_account"
  on public.data_feeds for select
  using (account_id is null or public.is_account_member(account_id));

drop policy if exists "feed_cache_select_account" on public.feed_cache;
create policy "feed_cache_select_account"
  on public.feed_cache for select
  using (account_id is null or public.is_account_member(account_id));

insert into public.data_feeds (account_id, feed_key, name, kind, tier, cadence, ttl_seconds, health, cost_class, config)
values
  (null, 'firecrawl_scrape', 'Firecrawl page scrape', 'scrape', 'T1', 'weekly', 604800, 'degraded', 'metered', '{"targets":["pricing","careers","changelog","reviews","press"]}'::jsonb),
  (null, 'grok_live_search', 'Grok live search', 'search', 'T2', 'daily', 86400, 'degraded', 'metered', '{}'::jsonb),
  (null, 'fred_series', 'FRED macro series', 'api', 'T1', 'monthly', 2592000, 'degraded', 'free', '{"series":["FEDFUNDS","CPIAUCSL","UMCSENT"]}'::jsonb),
  (null, 'google_trends', 'Google Trends interest', 'api', 'T2', 'weekly', 604800, 'degraded', 'free', '{}'::jsonb),
  (null, 'gdelt_count', 'GDELT news count', 'api', 'T2', 'weekly', 604800, 'degraded', 'free', '{}'::jsonb),
  (null, 'github_repo_stats', 'GitHub repository stats', 'api', 'T1', 'weekly', 604800, 'degraded', 'free', '{}'::jsonb)
on conflict (account_id, feed_key) do update set
  name = excluded.name,
  kind = excluded.kind,
  tier = excluded.tier,
  cadence = excluded.cadence,
  ttl_seconds = excluded.ttl_seconds,
  cost_class = excluded.cost_class,
  config = excluded.config,
  updated_at = now();
