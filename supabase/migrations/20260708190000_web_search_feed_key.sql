-- Renames the grok_live_search data feed to web_search: xAI's Live Search API
-- was retired 2026-01-12, so the fetcher is now a provider chain (Exa ->
-- Firecrawl search -> xAI Agent Tools API) and "grok_live_search" no longer
-- describes what runs. This is purely additive — it does NOT touch or delete
-- the existing grok_live_search row, so it is safe to apply before, with, or
-- after the worker code deploy that switches feedKey references to
-- "web_search" (the old row simply becomes an unused, harmless leftover; a
-- migration that renamed it in place would break a worker still running the
-- old code, which still looks up "grok_live_search").

insert into public.data_feeds (account_id, feed_key, name, kind, tier, cadence, ttl_seconds, health, cost_class, config)
values
  (null, 'web_search', 'Web search (Exa -> Firecrawl -> xAI)', 'search', 'T2', 'daily', 86400, 'degraded', 'metered', '{}'::jsonb)
on conflict (account_id, feed_key) do update set
  name = excluded.name,
  kind = excluded.kind,
  tier = excluded.tier,
  cadence = excluded.cadence,
  ttl_seconds = excluded.ttl_seconds,
  cost_class = excluded.cost_class,
  config = excluded.config,
  updated_at = now();
