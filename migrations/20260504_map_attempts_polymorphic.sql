-- Polymorphic attempt reference (Custom_Questions_Brief.md §4.8).
-- An attempt now points at EITHER a vetted question (the existing question_id)
-- OR a custom question version — never both, never neither.
--
-- Brief→repo adaptation: the brief calls this table `map_test_attempts`; it's
-- `map_attempts` in this repo (probed 2026-05-04).
--
-- All existing rows have question_id non-null and custom_question_version_id
-- null, which already satisfies the XOR check.

BEGIN;

ALTER TABLE public.map_attempts
  ADD COLUMN IF NOT EXISTS custom_question_version_id uuid
    REFERENCES public.map_custom_question_versions(id) ON DELETE RESTRICT;

DO $$ BEGIN
  ALTER TABLE public.map_attempts
    ADD CONSTRAINT map_attempts_question_xor
    CHECK (
      (question_id IS NOT NULL AND custom_question_version_id IS NULL) OR
      (question_id IS NULL     AND custom_question_version_id IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS map_attempts_custom_version_idx
  ON public.map_attempts (custom_question_version_id)
  WHERE custom_question_version_id IS NOT NULL;

COMMIT;
