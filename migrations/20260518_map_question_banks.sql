-- =========================================================================
-- Migration: map_question_banks  (Question Banks — Phase 1)
-- Project:   klhzfwxpztaojekwgzcg
-- Spec:      docs/superpowers/specs/2026-05-18-question-banks-and-assignment-design.md (§8 Phase 1)
--
-- Adds the assignable "Bank" substrate + vetted lane:
--   * map_question_banks       (the assignable unit: vetted recipe OR custom set)
--   * map_question_bank_items  (custom lane's curated questions; Phase-2 use)
--   * map_bank_assignments     (bank x kid, status-tracked, frozen snapshot col)
--   * map_v_bank_assignment_overview (security_invoker read view)
--   * RPCs: map_create_bank / map_assign_bank / map_revoke_bank_assignment /
--           map_start_bank_assignment  (vetted fully; custom raises Phase-2)
--   * AFTER UPDATE trigger on map_test_sessions → flips linked assignment
--     to 'completed' when its session completes (no client change)
--
-- Properties:
--   * Idempotent. Safe to re-run end-to-end. Single transaction.
--   * No PG enums (repo convention: text + CHECK).
--   * RLS on every new table via family_id = public.map_current_family_id().
--   * Custom-lane columns exist now; custom RPC paths raise a clear Phase-2
--     error so the schema is stable and Phase 2 adds no schema churn.
-- =========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.map_question_banks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       uuid NOT NULL REFERENCES public.map_families(id) ON DELETE CASCADE,
  owner_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name            text NOT NULL,
  subject         text NOT NULL,
  grade           int  NOT NULL,
  lane            text NOT NULL,
  standard_codes  text[] NOT NULL DEFAULT '{}',
  planned_length  int,
  difficulty      text,
  soft_deleted_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_qb_name_len   CHECK (char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT map_qb_subject    CHECK (subject IN ('math','reading','language')),
  CONSTRAINT map_qb_grade      CHECK (grade BETWEEN 0 AND 12),
  CONSTRAINT map_qb_lane       CHECK (lane IN ('vetted','custom')),
  CONSTRAINT map_qb_difficulty CHECK (difficulty IS NULL OR difficulty IN ('easy','medium','hard','any')),
  CONSTRAINT map_qb_length_rng CHECK (planned_length IS NULL OR planned_length BETWEEN 5 AND 60),
  CONSTRAINT map_qb_lane_coherent CHECK (
    (lane = 'vetted' AND planned_length IS NOT NULL)
    OR
    (lane = 'custom' AND standard_codes = '{}' AND planned_length IS NULL AND difficulty IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.map_question_bank_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id            uuid NOT NULL REFERENCES public.map_question_banks(id) ON DELETE CASCADE,
  custom_question_id uuid NOT NULL REFERENCES public.map_custom_questions(id) ON DELETE CASCADE,
  sort_order         int  NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_qbi_unique UNIQUE (bank_id, custom_question_id)
);

CREATE TABLE IF NOT EXISTS public.map_bank_assignments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id             uuid NOT NULL REFERENCES public.map_families(id) ON DELETE CASCADE,
  bank_id               uuid NOT NULL REFERENCES public.map_question_banks(id) ON DELETE CASCADE,
  student_id            uuid NOT NULL REFERENCES public.map_students(id) ON DELETE CASCADE,
  assigned_by_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at           timestamptz NOT NULL DEFAULT now(),
  due_by                timestamptz,
  parent_note           text,
  status                text NOT NULL DEFAULT 'assigned',
  session_id            uuid REFERENCES public.map_test_sessions(id) ON DELETE SET NULL,
  snapshot_question_ids uuid[],
  started_at            timestamptz,
  completed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_ba_status CHECK (status IN ('assigned','in_progress','completed','revoked')),
  CONSTRAINT map_ba_status_coherent CHECK (
    (status = 'assigned'    AND session_id IS NULL     AND started_at IS NULL     AND completed_at IS NULL)
    OR (status = 'in_progress' AND session_id IS NOT NULL AND started_at IS NOT NULL AND completed_at IS NULL)
    OR (status = 'completed'   AND session_id IS NOT NULL AND started_at IS NOT NULL AND completed_at IS NOT NULL)
    OR (status = 'revoked'     AND session_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_map_qb_family       ON public.map_question_banks(family_id) WHERE soft_deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_map_qbi_bank        ON public.map_question_bank_items(bank_id);
CREATE INDEX IF NOT EXISTS idx_map_ba_family       ON public.map_bank_assignments(family_id);
CREATE INDEX IF NOT EXISTS idx_map_ba_student      ON public.map_bank_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_map_ba_session      ON public.map_bank_assignments(session_id);

ALTER TABLE public.map_question_banks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_question_bank_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_bank_assignments    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qb_select_own ON public.map_question_banks;
DROP POLICY IF EXISTS qb_insert_own ON public.map_question_banks;
DROP POLICY IF EXISTS qb_update_own ON public.map_question_banks;
DROP POLICY IF EXISTS qb_delete_own ON public.map_question_banks;
CREATE POLICY qb_select_own ON public.map_question_banks FOR SELECT USING (family_id = public.map_current_family_id());
CREATE POLICY qb_insert_own ON public.map_question_banks FOR INSERT WITH CHECK (family_id = public.map_current_family_id());
CREATE POLICY qb_update_own ON public.map_question_banks FOR UPDATE USING (family_id = public.map_current_family_id()) WITH CHECK (family_id = public.map_current_family_id());
CREATE POLICY qb_delete_own ON public.map_question_banks FOR DELETE USING (family_id = public.map_current_family_id());

DROP POLICY IF EXISTS qbi_select_own ON public.map_question_bank_items;
DROP POLICY IF EXISTS qbi_insert_own ON public.map_question_bank_items;
DROP POLICY IF EXISTS qbi_update_own ON public.map_question_bank_items;
DROP POLICY IF EXISTS qbi_delete_own ON public.map_question_bank_items;
CREATE POLICY qbi_select_own ON public.map_question_bank_items FOR SELECT USING (bank_id IN (SELECT id FROM public.map_question_banks WHERE family_id = public.map_current_family_id()));
CREATE POLICY qbi_insert_own ON public.map_question_bank_items FOR INSERT WITH CHECK (bank_id IN (SELECT id FROM public.map_question_banks WHERE family_id = public.map_current_family_id()));
CREATE POLICY qbi_update_own ON public.map_question_bank_items FOR UPDATE USING (bank_id IN (SELECT id FROM public.map_question_banks WHERE family_id = public.map_current_family_id())) WITH CHECK (bank_id IN (SELECT id FROM public.map_question_banks WHERE family_id = public.map_current_family_id()));
CREATE POLICY qbi_delete_own ON public.map_question_bank_items FOR DELETE USING (bank_id IN (SELECT id FROM public.map_question_banks WHERE family_id = public.map_current_family_id()));

DROP POLICY IF EXISTS ba_select_own ON public.map_bank_assignments;
DROP POLICY IF EXISTS ba_insert_own ON public.map_bank_assignments;
DROP POLICY IF EXISTS ba_update_own ON public.map_bank_assignments;
DROP POLICY IF EXISTS ba_delete_own ON public.map_bank_assignments;
CREATE POLICY ba_select_own ON public.map_bank_assignments FOR SELECT USING (family_id = public.map_current_family_id());
CREATE POLICY ba_insert_own ON public.map_bank_assignments FOR INSERT WITH CHECK (family_id = public.map_current_family_id());
CREATE POLICY ba_update_own ON public.map_bank_assignments FOR UPDATE USING (family_id = public.map_current_family_id()) WITH CHECK (family_id = public.map_current_family_id());
CREATE POLICY ba_delete_own ON public.map_bank_assignments FOR DELETE USING (family_id = public.map_current_family_id());

-- When a session linked to a bank assignment completes, flip the assignment.
CREATE OR REPLACE FUNCTION public.map_bank_assignment_on_session_complete()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'completed' AND COALESCE(OLD.status,'') <> 'completed' THEN
    UPDATE public.map_bank_assignments
       SET status = 'completed',
           completed_at = COALESCE(NEW.completed_at, now())
     WHERE session_id = NEW.id
       AND status = 'in_progress';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_map_bank_assignment_complete ON public.map_test_sessions;
CREATE TRIGGER trg_map_bank_assignment_complete
AFTER UPDATE OF status ON public.map_test_sessions
FOR EACH ROW
EXECUTE FUNCTION public.map_bank_assignment_on_session_complete();

-- Parent-facing read view (security_invoker → inherits caller RLS).
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
LEFT JOIN public.map_test_sessions sess ON sess.id = a.session_id;

COMMIT;
