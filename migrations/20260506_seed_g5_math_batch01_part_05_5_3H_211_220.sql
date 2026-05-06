-- Grade 5 math seed batch 01, part 05/10 — TEKS 5.3H, band 211_220.
-- Sub-skill (§17): frac_add_unlike_denom.
-- 5 questions × 4 choices. Idempotent (NOT EXISTS guard on stem + standard).

DO $mig$
DECLARE
  v_standard_id uuid;
  v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject = 'math' AND grade = 5 AND teks_code = '5.3H';
  IF v_standard_id IS NULL THEN
    RAISE EXCEPTION 'standard not found: math grade 5 teks 5.3H';
  END IF;

  -- q1
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Add: 1/2 + 1/3.$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '211_220', 'medium',
            $stem$Add: 1/2 + 1/3.$stem$,
            $svg$<svg viewBox='0 0 240 140' xmlns='http://www.w3.org/2000/svg'><g stroke='#333' stroke-width='1'><rect x='10' y='10' width='100' height='40' fill='white'/><rect x='10' y='10' width='50' height='40' fill='#4a90e2'/><line x1='60' y1='10' x2='60' y2='50'/><text x='40' y='75' font-family='sans-serif' font-size='14'>1/2</text><rect x='130' y='10' width='99' height='40' fill='white'/><rect x='130' y='10' width='33' height='40' fill='#f5a623'/><line x1='163' y1='10' x2='163' y2='50'/><line x1='196' y1='10' x2='196' y2='50'/><text x='165' y='75' font-family='sans-serif' font-size='14'>1/3</text><rect x='10' y='90' width='120' height='40' fill='white'/><rect x='10' y='90' width='60' height='40' fill='#4a90e2'/><rect x='70' y='90' width='40' height='40' fill='#f5a623'/><g stroke='#333' stroke-width='0.5'><line x1='30' y1='90' x2='30' y2='130'/><line x1='50' y1='90' x2='50' y2='130'/><line x1='70' y1='90' x2='70' y2='130'/><line x1='90' y1='90' x2='90' y2='130'/><line x1='110' y1='90' x2='110' y2='130'/></g><text x='30' y='150' font-family='sans-serif' font-size='14'>3/6 + 2/6 = 5/6</text></g></svg>$svg$,
            $exp$Find a common denominator. The LCM of 2 and 3 is 6. Rewrite: 1/2 = 3/6 and 1/3 = 2/6. Add the numerators: 3/6 + 2/6 = 5/6.$exp$,
            $note$Khan Academy: Add fractions with unlike denominators$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$2/5$body$, false, $msc$Added numerators and denominators directly: (1+1)/(2+3).$msc$, 'fraction_unlike_denominator_added_directly', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$5/6$body$, true, NULL, NULL, 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$1/6$body$, false, $msc$Multiplied the fractions instead of adding them.$msc$, 'operation_swap_add_subtract', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$5/12$body$, false, $msc$Multiplied denominators (2 × 3 = 6 wait — wrote 12) and added numerators.$msc$, 'fraction_unlike_denominator_added_directly', 4);
  END IF;

  -- q2
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Add: 2/5 + 1/4.$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '211_220', 'medium',
            $stem$Add: 2/5 + 1/4.$stem$,
            NULL,
            $exp$Common denominator of 5 and 4 is 20. Rewrite: 2/5 = 8/20 and 1/4 = 5/20. Add: 8/20 + 5/20 = 13/20.$exp$,
            $note$Khan Academy: Add fractions with unlike denominators$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$3/9$body$, false, $msc$Added numerators and denominators directly.$msc$, 'fraction_unlike_denominator_added_directly', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$13/20$body$, true, NULL, NULL, 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$3/20$body$, false, $msc$Used a common denominator of 20 but forgot to scale the numerators along with the denominators.$msc$, 'fraction_unlike_denominator_added_directly', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$3/5$body$, false, $msc$Treated 2/5 + 1/4 as 2/5 + 1/5 by switching the denominators.$msc$, 'fraction_compared_denominator_only', 4);
  END IF;

  -- q3
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Aarav ate 1/3 of a pizza. Imani ate 1/6 of the same pizza. What fraction of the pizza did they eat in all?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '211_220', 'medium',
            $stem$Aarav ate 1/3 of a pizza. Imani ate 1/6 of the same pizza. What fraction of the pizza did they eat in all?$stem$,
            NULL,
            $exp$Common denominator of 3 and 6 is 6. Rewrite: 1/3 = 2/6 and 1/6 = 1/6. Add: 2/6 + 1/6 = 3/6 = 1/2.$exp$,
            $note$Khan Academy: Add and subtract fractions word problems$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$1/2$body$, true, NULL, NULL, 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$2/9$body$, false, $msc$Added numerators and denominators directly.$msc$, 'fraction_unlike_denominator_added_directly', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$1/9$body$, false, $msc$Multiplied instead of adding.$msc$, 'operation_swap_add_subtract', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$1/6$body$, false, $msc$Picked the smaller fraction as the total.$msc$, 'fraction_compared_numerator_only', 4);
  END IF;

  -- q4
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Subtract: 3/4 − 1/3.$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '211_220', 'medium',
            $stem$Subtract: 3/4 − 1/3.$stem$,
            NULL,
            $exp$Common denominator of 4 and 3 is 12. Rewrite: 3/4 = 9/12 and 1/3 = 4/12. Subtract: 9/12 − 4/12 = 5/12.$exp$,
            $note$Khan Academy: Subtract fractions with unlike denominators$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$5/12$body$, true, NULL, NULL, 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$2/1$body$, false, $msc$Subtracted numerators and denominators directly: (3−1)/(4−3).$msc$, 'fraction_unlike_denominator_added_directly', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$2/12$body$, false, $msc$Used a common denominator of 12 but did not scale the numerators.$msc$, 'fraction_unlike_denominator_added_directly', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$13/12$body$, false, $msc$Added instead of subtracting.$msc$, 'operation_swap_add_subtract', 4);
  END IF;

  -- q5
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Theo has 5/8 of a cup of flour. He uses 1/4 of a cup. How much flour is left?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '211_220', 'medium',
            $stem$Theo has 5/8 of a cup of flour. He uses 1/4 of a cup. How much flour is left?$stem$,
            NULL,
            $exp$5/8 − 1/4. Common denominator 8. Rewrite 1/4 = 2/8. 5/8 − 2/8 = 3/8 cup.$exp$,
            $note$Khan Academy: Add and subtract fractions word problems$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$3/8 cup$body$, true, NULL, NULL, 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$4/4 cup$body$, false, $msc$Subtracted numerators and denominators separately.$msc$, 'fraction_unlike_denominator_added_directly', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$7/8 cup$body$, false, $msc$Added instead of subtracting.$msc$, 'operation_swap_add_subtract', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$1/8 cup$body$, false, $msc$Forgot to convert 1/4 to 2/8 before subtracting (subtracted 4 from 5).$msc$, 'fraction_unlike_denominator_added_directly', 4);
  END IF;

END $mig$;