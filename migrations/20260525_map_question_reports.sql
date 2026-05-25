-- =========================================================================
-- Migration: map_question_reports  (Question Reporting — "Report a problem")
-- Project:   klhzfwxpztaojekwgzcg
-- Spec:      docs/superpowers/specs/2026-05-25-question-reporting-design.md
--
-- End users report a broken VETTED question (map_questions) with a category
-- + free-text reason. Reports are family-scoped; writes flow through the
-- SECURITY DEFINER RPC map_report_question (stamps family_id, validates the
-- question is vetted). Operator analyzes via SQL (service role bypasses RLS).
-- Idempotent, single transaction.
-- =========================================================================

BEGIN;

-- 1. Enums (Postgres has no CREATE TYPE IF NOT EXISTS; guard on duplicate_object)
DO $$ BEGIN
  CREATE TYPE public.map_report_reason AS ENUM (
    'confusing_wording',
    'wrong_answer',
    'typo_or_error',
    'image_problem',
    'off_topic_or_hard',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.map_report_status AS ENUM (
    'new',
    'triaged',
    'resolved',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Table
CREATE TABLE IF NOT EXISTS public.map_question_reports (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id        uuid NOT NULL REFERENCES public.map_questions(id)        ON DELETE CASCADE,
  family_id          uuid NOT NULL REFERENCES public.map_families(id)         ON DELETE CASCADE,
  student_id         uuid REFERENCES public.map_students(id)                  ON DELETE SET NULL,
  session_id         uuid REFERENCES public.map_test_sessions(id)             ON DELETE SET NULL,
  selected_choice_id uuid REFERENCES public.map_question_choices(id)          ON DELETE SET NULL,
  reason             public.map_report_reason  NOT NULL,
  reason_text        text,
  status             public.map_report_status  NOT NULL DEFAULT 'new',
  created_at         timestamptz               NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS map_question_reports_question_idx ON public.map_question_reports (question_id);
CREATE INDEX IF NOT EXISTS map_question_reports_status_idx   ON public.map_question_reports (status);
CREATE INDEX IF NOT EXISTS map_question_reports_created_idx  ON public.map_question_reports (created_at DESC);

-- 3. RLS: family owns its own reports (SELECT only); all writes via the RPC.
ALTER TABLE public.map_question_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qr_select_own ON public.map_question_reports;
CREATE POLICY qr_select_own ON public.map_question_reports
  FOR SELECT USING (family_id = public.map_current_family_id());

-- 4. RPC: insert one report, stamping family_id server-side.
CREATE OR REPLACE FUNCTION public.map_report_question(
  p_question_id        uuid,
  p_reason             public.map_report_reason,
  p_reason_text        text DEFAULT NULL,
  p_session_id         uuid DEFAULT NULL,
  p_student_id         uuid DEFAULT NULL,
  p_selected_choice_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family uuid := public.map_current_family_id();
  v_text   text := nullif(btrim(left(coalesce(p_reason_text, ''), 1000)), '');
  v_id     uuid;
BEGIN
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'no family for current user';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE id = p_question_id) THEN
    RAISE EXCEPTION 'question not found in vetted bank';
  END IF;

  INSERT INTO public.map_question_reports
    (question_id, family_id, student_id, session_id, selected_choice_id, reason, reason_text)
  VALUES
    (p_question_id, v_family, p_student_id, p_session_id, p_selected_choice_id, p_reason, v_text)
  RETURNING id INTO v_id;

  RETURN v_id;
END
$$;

GRANT EXECUTE ON FUNCTION public.map_report_question(
  uuid, public.map_report_reason, text, uuid, uuid, uuid
) TO authenticated;

COMMIT;
