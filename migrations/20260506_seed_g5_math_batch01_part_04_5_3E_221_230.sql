-- Grade 5 math seed batch 01, part 04/10 — TEKS 5.3E, band 221_230.
-- Sub-skill (§17): decimal_x_decimal_hundredths.
-- 5 questions × 4 choices. Idempotent (NOT EXISTS guard on stem + standard).

DO $mig$
DECLARE
  v_standard_id uuid;
  v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject = 'math' AND grade = 5 AND teks_code = '5.3E';
  IF v_standard_id IS NULL THEN
    RAISE EXCEPTION 'standard not found: math grade 5 teks 5.3E';
  END IF;

  -- q1
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$What is 0.4 × 0.3?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '221_230', 'hard',
            $stem$What is 0.4 × 0.3?$stem$,
            $svg$<svg viewBox='0 0 220 240' xmlns='http://www.w3.org/2000/svg'><g stroke='#333' stroke-width='1'><rect x='10' y='10' width='200' height='200' fill='white'/><rect x='10' y='10' width='80' height='200' fill='#cfe4ff'/><rect x='10' y='10' width='200' height='60' fill='#ffe4b3' opacity='0.7'/><rect x='10' y='10' width='80' height='60' fill='#a5d99c'/></g><g stroke='#333' stroke-width='1' fill='none'><line x1='10' y1='10' x2='10' y2='210'/><line x1='30' y1='10' x2='30' y2='210'/><line x1='50' y1='10' x2='50' y2='210'/><line x1='70' y1='10' x2='70' y2='210'/><line x1='90' y1='10' x2='90' y2='210'/><line x1='110' y1='10' x2='110' y2='210'/><line x1='130' y1='10' x2='130' y2='210'/><line x1='150' y1='10' x2='150' y2='210'/><line x1='170' y1='10' x2='170' y2='210'/><line x1='190' y1='10' x2='190' y2='210'/><line x1='210' y1='10' x2='210' y2='210'/><line x1='10' y1='10' x2='210' y2='10'/><line x1='10' y1='30' x2='210' y2='30'/><line x1='10' y1='50' x2='210' y2='50'/><line x1='10' y1='70' x2='210' y2='70'/><line x1='10' y1='90' x2='210' y2='90'/><line x1='10' y1='110' x2='210' y2='110'/><line x1='10' y1='130' x2='210' y2='130'/><line x1='10' y1='150' x2='210' y2='150'/><line x1='10' y1='170' x2='210' y2='170'/><line x1='10' y1='190' x2='210' y2='190'/><line x1='10' y1='210' x2='210' y2='210'/></g><text x='40' y='230' font-family='sans-serif' font-size='12'>green overlap = 0.4 × 0.3</text></svg>$svg$,
            $exp$0.4 of the grid is shaded vertically (4 columns out of 10). 0.3 is shaded horizontally (3 rows out of 10). The OVERLAP — the green area — is 4 × 3 = 12 small squares out of 100, which is 0.12.$exp$,
            $note$Khan Academy: Multiply decimals using grids and area models$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$0.12$body$, true, NULL, NULL, 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$1.2$body$, false, $msc$Multiplied 4 × 3 = 12 but counted only one decimal place in the product instead of two.$msc$, 'decimal_count_zeros_in_product', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$0.7$body$, false, $msc$Added the decimals (0.4 + 0.3) instead of multiplying.$msc$, 'operation_swap_add_subtract', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$0.012$body$, false, $msc$Counted three decimal places instead of two.$msc$, 'decimal_count_zeros_in_product', 4);
  END IF;

  -- q2
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Multiply: 1.5 × 0.6.$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '221_230', 'hard',
            $stem$Multiply: 1.5 × 0.6.$stem$,
            NULL,
            $exp$Compute 15 × 6 = 90. Total decimal places: 1 (in 1.5) + 1 (in 0.6) = 2. Place the decimal two from the right: 0.90 = 0.9.$exp$,
            $note$Khan Academy: Multiply decimals (tenths)$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$0.9$body$, true, NULL, NULL, 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$9.0$body$, false, $msc$Counted only one decimal place in the product.$msc$, 'decimal_count_zeros_in_product', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$2.1$body$, false, $msc$Added 1.5 + 0.6 instead of multiplying.$msc$, 'operation_swap_add_subtract', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$0.09$body$, false, $msc$Counted three decimal places instead of two.$msc$, 'decimal_count_zeros_in_product', 4);
  END IF;

  -- q3
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$What is 2.4 × 0.05?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '221_230', 'hard',
            $stem$What is 2.4 × 0.05?$stem$,
            NULL,
            $exp$Compute 24 × 5 = 120. Total decimal places: 1 + 2 = 3. Place the decimal three from the right: 0.120 = 0.12.$exp$,
            $note$Khan Academy: Multiply decimals (hundredths)$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$1.2$body$, false, $msc$Counted only two decimal places instead of three.$msc$, 'decimal_count_zeros_in_product', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$12.0$body$, false, $msc$Forgot to count the decimal places in the second factor.$msc$, 'decimal_count_zeros_in_product', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$0.12$body$, true, NULL, NULL, 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$0.012$body$, false, $msc$Counted four decimal places instead of three.$msc$, 'decimal_count_zeros_in_product', 4);
  END IF;

  -- q4
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Jamal walks at 0.8 km per hour. How far does he walk in 0.5 hours?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '221_230', 'hard',
            $stem$Jamal walks at 0.8 km per hour. How far does he walk in 0.5 hours?$stem$,
            NULL,
            $exp$Distance = rate × time = 0.8 × 0.5. Compute 8 × 5 = 40. Total decimal places: 1 + 1 = 2. Answer: 0.40 km = 0.4 km.$exp$,
            $note$Khan Academy: Multiply decimals word problems$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$0.4 km$body$, true, NULL, NULL, 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$1.3 km$body$, false, $msc$Added the rate and time instead of multiplying.$msc$, 'operation_swap_add_subtract', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$4.0 km$body$, false, $msc$Counted only one decimal place in the product.$msc$, 'decimal_count_zeros_in_product', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$0.04 km$body$, false, $msc$Counted three decimal places instead of two.$msc$, 'decimal_count_zeros_in_product', 4);
  END IF;

  -- q5
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Mei calculates 0.3 × 0.6 by writing '0.18' and explains: 'Three tenths times six tenths gives 18 hundredths.' Which choice best explains why she is correct?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '221_230', 'hard',
            $stem$Mei calculates 0.3 × 0.6 by writing '0.18' and explains: 'Three tenths times six tenths gives 18 hundredths.' Which choice best explains why she is correct?$stem$,
            NULL,
            $exp$Tenths × tenths = hundredths because 1/10 × 1/10 = 1/100. Three tenths × six tenths = (3 × 6) hundredths = 18 hundredths = 0.18.$exp$,
            $note$Khan Academy: Multiply decimals (tenths)$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$Tenths × tenths gives hundredths, and 3 × 6 = 18 hundredths.$body$, true, NULL, NULL, 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$Adding the decimal places gives one place, and 3 × 6 = 18.$body$, false, $msc$Counted decimal places by adding tenths' positions but forgot that places multiply (1+1=2, not 1).$msc$, 'decimal_count_zeros_in_product', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$She just multiplied 3 × 6 and put a zero in front.$body$, false, $msc$Identified a surface pattern but missed why the place value works.$msc$, 'decimal_count_zeros_in_product', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$Multiplying decimals always gives an answer smaller than 1.$body$, false, $msc$Made an over-generalization that fails for products like 1.5 × 0.6 = 0.9 or 2.5 × 1.2 = 3.0.$msc$, 'decimal_place_value_misread', 4);
  END IF;

END $mig$;