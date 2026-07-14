-- Briefings become shelf documents (owner direction 2026-07-14: the State of
-- the Union should live as a doc on the shelf, not a permanent panel).
-- skill_artifacts.skill_key FKs to skill_catalog, so the briefing needs a
-- catalog row. implemented=false keeps it OUT of every runnable-skill list
-- (Atlas's directable skills filter on implemented=true) — the row exists
-- only so the worker can file the document.

insert into public.skill_catalog
  (skill_key, agent_key, title, description, trigger_kinds, output_kind, implemented, orchestrator_can_trigger, sort_order)
values (
  'atlas.state_of_the_union',
  'orchestrator',
  'State of the Union',
  'Atlas''s cross-canvas briefing: where you stand, what changed since last time, brain coverage, and the one move that matters most.',
  '{auto}',
  'briefing',
  false,
  false,
  0
)
on conflict (skill_key) do nothing;
