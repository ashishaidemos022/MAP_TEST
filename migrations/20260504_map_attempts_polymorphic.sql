-- Polymorphic attempt reference (Custom_Questions_Brief.md §4.8).
-- An attempt now points at EITHER a vetted question (the existing question_id)
-- OR a custom question version — never both, never neither.
--
-- Brief→repo adaptation: the brief calls this table `map_test_attempts`; it's
-- `map_attempts` in this repo (probed 2026-05-04).
--
-- All existing rows have question_id non-null and custom_question_version_id
-- null, which already satisfies the XOR check.
--
-- Note (2026-05-04 follow-up): question_id had a NOT NULL constraint that
-- blocked custom-question attempts from being recorded (the XOR allows null
-- on either side, but the column-level NOT NULL fired first). The DROP NOT
-- NULL below was applied as a follow-on migration after the kid hit it.

BEGIN;

ALTER TABLE public.map_attempts
  ADD COLUMN IF NOT EXISTS custom_question_version_id uuid
    REFERENCES public.map_custom_question_versions(id) ON DELETE RESTRICT;

ALTER TABLE public.map_attempts ALTER COLUMN question_id DROP NOT NULL;

-- selected_choice_id originally FK'd to map_question_choices (vetted only).
-- With polymorphic attempts, the choice may live in map_custom_question_choices
-- instead. Drop the FK and replace with a trigger that picks the right table
-- based on which of question_id / custom_question_version_id is set.
ALTER TABLE public.map_attempts
  DROP CONSTRAINT IF EXISTS map_attempts_selected_choice_id_fkey;

CREATE OR REPLACE FUNCTION public.map_attempts_validate_choice_ref()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF NEW.selected_choice_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.question_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.map_question_choices c
      WHERE c.id = NEW.selected_choice_id AND c.question_id = NEW.question_id
    ) INTO v_ok;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'selected_choice_id % is not a vetted choice on question %',
        NEW.selected_choice_id, NEW.question_id;
    END IF;
  ELSIF NEW.custom_question_version_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.map_custom_question_choices c
      WHERE c.id = NEW.selected_choice_id AND c.version_id = NEW.custom_question_version_id
    ) INTO v_ok;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'selected_choice_id % is not a custom choice on version %',
        NEW.selected_choice_id, NEW.custom_question_version_id;
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS map_attempts_validate_choice_ref_trg ON public.map_attempts;
CREATE TRIGGER map_attempts_validate_choice_ref_trg
  BEFORE INSERT OR UPDATE OF selected_choice_id, question_id, custom_question_version_id
  ON public.map_attempts
  FOR EACH ROW EXECUTE FUNCTION public.map_attempts_validate_choice_ref();

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
