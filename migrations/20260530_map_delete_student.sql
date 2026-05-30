-- =========================================================================
-- Migration: map_delete_student  (Delete a Student)
-- Project:   klhzfwxpztaojekwgzcg
-- Spec:      docs/superpowers/specs/2026-05-30-delete-student-design.md
--
-- Adds map_delete_student(p_student_id): family-scoped HARD delete of a
-- student and all their per-student data. Deletes in a controlled order to
-- avoid the session->assignment trap: deleting a map_test_sessions row fires
-- map_bank_assignments.session_id ON DELETE SET NULL, which violates the
-- map_ba_status_coherent CHECK (23514) on an in_progress assignment. So we
-- delete assignments BEFORE sessions. Idempotent (CREATE OR REPLACE), single
-- transaction. Models 20260520_map_delete_bank.sql.
--
-- Blast radius (confirmed against migrations):
--   map_test_sessions         student_id CASCADE  -> deleted (cascades attempts, pick_diagnostics)
--   map_misconception_signals student_id CASCADE  -> deleted
--   map_bank_assignments      student_id CASCADE  -> deleted (explicitly, first)
--   map_question_reports      student_id SET NULL -> survives, anonymized
-- =========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.map_delete_student(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family uuid := public.map_current_family_id();
BEGIN
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'no family for current user';
  END IF;

  -- Ownership check (also the not-found guard).
  IF NOT EXISTS (
    SELECT 1 FROM public.map_students
     WHERE id = p_student_id AND family_id = v_family
  ) THEN
    RAISE EXCEPTION 'student not found or not yours';
  END IF;

  -- Controlled order: assignments first (else the session delete below trips
  -- map_bank_assignments.session_id SET NULL -> map_ba_status_coherent 23514).
  DELETE FROM public.map_bank_assignments WHERE student_id = p_student_id;
  DELETE FROM public.map_test_sessions    WHERE student_id = p_student_id; -- cascades attempts + pick_diagnostics
  DELETE FROM public.map_students         WHERE id = p_student_id;          -- cascades signals; reports -> SET NULL
END
$$;

GRANT EXECUTE ON FUNCTION public.map_delete_student(uuid) TO authenticated;

COMMIT;
