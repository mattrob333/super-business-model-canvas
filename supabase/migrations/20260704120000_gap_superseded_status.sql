-- RF-4-5: gap engine idempotency — prior open competitive gaps are superseded on each run
-- instead of duplicated. New terminal status for machine-replaced gaps.

alter type public.gap_status add value if not exists 'superseded';
