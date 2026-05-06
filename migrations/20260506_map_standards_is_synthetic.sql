-- Grade5_Seeding_Brief §3.1 — flag for non-TEKS synthetic standards
-- (review skills, Plano-vs-TEKS gaps that don't have a real TEKS code).
-- The test composer treats synthetic and TEKS-derived standards
-- identically; the flag is for the parent dashboard's TEKS heatmap and
-- the coverage script. Already applied 2026-05-06.

ALTER TABLE public.map_standards
  ADD COLUMN IF NOT EXISTS is_synthetic boolean NOT NULL DEFAULT false;
