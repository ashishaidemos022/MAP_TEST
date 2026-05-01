-- =========================================================================
-- Migration: map_multi_tenant
-- Project:   klhzfwxpztaojekwgzcg
-- Brief:     MULTI_USER_BRIEF.md sections 4 & 5 (+ §7.5 add for diagnostics)
--
-- Adds family-account multi-tenancy:
--   * map_families table (1 row per parent account, FK to auth.users)
--   * map_students gains family_id, avatar_emoji, created_at
--   * PIN management via pgcrypto bcrypt, exposed as RPCs
--   * RLS on every per-family table (sessions, attempts, signals)
--   * RLS on map_pick_diagnostics via session→student→family chain
--   * Read-all-authenticated RLS on shared question-bank tables
--
-- Properties:
--   * Idempotent. Safe to re-run end-to-end.
--   * Single transaction. A partial apply is impossible.
--   * Does NOT touch map_parent_settings — that table is removed in a
--     separate cleanup migration after end-to-end PIN verification.
--     (Anon can read its legacy bcrypt PIN hash until then; accepted risk
--      since the PIN UI no longer reads it and bcrypt resists reversal.)
--   * Does NOT flip map_students.family_id to NOT NULL — that happens in
--     a follow-up migration after the first parent signs up and any
--     pre-existing student rows are reassigned to a family.
--   * No CREATE INDEX on map_pick_diagnostics(session_id) — covered by the
--     existing composite idx_map_pick_diag_session(session_id, question_index).
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 0. Extensions
--    pgcrypto lives in the `extensions` schema per Supabase convention.
--    All references below are fully qualified so SECURITY DEFINER functions
--    can run with search_path = '' for hardening.
-- -------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- -------------------------------------------------------------------------
-- 1. map_families
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.map_families (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   uuid NOT NULL UNIQUE
                       REFERENCES auth.users(id) ON DELETE CASCADE,
  family_name     text NOT NULL DEFAULT 'My family',
  parent_pin_hash text,                          -- bcrypt; NULL until first set
  pin_set_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_map_families_owner
  ON public.map_families(owner_user_id);

COMMENT ON TABLE  public.map_families IS
  'One row per parent auth.users record. Owns 1..N map_students.';
COMMENT ON COLUMN public.map_families.parent_pin_hash IS
  'bcrypt hash of the 4-8 digit parent PIN. NULL until map_set_parent_pin() is called.';

-- -------------------------------------------------------------------------
-- 2. map_students additions
--    family_id is intentionally NULLABLE here. A follow-up migration flips
--    it to NOT NULL once any pre-existing rows have been reassigned.
-- -------------------------------------------------------------------------
ALTER TABLE public.map_students
  ADD COLUMN IF NOT EXISTS family_id    uuid
                                        REFERENCES public.map_families(id)
                                        ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS avatar_emoji text NOT NULL DEFAULT '🦊',
  ADD COLUMN IF NOT EXISTS created_at   timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_map_students_family
  ON public.map_students(family_id);

-- -------------------------------------------------------------------------
-- 3. Helper functions used by RLS policies
--
-- Both are SECURITY DEFINER + STABLE + search_path=''. Fully qualified
-- references everywhere. auth.uid() returns the *caller's* uid even under
-- SECURITY DEFINER (that flag changes role, not auth context).
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.map_current_family_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id
    FROM public.map_families
   WHERE owner_user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.map_student_in_my_family(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.map_students s
      JOIN public.map_families f ON f.id = s.family_id
     WHERE s.id = p_student_id
       AND f.owner_user_id = auth.uid()
  )
$$;

GRANT EXECUTE ON FUNCTION public.map_current_family_id()              TO authenticated;
GRANT EXECUTE ON FUNCTION public.map_student_in_my_family(uuid)       TO authenticated;

-- -------------------------------------------------------------------------
-- 4. PIN management RPCs (bcrypt via pgcrypto)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.map_set_parent_pin(p_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_family uuid;
BEGIN
  IF p_pin !~ '^\d{4,8}$' THEN
    RAISE EXCEPTION 'PIN must be 4-8 digits';
  END IF;

  SELECT id
    INTO v_family
    FROM public.map_families
   WHERE owner_user_id = auth.uid();

  IF v_family IS NULL THEN
    RAISE EXCEPTION 'No family found for current user';
  END IF;

  UPDATE public.map_families
     SET parent_pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')),
         pin_set_at      = now(),
         updated_at      = now()
   WHERE id = v_family;
END
$$;

CREATE OR REPLACE FUNCTION public.map_verify_parent_pin(p_pin text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hash text;
BEGIN
  SELECT parent_pin_hash
    INTO v_hash
    FROM public.map_families
   WHERE owner_user_id = auth.uid();

  IF v_hash IS NULL THEN
    RETURN false;
  END IF;

  RETURN extensions.crypt(p_pin, v_hash) = v_hash;
END
$$;

GRANT EXECUTE ON FUNCTION public.map_set_parent_pin(text)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.map_verify_parent_pin(text) TO authenticated;

-- -------------------------------------------------------------------------
-- 5. RLS — map_families
-- -------------------------------------------------------------------------
ALTER TABLE public.map_families ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS families_select_own ON public.map_families;
CREATE POLICY families_select_own ON public.map_families
  FOR SELECT
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS families_insert_own ON public.map_families;
CREATE POLICY families_insert_own ON public.map_families
  FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS families_update_own ON public.map_families;
CREATE POLICY families_update_own ON public.map_families
  FOR UPDATE
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- No DELETE policy: families are deleted via auth.users cascade only.

-- -------------------------------------------------------------------------
-- 6. RLS — map_students
-- -------------------------------------------------------------------------
ALTER TABLE public.map_students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS students_select_own ON public.map_students;
CREATE POLICY students_select_own ON public.map_students
  FOR SELECT
  USING (family_id = public.map_current_family_id());

DROP POLICY IF EXISTS students_insert_own ON public.map_students;
CREATE POLICY students_insert_own ON public.map_students
  FOR INSERT
  WITH CHECK (family_id = public.map_current_family_id());

DROP POLICY IF EXISTS students_update_own ON public.map_students;
CREATE POLICY students_update_own ON public.map_students
  FOR UPDATE
  USING (family_id = public.map_current_family_id())
  WITH CHECK (family_id = public.map_current_family_id());

DROP POLICY IF EXISTS students_delete_own ON public.map_students;
CREATE POLICY students_delete_own ON public.map_students
  FOR DELETE
  USING (family_id = public.map_current_family_id());

-- -------------------------------------------------------------------------
-- 7. RLS — per-student data tables
-- -------------------------------------------------------------------------
ALTER TABLE public.map_test_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sessions_all_own ON public.map_test_sessions;
CREATE POLICY sessions_all_own ON public.map_test_sessions
  FOR ALL
  USING      (public.map_student_in_my_family(student_id))
  WITH CHECK (public.map_student_in_my_family(student_id));

ALTER TABLE public.map_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attempts_all_own ON public.map_attempts;
CREATE POLICY attempts_all_own ON public.map_attempts
  FOR ALL
  USING      (public.map_student_in_my_family(student_id))
  WITH CHECK (public.map_student_in_my_family(student_id));

ALTER TABLE public.map_misconception_signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS signals_all_own ON public.map_misconception_signals;
CREATE POLICY signals_all_own ON public.map_misconception_signals
  FOR ALL
  USING      (public.map_student_in_my_family(student_id))
  WITH CHECK (public.map_student_in_my_family(student_id));

-- -------------------------------------------------------------------------
-- 7.5 RLS — session-scoped diagnostics
--     map_pick_diagnostics has session_id (no student_id) and was added by
--     the adaptive-picker work after MULTI_USER_BRIEF.md §5.3 was drafted.
--     Without RLS, family A could read family B's pick traces. Gating
--     joins through the session to the student, then to the family helper.
--     The existing composite index idx_map_pick_diag_session
--     (session_id, question_index) covers the EXISTS lookup; no new index
--     needed.
-- -------------------------------------------------------------------------
ALTER TABLE public.map_pick_diagnostics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pick_diag_all_own ON public.map_pick_diagnostics;
CREATE POLICY pick_diag_all_own ON public.map_pick_diagnostics
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
        FROM public.map_test_sessions s
       WHERE s.id = map_pick_diagnostics.session_id
         AND public.map_student_in_my_family(s.student_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.map_test_sessions s
       WHERE s.id = map_pick_diagnostics.session_id
         AND public.map_student_in_my_family(s.student_id)
    )
  );

-- -------------------------------------------------------------------------
-- 8. RLS — shared question bank
--    Read-all-authenticated. No write policies => only service_role writes.
-- -------------------------------------------------------------------------
ALTER TABLE public.map_standards          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_reading_passages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_questions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_question_choices   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_misconception_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS standards_read ON public.map_standards;
CREATE POLICY standards_read
  ON public.map_standards
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS passages_read ON public.map_reading_passages;
CREATE POLICY passages_read
  ON public.map_reading_passages
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS questions_read ON public.map_questions;
CREATE POLICY questions_read
  ON public.map_questions
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS choices_read ON public.map_question_choices;
CREATE POLICY choices_read
  ON public.map_question_choices
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS misc_tags_read ON public.map_misconception_tags;
CREATE POLICY misc_tags_read
  ON public.map_misconception_tags
  FOR SELECT TO authenticated
  USING (true);

COMMIT;

-- =========================================================================
-- Post-migration validation queries (run separately, NOT inside the txn)
-- =========================================================================

-- 1. Tables and columns
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'map_families'
--  ORDER BY ordinal_position;
--
-- SELECT column_name, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name = 'map_students'
--    AND column_name IN ('family_id','avatar_emoji','created_at');
--   -- expect family_id nullable=YES; the others nullable=NO with defaults

-- 2. RLS is on for every map_* table (excluding map_parent_settings — by design)
-- SELECT tablename, rowsecurity
--   FROM pg_tables
--  WHERE schemaname = 'public' AND tablename LIKE 'map\_%' ESCAPE '\'
--  ORDER BY tablename;
--   -- every row should show rowsecurity = true EXCEPT map_parent_settings

-- 3. SECURITY DEFINER on the four helper/RPC functions
-- SELECT proname, prosecdef, pg_get_function_identity_arguments(oid) AS args
--   FROM pg_proc
--  WHERE pronamespace = 'public'::regnamespace
--    AND proname IN (
--      'map_current_family_id',
--      'map_student_in_my_family',
--      'map_set_parent_pin',
--      'map_verify_parent_pin'
--    );
--   -- all four should have prosecdef = true

-- 4. Empty-state sanity
-- SELECT count(*) FROM public.map_families;   -- expect 0 immediately

-- 5. RLS smoke test (manual — see MULTI_USER_BRIEF.md §5.5)
--    Sign up two test parents in two browsers, add one student each,
--    then from each session run:  SELECT count(*) FROM public.map_students;
--    Each must return 1. Anything else means stop and fix RLS.
