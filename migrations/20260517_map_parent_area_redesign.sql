-- Migration: map_parent_area_redesign
-- Phase 5 foundation slice. Apply via Supabase MCP `apply_migration`
-- (migration name: map_parent_area_redesign). Idempotent, single transaction.
-- Reconciled to live schema of project klhzfwxpztaojekwgzcg (see spec
-- docs/superpowers/specs/2026-05-17-parent-area-foundation-design.md §3).

-- 0. Pre-flight: fail loudly if a dependency column we rely on has moved.
DO $pf$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='map_custom_question_versions'
                   AND column_name='standard_code') THEN
    RAISE EXCEPTION 'pre-flight: map_custom_question_versions.standard_code missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='map_misconception_signals'
                   AND column_name='occurrence_count') THEN
    RAISE EXCEPTION 'pre-flight: map_misconception_signals.occurrence_count missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='map_test_sessions'
                   AND column_name='custom_config') THEN
    RAISE EXCEPTION 'pre-flight: map_test_sessions.custom_config missing';
  END IF;
END $pf$;

-- 1. Assignment status enum.
DO $en$ BEGIN
  CREATE TYPE public.map_assignment_status AS ENUM
    ('assigned','in_progress','completed','expired','revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $en$;

-- 2. Test definitions (the reusable recipe; no student_id by design).
CREATE TABLE IF NOT EXISTS public.map_test_definitions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           uuid NOT NULL REFERENCES public.map_families(id) ON DELETE CASCADE,
  owner_user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name                text NOT NULL,
  subject             public.map_subject NOT NULL,
  grade               int NOT NULL,
  planned_length      int NOT NULL DEFAULT 25,
  source_mix          text NOT NULL DEFAULT 'vetted_only',
  custom_pct          int,
  difficulty_mix      jsonb,
  standard_codes      text[] DEFAULT '{}',
  custom_question_ids uuid[] DEFAULT '{}',
  custom_passage_ids  uuid[] DEFAULT '{}',
  is_template         boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  soft_deleted_at     timestamptz,
  CONSTRAINT map_td_name_len CHECK (char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT map_td_grade_check CHECK (grade BETWEEN 0 AND 12),
  CONSTRAINT map_td_planned_length_check CHECK (planned_length BETWEEN 5 AND 50),
  CONSTRAINT map_td_source_mix_check CHECK (source_mix IN ('vetted_only','custom_only','mixed')),
  CONSTRAINT map_td_custom_pct_check
    CHECK ((source_mix <> 'mixed' AND custom_pct IS NULL) OR
           (source_mix = 'mixed' AND custom_pct BETWEEN 0 AND 100))
);
CREATE INDEX IF NOT EXISTS map_td_family_idx
  ON public.map_test_definitions (family_id) WHERE soft_deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS map_td_family_template_idx
  ON public.map_test_definitions (family_id, is_template)
  WHERE soft_deleted_at IS NULL AND is_template = true;

-- 3. Assignments (definition × kid).
CREATE TABLE IF NOT EXISTS public.map_test_assignments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           uuid NOT NULL REFERENCES public.map_families(id) ON DELETE CASCADE,
  definition_id       uuid NOT NULL REFERENCES public.map_test_definitions(id) ON DELETE RESTRICT,
  student_id          uuid NOT NULL REFERENCES public.map_students(id) ON DELETE CASCADE,
  assigned_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at         timestamptz NOT NULL DEFAULT now(),
  due_by              timestamptz,
  session_id          uuid REFERENCES public.map_test_sessions(id) ON DELETE SET NULL,
  status              public.map_assignment_status NOT NULL DEFAULT 'assigned',
  started_at          timestamptz,
  completed_at        timestamptz,
  parent_note         text,
  CONSTRAINT map_ta_note_len CHECK (parent_note IS NULL OR char_length(parent_note) BETWEEN 1 AND 500),
  CONSTRAINT map_ta_session_status_coherent CHECK (
    (status = 'assigned'    AND session_id IS NULL AND started_at IS NULL AND completed_at IS NULL) OR
    (status = 'in_progress' AND session_id IS NOT NULL AND started_at IS NOT NULL AND completed_at IS NULL) OR
    (status = 'completed'   AND session_id IS NOT NULL AND started_at IS NOT NULL AND completed_at IS NOT NULL) OR
    (status = 'expired'     AND session_id IS NULL) OR
    (status = 'revoked'     AND session_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS map_ta_family_idx ON public.map_test_assignments (family_id);
CREATE INDEX IF NOT EXISTS map_ta_student_status_idx
  ON public.map_test_assignments (student_id, status) WHERE status IN ('assigned','in_progress');
CREATE INDEX IF NOT EXISTS map_ta_definition_idx ON public.map_test_assignments (definition_id);
CREATE INDEX IF NOT EXISTS map_ta_completed_idx
  ON public.map_test_assignments (family_id, completed_at DESC) WHERE status = 'completed';

-- 4. RLS — family-scoped, mirrors public.map_custom_questions policies.
ALTER TABLE public.map_test_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_test_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS map_td_select ON public.map_test_definitions;
DROP POLICY IF EXISTS map_td_insert ON public.map_test_definitions;
DROP POLICY IF EXISTS map_td_update ON public.map_test_definitions;
CREATE POLICY map_td_select ON public.map_test_definitions FOR SELECT
  USING (family_id = public.map_current_family_id() AND soft_deleted_at IS NULL);
CREATE POLICY map_td_insert ON public.map_test_definitions FOR INSERT
  WITH CHECK (family_id = public.map_current_family_id());
CREATE POLICY map_td_update ON public.map_test_definitions FOR UPDATE
  USING (family_id = public.map_current_family_id())
  WITH CHECK (family_id = public.map_current_family_id());

DROP POLICY IF EXISTS map_ta_select ON public.map_test_assignments;
DROP POLICY IF EXISTS map_ta_insert ON public.map_test_assignments;
DROP POLICY IF EXISTS map_ta_update ON public.map_test_assignments;
CREATE POLICY map_ta_select ON public.map_test_assignments FOR SELECT
  USING (family_id = public.map_current_family_id());
CREATE POLICY map_ta_insert ON public.map_test_assignments FOR INSERT
  WITH CHECK (family_id = public.map_current_family_id());
CREATE POLICY map_ta_update ON public.map_test_assignments FOR UPDATE
  USING (family_id = public.map_current_family_id())
  WITH CHECK (family_id = public.map_current_family_id());

-- 5. parent_v2 flag (gates nothing yet; UI cycle consumes it).
ALTER TABLE public.map_families
  ADD COLUMN IF NOT EXISTS parent_v2 boolean NOT NULL DEFAULT false;

-- 6. Views.
CREATE OR REPLACE VIEW public.map_v_classroom_roster AS
SELECT
  s.id AS student_id,
  s.family_id,
  s.display_name,
  s.grade,
  b.current_band,
  (SELECT count(*) FROM public.map_attempts a
     WHERE a.student_id = s.id AND a.answered_at >= now() - interval '7 days')
    AS questions_this_week,
  (SELECT count(DISTINCT date_trunc('day', a.answered_at)) FROM public.map_attempts a
     WHERE a.student_id = s.id AND a.answered_at >= now() - interval '7 days')
    AS active_days_this_week,
  (SELECT count(*) FROM public.map_v_mastery_by_standard m
     WHERE m.student_id = s.id AND m.status = 'mastered') AS standards_mastered,
  (SELECT count(*) FROM public.map_v_mastery_by_standard m
     WHERE m.student_id = s.id AND m.status = 'developing') AS standards_developing,
  (SELECT count(*) FROM public.map_v_mastery_by_standard m
     WHERE m.student_id = s.id AND m.status = 'growth') AS standards_growth,
  (SELECT count(*) FROM public.map_misconception_signals ms
     WHERE ms.student_id = s.id AND ms.active = true AND ms.occurrence_count >= 3)
    AS active_misconceptions,
  (SELECT count(*) FROM public.map_test_assignments ta
     WHERE ta.student_id = s.id AND ta.status IN ('assigned','in_progress'))
    AS pending_assignments,
  (SELECT row_to_json(x) FROM (
     SELECT ts.id, ts.subject, ts.completed_at,
            ts.correct_count,
            array_length(ts.question_ids, 1) AS questions_attempted,
            round(100.0 * ts.correct_count
                  / nullif(array_length(ts.question_ids, 1), 0)) AS score
     FROM public.map_test_sessions ts
     WHERE ts.student_id = s.id AND ts.completed_at IS NOT NULL
     ORDER BY ts.completed_at DESC LIMIT 1
   ) x) AS last_session
FROM public.map_students s
LEFT JOIN public.map_v_student_current_band b ON b.student_id = s.id;

CREATE OR REPLACE VIEW public.map_v_assignment_overview AS
SELECT
  ta.id AS assignment_id,
  ta.family_id,
  ta.status,
  ta.assigned_at,
  ta.due_by,
  ta.started_at,
  ta.completed_at,
  ta.session_id,
  ta.parent_note,
  s.id AS student_id,
  s.display_name AS student_name,
  s.grade AS student_grade,
  td.id AS definition_id,
  td.name AS definition_name,
  td.subject,
  td.grade AS definition_grade,
  td.planned_length,
  td.source_mix,
  td.is_template,
  ts.correct_count AS questions_correct,
  array_length(ts.question_ids, 1) AS questions_attempted,
  round(100.0 * ts.correct_count
        / nullif(array_length(ts.question_ids, 1), 0)) AS score,
  ts.estimated_rit
FROM public.map_test_assignments ta
JOIN public.map_students s ON s.id = ta.student_id
JOIN public.map_test_definitions td ON td.id = ta.definition_id
LEFT JOIN public.map_test_sessions ts ON ts.id = ta.session_id
WHERE td.soft_deleted_at IS NULL;

CREATE OR REPLACE VIEW public.map_v_library_content AS
SELECT
  q.id AS content_id,
  'question'::text AS content_type,
  'vetted'::text AS source_tab,
  NULL::text AS source_detail,
  q.subject::text, q.grade::int, q.rit_band::text,
  st.teks_code, st.teks_title,
  NULL::text AS status,
  NULL::uuid AS family_id,
  q.created_at
FROM public.map_questions q
JOIN public.map_standards st ON st.id = q.standard_id
WHERE q.is_active = true
UNION ALL
SELECT
  cq.id, 'question',
  CASE WHEN cq.source = 'parent_ai_generated' THEN 'ai_studio' ELSE 'my_questions' END,
  cq.source, qv.subject, qv.grade, NULL,
  qv.standard_code, NULL, cq.status, cq.family_id, cq.created_at
FROM public.map_custom_questions cq
JOIN public.map_custom_question_versions qv ON qv.id = cq.current_version_id
WHERE cq.soft_deleted_at IS NULL
UNION ALL
SELECT
  cp.id, 'passage',
  CASE WHEN cp.source = 'parent_ai_generated' THEN 'ai_studio' ELSE 'my_questions' END,
  cp.source, pv.subject, pv.grade, NULL,
  NULL, NULL, cp.status, cp.family_id, cp.created_at
FROM public.map_custom_passages cp
JOIN public.map_custom_passage_versions pv ON pv.id = cp.current_version_id
WHERE cp.soft_deleted_at IS NULL;

-- 7. RPCs (mirror map_custom_questions auth pattern).
CREATE OR REPLACE FUNCTION public.map_create_test_definition(
  p_name text, p_subject public.map_subject, p_grade int, p_planned_length int,
  p_source_mix text, p_custom_pct int, p_difficulty_mix jsonb,
  p_standard_codes text[], p_custom_question_ids uuid[],
  p_custom_passage_ids uuid[], p_is_template boolean
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_family uuid; v_id uuid;
BEGIN
  v_family := public.map_current_family_id();
  IF v_family IS NULL THEN RAISE EXCEPTION 'no family for current user'; END IF;
  INSERT INTO public.map_test_definitions
    (family_id, owner_user_id, name, subject, grade, planned_length,
     source_mix, custom_pct, difficulty_mix, standard_codes,
     custom_question_ids, custom_passage_ids, is_template)
  VALUES
    (v_family, auth.uid(), p_name, p_subject, p_grade, p_planned_length,
     p_source_mix, p_custom_pct, p_difficulty_mix, coalesce(p_standard_codes,'{}'),
     coalesce(p_custom_question_ids,'{}'), coalesce(p_custom_passage_ids,'{}'),
     coalesce(p_is_template,false))
  RETURNING id INTO v_id;
  RETURN v_id;
END $fn$;
GRANT EXECUTE ON FUNCTION public.map_create_test_definition(
  text,public.map_subject,int,int,text,int,jsonb,text[],uuid[],uuid[],boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.map_assign_test_definition(
  p_definition_id uuid, p_student_ids uuid[],
  p_due_by timestamptz, p_parent_note text
) RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_family uuid; v_ids uuid[] := '{}'; v_sid uuid; v_new uuid;
BEGIN
  v_family := public.map_current_family_id();
  IF v_family IS NULL THEN RAISE EXCEPTION 'no family for current user'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.map_test_definitions
                 WHERE id = p_definition_id AND family_id = v_family
                   AND soft_deleted_at IS NULL) THEN
    RAISE EXCEPTION 'definition not found in this family';
  END IF;
  FOREACH v_sid IN ARRAY coalesce(p_student_ids,'{}') LOOP
    IF NOT EXISTS (SELECT 1 FROM public.map_students
                   WHERE id = v_sid AND family_id = v_family) THEN
      RAISE EXCEPTION 'not your kid';
    END IF;
  END LOOP;
  FOREACH v_sid IN ARRAY coalesce(p_student_ids,'{}') LOOP
    INSERT INTO public.map_test_assignments
      (family_id, definition_id, student_id, assigned_by_user_id,
       due_by, parent_note, status)
    VALUES (v_family, p_definition_id, v_sid, auth.uid(),
            p_due_by, p_parent_note, 'assigned')
    RETURNING id INTO v_new;
    v_ids := array_append(v_ids, v_new);
  END LOOP;
  RETURN v_ids;
END $fn$;
GRANT EXECUTE ON FUNCTION public.map_assign_test_definition(
  uuid,uuid[],timestamptz,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.map_revoke_assignment(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_family uuid;
BEGIN
  v_family := public.map_current_family_id();
  UPDATE public.map_test_assignments
     SET status = 'revoked'
   WHERE id = p_assignment_id
     AND family_id = v_family
     AND status = 'assigned';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found, not yours, or not revocable';
  END IF;
END $fn$;
GRANT EXECUTE ON FUNCTION public.map_revoke_assignment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.map_start_assignment(
  p_assignment_id uuid, p_session_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_family uuid;
BEGIN
  v_family := public.map_current_family_id();
  UPDATE public.map_test_assignments
     SET status = 'in_progress', session_id = p_session_id, started_at = now()
   WHERE id = p_assignment_id
     AND family_id = v_family
     AND status = 'assigned';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found, not yours, or not startable';
  END IF;
END $fn$;
GRANT EXECUTE ON FUNCTION public.map_start_assignment(uuid,uuid) TO authenticated;

-- 8. Faithful backfill of legacy kind='custom' sessions. Keyed by session id;
-- skips sessions already linked. source_mix='vetted_only' is accurate (the
-- legacy customTest.ts path only drew from map_questions).
WITH legacy AS (
  SELECT ts.id AS session_id, ts.student_id, ts.subject,
         coalesce(ts.grade, st.grade) AS grade,
         coalesce(ts.planned_length, array_length(ts.question_ids,1), 25) AS planned_length,
         st.family_id,
         coalesce(ts.started_at, ts.completed_at, now()) AS started_at,
         ts.completed_at,
         to_char(coalesce(ts.started_at, ts.completed_at, now()), 'Mon DD, YYYY') AS label,
         CASE
           WHEN ts.custom_config ? 'standard_ids' THEN (
             SELECT coalesce(array_agg(s2.teks_code), '{}')
             FROM public.map_standards s2
             WHERE s2.id IN (
               SELECT (jsonb_array_elements_text(ts.custom_config->'standard_ids'))::uuid
             )
           )
           ELSE '{}'::text[]
         END AS standard_codes
  FROM public.map_test_sessions ts
  JOIN public.map_students st ON st.id = ts.student_id
  WHERE ts.kind = 'custom'
    AND NOT EXISTS (
      SELECT 1 FROM public.map_test_assignments ta WHERE ta.session_id = ts.id
    )
), made_def AS (
  INSERT INTO public.map_test_definitions
    (family_id, owner_user_id, name, subject, grade, planned_length,
     source_mix, custom_pct, standard_codes, is_template, created_at, updated_at)
  SELECT family_id, NULL, 'Backfilled · ' || label, subject, grade, planned_length,
         'vetted_only', NULL, standard_codes, false, started_at, started_at
  FROM legacy
  RETURNING id AS definition_id, created_at
)
INSERT INTO public.map_test_assignments
  (family_id, definition_id, student_id, assigned_by_user_id, assigned_at,
   session_id, status, started_at, completed_at)
SELECT l.family_id, d.definition_id, l.student_id, NULL, l.started_at,
       l.session_id,
       CASE WHEN l.completed_at IS NOT NULL THEN 'completed'::public.map_assignment_status
            ELSE 'in_progress'::public.map_assignment_status END,
       l.started_at,
       l.completed_at
FROM legacy l
JOIN made_def d ON d.created_at = l.started_at;

-- Post-apply validation (run by scripts/test-parent-redesign-foundation.mjs):
--   SELECT count(*) FROM map_test_sessions WHERE kind='custom';
--   SELECT count(*) FROM map_test_assignments ta
--     JOIN map_test_definitions td ON td.id=ta.definition_id
--     WHERE td.owner_user_id IS NULL AND td.name LIKE 'Backfilled · %';
--   -> counts must match.
