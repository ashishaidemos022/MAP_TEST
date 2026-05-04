-- Custom Question Bank — Phase 4 Cycle 1 schema (Custom_Questions_Brief.md §4.1-§4.10).
-- Five new tables (passages headers + versions, questions headers + versions, choices),
-- five RPCs, RLS policies, helper view. Single transaction; idempotent re-run via
-- IF NOT EXISTS / DROP-then-CREATE for policies and triggers.
--
-- Brief→repo adaptation: this file uses identifier names from the brief unchanged.
-- The polymorphic ALTER on the attempts table lives in a separate migration
-- (20260504_map_attempts_polymorphic.sql) because the brief's `map_test_attempts`
-- is named `map_attempts` in this repo.

BEGIN;

-- =========================================================================
-- 4.1 Passages: header table
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.map_custom_passages (
  id                      uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  family_id               uuid NOT NULL REFERENCES public.map_families(id) ON DELETE CASCADE,
  owner_user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  current_version_id      uuid,
  source                  text NOT NULL,
  status                  text NOT NULL DEFAULT 'draft',
  created_via             text NOT NULL,
  community_submitted_at  timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  soft_deleted_at         timestamptz,
  CONSTRAINT map_cp_source_check
    CHECK (source IN ('parent_manual','parent_ai_assisted','parent_ai_generated')),
  CONSTRAINT map_cp_status_check
    CHECK (status IN ('draft','published','archived')),
  CONSTRAINT map_cp_via_check
    CHECK (created_via IN ('ui','mcp')),
  CONSTRAINT map_cp_community_only_manual
    CHECK (community_submitted_at IS NULL OR source = 'parent_manual')
);

CREATE INDEX IF NOT EXISTS map_cp_family_idx
  ON public.map_custom_passages (family_id) WHERE soft_deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS map_cp_family_status_idx
  ON public.map_custom_passages (family_id, status) WHERE soft_deleted_at IS NULL;

-- =========================================================================
-- 4.2 Passages: versions table
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.map_custom_passage_versions (
  id                      uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  passage_id              uuid NOT NULL REFERENCES public.map_custom_passages(id) ON DELETE CASCADE,
  version_number          int  NOT NULL,
  subject                 text NOT NULL,
  grade                   int  NOT NULL,
  title                   text,
  body                    text NOT NULL,
  genre                   text,
  estimated_grade_level   numeric(3,1),
  standard_codes          text[] DEFAULT '{}',
  passage_svg             bytea,
  passage_svg_alt_text    text,
  ai_metadata             jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_cpv_subject_check CHECK (subject IN ('reading','language')),
  CONSTRAINT map_cpv_grade_check CHECK (grade BETWEEN 0 AND 12),
  CONSTRAINT map_cpv_body_len CHECK (char_length(body) BETWEEN 50 AND 10000),
  CONSTRAINT map_cpv_title_len CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT map_cpv_genre_check CHECK (
    genre IS NULL OR genre IN ('fiction','nonfiction','poetry','drama','informational','editing_draft')
  ),
  CONSTRAINT map_cpv_svg_size
    CHECK (passage_svg IS NULL OR octet_length(passage_svg) BETWEEN 100 AND 65536),
  CONSTRAINT map_cpv_svg_needs_alt
    CHECK (passage_svg IS NULL OR (passage_svg_alt_text IS NOT NULL
      AND char_length(passage_svg_alt_text) BETWEEN 1 AND 500)),
  UNIQUE (passage_id, version_number)
);

CREATE INDEX IF NOT EXISTS map_cpv_passage_idx
  ON public.map_custom_passage_versions (passage_id, version_number DESC);
CREATE INDEX IF NOT EXISTS map_cpv_subject_grade_idx
  ON public.map_custom_passage_versions (subject, grade);

-- =========================================================================
-- 4.3 Header → version FK for passages (deferrable, so the create flow works)
-- =========================================================================

DO $$ BEGIN
  ALTER TABLE public.map_custom_passages
    ADD CONSTRAINT map_cp_current_version_fk
    FOREIGN KEY (current_version_id)
    REFERENCES public.map_custom_passage_versions(id)
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =========================================================================
-- 4.4 Questions: header table
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.map_custom_questions (
  id                      uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  family_id               uuid NOT NULL REFERENCES public.map_families(id) ON DELETE CASCADE,
  owner_user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  current_version_id      uuid,
  source                  text NOT NULL,
  status                  text NOT NULL DEFAULT 'draft',
  created_via             text NOT NULL,
  community_submitted_at  timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  soft_deleted_at         timestamptz,
  CONSTRAINT map_cq_source_check
    CHECK (source IN ('parent_manual','parent_ai_assisted','parent_ai_generated')),
  CONSTRAINT map_cq_status_check
    CHECK (status IN ('draft','published','archived')),
  CONSTRAINT map_cq_via_check
    CHECK (created_via IN ('ui','mcp')),
  CONSTRAINT map_cq_community_only_manual
    CHECK (community_submitted_at IS NULL OR source = 'parent_manual')
);

CREATE INDEX IF NOT EXISTS map_cq_family_idx
  ON public.map_custom_questions (family_id) WHERE soft_deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS map_cq_family_status_idx
  ON public.map_custom_questions (family_id, status) WHERE soft_deleted_at IS NULL;

-- =========================================================================
-- 4.5 Questions: versions table (with passage reference)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.map_custom_question_versions (
  id                  uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  question_id         uuid NOT NULL REFERENCES public.map_custom_questions(id) ON DELETE CASCADE,
  version_number      int  NOT NULL,
  subject             text NOT NULL,
  grade               int  NOT NULL,
  stem                text NOT NULL,
  stem_svg            bytea,
  stem_svg_alt_text   text,
  passage_version_id  uuid REFERENCES public.map_custom_passage_versions(id) ON DELETE RESTRICT,
  question_focus      text,
  standard_code       text,
  difficulty          int,
  ai_metadata         jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_cqv_subject_check CHECK (subject IN ('math','reading','language')),
  CONSTRAINT map_cqv_grade_check CHECK (grade BETWEEN 0 AND 12),
  CONSTRAINT map_cqv_stem_len CHECK (char_length(stem) BETWEEN 5 AND 2000),
  CONSTRAINT map_cqv_focus_len CHECK (question_focus IS NULL OR char_length(question_focus) BETWEEN 1 AND 200),
  CONSTRAINT map_cqv_difficulty_check CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 5),
  CONSTRAINT map_cqv_stem_svg_size
    CHECK (stem_svg IS NULL OR octet_length(stem_svg) BETWEEN 100 AND 65536),
  CONSTRAINT map_cqv_stem_svg_needs_alt
    CHECK (stem_svg IS NULL OR (stem_svg_alt_text IS NOT NULL
      AND char_length(stem_svg_alt_text) BETWEEN 1 AND 500)),
  CONSTRAINT map_cqv_math_no_passage
    CHECK (subject <> 'math' OR passage_version_id IS NULL),
  UNIQUE (question_id, version_number)
);

CREATE INDEX IF NOT EXISTS map_cqv_question_idx
  ON public.map_custom_question_versions (question_id, version_number DESC);
CREATE INDEX IF NOT EXISTS map_cqv_standard_idx
  ON public.map_custom_question_versions (standard_code) WHERE standard_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS map_cqv_passage_idx
  ON public.map_custom_question_versions (passage_version_id) WHERE passage_version_id IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.map_custom_questions
    ADD CONSTRAINT map_cq_current_version_fk
    FOREIGN KEY (current_version_id)
    REFERENCES public.map_custom_question_versions(id)
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =========================================================================
-- 4.6 Choices
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.map_custom_question_choices (
  id                  uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  version_id          uuid NOT NULL REFERENCES public.map_custom_question_versions(id) ON DELETE CASCADE,
  ordinal             int  NOT NULL,
  label               text NOT NULL,
  text                text NOT NULL,
  choice_svg          bytea,
  choice_svg_alt_text text,
  is_correct          boolean NOT NULL DEFAULT false,
  explanation_correct text,
  explanation_wrong   text,
  misconception_tag   text REFERENCES public.map_misconception_tags(tag) ON DELETE SET NULL,
  CONSTRAINT map_cqc_ordinal_check CHECK (ordinal BETWEEN 0 AND 4),
  CONSTRAINT map_cqc_label_check CHECK (label IN ('A','B','C','D','E')),
  CONSTRAINT map_cqc_text_len CHECK (char_length(text) BETWEEN 1 AND 500),
  CONSTRAINT map_cqc_explcorrect_len
    CHECK (explanation_correct IS NULL OR char_length(explanation_correct) BETWEEN 1 AND 1500),
  CONSTRAINT map_cqc_explwrong_len
    CHECK (explanation_wrong IS NULL OR char_length(explanation_wrong) BETWEEN 1 AND 1500),
  CONSTRAINT map_cqc_correct_needs_expl
    CHECK (is_correct = false OR explanation_correct IS NOT NULL),
  CONSTRAINT map_cqc_choice_svg_size
    CHECK (choice_svg IS NULL OR octet_length(choice_svg) BETWEEN 100 AND 32768),
  CONSTRAINT map_cqc_choice_svg_needs_alt
    CHECK (choice_svg IS NULL OR (choice_svg_alt_text IS NOT NULL
      AND char_length(choice_svg_alt_text) BETWEEN 1 AND 300)),
  UNIQUE (version_id, ordinal),
  UNIQUE (version_id, label)
);

CREATE INDEX IF NOT EXISTS map_cqc_version_idx
  ON public.map_custom_question_choices (version_id, ordinal);

-- =========================================================================
-- 4.7 Triggers for shape invariants — fire on COMMIT (deferred)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.map_validate_custom_question_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_version_id uuid;
  v_choice_count int;
  v_correct_count int;
  v_choice_svg_count int;
  v_subject text;
  v_passage_version_id uuid;
  v_question_status text;
  v_passage_status text;
BEGIN
  -- For row-level INSERT/UPDATE/DELETE on choices, NEW or OLD has version_id.
  -- For row-level INSERT/UPDATE on versions, the row IS the version.
  IF TG_TABLE_NAME = 'map_custom_question_choices' THEN
    v_version_id := COALESCE(NEW.version_id, OLD.version_id);
  ELSE
    v_version_id := COALESCE(NEW.id, OLD.id);
  END IF;

  IF v_version_id IS NULL THEN RETURN NULL; END IF;

  SELECT count(*),
         count(*) FILTER (WHERE is_correct),
         count(*) FILTER (WHERE choice_svg IS NOT NULL)
    INTO v_choice_count, v_correct_count, v_choice_svg_count
  FROM public.map_custom_question_choices
  WHERE version_id = v_version_id;

  SELECT v.subject, v.passage_version_id, q.status
    INTO v_subject, v_passage_version_id, v_question_status
  FROM public.map_custom_question_versions v
  JOIN public.map_custom_questions q ON q.id = v.question_id
  WHERE v.id = v_version_id;

  IF v_question_status IS NULL THEN RETURN NULL; END IF;

  -- Only enforce on published questions; drafts may be in flight.
  IF v_question_status = 'published' THEN
    IF v_choice_count NOT BETWEEN 3 AND 5 THEN
      RAISE EXCEPTION 'published version % must have 3-5 choices, has %', v_version_id, v_choice_count;
    END IF;
    IF v_correct_count <> 1 THEN
      RAISE EXCEPTION 'published version % must have exactly 1 correct choice, has %', v_version_id, v_correct_count;
    END IF;
    IF v_choice_svg_count <> 0 AND v_choice_svg_count <> v_choice_count THEN
      RAISE EXCEPTION 'published version % has SVG on % of % choices; must be all or none',
        v_version_id, v_choice_svg_count, v_choice_count;
    END IF;
    IF v_subject = 'reading' AND v_passage_version_id IS NULL THEN
      RAISE EXCEPTION 'published reading question % must reference a passage', v_version_id;
    END IF;
    IF v_passage_version_id IS NOT NULL THEN
      SELECT p.status INTO v_passage_status
      FROM public.map_custom_passage_versions pv
      JOIN public.map_custom_passages p ON p.id = pv.passage_id
      WHERE pv.id = v_passage_version_id;
      IF v_passage_status <> 'published' THEN
        RAISE EXCEPTION 'published question % cannot reference a passage in status %', v_version_id, v_passage_status;
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS map_validate_custom_question_version_trg ON public.map_custom_question_choices;
CREATE CONSTRAINT TRIGGER map_validate_custom_question_version_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.map_custom_question_choices
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.map_validate_custom_question_version();

DROP TRIGGER IF EXISTS map_validate_custom_question_version_self_trg ON public.map_custom_question_versions;
CREATE CONSTRAINT TRIGGER map_validate_custom_question_version_self_trg
  AFTER INSERT OR UPDATE ON public.map_custom_question_versions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.map_validate_custom_question_version();

-- Also re-validate when a question's status flips from draft to published.
CREATE OR REPLACE FUNCTION public.map_validate_custom_question_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_version_id uuid;
BEGIN
  IF NEW.status = 'published' AND (OLD.status IS DISTINCT FROM 'published') THEN
    v_version_id := NEW.current_version_id;
    IF v_version_id IS NOT NULL THEN
      -- Trigger validation by touching the version (UPDATE on versions table fires the validator).
      UPDATE public.map_custom_question_versions
        SET created_at = created_at
      WHERE id = v_version_id;
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS map_validate_custom_question_on_status_change_trg ON public.map_custom_questions;
CREATE TRIGGER map_validate_custom_question_on_status_change_trg
  AFTER UPDATE OF status ON public.map_custom_questions
  FOR EACH ROW EXECUTE FUNCTION public.map_validate_custom_question_on_status_change();

-- Soft-delete guard on passages: cannot soft-delete a passage with non-archived
-- referencing questions.
CREATE OR REPLACE FUNCTION public.map_guard_passage_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_ref_count int;
BEGIN
  IF NEW.soft_deleted_at IS NOT NULL AND OLD.soft_deleted_at IS NULL THEN
    SELECT count(*) INTO v_ref_count
    FROM public.map_custom_questions q
    JOIN public.map_custom_question_versions qv ON qv.question_id = q.id
    JOIN public.map_custom_passage_versions pv ON pv.id = qv.passage_version_id
    WHERE pv.passage_id = NEW.id
      AND q.soft_deleted_at IS NULL
      AND q.status <> 'archived';
    IF v_ref_count > 0 THEN
      RAISE EXCEPTION 'passage in use by % non-archived question(s); archive or soft-delete those first', v_ref_count;
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS map_guard_passage_soft_delete_trg ON public.map_custom_passages;
CREATE TRIGGER map_guard_passage_soft_delete_trg
  BEFORE UPDATE OF soft_deleted_at ON public.map_custom_passages
  FOR EACH ROW EXECUTE FUNCTION public.map_guard_passage_soft_delete();

-- =========================================================================
-- 4.9 RPCs
-- =========================================================================

CREATE OR REPLACE FUNCTION public.map_create_custom_passage(
  p_source                text,
  p_created_via           text,
  p_subject               text,
  p_grade                 int,
  p_title                 text,
  p_body                  text,
  p_genre                 text,
  p_estimated_grade_level numeric,
  p_standard_codes        text[],
  p_ai_metadata           jsonb,
  p_passage_svg           bytea DEFAULT NULL,
  p_passage_svg_alt_text  text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family_id  uuid;
  v_user_id    uuid;
  v_passage_id uuid;
  v_version_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  v_family_id := public.map_current_family_id();
  IF v_family_id IS NULL THEN RAISE EXCEPTION 'no family for current user'; END IF;

  IF p_passage_svg IS NOT NULL
     AND (p_passage_svg_alt_text IS NULL OR length(p_passage_svg_alt_text) = 0) THEN
    RAISE EXCEPTION 'passage_svg_alt_text required when passage_svg is provided';
  END IF;

  INSERT INTO public.map_custom_passages
    (family_id, owner_user_id, source, created_via)
    VALUES (v_family_id, v_user_id, p_source, p_created_via)
    RETURNING id INTO v_passage_id;

  INSERT INTO public.map_custom_passage_versions
    (passage_id, version_number, subject, grade, title, body, genre, estimated_grade_level,
     standard_codes, passage_svg, passage_svg_alt_text, ai_metadata)
    VALUES (v_passage_id, 1, p_subject, p_grade, p_title, p_body, p_genre, p_estimated_grade_level,
            COALESCE(p_standard_codes, '{}'), p_passage_svg, p_passage_svg_alt_text, p_ai_metadata)
    RETURNING id INTO v_version_id;

  UPDATE public.map_custom_passages
     SET current_version_id = v_version_id
   WHERE id = v_passage_id;

  RETURN v_passage_id;
END
$$;

GRANT EXECUTE ON FUNCTION public.map_create_custom_passage(text,text,text,int,text,text,text,numeric,text[],jsonb,bytea,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.map_publish_custom_passage(p_passage_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.map_custom_passages
     SET status = 'published', updated_at = now()
   WHERE id = p_passage_id
     AND family_id = public.map_current_family_id()
     AND status = 'draft'
     AND soft_deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'passage not found, not yours, not in draft, or deleted';
  END IF;
END
$$;

GRANT EXECUTE ON FUNCTION public.map_publish_custom_passage(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.map_revise_custom_passage(
  p_passage_id            uuid,
  p_subject               text,
  p_grade                 int,
  p_title                 text,
  p_body                  text,
  p_genre                 text,
  p_estimated_grade_level numeric,
  p_standard_codes        text[],
  p_ai_metadata           jsonb,
  p_passage_svg           bytea DEFAULT NULL,
  p_passage_svg_alt_text  text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family_id    uuid;
  v_next_version int;
  v_version_id   uuid;
BEGIN
  v_family_id := public.map_current_family_id();
  IF NOT EXISTS (
    SELECT 1 FROM public.map_custom_passages
    WHERE id = p_passage_id AND family_id = v_family_id
      AND soft_deleted_at IS NULL AND status = 'published'
  ) THEN
    RAISE EXCEPTION 'passage not found, not yours, deleted, or not published';
  END IF;

  IF p_passage_svg IS NOT NULL
     AND (p_passage_svg_alt_text IS NULL OR length(p_passage_svg_alt_text) = 0) THEN
    RAISE EXCEPTION 'passage_svg_alt_text required when passage_svg is provided';
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
    FROM public.map_custom_passage_versions WHERE passage_id = p_passage_id;

  INSERT INTO public.map_custom_passage_versions
    (passage_id, version_number, subject, grade, title, body, genre, estimated_grade_level,
     standard_codes, passage_svg, passage_svg_alt_text, ai_metadata)
    VALUES (p_passage_id, v_next_version, p_subject, p_grade, p_title, p_body, p_genre,
            p_estimated_grade_level, COALESCE(p_standard_codes, '{}'),
            p_passage_svg, p_passage_svg_alt_text, p_ai_metadata)
    RETURNING id INTO v_version_id;

  UPDATE public.map_custom_passages
     SET current_version_id = v_version_id, updated_at = now()
   WHERE id = p_passage_id;

  RETURN v_version_id;
END
$$;

GRANT EXECUTE ON FUNCTION public.map_revise_custom_passage(uuid,text,int,text,text,text,numeric,text[],jsonb,bytea,text) TO authenticated;

-- Question RPCs: create, publish, revise. Each verifies the passage_version_id
-- (when non-null) belongs to a passage owned by the same family.

CREATE OR REPLACE FUNCTION public.map_create_custom_question(
  p_source              text,
  p_created_via         text,
  p_subject             text,
  p_grade               int,
  p_stem                text,
  p_standard_code       text,
  p_difficulty          int,
  p_ai_metadata         jsonb,
  p_choices             jsonb,
  p_passage_version_id  uuid DEFAULT NULL,
  p_question_focus      text DEFAULT NULL,
  p_stem_svg            bytea DEFAULT NULL,
  p_stem_svg_alt_text   text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family_id   uuid;
  v_user_id     uuid;
  v_question_id uuid;
  v_version_id  uuid;
  v_choice      jsonb;
  v_ordinal     int := 0;
  v_choice_svg_b64 text;
  v_choice_svg_bytes bytea;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  v_family_id := public.map_current_family_id();
  IF v_family_id IS NULL THEN RAISE EXCEPTION 'no family for current user'; END IF;

  IF p_stem_svg IS NOT NULL
     AND (p_stem_svg_alt_text IS NULL OR length(p_stem_svg_alt_text) = 0) THEN
    RAISE EXCEPTION 'stem_svg_alt_text required when stem_svg is provided';
  END IF;

  -- Verify any non-null passage_version_id is in the same family.
  IF p_passage_version_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.map_custom_passage_versions pv
      JOIN public.map_custom_passages p ON p.id = pv.passage_id
      WHERE pv.id = p_passage_version_id
        AND p.family_id = v_family_id
        AND p.soft_deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'passage not in family';
    END IF;
  END IF;

  INSERT INTO public.map_custom_questions
    (family_id, owner_user_id, source, created_via)
    VALUES (v_family_id, v_user_id, p_source, p_created_via)
    RETURNING id INTO v_question_id;

  INSERT INTO public.map_custom_question_versions
    (question_id, version_number, subject, grade, stem, stem_svg, stem_svg_alt_text,
     passage_version_id, question_focus, standard_code, difficulty, ai_metadata)
    VALUES (v_question_id, 1, p_subject, p_grade, p_stem, p_stem_svg, p_stem_svg_alt_text,
            p_passage_version_id, p_question_focus, p_standard_code, p_difficulty, p_ai_metadata)
    RETURNING id INTO v_version_id;

  UPDATE public.map_custom_questions
     SET current_version_id = v_version_id
   WHERE id = v_question_id;

  -- Insert choices from the jsonb array.
  FOR v_choice IN SELECT jsonb_array_elements(COALESCE(p_choices, '[]'::jsonb))
  LOOP
    v_choice_svg_b64 := v_choice->>'choice_svg';
    v_choice_svg_bytes := CASE
      WHEN v_choice_svg_b64 IS NULL OR length(v_choice_svg_b64) = 0 THEN NULL
      ELSE decode(v_choice_svg_b64, 'base64')
    END;

    INSERT INTO public.map_custom_question_choices
      (version_id, ordinal, label, text, choice_svg, choice_svg_alt_text,
       is_correct, explanation_correct, explanation_wrong, misconception_tag)
      VALUES (
        v_version_id,
        v_ordinal,
        v_choice->>'label',
        v_choice->>'text',
        v_choice_svg_bytes,
        v_choice->>'choice_svg_alt_text',
        COALESCE((v_choice->>'is_correct')::boolean, false),
        v_choice->>'explanation_correct',
        v_choice->>'explanation_wrong',
        v_choice->>'misconception_tag'
      );
    v_ordinal := v_ordinal + 1;
  END LOOP;

  RETURN v_question_id;
END
$$;

GRANT EXECUTE ON FUNCTION public.map_create_custom_question(text,text,text,int,text,text,int,jsonb,jsonb,uuid,text,bytea,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.map_publish_custom_question(p_question_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- Ensure invariants surface BEFORE commit by switching the deferred constraints
  -- to immediate at the end of this transaction.
  SET CONSTRAINTS ALL IMMEDIATE;
  UPDATE public.map_custom_questions
     SET status = 'published', updated_at = now()
   WHERE id = p_question_id
     AND family_id = public.map_current_family_id()
     AND status = 'draft'
     AND soft_deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'question not found, not yours, not in draft, or deleted';
  END IF;
END
$$;

GRANT EXECUTE ON FUNCTION public.map_publish_custom_question(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.map_revise_custom_question(
  p_question_id         uuid,
  p_subject             text,
  p_grade               int,
  p_stem                text,
  p_standard_code       text,
  p_difficulty          int,
  p_ai_metadata         jsonb,
  p_choices             jsonb,
  p_passage_version_id  uuid DEFAULT NULL,
  p_question_focus      text DEFAULT NULL,
  p_stem_svg            bytea DEFAULT NULL,
  p_stem_svg_alt_text   text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family_id    uuid;
  v_next_version int;
  v_version_id   uuid;
  v_choice       jsonb;
  v_ordinal      int := 0;
  v_choice_svg_b64 text;
  v_choice_svg_bytes bytea;
BEGIN
  v_family_id := public.map_current_family_id();
  IF NOT EXISTS (
    SELECT 1 FROM public.map_custom_questions
    WHERE id = p_question_id AND family_id = v_family_id
      AND soft_deleted_at IS NULL AND status = 'published'
  ) THEN
    RAISE EXCEPTION 'question not found, not yours, deleted, or not published';
  END IF;

  IF p_stem_svg IS NOT NULL
     AND (p_stem_svg_alt_text IS NULL OR length(p_stem_svg_alt_text) = 0) THEN
    RAISE EXCEPTION 'stem_svg_alt_text required when stem_svg is provided';
  END IF;

  IF p_passage_version_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.map_custom_passage_versions pv
      JOIN public.map_custom_passages p ON p.id = pv.passage_id
      WHERE pv.id = p_passage_version_id
        AND p.family_id = v_family_id
        AND p.soft_deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'passage not in family';
    END IF;
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
    FROM public.map_custom_question_versions WHERE question_id = p_question_id;

  INSERT INTO public.map_custom_question_versions
    (question_id, version_number, subject, grade, stem, stem_svg, stem_svg_alt_text,
     passage_version_id, question_focus, standard_code, difficulty, ai_metadata)
    VALUES (p_question_id, v_next_version, p_subject, p_grade, p_stem, p_stem_svg,
            p_stem_svg_alt_text, p_passage_version_id, p_question_focus,
            p_standard_code, p_difficulty, p_ai_metadata)
    RETURNING id INTO v_version_id;

  FOR v_choice IN SELECT jsonb_array_elements(COALESCE(p_choices, '[]'::jsonb))
  LOOP
    v_choice_svg_b64 := v_choice->>'choice_svg';
    v_choice_svg_bytes := CASE
      WHEN v_choice_svg_b64 IS NULL OR length(v_choice_svg_b64) = 0 THEN NULL
      ELSE decode(v_choice_svg_b64, 'base64')
    END;

    INSERT INTO public.map_custom_question_choices
      (version_id, ordinal, label, text, choice_svg, choice_svg_alt_text,
       is_correct, explanation_correct, explanation_wrong, misconception_tag)
      VALUES (
        v_version_id, v_ordinal,
        v_choice->>'label', v_choice->>'text', v_choice_svg_bytes, v_choice->>'choice_svg_alt_text',
        COALESCE((v_choice->>'is_correct')::boolean, false),
        v_choice->>'explanation_correct', v_choice->>'explanation_wrong',
        v_choice->>'misconception_tag'
      );
    v_ordinal := v_ordinal + 1;
  END LOOP;

  UPDATE public.map_custom_questions
     SET current_version_id = v_version_id, updated_at = now()
   WHERE id = p_question_id;

  RETURN v_version_id;
END
$$;

GRANT EXECUTE ON FUNCTION public.map_revise_custom_question(uuid,text,int,text,text,int,jsonb,jsonb,uuid,text,bytea,text) TO authenticated;

-- =========================================================================
-- 4.10 RLS
-- =========================================================================

ALTER TABLE public.map_custom_passages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_custom_passage_versions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_custom_questions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_custom_question_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_custom_question_choices  ENABLE ROW LEVEL SECURITY;

-- Passages
DROP POLICY IF EXISTS map_cp_select ON public.map_custom_passages;
CREATE POLICY map_cp_select ON public.map_custom_passages FOR SELECT
  USING (family_id = public.map_current_family_id() AND soft_deleted_at IS NULL);
DROP POLICY IF EXISTS map_cp_insert ON public.map_custom_passages;
CREATE POLICY map_cp_insert ON public.map_custom_passages FOR INSERT
  WITH CHECK (family_id = public.map_current_family_id());
DROP POLICY IF EXISTS map_cp_update ON public.map_custom_passages;
CREATE POLICY map_cp_update ON public.map_custom_passages FOR UPDATE
  USING (family_id = public.map_current_family_id())
  WITH CHECK (family_id = public.map_current_family_id());

-- Passage versions: scope through the parent passage.
DROP POLICY IF EXISTS map_cpv_select ON public.map_custom_passage_versions;
CREATE POLICY map_cpv_select ON public.map_custom_passage_versions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.map_custom_passages p
    WHERE p.id = passage_id AND p.family_id = public.map_current_family_id()
  ));
DROP POLICY IF EXISTS map_cpv_insert ON public.map_custom_passage_versions;
CREATE POLICY map_cpv_insert ON public.map_custom_passage_versions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.map_custom_passages p
    WHERE p.id = passage_id AND p.family_id = public.map_current_family_id()
  ));
DROP POLICY IF EXISTS map_cpv_update ON public.map_custom_passage_versions;
CREATE POLICY map_cpv_update ON public.map_custom_passage_versions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.map_custom_passages p
    WHERE p.id = passage_id AND p.family_id = public.map_current_family_id()
  ));

-- Questions
DROP POLICY IF EXISTS map_cq_select ON public.map_custom_questions;
CREATE POLICY map_cq_select ON public.map_custom_questions FOR SELECT
  USING (family_id = public.map_current_family_id() AND soft_deleted_at IS NULL);
DROP POLICY IF EXISTS map_cq_insert ON public.map_custom_questions;
CREATE POLICY map_cq_insert ON public.map_custom_questions FOR INSERT
  WITH CHECK (family_id = public.map_current_family_id());
DROP POLICY IF EXISTS map_cq_update ON public.map_custom_questions;
CREATE POLICY map_cq_update ON public.map_custom_questions FOR UPDATE
  USING (family_id = public.map_current_family_id())
  WITH CHECK (family_id = public.map_current_family_id());

-- Question versions
DROP POLICY IF EXISTS map_cqv_select ON public.map_custom_question_versions;
CREATE POLICY map_cqv_select ON public.map_custom_question_versions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.map_custom_questions q
    WHERE q.id = question_id AND q.family_id = public.map_current_family_id()
  ));
DROP POLICY IF EXISTS map_cqv_insert ON public.map_custom_question_versions;
CREATE POLICY map_cqv_insert ON public.map_custom_question_versions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.map_custom_questions q
    WHERE q.id = question_id AND q.family_id = public.map_current_family_id()
  ));
DROP POLICY IF EXISTS map_cqv_update ON public.map_custom_question_versions;
CREATE POLICY map_cqv_update ON public.map_custom_question_versions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.map_custom_questions q
    WHERE q.id = question_id AND q.family_id = public.map_current_family_id()
  ));

-- Choices
DROP POLICY IF EXISTS map_cqc_select ON public.map_custom_question_choices;
CREATE POLICY map_cqc_select ON public.map_custom_question_choices FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.map_custom_question_versions v
    JOIN public.map_custom_questions q ON q.id = v.question_id
    WHERE v.id = version_id AND q.family_id = public.map_current_family_id()
  ));
DROP POLICY IF EXISTS map_cqc_insert ON public.map_custom_question_choices;
CREATE POLICY map_cqc_insert ON public.map_custom_question_choices FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.map_custom_question_versions v
    JOIN public.map_custom_questions q ON q.id = v.question_id
    WHERE v.id = version_id AND q.family_id = public.map_current_family_id()
  ));
DROP POLICY IF EXISTS map_cqc_update ON public.map_custom_question_choices;
CREATE POLICY map_cqc_update ON public.map_custom_question_choices FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.map_custom_question_versions v
    JOIN public.map_custom_questions q ON q.id = v.question_id
    WHERE v.id = version_id AND q.family_id = public.map_current_family_id()
  ));

-- =========================================================================
-- 4.11 Helper view
-- =========================================================================

CREATE OR REPLACE VIEW public.map_custom_questions_resolved AS
SELECT
  q.id                            AS question_id,
  q.family_id,
  q.status                        AS question_status,
  q.source                        AS question_source,
  qv.id                           AS version_id,
  qv.version_number               AS question_version_number,
  qv.subject,
  qv.grade,
  qv.stem,
  qv.stem_svg,
  qv.stem_svg_alt_text,
  qv.standard_code,
  qv.difficulty,
  qv.question_focus,
  pv.id                           AS passage_version_id,
  pv.passage_id,
  pv.version_number               AS passage_version_number,
  pv.title                        AS passage_title,
  pv.body                         AS passage_body,
  pv.passage_svg,
  pv.passage_svg_alt_text,
  pv.genre                        AS passage_genre,
  pv.standard_codes               AS passage_standard_codes,
  (
    SELECT jsonb_agg(jsonb_build_object(
      'label', c.label, 'text', c.text, 'is_correct', c.is_correct,
      'choice_svg', c.choice_svg, 'choice_svg_alt_text', c.choice_svg_alt_text,
      'explanation_correct', c.explanation_correct,
      'explanation_wrong', c.explanation_wrong,
      'misconception_tag', c.misconception_tag
    ) ORDER BY c.ordinal)
    FROM public.map_custom_question_choices c
    WHERE c.version_id = qv.id
  )                                AS choices
FROM public.map_custom_questions q
JOIN public.map_custom_question_versions qv ON qv.id = q.current_version_id
LEFT JOIN public.map_custom_passage_versions pv ON pv.id = qv.passage_version_id
WHERE q.soft_deleted_at IS NULL;

COMMIT;
