-- Grade 5 math seed batch 01, part 01/10 — TEKS 5.3K, band 201_210.
-- Sub-skill (§17): decimal_add_hundredths.
-- 5 questions × 4 choices. Idempotent (NOT EXISTS guard on stem + standard).

DO $mig$
DECLARE
  v_standard_id uuid;
  v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject = 'math' AND grade = 5 AND teks_code = '5.3K';
  IF v_standard_id IS NULL THEN
    RAISE EXCEPTION 'standard not found: math grade 5 teks 5.3K';
  END IF;

  -- q1
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Maya is shading a 10×10 grid to add 0.43 + 0.25. How many small squares should she shade in all?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$Maya is shading a 10×10 grid to add 0.43 + 0.25. How many small squares should she shade in all?$stem$,
            $svg$<svg viewBox='0 0 220 240' xmlns='http://www.w3.org/2000/svg'><g stroke='#333' stroke-width='1'><rect x='10' y='10' width='200' height='200' fill='white'/><g fill='#4a90e2'><rect x='10' y='10' width='20' height='20'/><rect x='30' y='10' width='20' height='20'/><rect x='50' y='10' width='20' height='20'/><rect x='70' y='10' width='20' height='20'/><rect x='90' y='10' width='20' height='20'/><rect x='110' y='10' width='20' height='20'/><rect x='130' y='10' width='20' height='20'/><rect x='150' y='10' width='20' height='20'/><rect x='170' y='10' width='20' height='20'/><rect x='190' y='10' width='20' height='20'/><rect x='10' y='30' width='20' height='20'/><rect x='30' y='30' width='20' height='20'/><rect x='50' y='30' width='20' height='20'/><rect x='70' y='30' width='20' height='20'/><rect x='90' y='30' width='20' height='20'/><rect x='110' y='30' width='20' height='20'/><rect x='130' y='30' width='20' height='20'/><rect x='150' y='30' width='20' height='20'/><rect x='170' y='30' width='20' height='20'/><rect x='190' y='30' width='20' height='20'/><rect x='10' y='50' width='20' height='20'/><rect x='30' y='50' width='20' height='20'/><rect x='50' y='50' width='20' height='20'/><rect x='70' y='50' width='20' height='20'/><rect x='90' y='50' width='20' height='20'/><rect x='110' y='50' width='20' height='20'/><rect x='130' y='50' width='20' height='20'/><rect x='150' y='50' width='20' height='20'/><rect x='170' y='50' width='20' height='20'/><rect x='190' y='50' width='20' height='20'/><rect x='10' y='70' width='20' height='20'/><rect x='30' y='70' width='20' height='20'/><rect x='50' y='70' width='20' height='20'/><rect x='70' y='70' width='20' height='20'/><rect x='90' y='70' width='20' height='20'/><rect x='110' y='70' width='20' height='20'/><rect x='130' y='70' width='20' height='20'/><rect x='150' y='70' width='20' height='20'/><rect x='170' y='70' width='20' height='20'/><rect x='190' y='70' width='20' height='20'/><rect x='10' y='90' width='20' height='20'/><rect x='30' y='90' width='20' height='20'/><rect x='50' y='90' width='20' height='20'/></g><g fill='#f5a623'><rect x='70' y='90' width='20' height='20'/><rect x='90' y='90' width='20' height='20'/><rect x='110' y='90' width='20' height='20'/><rect x='130' y='90' width='20' height='20'/><rect x='150' y='90' width='20' height='20'/><rect x='170' y='90' width='20' height='20'/><rect x='190' y='90' width='20' height='20'/><rect x='10' y='110' width='20' height='20'/><rect x='30' y='110' width='20' height='20'/><rect x='50' y='110' width='20' height='20'/><rect x='70' y='110' width='20' height='20'/><rect x='90' y='110' width='20' height='20'/><rect x='110' y='110' width='20' height='20'/><rect x='130' y='110' width='20' height='20'/><rect x='150' y='110' width='20' height='20'/><rect x='170' y='110' width='20' height='20'/><rect x='190' y='110' width='20' height='20'/><rect x='10' y='130' width='20' height='20'/><rect x='30' y='130' width='20' height='20'/><rect x='50' y='130' width='20' height='20'/><rect x='70' y='130' width='20' height='20'/><rect x='90' y='130' width='20' height='20'/><rect x='110' y='130' width='20' height='20'/><rect x='130' y='130' width='20' height='20'/><rect x='150' y='130' width='20' height='20'/></g><g/></g><g><line x1='10' y1='10' x2='10' y2='210'/><line x1='30' y1='10' x2='30' y2='210'/><line x1='50' y1='10' x2='50' y2='210'/><line x1='70' y1='10' x2='70' y2='210'/><line x1='90' y1='10' x2='90' y2='210'/><line x1='110' y1='10' x2='110' y2='210'/><line x1='130' y1='10' x2='130' y2='210'/><line x1='150' y1='10' x2='150' y2='210'/><line x1='170' y1='10' x2='170' y2='210'/><line x1='190' y1='10' x2='190' y2='210'/><line x1='210' y1='10' x2='210' y2='210'/><line x1='10' y1='10' x2='210' y2='10'/><line x1='10' y1='30' x2='210' y2='30'/><line x1='10' y1='50' x2='210' y2='50'/><line x1='10' y1='70' x2='210' y2='70'/><line x1='10' y1='90' x2='210' y2='90'/><line x1='10' y1='110' x2='210' y2='110'/><line x1='10' y1='130' x2='210' y2='130'/><line x1='10' y1='150' x2='210' y2='150'/><line x1='10' y1='170' x2='210' y2='170'/><line x1='10' y1='190' x2='210' y2='190'/><line x1='10' y1='210' x2='210' y2='210'/></g><text x='30' y='230' font-family='sans-serif' font-size='12' fill='#4a90e2'>blue = 0.43</text><text x='130' y='230' font-family='sans-serif' font-size='12' fill='#f5a623'>orange = 0.25</text></svg>$svg$,
            $exp$0.43 means 43 hundredths, so 43 squares are shaded blue. 0.25 means 25 hundredths, so 25 more squares are shaded orange. 43 + 25 = 68 squares shaded in total, representing 0.68.$exp$,
            $note$Khan Academy: Add decimals (hundredths)$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$58$body$, false, $msc$Added 4+1 = 5 in tens place but missed regrouping in ones, getting 5+8 = 58.$msc$, 'regrouping_forgot_carry', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$68$body$, true, NULL, NULL, 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$78$body$, false, $msc$Counted by tens instead of by hundredths and arrived at 78.$msc$, 'decimal_place_value_misread', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$118$body$, false, $msc$Counted the rows of 10 incorrectly and added an extra full row.$msc$, 'off_by_one_count', 4);
  END IF;

  -- q2
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$What is 2.37 + 1.85?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$What is 2.37 + 1.85?$stem$,
            NULL,
            $exp$Stack the decimals so the decimal points line up: 2.37 + 1.85. Add hundredths: 7 + 5 = 12, write 2 carry 1. Tenths: 1 + 3 + 8 = 12, write 2 carry 1. Ones: 1 + 2 + 1 = 4. Answer: 4.22.$exp$,
            $note$Khan Academy: Add decimals (hundredths)$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$3.12$body$, false, $msc$Right-aligned the digits instead of aligning decimal points (lined up 7 and 5, then 3 and 8, then 2 and 1).$msc$, 'decimal_align_decimal_point', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$4.12$body$, false, $msc$Forgot to carry the 1 from the hundredths column when adding tenths.$msc$, 'regrouping_forgot_carry', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$4.22$body$, true, NULL, NULL, 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$3.122$body$, false, $msc$Concatenated the digits without recognizing that 7 + 5 regroups to 12, treating the sum as a 3-decimal number.$msc$, 'place_value_concatenated_digits', 4);
  END IF;

  -- q3
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Selena ran 1.45 km on Monday and 0.86 km on Tuesday. How far did she run in all?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$Selena ran 1.45 km on Monday and 0.86 km on Tuesday. How far did she run in all?$stem$,
            NULL,
            $exp$Add 1.45 + 0.86. Hundredths: 5 + 6 = 11, write 1 carry 1. Tenths: 1 + 4 + 8 = 13, write 3 carry 1. Ones: 1 + 1 + 0 = 2. Total: 2.31 km.$exp$,
            $note$Khan Academy: Adding & subtracting decimals word problems$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$2.21 km$body$, false, $msc$Forgot to carry from hundredths into tenths.$msc$, 'regrouping_forgot_carry', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$2.31 km$body$, true, NULL, NULL, 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$1.131 km$body$, false, $msc$Right-aligned digits instead of aligning decimal points, producing a too-small answer.$msc$, 'decimal_align_decimal_point', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$0.59 km$body$, false, $msc$Subtracted instead of adding because of the words 'on Monday' and 'on Tuesday'.$msc$, 'operation_swap_add_subtract', 4);
  END IF;

  -- q4
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Ravi added 3.4 + 0.27 and got 0.61. What mistake did he make?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$Ravi added 3.4 + 0.27 and got 0.61. What mistake did he make?$stem$,
            NULL,
            $exp$Ravi right-aligned the digits as if they were whole numbers: he stacked 4 above 7 and 3 above 2, then placed the decimal randomly. The correct method aligns decimal points: 3.40 + 0.27 = 3.67.$exp$,
            $note$Khan Academy: Add decimals (hundredths)$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$He aligned the digits on the right instead of aligning the decimal points.$body$, true, NULL, NULL, 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$He multiplied instead of adding.$body$, false, $msc$Picked the wrong operation as the explanation.$msc$, 'operation_swap_add_subtract', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$He forgot to carry from the ones to the tens.$body$, false, $msc$Identified a regrouping error when the actual error was decimal alignment.$msc$, 'regrouping_forgot_carry', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$He used the wrong place values for the digit 4.$body$, false, $msc$Identified place-value misreading rather than the alignment error that produced the answer.$msc$, 'decimal_place_value_misread', 4);
  END IF;

  -- q5
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Theo bought a notebook for $2.45 and a pen for $1.30. How much did he spend in all?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$Theo bought a notebook for $2.45 and a pen for $1.30. How much did he spend in all?$stem$,
            NULL,
            $exp$Align the decimal points: 2.45 + 1.30. Hundredths: 5 + 0 = 5. Tenths: 4 + 3 = 7. Ones: 2 + 1 = 3. Total: $3.75.$exp$,
            $note$Khan Academy: Adding & subtracting decimals word problems$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$$3.75$body$, true, NULL, NULL, 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$$3.85$body$, false, $msc$Added 4 + 3 + 1 in the tenths column, mistakenly carrying from a 5+0 sum that doesn't carry.$msc$, 'regrouping_forgot_carry', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$$1.15$body$, false, $msc$Subtracted instead of adding because the second item was cheaper.$msc$, 'operation_swap_add_subtract', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$$3.07$body$, false, $msc$Right-aligned digits instead of decimal points.$msc$, 'decimal_align_decimal_point', 4);
  END IF;

END $mig$;