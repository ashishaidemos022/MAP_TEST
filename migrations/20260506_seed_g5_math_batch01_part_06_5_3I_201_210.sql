-- Grade 5 math seed batch 01, part 06/10 — TEKS 5.3I, band 201_210.
-- Sub-skill (§17): frac_x_whole_models.
-- 5 questions × 4 choices. Idempotent (NOT EXISTS guard on stem + standard).

DO $mig$
DECLARE
  v_standard_id uuid;
  v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject = 'math' AND grade = 5 AND teks_code = '5.3I';
  IF v_standard_id IS NULL THEN
    RAISE EXCEPTION 'standard not found: math grade 5 teks 5.3I';
  END IF;

  -- q1
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$What is 4 × 1/3?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$What is 4 × 1/3?$stem$,
            $svg$<svg viewBox='0 0 280 100' xmlns='http://www.w3.org/2000/svg'><g stroke='#333' stroke-width='1'><rect x='10' y='10' width='60' height='40' fill='white'/><rect x='10' y='10' width='20' height='40' fill='#4a90e2'/><line x1='30' y1='10' x2='30' y2='50'/><line x1='50' y1='10' x2='50' y2='50'/><rect x='80' y='10' width='60' height='40' fill='white'/><rect x='80' y='10' width='20' height='40' fill='#4a90e2'/><line x1='100' y1='10' x2='100' y2='50'/><line x1='120' y1='10' x2='120' y2='50'/><rect x='150' y='10' width='60' height='40' fill='white'/><rect x='150' y='10' width='20' height='40' fill='#4a90e2'/><line x1='170' y1='10' x2='170' y2='50'/><line x1='190' y1='10' x2='190' y2='50'/><rect x='220' y='10' width='60' height='40' fill='white'/><rect x='220' y='10' width='20' height='40' fill='#4a90e2'/><line x1='240' y1='10' x2='240' y2='50'/><line x1='260' y1='10' x2='260' y2='50'/></g><text x='40' y='75' font-family='sans-serif' font-size='12'>1/3 + 1/3 + 1/3 + 1/3 = 4/3</text></svg>$svg$,
            $exp$Multiplying a whole number by a fraction means making that many copies. 4 × 1/3 = 1/3 + 1/3 + 1/3 + 1/3 = 4/3 (or 1 1/3).$exp$,
            $note$Khan Academy: Multiply fractions and whole numbers using fraction models$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$4/12$body$, false, $msc$Multiplied numerator AND denominator by 4 instead of just the numerator.$msc$, 'fraction_part_whole_swap', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$4/3$body$, true, NULL, NULL, 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$1/12$body$, false, $msc$Multiplied 4 in the denominator (treated 4 as 1/4 then multiplied 1/4 × 1/3 = 1/12).$msc$, 'fraction_part_whole_swap', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$4 1/3$body$, false, $msc$Added 4 + 1/3 instead of multiplying.$msc$, 'operation_swap_add_subtract', 4);
  END IF;

  -- q2
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Multiply: 6 × 2/5.$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$Multiply: 6 × 2/5.$stem$,
            NULL,
            $exp$Multiply the whole number by the numerator: 6 × 2 = 12. Keep the denominator: 12/5 (or 2 2/5).$exp$,
            $note$Khan Academy: Multiply fractions and whole numbers$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$12/5$body$, true, NULL, NULL, 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$12/30$body$, false, $msc$Multiplied both numerator AND denominator by 6.$msc$, 'fraction_part_whole_swap', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$8/5$body$, false, $msc$Added 6 + 2 in the numerator instead of multiplying.$msc$, 'operation_swap_add_subtract', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$2/30$body$, false, $msc$Multiplied 6 in the denominator instead of the numerator.$msc$, 'fraction_part_whole_swap', 4);
  END IF;

  -- q3
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Diego pours 3/4 of a cup of juice for each of 5 friends. How much juice does he pour in all?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$Diego pours 3/4 of a cup of juice for each of 5 friends. How much juice does he pour in all?$stem$,
            NULL,
            $exp$5 × 3/4 = 15/4. As a mixed number: 15 ÷ 4 = 3 with remainder 3, so 15/4 = 3 3/4 cups.$exp$,
            $note$Khan Academy: Multiply fractions and whole numbers$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$8/4 cups$body$, false, $msc$Added 5 + 3 in the numerator instead of multiplying.$msc$, 'operation_swap_add_subtract', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$15/20 cups$body$, false, $msc$Multiplied both the numerator AND the denominator by 5.$msc$, 'fraction_part_whole_swap', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$3 3/4 cups$body$, true, NULL, NULL, 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$3/20 cups$body$, false, $msc$Treated the 5 as 1/5 and multiplied 1/5 × 3/4 = 3/20.$msc$, 'fraction_part_whole_swap', 4);
  END IF;

  -- q4
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Find 3 × 5/8.$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$Find 3 × 5/8.$stem$,
            NULL,
            $exp$Multiply numerator by the whole number: 3 × 5 = 15. Keep the denominator: 15/8 (or 1 7/8).$exp$,
            $note$Khan Academy: Multiply fractions and whole numbers$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$15/8$body$, true, NULL, NULL, 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$5/24$body$, false, $msc$Multiplied 3 in the denominator instead of the numerator.$msc$, 'fraction_part_whole_swap', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$8/8$body$, false, $msc$Added 3 + 5 in the numerator.$msc$, 'operation_swap_add_subtract', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$15/24$body$, false, $msc$Multiplied both numerator and denominator by 3.$msc$, 'fraction_part_whole_swap', 4);
  END IF;

  -- q5
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Sofia wants 7 servings of yogurt. Each serving uses 1/4 of a cup. How much yogurt does she need in total?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$Sofia wants 7 servings of yogurt. Each serving uses 1/4 of a cup. How much yogurt does she need in total?$stem$,
            NULL,
            $exp$7 × 1/4 = 7/4 cups. As a mixed number: 7 ÷ 4 = 1 with remainder 3, so 7/4 = 1 3/4 cups.$exp$,
            $note$Khan Academy: Multiply fractions and whole numbers$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$1 3/4 cups$body$, true, NULL, NULL, 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$7 1/4 cups$body$, false, $msc$Added 7 + 1/4 instead of multiplying.$msc$, 'operation_swap_add_subtract', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$7/28 cups$body$, false, $msc$Multiplied both numerator and denominator by 7.$msc$, 'fraction_part_whole_swap', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$1/28 cups$body$, false, $msc$Treated the 7 as 1/7 and multiplied 1/7 × 1/4.$msc$, 'fraction_part_whole_swap', 4);
  END IF;

END $mig$;