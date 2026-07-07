-- Goal Phase 1: the final 14 catalog skills go live — every room's tile is
-- now real. Same contract as Phases B/F/G: the base catalog upsert never
-- flips implemented; explicit follow-on migrations do, and only for keys the
-- worker executes. Descriptions state exactly what each skill consumes and
-- produces — the catalog tiles are the UI contract.

update public.skill_catalog
set implemented = true,
    description = 'Consumes your own and competitor Revenue Streams canvas items and produces a ranked list of monetization models competitors run that you do not, each citing the competitor''s verbatim canvas text plus an adoption rationale and a concrete first experiment.'
where skill_key = 'yield.monetization_gaps';

update public.skill_catalog
set implemented = true,
    description = 'Consumes your Revenue Streams and Customer Segments canvas plus live review excerpts about the analyzed company''s pricing, and produces a per-segment willingness-to-pay read (underpriced/overpriced/aligned/unknown) where every read quotes a retrieved review verbatim.'
where skill_key = 'yield.wtp_signals';

update public.skill_catalog
set implemented = true,
    description = 'Consumes the latest supply-chain map artifact plus your Key Partners and Value Propositions items, and produces one personalized outreach DRAFT per top map candidate (up to 5) — grounded verbatim in each candidate''s map rationale, written as an approval surface that is never sent autonomously.'
where skill_key = 'envoy.partner_outreach';

update public.skill_catalog
set implemented = true,
    description = 'Consumes the researched competitor list plus live search evidence of competitor partnership announcements (own Key Partners as context) and produces a verifier-spot-checked read of observed partnership moves, each with a verbatim evidence quote and a counter-partner suggestion.'
where skill_key = 'envoy.ecosystem_watch';

update public.skill_catalog
set implemented = true,
    description = 'Consumes your Customer Segments canvas (Channels items as context) plus live community search, and produces a ranked, evidence-quoted map of where each segment congregates online/offline with a concrete norm-respecting entry strategy per watering hole.'
where skill_key = 'relay.watering_holes';

update public.skill_catalog
set implemented = true,
    description = 'Consumes your Value Propositions and Customer Segments canvas items (plus the latest avatar-refinement artifact when one exists) and produces a before/after table rewriting each of your value-prop lines in the segment''s own language, honestly marking lines where no segment language exists yet.'
where skill_key = 'compass.message_market_fit';

update public.skill_catalog
set implemented = true,
    description = 'Consumes your Customer Relationships items plus live-searched customer reviews of your company and researched competitors; produces excerpt-grounded complaint theme clusters, labeled own vs competitor, each mapped to a concrete retention play.'
where skill_key = 'anchor.churn_signal_audit';

update public.skill_catalog
set implemented = true,
    description = 'Consumes the researched competitors, their Customer Relationships canvas items, and live search evidence on their referral/community/champion programs; produces a verifier-spot-checked playbook of competitor advocacy mechanisms, each with a verbatim labeled evidence quote and an equivalent move sized for your scale.'
where skill_key = 'anchor.advocacy_engine_scan';

update public.skill_catalog
set implemented = true,
    description = 'Consumes your Key Activities canvas, your researched competitor list, and live search evidence on those competitors'' hiring and product launches; produces a per-activity gap analysis showing where competitors visibly invest (with verbatim quotes) and honestly marking activities with no public signal.'
where skill_key = 'tempo.operational_benchmark';

update public.skill_catalog
set implemented = true,
    description = 'Consumes the researched competitor list plus live launch/changelog evidence (own Key Activities as context) and produces a per-competitor recent-shipping read with verbatim-quoted observations and an overall outshipping insight that honestly declares itself evidence-too-thin when no delta is grounded.'
where skill_key = 'tempo.velocity_watch';

update public.skill_catalog
set implemented = true,
    description = 'Consumes your own Key Resources (plus Key Partners and Key Activities as context — no external feed) and produces a parser-grounded risk register of key-person, single-supplier, platform-dependency, and concentration risks with severity, exposure, and a mitigation first step; severity-4+ risks open Gap Register rows.'
where skill_key = 'vault.single_point_scan';

update public.skill_catalog
set implemented = true,
    description = 'Consumes the researched competitor list plus live-searched hiring/job-posting excerpts (own Key Resources as context) and produces a per-competitor hiring-signal read by function — each signal quoted verbatim from an excerpt, thin evidence stated honestly — with an inferred next move per competitor.'
where skill_key = 'vault.talent_radar';

update public.skill_catalog
set implemented = true,
    description = 'Consumes your Cost Structure canvas items plus the analyzed company''s brief and produces a benchmark of your costs against your archetype''s typical mix — your numbers quoted verbatim from the canvas, archetype norms labeled as model knowledge, and one "Cost input:" gap row opened per category the canvas cannot ground.'
where skill_key = 'ledger.cost_benchmark';

update public.skill_catalog
set implemented = true,
    description = 'Consumes your own Cost Structure canvas items plus live adoption evidence and produces a ranked vendor/tooling shortlist — each row names one of your cost drivers verbatim with a verbatim evidence quote and an expected-impact rationale.'
where skill_key = 'ledger.efficiency_scan';
