-- =========================================================================
-- Migration: map_bank_rpcs_family_param  (Bank-First AI Authoring — fixup)
-- Project:   klhzfwxpztaojekwgzcg
-- Spec:      docs/superpowers/specs/2026-05-20-bank-first-ai-authoring-design.md
--
-- Lets the MCP server (service-role, no auth.uid()) call the bank RPCs by
-- accepting an OPTIONAL p_family_id. The parent-UI continues to call them
-- with no p_family_id and falls back to map_current_family_id() exactly as
-- before. If both are present, the values must match — a logged-in user
-- cannot use this parameter to write into a different family.
--
-- Properties: idempotent, single transaction. Only changes the three Phase-
-- 4.1 RPCs. The schema, views, and ON CONFLICT semantics are untouched.
-- =========================================================================

BEGIN;

-- Drop the old signatures so the new one replaces them cleanly. CREATE OR
-- REPLACE FUNCTION can't add a parameter on its own.
DROP FUNCTION IF EXISTS public.map_create_or_find_custom_bank(text, text, int);
DROP FUNCTION IF EXISTS public.map_add_items_to_bank(uuid, uuid[], uuid[]);
DROP FUNCTION IF EXISTS public.map_rename_bank(uuid, text);

-- ---------------------------------------------------------------------------
-- 1. map_create_or_find_custom_bank
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.map_create_or_find_custom_bank(
  p_name      text,
  p_subject   text,
  p_grade     int,
  p_family_id uuid DEFAULT NULL
) RETURNS TABLE(bank_id uuid, resolved_name text, was_created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family uuid;
  v_id     uuid;
  v_name   text := p_name;
  v_n      int  := 2;
BEGIN
  -- Resolve the working family_id with a strict cross-check.
  IF auth.uid() IS NOT NULL THEN
    v_family := public.map_current_family_id();
    IF p_family_id IS NOT NULL AND p_family_id <> v_family THEN
      RAISE EXCEPTION 'p_family_id does not match the authenticated user''s family';
    END IF;
  ELSE
    v_family := p_family_id;
  END IF;
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

-- ---------------------------------------------------------------------------
-- 2. map_add_items_to_bank
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.map_add_items_to_bank(
  p_bank_id      uuid,
  p_question_ids uuid[],
  p_passage_ids  uuid[],
  p_family_id    uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family     uuid;
  v_lane       text;
  v_subject    text;
  v_grade      int;
  v_existing   int;
  v_to_add_q   int := COALESCE(array_length(p_question_ids, 1), 0);
  v_to_add_p   int := COALESCE(array_length(p_passage_ids,  1), 0);
  v_net_new_q  int;
  v_net_new_p  int;
  v_next_sort  int;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    v_family := public.map_current_family_id();
    IF p_family_id IS NOT NULL AND p_family_id <> v_family THEN
      RAISE EXCEPTION 'p_family_id does not match the authenticated user''s family';
    END IF;
  ELSE
    v_family := p_family_id;
  END IF;
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

  -- Count net-new (not already in the bank) so idempotent re-sends don't
  -- spuriously fail at the cap.
  IF v_to_add_q > 0 THEN
    SELECT count(*) INTO v_net_new_q
      FROM unnest(p_question_ids) AS t(qid)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.map_question_bank_items
        WHERE bank_id = p_bank_id AND custom_question_id = t.qid
     );
  ELSE
    v_net_new_q := 0;
  END IF;

  IF v_to_add_p > 0 THEN
    SELECT count(*) INTO v_net_new_p
      FROM unnest(p_passage_ids) AS t(pid)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.map_question_bank_items
        WHERE bank_id = p_bank_id AND custom_passage_id = t.pid
     );
  ELSE
    v_net_new_p := 0;
  END IF;

  IF v_existing + v_net_new_q + v_net_new_p > 60 THEN
    RAISE EXCEPTION 'a bank can hold at most 60 items (current %, adding %)',
      v_existing, v_net_new_q + v_net_new_p;
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
    ON CONFLICT (bank_id, custom_passage_id) WHERE custom_passage_id IS NOT NULL DO NOTHING;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. map_rename_bank
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.map_rename_bank(
  p_bank_id   uuid,
  p_name      text,
  p_family_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family  uuid;
  v_subject text;
  v_grade   int;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    v_family := public.map_current_family_id();
    IF p_family_id IS NOT NULL AND p_family_id <> v_family THEN
      RAISE EXCEPTION 'p_family_id does not match the authenticated user''s family';
    END IF;
  ELSE
    v_family := p_family_id;
  END IF;
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'no family for current user';
  END IF;

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

COMMIT;
