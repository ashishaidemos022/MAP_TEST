-- Grade 5 math seed batch 01, part 08/10 — TEKS 5.4F, band 191_200.
-- Sub-skill (§17): eval_expressions_with_parentheses.
-- 5 questions × 4 choices. Idempotent (NOT EXISTS guard on stem + standard).

DO $mig$
DECLARE
  v_standard_id uuid;
  v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject = 'math' AND grade = 5 AND teks_code = '5.4F';
  IF v_standard_id IS NULL THEN
    RAISE EXCEPTION 'standard not found: math grade 5 teks 5.4F';
  END IF;

  -- q1
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Evaluate: (6 + 4) × 2.$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '191_200', 'easy',
            $stem$Evaluate: (6 + 4) × 2.$stem$,
            NULL,
            $exp$Parentheses first: 6 + 4 = 10. Then multiply: 10 × 2 = 20.$exp$,
            $note$Khan Academy: Evaluate expressions with parentheses$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$12$body$, false, $msc$Computed left to right ignoring parentheses: 6 + 4 × 2 read as 6 + 8 = 14, then dropped to 12 by mis-arithmetic.$msc$, 'order_of_operations_left_to_right', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$14$body$, false, $msc$Ignored the parentheses and applied PEMDAS to 6 + 4 × 2.$msc$, 'order_of_operations_left_to_right', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$20$body$, true, NULL, NULL, 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$24$body$, false, $msc$Multiplied 6 × 4 and added 2 (no parentheses respect).$msc$, 'order_of_operations_left_to_right', 4);
  END IF;

  -- q2
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$What is 18 − (3 × 4)?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '191_200', 'easy',
            $stem$What is 18 − (3 × 4)?$stem$,
            NULL,
            $exp$Parentheses first: 3 × 4 = 12. Then subtract: 18 − 12 = 6.$exp$,
            $note$Khan Academy: Evaluate expressions with parentheses$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$60$body$, false, $msc$Subtracted left to right: 18 − 3 = 15, then × 4 = 60.$msc$, 'order_of_operations_left_to_right', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$6$body$, true, NULL, NULL, 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$9$body$, false, $msc$Computed 3 × 4 = 12, then 18 − 12 incorrectly as 9.$msc$, 'regrouping_borrow_error', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$29$body$, false, $msc$Added the second number instead of subtracting after computing the parentheses.$msc$, 'operation_swap_add_subtract', 4);
  END IF;

  -- q3
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Evaluate: (12 ÷ 3) + 5.$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '191_200', 'easy',
            $stem$Evaluate: (12 ÷ 3) + 5.$stem$,
            NULL,
            $exp$Parentheses first: 12 ÷ 3 = 4. Then add: 4 + 5 = 9.$exp$,
            $note$Khan Academy: Evaluate expressions with parentheses$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$9$body$, true, NULL, NULL, 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$12 ÷ 8 = 1.5$body$, false, $msc$Treated the 5 as part of the divisor: computed 12 ÷ (3 + 5).$msc$, 'order_of_operations_left_to_right', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$20$body$, false, $msc$Multiplied instead of divided in the parentheses, then added.$msc$, 'operation_swap_add_subtract', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$1.5$body$, false, $msc$Divided 12 by (3 + 5) by ignoring the explicit parentheses.$msc$, 'order_of_operations_left_to_right', 4);
  END IF;

  -- q4
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Evaluate: 2 × (5 + 3).$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '191_200', 'easy',
            $stem$Evaluate: 2 × (5 + 3).$stem$,
            NULL,
            $exp$Parentheses first: 5 + 3 = 8. Then multiply: 2 × 8 = 16.$exp$,
            $note$Khan Academy: Evaluate expressions with parentheses$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$10$body$, false, $msc$Multiplied 2 × 5 = 10 first and stopped (did not add the 3).$msc$, 'order_of_operations_left_to_right', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$13$body$, false, $msc$Multiplied 2 × 5 = 10 and added 3.$msc$, 'order_of_operations_left_to_right', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$16$body$, true, NULL, NULL, 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$11$body$, false, $msc$Added all three numbers (2 + 5 + 3 + 1).$msc$, 'operation_swap_add_subtract', 4);
  END IF;

  -- q5
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Which expression has a value of 30?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '191_200', 'easy',
            $stem$Which expression has a value of 30?$stem$,
            NULL,
            $exp$(2 + 4) × 5 = 6 × 5 = 30. Test the others: 2 + (4 × 5) = 22. (2 × 4) + 5 = 13. 2 + 4 × 5 = 22. Only (2 + 4) × 5 equals 30.$exp$,
            $note$Khan Academy: Evaluate expressions with parentheses$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$2 + (4 × 5)$body$, false, $msc$Confused the parentheses placement (this evaluates to 22).$msc$, 'order_of_operations_left_to_right', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$(2 + 4) × 5$body$, true, NULL, NULL, 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$(2 × 4) + 5$body$, false, $msc$Picked an expression equal to 13.$msc$, 'order_of_operations_left_to_right', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$2 + 4 × 5$body$, false, $msc$Ignored that no parentheses means multiplication first (= 22).$msc$, 'order_of_operations_left_to_right', 4);
  END IF;

END $mig$;