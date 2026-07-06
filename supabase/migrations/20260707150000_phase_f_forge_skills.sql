-- Phase F: Forge (value_propositions) gets its first two runnable skills.
-- Same contract as Phase B: the base catalog upsert never flips implemented;
-- explicit follow-on migrations do, and only for keys the worker executes.
-- Descriptions state exactly what each skill consumes and produces — the
-- catalog tiles are the UI contract.

update public.skill_catalog
set implemented = true,
    description = 'Compares your Value Propositions items against every researched competitor''s claims and classifies each as unique, contested (naming the competitor), or table stakes. Needs your VP items plus at least one researched competitor.'
where skill_key = 'forge.differentiator_audit';

update public.skill_catalog
set implemented = true,
    description = 'Flags Value Propositions items with no linked evidence or an "Assumption:" label, suggests an evidence source for each, and opens one Gap Register entry per proof gap. Needs your VP canvas items only.'
where skill_key = 'forge.proof_gap_scan';
