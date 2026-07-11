-- Registers the sec_edgar_filings feed: real SEC filing text (10-K risk
-- factors, segment revenue, competitive-position language in a company's
-- own filed words) for the many competitors that ARE SEC-registered public
-- filers. Needs no paid API key -- only a descriptive contact User-Agent per
-- SEC's fair-access policy, defaulted in code. Purely additive, matching the
-- web_search feed-key migration's convention.

insert into public.data_feeds (account_id, feed_key, name, kind, tier, cadence, ttl_seconds, health, cost_class, config)
values
  (null, 'sec_edgar_filings', 'SEC EDGAR filings', 'api', 'T1', 'weekly', 604800, 'degraded', 'free', '{}'::jsonb)
on conflict (account_id, feed_key) do update set
  name = excluded.name,
  kind = excluded.kind,
  tier = excluded.tier,
  cadence = excluded.cadence,
  ttl_seconds = excluded.ttl_seconds,
  cost_class = excluded.cost_class,
  config = excluded.config,
  updated_at = now();
