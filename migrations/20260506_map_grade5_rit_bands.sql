-- Grade5_Seeding_Brief §2 — extend map_rit_band so Grade 5 has room to
-- step above 'above_210'. Non-destructive; existing rows that use
-- 'above_210' / 'above_230' remain valid (they stay as legacy catchalls
-- per §13). Already applied 2026-05-06; this file is for repo audit.

ALTER TYPE public.map_rit_band ADD VALUE IF NOT EXISTS '211_220' AFTER '201_210';
ALTER TYPE public.map_rit_band ADD VALUE IF NOT EXISTS '221_230' AFTER '211_220';
ALTER TYPE public.map_rit_band ADD VALUE IF NOT EXISTS '231_240' AFTER '221_230';
