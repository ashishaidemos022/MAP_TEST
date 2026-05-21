-- =========================================================================
-- Migration: map_bank_first_authoring  (Bank-First AI Authoring)
-- Project:   klhzfwxpztaojekwgzcg
-- Spec:      docs/superpowers/specs/2026-05-20-bank-first-ai-authoring-design.md
--
-- Adds:
--   * map_question_bank_items.custom_passage_id (XOR with custom_question_id)
--   * RPC map_create_or_find_custom_bank(name, subject, grade)
--   * RPC map_add_items_to_bank(bank_id, question_ids, passage_ids)
--   * RPC map_rename_bank(bank_id, name)
--   * View map_v_custom_bank_overview (security_invoker)
--   * View map_v_custom_legacy_items   (security_invoker)
--
-- Properties: idempotent, single transaction, no enum changes, no data
-- migration. RLS inherits from existing tables.
-- =========================================================================

BEGIN;

-- 1. Extend map_question_bank_items to also hold passages.
ALTER TABLE public.map_question_bank_items
  ADD COLUMN IF NOT EXISTS custom_passage_id uuid
    REFERENCES public.map_custom_passages(id) ON DELETE CASCADE;

ALTER TABLE public.map_question_bank_items
  ALTER COLUMN custom_question_id DROP NOT NULL;

-- One-of constraint (drop-then-add so re-run is safe).
ALTER TABLE public.map_question_bank_items
  DROP CONSTRAINT IF EXISTS map_qbi_xor_kind;
ALTER TABLE public.map_question_bank_items
  ADD CONSTRAINT map_qbi_xor_kind CHECK (
    (custom_question_id IS NOT NULL AND custom_passage_id IS NULL)
    OR
    (custom_question_id IS NULL AND custom_passage_id IS NOT NULL)
  );

-- Passage-uniqueness within a bank.
DROP INDEX IF EXISTS public.map_qbi_passage_unique;
CREATE UNIQUE INDEX map_qbi_passage_unique
  ON public.map_question_bank_items(bank_id, custom_passage_id)
  WHERE custom_passage_id IS NOT NULL;

-- 2. RPC: create-or-find a custom bank by (name, subject, grade).
CREATE OR REPLACE FUNCTION public.map_create_or_find_custom_bank(
  p_name    text,
  p_subject text,
  p_grade   int
) RETURNS TABLE(bank_id uuid, resolved_name text, was_created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family uuid := public.map_current_family_id();
  v_id     uuid;
  v_name   text := p_name;
  v_n      int  := 2;
BEGIN
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'no family for current user';
  END IF;
  IF p_name IS NULL OR char_length(p_name) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'name must be 1..120 chars';
  END IF;
  IF p_subject NOT IN ('math','reading','language') THEN
    RAISE EXCEPTION 'unknown subject: %', p_subject;
  END IF;
  IF p_grade NOT BETWEEN 0 AND 12 THEN
    RAISE EXCEPTION 'grade out of range';
  END IF;

  -- Reuse path: same family, lane=custom, same subject+grade+name, not soft-deleted.
  SELECT id INTO v_id
    FROM public.map_question_banks
   WHERE family_id = v_family
     AND lane = 'custom'
     AND soft_deleted_at IS NULL
     AND name = p_name
     AND subject = p_subject
     AND grade = p_grade
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, p_name, false;
    RETURN;
  END IF;

  -- Suffix path: same family + name but different subject/grade. Find smallest (N).
  WHILE EXISTS (
    SELECT 1 FROM public.map_question_banks
     WHERE family_id = v_family
       AND lane = 'custom'
       AND soft_deleted_at IS NULL
       AND name = v_name
  ) LOOP
    v_name := p_name || ' (' || v_n || ')';
    v_n := v_n + 1;
  END LOOP;

  INSERT INTO public.map_question_banks
    (family_id, owner_user_id, name, subject, grade, lane,
     standard_codes, planned_length, difficulty)
  VALUES
    (v_family, auth.uid(), v_name, p_subject, p_grade, 'custom',
     '{}', NULL, NULL)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_name, true;
END
$$;

-- 3. RPC: append items to a bank (idempotent on the unique indexes).
CREATE OR REPLACE FUNCTION public.map_add_items_to_bank(
  p_bank_id      uuid,
  p_question_ids uuid[],
  p_passage_ids  uuid[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family    uuid := public.map_current_family_id();
  v_lane      text;
  v_subject   text;
  v_grade     int;
  v_existing  int;
  v_to_add_q  int := COALESCE(array_length(p_question_ids, 1), 0);
  v_to_add_p  int := COALESCE(array_length(p_passage_ids,  1), 0);
  v_next_sort int;
BEGIN
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'no family for current user';
  END IF;

  SELECT lane, subject, grade INTO v_lane, v_subject, v_grade
    FROM public.map_question_banks
   WHERE id = p_bank_id
     AND family_id = v_family
     AND soft_deleted_at IS NULL;
  IF v_lane IS NULL THEN
    RAISE EXCEPTION 'bank not found or not yours';
  END IF;
  IF v_lane <> 'custom' THEN
    RAISE EXCEPTION 'only custom banks accept items';
  END IF;

  -- Family ownership + subject/grade match for every id.
  -- subject/grade live on the current version row, not on the header table.
  IF v_to_add_q > 0 THEN
    IF (SELECT count(*)
          FROM public.map_custom_questions q
          JOIN public.map_custom_question_versions v ON v.id = q.current_version_id
         WHERE q.id = ANY(p_question_ids)
           AND q.family_id = v_family
           AND q.soft_deleted_at IS NULL
           AND v.subject = v_subject
           AND v.grade = v_grade) <> v_to_add_q THEN
      RAISE EXCEPTION 'one or more questions are not yours, are deleted, or do not match the bank subject/grade';
    END IF;
  END IF;
  IF v_to_add_p > 0 THEN
    IF (SELECT count(*)
          FROM public.map_custom_passages p
          JOIN public.map_custom_passage_versions v ON v.id = p.current_version_id
         WHERE p.id = ANY(p_passage_ids)
           AND p.family_id = v_family
           AND p.soft_deleted_at IS NULL
           AND v.subject = v_subject
           AND v.grade = v_grade) <> v_to_add_p THEN
      RAISE EXCEPTION 'one or more passages are not yours, are deleted, or do not match the bank subject/grade';
    END IF;
  END IF;

  SELECT count(*) INTO v_existing
    FROM public.map_question_bank_items
   WHERE bank_id = p_bank_id;

  IF v_existing + v_to_add_q + v_to_add_p > 60 THEN
    RAISE EXCEPTION 'a bank can hold at most 60 items (current %, adding %)',
      v_existing, v_to_add_q + v_to_add_p;
  END IF;

  SELECT COALESCE(MAX(sort_order), -1) + 1 INTO v_next_sort
    FROM public.map_question_bank_items
   WHERE bank_id = p_bank_id;

  IF v_to_add_q > 0 THEN
    INSERT INTO public.map_question_bank_items
      (bank_id, custom_question_id, sort_order)
    SELECT p_bank_id, qid, v_next_sort + (ord - 1)
      FROM unnest(p_question_ids) WITH ORDINALITY AS t(qid, ord)
    ON CONFLICT (bank_id, custom_question_id) DO NOTHING;
    v_next_sort := v_next_sort + v_to_add_q;
  END IF;

  IF v_to_add_p > 0 THEN
    INSERT INTO public.map_question_bank_items
      (bank_id, custom_passage_id, sort_order)
    SELECT p_bank_id, pid, v_next_sort + (ord - 1)
      FROM unnest(p_passage_ids) WITH ORDINALITY AS t(pid, ord)
    ON CONFLICT (bank_id, custom_passage_id) DO NOTHING;
  END IF;
END
$$;

-- 4. RPC: rename a bank (family-scoped, collision-checked).
CREATE OR REPLACE FUNCTION public.map_rename_bank(
  p_bank_id uuid,
  p_name    text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family  uuid := public.map_current_family_id();
  v_subject text;
  v_grade   int;
BEGIN
  IF p_name IS NULL OR char_length(p_name) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'name must be 1..120 chars';
  END IF;
  SELECT subject, grade INTO v_subject, v_grade
    FROM public.map_question_banks
   WHERE id = p_bank_id
     AND family_id = v_family
     AND soft_deleted_at IS NULL;
  IF v_subject IS NULL THEN
    RAISE EXCEPTION 'bank not found or not yours';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.map_question_banks
     WHERE family_id = v_family
       AND lane = 'custom'
       AND soft_deleted_at IS NULL
       AND name = p_name
       AND subject = v_subject
       AND grade = v_grade
       AND id <> p_bank_id
  ) THEN
    RAISE EXCEPTION 'another bank already uses that name for this subject and grade';
  END IF;
  UPDATE public.map_question_banks
     SET name = p_name, updated_at = now()
   WHERE id = p_bank_id AND family_id = v_family;
END
$$;

-- 5. View: per-bank overview for the AI Studio list.
DROP VIEW IF EXISTS public.map_v_custom_bank_overview;
CREATE VIEW public.map_v_custom_bank_overview
WITH (security_invoker = true) AS
SELECT
  b.id, b.family_id, b.name, b.subject, b.grade, b.created_at, b.updated_at,
  count(i.id) FILTER (WHERE cq.id IS NOT NULL)         AS question_count,
  count(i.id) FILTER (WHERE cp.id IS NOT NULL)         AS passage_count,
  count(*)    FILTER (WHERE cq.status = 'draft')       AS draft_question_count,
  count(*)    FILTER (WHERE cq.status = 'published')   AS ready_question_count
FROM public.map_question_banks b
LEFT JOIN public.map_question_bank_items i
       ON i.bank_id = b.id
LEFT JOIN public.map_custom_questions cq
       ON cq.id = i.custom_question_id AND cq.soft_deleted_at IS NULL
LEFT JOIN public.map_custom_passages  cp
       ON cp.id = i.custom_passage_id  AND cp.soft_deleted_at IS NULL
WHERE b.lane = 'custom' AND b.soft_deleted_at IS NULL
GROUP BY b.id;

-- 6. View: orphaned custom items (Legacy link source).
-- subject/grade come from the current version row; items with no current_version_id
-- are excluded (they were never properly authored and aren't usable).
DROP VIEW IF EXISTS public.map_v_custom_legacy_items;
CREATE VIEW public.map_v_custom_legacy_items
WITH (security_invoker = true) AS
SELECT 'question'::text AS kind, q.id, q.family_id,
       qv.subject, qv.grade,
       q.status, q.created_at
FROM public.map_custom_questions q
JOIN public.map_custom_question_versions qv ON qv.id = q.current_version_id
WHERE q.soft_deleted_at IS NULL
  AND q.id NOT IN (SELECT custom_question_id
                     FROM public.map_question_bank_items
                    WHERE custom_question_id IS NOT NULL)
UNION ALL
SELECT 'passage'::text AS kind, p.id, p.family_id,
       pv.subject, pv.grade,
       p.status, p.created_at
FROM public.map_custom_passages p
JOIN public.map_custom_passage_versions pv ON pv.id = p.current_version_id
WHERE p.soft_deleted_at IS NULL
  AND p.id NOT IN (SELECT custom_passage_id
                     FROM public.map_question_bank_items
                    WHERE custom_passage_id IS NOT NULL);

COMMIT;
