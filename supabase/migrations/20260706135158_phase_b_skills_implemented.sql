-- Phase B: mark only shipped worker-backed skills runnable.
-- The base catalog upsert intentionally does not flip implemented on conflict,
-- so implementation flags move in explicit follow-on migrations.

update public.skill_catalog
set implemented = true
where skill_key in (
  'compass.avatar_refinement',
  'compass.segment_expansion',
  'relay.channel_gap_scan',
  'relay.channel_economics'
);
