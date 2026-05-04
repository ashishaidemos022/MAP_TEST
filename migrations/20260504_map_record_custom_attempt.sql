-- Custom-question attempt recorder (Cycle 2). Parallel to map_record_attempt
-- but reads the choice's correctness + misconception_tag from
-- map_custom_question_choices and writes the polymorphic
-- custom_question_version_id column on map_attempts. The XOR check enforces
-- question_id stays NULL for these rows.
--
-- Already applied 2026-05-04 via apply_migration; this file is for repo audit.

CREATE OR REPLACE FUNCTION public.map_record_custom_attempt(
  p_session_id                  uuid,
  p_student_id                  uuid,
  p_custom_question_version_id  uuid,
  p_choice_id                   uuid,
  p_time_ms                     integer
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_attempt_id uuid;
  v_correct    boolean;
  v_tag        text;
  v_standard   text;
BEGIN
  SELECT c.is_correct, c.misconception_tag
    INTO v_correct, v_tag
  FROM public.map_custom_question_choices c
  WHERE c.id = p_choice_id
    AND c.version_id = p_custom_question_version_id;
  IF v_correct IS NULL THEN
    RAISE EXCEPTION 'choice % does not belong to custom question version %', p_choice_id, p_custom_question_version_id;
  END IF;

  SELECT v.standard_code INTO v_standard
  FROM public.map_custom_question_versions v
  WHERE v.id = p_custom_question_version_id;

  INSERT INTO public.map_attempts(
    session_id, student_id, question_id, custom_question_version_id,
    selected_choice_id, is_correct, time_spent_ms
  )
  VALUES (
    p_session_id, p_student_id, NULL, p_custom_question_version_id,
    p_choice_id, v_correct, p_time_ms
  )
  RETURNING id INTO v_attempt_id;

  IF v_correct = false AND v_tag IS NOT NULL THEN
    INSERT INTO public.map_misconception_signals
      (student_id, misconception_tag, occurrence_count,
       consecutive_correct, first_seen_at, last_seen_at)
    VALUES (p_student_id, v_tag, 1, 0, now(), now())
    ON CONFLICT (student_id, misconception_tag) DO UPDATE
      SET occurrence_count = map_misconception_signals.occurrence_count + 1,
          consecutive_correct = 0,
          last_seen_at = now(),
          cleared_at = NULL;
  ELSIF v_correct = true AND v_standard IS NOT NULL THEN
    UPDATE public.map_misconception_signals s
    SET consecutive_correct = s.consecutive_correct + 1,
        cleared_at = CASE WHEN s.consecutive_correct + 1 >= 3
                          THEN now() ELSE s.cleared_at END
    WHERE s.student_id = p_student_id
      AND s.cleared_at IS NULL
      AND EXISTS (
        SELECT 1 FROM public.map_misconception_tags t
        WHERE t.tag = s.misconception_tag
          AND v_standard = ANY(t.related_teks)
      );
  END IF;

  RETURN v_attempt_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.map_record_custom_attempt(uuid,uuid,uuid,uuid,integer) TO authenticated;
