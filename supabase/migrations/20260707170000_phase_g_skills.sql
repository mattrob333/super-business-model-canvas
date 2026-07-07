-- Phase G: six standalone skill modules go live (one per workspace room).
-- Same contract as Phases B/F: the base catalog upsert never flips
-- implemented; explicit follow-on migrations do, and only for keys the
-- worker executes. Descriptions state exactly what each skill consumes and
-- produces — the catalog tiles are the UI contract.

update public.skill_catalog
set implemented = true,
    description = 'Classifies every Key Resources item (using competitor resources and own value propositions as optional context) into a moat class with a 1-5 durability score, producing a Moat audit artifact plus a resources/durable run summary.'
where skill_key = 'vault.moat_audit';

update public.skill_catalog
set implemented = true,
    description = 'Turns your Value Propositions and Customer Segments canvas items (plus any prior differentiator-audit and avatar-refinement artifacts) into a one-page positioning brief: a six-part positioning statement, verbatim-grounded message pillars with segment language, and tone notes.'
where skill_key = 'forge.positioning_brief';

update public.skill_catalog
set implemented = true,
    description = 'Fills a fixed six-variable unit economics frame (CAC, ACV/ARPA, gross margin, retention/churn, payback, LTV) strictly from your Revenue Streams and Cost Structure canvas items, and opens a Gap Register owner-input row for every variable the canvas cannot ground.'
where skill_key = 'ledger.unit_economics_frame';

update public.skill_catalog
set implemented = true,
    description = 'Maps the analyzed company''s upstream suppliers and downstream distribution from live industry-search evidence (plus current Key Partners items as context) and produces a Key Partners artifact with scored, excerpt-quoted, verifier-spot-checked partnership candidates.'
where skill_key = 'envoy.supply_chain_map';

update public.skill_catalog
set implemented = true,
    description = 'Consumes your and competitors'' Customer Relationships canvas items (plus your Channels as context) and produces a six-stage lifecycle map artifact — your motion vs. verified competitor motions per stage, with gap flags and recommendations.'
where skill_key = 'anchor.lifecycle_map';

update public.skill_catalog
set implemented = true,
    description = 'Consumes your Key Activities canvas items plus live market-search evidence per activity, and produces a build-vs-buy verdict table (keep_in_house / consider_buying / strong_buy_candidate) with excerpt-quoted market alternatives, switching sketches, and a verifier spot-check.'
where skill_key = 'tempo.build_vs_buy';
