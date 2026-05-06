-- Grade 5 math seed batch 01, part 03/10 — TEKS 5.3D, band 211_220.
-- Sub-skill (§17): decimal_x_whole_visual.
-- 5 questions × 4 choices. Idempotent (NOT EXISTS guard on stem + standard).

DO $mig$
DECLARE
  v_standard_id uuid;
  v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject = 'math' AND grade = 5 AND teks_code = '5.3D';
  IF v_standard_id IS NULL THEN
    RAISE EXCEPTION 'standard not found: math grade 5 teks 5.3D';
  END IF;

  -- q1
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Liam multiplies 6 × 0.4 using a 10×10 grid where each row of 10 squares is one whole. How many squares should he shade?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '211_220', 'medium',
            $stem$Liam multiplies 6 × 0.4 using a 10×10 grid where each row of 10 squares is one whole. How many squares should he shade?$stem$,
            $svg$<svg viewBox='0 0 220 240' xmlns='http://www.w3.org/2000/svg'><g stroke='#333' stroke-width='1'><rect x='10' y='10' width='200' height='200' fill='white'/><g fill='#4a90e2'><rect x='10' y='10' width='20' height='20'/><rect x='30' y='10' width='20' height='20'/><rect x='50' y='10' width='20' height='20'/><rect x='70' y='10' width='20' height='20'/><rect x='10' y='30' width='20' height='20'/><rect x='30' y='30' width='20' height='20'/><rect x='50' y='30' width='20' height='20'/><rect x='70' y='30' width='20' height='20'/><rect x='10' y='50' width='20' height='20'/><rect x='30' y='50' width='20' height='20'/><rect x='50' y='50' width='20' height='20'/><rect x='70' y='50' width='20' height='20'/><rect x='10' y='70' width='20' height='20'/><rect x='30' y='70' width='20' height='20'/><rect x='50' y='70' width='20' height='20'/><rect x='70' y='70' width='20' height='20'/><rect x='10' y='90' width='20' height='20'/><rect x='30' y='90' width='20' height='20'/><rect x='50' y='90' width='20' height='20'/><rect x='70' y='90' width='20' height='20'/><rect x='10' y='110' width='20' height='20'/><rect x='30' y='110' width='20' height='20'/><rect x='50' y='110' width='20' height='20'/><rect x='70' y='110' width='20' height='20'/></g></g><g stroke='#333' stroke-width='1' fill='none'><line x1='10' y1='10' x2='10' y2='210'/><line x1='30' y1='10' x2='30' y2='210'/><line x1='50' y1='10' x2='50' y2='210'/><line x1='70' y1='10' x2='70' y2='210'/><line x1='90' y1='10' x2='90' y2='210'/><line x1='110' y1='10' x2='110' y2='210'/><line x1='130' y1='10' x2='130' y2='210'/><line x1='150' y1='10' x2='150' y2='210'/><line x1='170' y1='10' x2='170' y2='210'/><line x1='190' y1='10' x2='190' y2='210'/><line x1='210' y1='10' x2='210' y2='210'/><line x1='10' y1='10' x2='210' y2='10'/><line x1='10' y1='30' x2='210' y2='30'/><line x1='10' y1='50' x2='210' y2='50'/><line x1='10' y1='70' x2='210' y2='70'/><line x1='10' y1='90' x2='210' y2='90'/><line x1='10' y1='110' x2='210' y2='110'/><line x1='10' y1='130' x2='210' y2='130'/><line x1='10' y1='150' x2='210' y2='150'/><line x1='10' y1='170' x2='210' y2='170'/><line x1='10' y1='190' x2='210' y2='190'/><line x1='10' y1='210' x2='210' y2='210'/></g><text x='40' y='235' font-family='sans-serif' font-size='12'>blue = first 4 columns of 6 rows</text></svg>$svg$,
            $exp$Each row of 10 squares represents 1 whole. Each row of 4 shaded squares represents 0.4 (4 tenths). Six rows are shaded, each with 4 squares: 6 × 0.4 = 2.4. Total shaded squares: 24.$exp$,
            $note$Khan Academy: Multiply decimals × whole visually$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$24 squares (= 2.4)$body$, true, NULL, NULL, 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$60 squares (= 6.0)$body$, false, $msc$Shaded full rows for each whole number 6, missing that 0.4 means partial rows.$msc$, 'decimal_place_value_misread', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$10 squares (= 1.0)$body$, false, $msc$Shaded one row of 10 because 0.4 + 6 looks like 'about 1'.$msc$, 'decimal_count_zeros_in_product', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$240 squares (= 24.0)$body$, false, $msc$Multiplied 6 × 4 = 24 but treated each square as 1 whole instead of 1 hundredth.$msc$, 'decimal_place_value_misread', 4);
  END IF;

  -- q2
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$What is 8 × 0.7?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '211_220', 'medium',
            $stem$What is 8 × 0.7?$stem$,
            NULL,
            $exp$8 × 7 = 56. There is one decimal place in 0.7, so place the decimal one place from the right in the product: 5.6.$exp$,
            $note$Khan Academy: Multiply decimals (tenths)$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$0.56$body$, false, $msc$Counted decimal places by adding the digits' position rather than the count of decimal places, placing the decimal too far left.$msc$, 'decimal_count_zeros_in_product', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$5.6$body$, true, NULL, NULL, 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$56$body$, false, $msc$Forgot to place the decimal point in the product.$msc$, 'decimal_count_zeros_in_product', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$8.7$body$, false, $msc$Added 8 + 0.7 instead of multiplying.$msc$, 'operation_swap_add_subtract', 4);
  END IF;

  -- q3
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Caleb buys 5 packs of stickers. Each pack costs $1.25. How much does Caleb spend?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '211_220', 'medium',
            $stem$Caleb buys 5 packs of stickers. Each pack costs $1.25. How much does Caleb spend?$stem$,
            NULL,
            $exp$5 × 1.25. Compute 5 × 125 = 625. There are 2 decimal places in 1.25, so place the decimal 2 from the right: 6.25. Total: $6.25.$exp$,
            $note$Khan Academy: Decimal × whole number word problems$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$$5.25$body$, false, $msc$Treated the 5 as a single addition (5 + 1.25 ≈ 6.25 then dropped the wrong digit).$msc$, 'operation_swap_add_subtract', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$$6.25$body$, true, NULL, NULL, 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$$0.625$body$, false, $msc$Counted total decimal places including a phantom one from the whole number 5.$msc$, 'decimal_count_zeros_in_product', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$$62.50$body$, false, $msc$Forgot to place the decimal correctly: computed 5 × 125 and shifted only one place.$msc$, 'decimal_count_zeros_in_product', 4);
  END IF;

  -- q4
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Multiply: 12 × 0.05.$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '211_220', 'medium',
            $stem$Multiply: 12 × 0.05.$stem$,
            NULL,
            $exp$12 × 5 = 60. There are 2 decimal places in 0.05, so the product has 2 decimal places: 0.60 (which equals 0.6).$exp$,
            $note$Khan Academy: Multiply whole numbers by 0.1 and 0.01$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$6.0$body$, false, $msc$Counted only one decimal place in 0.05 instead of two.$msc$, 'decimal_count_zeros_in_product', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$0.6$body$, true, NULL, NULL, 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$0.06$body$, false, $msc$Treated 12 × 0.05 like 12 × 0.005 (counted three decimal places).$msc$, 'decimal_count_zeros_in_product', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$60$body$, false, $msc$Forgot the decimal point entirely.$msc$, 'decimal_count_zeros_in_product', 4);
  END IF;

  -- q5
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Noor reads that her water bottle holds 0.6 L. She fills it 4 times to water her plants. How much water did she use in all?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '211_220', 'medium',
            $stem$Noor reads that her water bottle holds 0.6 L. She fills it 4 times to water her plants. How much water did she use in all?$stem$,
            NULL,
            $exp$4 × 0.6. Compute 4 × 6 = 24. Place one decimal place: 2.4. Noor used 2.4 L in all.$exp$,
            $note$Khan Academy: Decimal × whole number word problems$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$2.4 L$body$, true, NULL, NULL, 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$0.24 L$body$, false, $msc$Counted two decimal places when 0.6 has only one.$msc$, 'decimal_count_zeros_in_product', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$24 L$body$, false, $msc$Forgot to include the decimal point in the product.$msc$, 'decimal_count_zeros_in_product', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$4.6 L$body$, false, $msc$Added 4 + 0.6 instead of multiplying.$msc$, 'operation_swap_add_subtract', 4);
  END IF;

END $mig$;