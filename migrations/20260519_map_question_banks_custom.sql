-- =========================================================================
-- Migration: map_question_banks_custom  (Question Banks — Phase 2)
-- Project:   klhzfwxpztaojekwgzcg
-- Spec:      docs/superpowers/specs/2026-05-18-question-banks-and-assignment-design.md (§8 Phase 2)
--
-- Activates the custom lane:
--   * map_create_bank        — real custom branch (insert lane='custom' bank)
--   * map_set_bank_items     — replace a custom bank's item set (<=60, family
--                              -owned custom questions; draft or published)
--   * map_assign_bank        — custom branch: require >=5 READY (published,
--                              not soft-deleted) items; freeze their
--                              current_version_id into snapshot_question_ids
--   * map_v_bank_items       — bank items joined to custom-question status,
--                              for the bank-detail readiness UI
--
-- Properties: idempotent, single transaction, no schema/table changes,
--   no PG enums. RLS unchanged (inherited from Phase-1 tables).
-- =========================================================================

BEGIN;

-- Recreate map_create_bank with a real custom branch (vetted unchanged).
CREATE OR REPLACE FUNCTION public.map_create_bank(
  p_name           text,
  p_subject        text,
  p_grade          int,
  p_lane           text,
  p_standard_codes text[],
  p_planned_length int,
  p_difficulty     text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family uuid := public.map_current_family_id();
  v_id     uuid;
BEGIN
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'no family for current user';
  END IF;
  IF p_lane = 'vetted' THEN
    INSERT INTO public.map_question_banks
      (family_id, owner_user_id, name, subject, grade, lane,
       standard_codes, planned_length, difficulty)
    VALUES
      (v_family, auth.uid(), p_name, p_subject, p_grade, 'vetted',
       COALESCE(p_standard_codes, '{}'), p_planned_length,
       NULLIF(p_difficulty, 'any'))
    RETURNING id INTO v_id;
  ELSIF p_lane = 'custom' THEN
    INSERT INTO public.map_question_banks
      (family_id, owner_user_id, name, subject, grade, lane,
       standard_codes, planned_length, difficulty)
    VALUES
      (v_family, auth.uid(), p_name, p_subject, p_grade, 'custom',
       '{}', NULL, NULL)
    RETURNING id INTO v_id;
  ELSE
    RAISE EXCEPTION 'unknown lane: %', p_lane;
  END IF;
  RETURN v_id;
END
$$;

-- Replace a custom bank's full item set. Family-owned, not soft-deleted
-- custom questions only; draft items are allowed (they just don't count as
-- "ready"). Hard cap 60. Replaces (not appends).
CREATE OR REPLACE FUNCTION public.map_set_bank_items(
  p_bank_id            uuid,
  p_custom_question_ids uuid[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family uuid := public.map_current_family_id();
  v_lane   text;
  v_n      int;
  v_owned  int;
BEGIN
  SELECT lane INTO v_lane
    FROM public.map_question_banks
   WHERE id = p_bank_id AND family_id = v_family AND soft_deleted_at IS NULL;
  IF v_lane IS NULL THEN
    RAISE EXCEPTION 'bank not found or not yours';
  END IF;
  IF v_lane <> 'custom' THEN
    RAISE EXCEPTION 'only custom banks have items';
  END IF;
  v_n := COALESCE(array_length(p_custom_question_ids, 1), 0);
  IF v_n > 60 THEN
    RAISE EXCEPTION 'a bank can hold at most 60 questions (got %)', v_n;
  END IF;
  IF v_n > 0 THEN
    SELECT count(*) INTO v_owned
      FROM public.map_custom_questions
     WHERE id = ANY(p_custom_question_ids)
       AND family_id = v_family
       AND soft_deleted_at IS NULL;
    IF v_owned <> v_n THEN
      RAISE EXCEPTION 'one or more questions are not yours or are deleted';
    END IF;
  END IF;
  DELETE FROM public.map_question_bank_items WHERE bank_id = p_bank_id;
  IF v_n > 0 THEN
    INSERT INTO public.map_question_bank_items (bank_id, custom_question_id, sort_order)
    SELECT p_bank_id, qid, ord - 1
    FROM unnest(p_custom_question_ids) WITH ORDINALITY AS t(qid, ord);
  END IF;
END
$$;

-- Recreate map_assign_bank with a real custom branch (vetted unchanged).
CREATE OR REPLACE FUNCTION public.map_assign_bank(
  p_bank_id     uuid,
  p_student_ids uuid[],
  p_due_by      timestamptz,
  p_parent_note text
) RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family   uuid := public.map_current_family_id();
  v_lane     text;
  v_sid      uuid;
  v_ids      uuid[] := '{}';
  v_new      uuid;
  v_snapshot uuid[];
BEGIN
  SELECT lane INTO v_lane
    FROM public.map_question_banks
   WHERE id = p_bank_id AND family_id = v_family AND soft_deleted_at IS NULL;
  IF v_lane IS NULL THEN
    RAISE EXCEPTION 'bank not found or not yours';
  END IF;
  IF p_student_ids IS NULL OR array_length(p_student_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no students given';
  END IF;

  IF v_lane = 'custom' THEN
    SELECT array_agg(cq.current_version_id ORDER BY i.sort_order)
      INTO v_snapshot
      FROM public.map_question_bank_items i
      JOIN public.map_custom_questions cq ON cq.id = i.custom_question_id
     WHERE i.bank_id = p_bank_id
       AND cq.family_id = v_family
       AND cq.status = 'published'
       AND cq.soft_deleted_at IS NULL
       AND cq.current_version_id IS NOT NULL;
    IF v_snapshot IS NULL OR array_length(v_snapshot, 1) < 5 THEN
      RAISE EXCEPTION 'bank needs at least 5 ready (published) questions to assign (has %)',
        COALESCE(array_length(v_snapshot, 1), 0);
    END IF;
  END IF;

  FOREACH v_sid IN ARRAY p_student_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.map_students WHERE id = v_sid AND family_id = v_family
    ) THEN
      RAISE EXCEPTION 'student % is not in your family', v_sid;
    END IF;
    INSERT INTO public.map_bank_assignments
      (family_id, bank_id, student_id, assigned_by_user_id,
       due_by, parent_note, status, snapshot_question_ids)
    VALUES
      (v_family, p_bank_id, v_sid, auth.uid(),
       p_due_by, p_parent_note, 'assigned',
       CASE WHEN v_lane = 'custom' THEN v_snapshot ELSE NULL END)
    RETURNING id INTO v_new;
    v_ids := array_append(v_ids, v_new);
  END LOOP;
  RETURN v_ids;
END
$$;

-- Bank items joined to their custom-question readiness, for the detail UI.
DROP VIEW IF EXISTS public.map_v_bank_items;
CREATE VIEW public.map_v_bank_items
WITH (security_invoker = true) AS
SELECT
  i.id                 AS item_id,
  i.bank_id            AS bank_id,
  i.sort_order         AS sort_order,
  cq.id                AS custom_question_id,
  cq.status            AS question_status,
  cq.source            AS question_source,
  cq.soft_deleted_at   AS soft_deleted_at,
  qv.stem              AS stem,
  (cq.status = 'published' AND cq.soft_deleted_at IS NULL) AS is_ready
FROM public.map_question_bank_items i
JOIN public.map_custom_questions cq ON cq.id = i.custom_question_id
LEFT JOIN public.map_custom_question_versions qv ON qv.id = cq.current_version_id;

COMMIT;
