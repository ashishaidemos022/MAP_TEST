-- Grade 5 math seed (doc: Dividing Decimals — Divide decimals by whole numbers).
-- TEKS 5.3F "Decimal ÷ whole number with area models", band 201_210.
-- 5 questions × 4 choices. Idempotent (NOT EXISTS guard on stem + standard).

DO $mig$
DECLARE
  v_standard_id uuid;
  v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject = 'math' AND grade = 5 AND teks_code = '5.3F';
  IF v_standard_id IS NULL THEN
    RAISE EXCEPTION 'standard not found: math grade 5 teks 5.3F';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$What is 0.6 ÷ 3?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$What is 0.6 ÷ 3?$stem$, NULL,
            $exp$0.6 is 6 tenths. Split 6 tenths into 3 equal groups: 6 ÷ 3 = 2 tenths in each group. 2 tenths = 0.2.$exp$,
            $note$Khan Academy: Divide decimals by whole numbers$note$, 'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order) VALUES
      (v_question_id, 'A', $body$0.2$body$, true, NULL, NULL, 1),
      (v_question_id, 'B', $body$2$body$, false, $msc$Divided 6 ÷ 3 but dropped the decimal, treating tenths as whole units.$msc$, 'division_decimal_for_whole_units', 2),
      (v_question_id, 'C', $body$0.3$body$, false, $msc$Subtracted 3 from 6 tenths instead of dividing into 3 groups.$msc$, 'operation_swap_add_subtract', 3),
      (v_question_id, 'D', $body$0.02$body$, false, $msc$Shifted the quotient an extra place to the right.$msc$, 'decimal_place_value_misread', 4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$What is 0.48 ÷ 4?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$What is 0.48 ÷ 4?$stem$, NULL,
            $exp$0.48 is 48 hundredths. 48 ÷ 4 = 12, so each group has 12 hundredths = 0.12.$exp$,
            $note$Khan Academy: Divide decimals by whole numbers$note$, 'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order) VALUES
      (v_question_id, 'A', $body$0.12$body$, true, NULL, NULL, 1),
      (v_question_id, 'B', $body$1.2$body$, false, $msc$Divided 48 ÷ 4 = 12 but placed the decimal one column too far left.$msc$, 'decimal_place_value_misread', 2),
      (v_question_id, 'C', $body$12$body$, false, $msc$Ignored that the dividend was hundredths, keeping a whole-number quotient.$msc$, 'division_decimal_for_whole_units', 3),
      (v_question_id, 'D', $body$0.11$body$, false, $msc$Made an off-by-one error sharing the hundredths into 4 groups.$msc$, 'division_equal_groups_off_by_one', 4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$The bar shows 0.8 split into 4 equal parts. How much is each part?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$The bar shows 0.8 split into 4 equal parts. How much is each part?$stem$,
            $svg$<svg viewBox='0 0 320 70' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif'><g stroke='#555' fill='#dce6f5'><rect x='10' y='20' width='70' height='30'/><rect x='80' y='20' width='70' height='30'/><rect x='150' y='20' width='70' height='30'/><rect x='220' y='20' width='70' height='30'/></g><g font-size='11' fill='#555' text-anchor='middle'><text x='45' y='40'>?</text><text x='115' y='40'>?</text><text x='185' y='40'>?</text><text x='255' y='40'>?</text></g><text x='150' y='14' font-size='11' fill='#333' text-anchor='middle'>total = 0.8</text></svg>$svg$,
            $exp$0.8 is 8 tenths shared into 4 equal parts: 8 ÷ 4 = 2 tenths per part = 0.2.$exp$,
            $note$Khan Academy: Divide decimals by whole numbers visually$note$, 'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order) VALUES
      (v_question_id, 'A', $body$0.2$body$, true, NULL, NULL, 1),
      (v_question_id, 'B', $body$0.4$body$, false, $msc$Split into 2 parts instead of the 4 parts shown.$msc$, 'division_equal_groups_off_by_one', 2),
      (v_question_id, 'C', $body$2$body$, false, $msc$Computed 8 ÷ 4 but dropped the tenths place.$msc$, 'division_decimal_for_whole_units', 3),
      (v_question_id, 'D', $body$0.02$body$, false, $msc$Placed the quotient in hundredths instead of tenths.$msc$, 'decimal_place_value_misread', 4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Ava pours 0.9 liter of juice equally into 3 cups. How much juice is in each cup?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$Ava pours 0.9 liter of juice equally into 3 cups. How much juice is in each cup?$stem$, NULL,
            $exp$0.9 liter is 9 tenths. Share into 3 equal cups: 9 ÷ 3 = 3 tenths per cup = 0.3 liter.$exp$,
            $note$Khan Academy: Divide decimals by whole numbers$note$, 'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order) VALUES
      (v_question_id, 'A', $body$0.3 liter$body$, true, NULL, NULL, 1),
      (v_question_id, 'B', $body$3 liters$body$, false, $msc$Divided 9 ÷ 3 but ignored that the juice was 0.9, not 9.$msc$, 'division_decimal_for_whole_units', 2),
      (v_question_id, 'C', $body$0.6 liter$body$, false, $msc$Subtracted 3 tenths instead of dividing into 3 equal cups.$msc$, 'operation_swap_add_subtract', 3),
      (v_question_id, 'D', $body$2.7 liters$body$, false, $msc$Multiplied 0.9 by 3 instead of dividing.$msc$, 'division_used_wrong_inverse', 4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$What is 1.2 ÷ 4?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'hard',
            $stem$What is 1.2 ÷ 4?$stem$, NULL,
            $exp$1.2 is 12 tenths. 12 ÷ 4 = 3, so the quotient is 3 tenths = 0.3.$exp$,
            $note$Khan Academy: Divide decimals by whole numbers$note$, 'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order) VALUES
      (v_question_id, 'A', $body$0.3$body$, true, NULL, NULL, 1),
      (v_question_id, 'B', $body$3$body$, false, $msc$Computed 12 ÷ 4 = 3 but dropped the tenths place.$msc$, 'division_decimal_for_whole_units', 2),
      (v_question_id, 'C', $body$0.4$body$, false, $msc$Divided the whole-number 1 part separately and mishandled the tenths.$msc$, 'decimal_align_decimal_point', 3),
      (v_question_id, 'D', $body$0.03$body$, false, $msc$Shifted the quotient an extra place into hundredths.$msc$, 'decimal_place_value_misread', 4);
  END IF;
END
$mig$;
