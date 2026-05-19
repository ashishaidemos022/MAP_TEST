-- Grade 5 math seed (doc: Decimals — Comparing & Ordering).
-- TEKS 5.2B "Compare and order decimals to the thousandths", band 211_220.
-- 5 questions × 4 choices. Idempotent (NOT EXISTS guard on stem + standard).

DO $mig$
DECLARE
  v_standard_id uuid;
  v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject = 'math' AND grade = 5 AND teks_code = '5.2B';
  IF v_standard_id IS NULL THEN
    RAISE EXCEPTION 'standard not found: math grade 5 teks 5.2B';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Which is greater, 0.7 or 0.65?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '211_220', 'medium',
            $stem$Which is greater, 0.7 or 0.65?$stem$, NULL,
            $exp$Line up place values: 0.7 is 0.70 = 70 hundredths; 0.65 is 65 hundredths. 70 hundredths > 65 hundredths, so 0.7 is greater.$exp$,
            $note$Khan Academy: Comparing decimals$note$, 'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order) VALUES
      (v_question_id, 'A', $body$0.7$body$, true, NULL, NULL, 1),
      (v_question_id, 'B', $body$0.65$body$, false, $msc$Thought the number with more digits is automatically larger.$msc$, 'comparison_ordering_misread', 2),
      (v_question_id, 'C', $body$They are equal.$body$, false, $msc$Ignored place value and treated 7 and 65 as the same size.$msc$, 'decimal_place_value_misread', 3),
      (v_question_id, 'D', $body$Cannot tell without more digits.$body$, false, $msc$Did not pad 0.7 to 0.70 to compare equal place values.$msc$, 'decimal_align_decimal_point', 4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Order these from least to greatest: 0.3, 0.31, 0.039.$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '211_220', 'hard',
            $stem$Order these from least to greatest: 0.3, 0.31, 0.039.$stem$, NULL,
            $exp$Write each to thousandths: 0.300, 0.310, 0.039. Compare: 39 < 300 < 310 thousandths, so least to greatest is 0.039, 0.3, 0.31.$exp$,
            $note$Khan Academy: Ordering decimals$note$, 'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order) VALUES
      (v_question_id, 'A', $body$0.039, 0.3, 0.31$body$, true, NULL, NULL, 1),
      (v_question_id, 'B', $body$0.3, 0.31, 0.039$body$, false, $msc$Ranked by how many digits each has instead of value.$msc$, 'comparison_ordering_misread', 2),
      (v_question_id, 'C', $body$0.039, 0.31, 0.3$body$, false, $msc$Compared 31 vs 3 as whole numbers without aligning places.$msc$, 'decimal_align_decimal_point', 3),
      (v_question_id, 'D', $body$0.3, 0.039, 0.31$body$, false, $msc$Read 0.039 as larger than 0.3 because it has more digits.$msc$, 'decimal_place_value_misread', 4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Which number is between 0.4 and 0.5?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '211_220', 'medium',
            $stem$Which number is between 0.4 and 0.5?$stem$, NULL,
            $exp$Between 0.4 (0.400) and 0.5 (0.500) means greater than 0.400 and less than 0.500. 0.45 = 0.450 fits. 0.405 also fits but is not offered; 0.45 is the only listed value in that range.$exp$,
            $note$Khan Academy: Comparing decimals$note$, 'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order) VALUES
      (v_question_id, 'A', $body$0.45$body$, true, NULL, NULL, 1),
      (v_question_id, 'B', $body$0.05$body$, false, $msc$Read 0.05 as "between" because the digit 5 sits between 4 and 5.$msc$, 'decimal_place_value_misread', 2),
      (v_question_id, 'C', $body$0.54$body$, false, $msc$Ignored that 0.54 is past 0.5, not before it.$msc$, 'comparison_ordering_misread', 3),
      (v_question_id, 'D', $body$0.4$body$, false, $msc$Chose a boundary value instead of one strictly between.$msc$, 'comparison_ordering_misread', 4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$How do 1.2 and 1.200 compare?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '211_220', 'medium',
            $stem$How do 1.2 and 1.200 compare?$stem$, NULL,
            $exp$Trailing zeros after the last nonzero decimal digit do not change value: 1.2 = 1.20 = 1.200 (one and two tenths). They are equal.$exp$,
            $note$Khan Academy: Comparing decimals$note$, 'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order) VALUES
      (v_question_id, 'A', $body$They are equal.$body$, true, NULL, NULL, 1),
      (v_question_id, 'B', $body$1.200 is greater.$body$, false, $msc$Thought more decimal digits make a number larger.$msc$, 'comparison_ordering_misread', 2),
      (v_question_id, 'C', $body$1.2 is greater.$body$, false, $msc$Thought a shorter decimal is the larger one.$msc$, 'comparison_ordering_misread', 3),
      (v_question_id, 'D', $body$1.200 is 1000 times 1.2.$body$, false, $msc$Treated the trailing zeros as extra place value.$msc$, 'decimal_place_value_misread', 4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Diego ran the 100 m in 12.08 seconds. Mei ran it in 12.8 seconds. Who was faster?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '211_220', 'hard',
            $stem$Diego ran the 100 m in 12.08 seconds. Mei ran it in 12.8 seconds. Who was faster?$stem$, NULL,
            $exp$Faster means the smaller time. Align places: 12.08 vs 12.80. The whole parts tie at 12; tenths: 0 < 8, so 12.08 < 12.80. Diego's time is smaller, so Diego was faster.$exp$,
            $note$Khan Academy: Compare decimals word problems$note$, 'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order) VALUES
      (v_question_id, 'A', $body$Diego$body$, true, NULL, NULL, 1),
      (v_question_id, 'B', $body$Mei$body$, false, $msc$Compared 08 vs 8 as whole numbers, thinking 12.08 was the larger/slower mistake reversed.$msc$, 'decimal_align_decimal_point', 2),
      (v_question_id, 'C', $body$They tied.$body$, false, $msc$Saw the same digits 1, 2, 8 and judged the times equal.$msc$, 'decimal_place_value_misread', 3),
      (v_question_id, 'D', $body$Mei, because larger time means faster.$body$, false, $msc$Reversed the meaning of faster — chose the bigger time.$msc$, 'comparison_ordering_misread', 4);
  END IF;
END
$mig$;
