-- =========================================================================
-- Migration: map_assignment_dismiss  (Assignment Management — Dismiss)
-- Project:   klhzfwxpztaojekwgzcg
-- Spec:      docs/superpowers/specs/2026-05-19-assignment-management-design.md
--
-- Adds map_bank_assignments.dismissed_at + map_dismiss_bank_assignment RPC
-- (terminal-only, family-scoped) and re-creates map_v_bank_assignment_overview
-- with a dismissed_at IS NULL filter (columns unchanged). Idempotent, single
-- transaction.
-- =========================================================================

BEGIN;

ALTER TABLE public.map_bank_assignments
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;

DROP VIEW IF EXISTS public.map_v_bank_assignment_overview;
CREATE VIEW public.map_v_bank_assignment_overview
WITH (security_invoker = true) AS
SELECT
  a.id                AS assignment_id,
  a.family_id         AS family_id,
  a.bank_id           AS bank_id,
  b.name              AS bank_name,
  b.lane              AS lane,
  b.subject           AS subject,
  b.grade             AS grade,
  a.student_id        AS student_id,
  s.display_name      AS student_name,
  a.status            AS status,
  a.due_by            AS due_by,
  a.parent_note       AS parent_note,
  a.assigned_at       AS assigned_at,
  a.completed_at      AS completed_at,
  a.session_id        AS session_id,
  sess.correct_count  AS questions_correct,
  sess.planned_length AS questions_total
FROM public.map_bank_assignments a
JOIN public.map_question_banks   b    ON b.id = a.bank_id
JOIN public.map_students         s    ON s.id = a.student_id
LEFT JOIN public.map_test_sessions sess ON sess.id = a.session_id
WHERE a.dismissed_at IS NULL;

CREATE OR REPLACE FUNCTION public.map_dismiss_bank_assignment(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family uuid := public.map_current_family_id();
BEGIN
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'no family for current user';
  END IF;
  UPDATE public.map_bank_assignments
     SET dismissed_at = now()
   WHERE id = p_assignment_id
     AND family_id = v_family
     AND dismissed_at IS NULL
     AND status IN ('completed','revoked');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assignment not found, not yours, already dismissed, or not in a dismissable (completed/revoked) state';
  END IF;
END
$$;

COMMIT;
