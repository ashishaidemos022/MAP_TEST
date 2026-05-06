-- Grade5_Seeding_Brief §2 — wire 231_240 into map_rit_band_ord and the
-- mastery view's reverse-mapping. Strategy: 231_240 collapses to ordinal 9
-- alongside legacy above_230 (matches the existing collapse of
-- 211_220/above_210 at ordinal 7) so historical median_ord values stay
-- stable. The view's reverse CASE returns 231_240 going forward — that's
-- the canonical Grade 5 ceiling band; above_230 is legacy.
--
-- Already applied 2026-05-06; this file is for repo audit.

CREATE OR REPLACE FUNCTION public.map_rit_band_ord(b public.map_rit_band)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE b
    WHEN 'below_161' THEN 1
    WHEN '161_170'   THEN 2
    WHEN '171_180'   THEN 3
    WHEN '181_190'   THEN 4
    WHEN '191_200'   THEN 5
    WHEN '201_210'   THEN 6
    WHEN 'above_210' THEN 7   -- legacy; equivalent to 211_220
    WHEN '211_220'   THEN 7
    WHEN '221_230'   THEN 8
    WHEN '231_240'   THEN 9   -- canonical Grade 5 ceiling
    WHEN 'above_230' THEN 9   -- legacy; equivalent to 231_240
  END;
$function$;

CREATE OR REPLACE VIEW public.map_v_student_current_band AS
WITH recent_correct AS (
  SELECT a.student_id,
         q.rit_band,
         row_number() OVER (PARTITION BY a.student_id ORDER BY a.answered_at DESC) AS rn
    FROM public.map_attempts a
    JOIN public.map_questions q ON q.id = a.question_id
    JOIN public.map_students s_1 ON s_1.id = a.student_id
   WHERE a.is_correct AND q.grade = s_1.grade
), median_per_student AS (
  SELECT rc2.student_id,
         percentile_cont(0.5::double precision) WITHIN GROUP (
           ORDER BY (public.map_rit_band_ord(rc2.rit_band)::double precision)
         )::integer AS median_ord
    FROM recent_correct rc2
   WHERE rc2.rn <= 10
   GROUP BY rc2.student_id
)
SELECT s.id AS student_id,
       COALESCE(
         CASE m.median_ord
           WHEN 1 THEN 'below_161'::public.map_rit_band
           WHEN 2 THEN '161_170'::public.map_rit_band
           WHEN 3 THEN '171_180'::public.map_rit_band
           WHEN 4 THEN '181_190'::public.map_rit_band
           WHEN 5 THEN '191_200'::public.map_rit_band
           WHEN 6 THEN '201_210'::public.map_rit_band
           WHEN 7 THEN '211_220'::public.map_rit_band
           WHEN 8 THEN '221_230'::public.map_rit_band
           WHEN 9 THEN '231_240'::public.map_rit_band
           ELSE NULL::public.map_rit_band
         END,
         CASE s.grade
           WHEN 1 THEN '171_180'::public.map_rit_band
           WHEN 2 THEN '181_190'::public.map_rit_band
           WHEN 3 THEN '191_200'::public.map_rit_band
           WHEN 4 THEN '201_210'::public.map_rit_band
           WHEN 5 THEN '211_220'::public.map_rit_band
           ELSE '201_210'::public.map_rit_band
         END
       ) AS current_band
  FROM public.map_students s
  LEFT JOIN median_per_student m ON m.student_id = s.id;
