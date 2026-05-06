-- Grade 5 math seed batch 01, part 02/10 — TEKS 5.3K, band 211_220.
-- Sub-skill (§17): decimal_subtract_hundredths.
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
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$What is 5.62 − 2.85?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '211_220', 'medium',
            $stem$What is 5.62 − 2.85?$stem$,
            NULL,
            $exp$Stack with decimal points aligned. Hundredths: 2 < 5, regroup from tenths: 12 − 5 = 7. Tenths now 5: 5 < 8, regroup from ones: 15 − 8 = 7. Ones: 4 − 2 = 2. Answer: 2.77.$exp$,
            $note$Khan Academy: Subtract decimals (hundredths)$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$2.77$body$, true, NULL, NULL, 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$3.23$body$, false, $msc$Subtracted the smaller digit from the larger digit in each column without regrouping (|2−5|=3, |6−8|=2, |5−2|=3).$msc$, 'regrouping_borrow_error', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$2.87$body$, false, $msc$Regrouped the hundredths but forgot to reduce the tenths from 6 to 5.$msc$, 'regrouping_borrow_error', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$8.47$body$, false, $msc$Added instead of subtracting.$msc$, 'operation_swap_add_subtract', 4);
  END IF;

  -- q2
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Imani has 4.0 meters of ribbon. She uses 1.65 meters for a project. How much ribbon does she have left?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '211_220', 'medium',
            $stem$Imani has 4.0 meters of ribbon. She uses 1.65 meters for a project. How much ribbon does she have left?$stem$,
            NULL,
            $exp$Rewrite 4.0 as 4.00 so the columns line up. 4.00 − 1.65: hundredths 0 < 5, borrow → 10 − 5 = 5; tenths now 9 (after the borrow chain), 9 − 6 = 3; ones 3 − 1 = 2. Answer: 2.35 m.$exp$,
            $note$Khan Academy: Adding & subtracting decimals word problems$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$3.45 m$body$, false, $msc$Subtracted 0.65 instead of 1.65, dropping the whole-number part.$msc$, 'decimal_place_value_misread', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$2.35 m$body$, true, NULL, NULL, 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$2.45 m$body$, false, $msc$Borrowed once from the ones to the tenths but didn't propagate the borrow chain back to hundredths.$msc$, 'regrouping_borrow_error', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$5.65 m$body$, false, $msc$Added instead of subtracting (more ribbon, not less).$msc$, 'operation_swap_add_subtract', 4);
  END IF;

  -- q3
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Diego is solving 7.04 − 3.27. He writes the problem with 7 above 3, 0 above 2, and 4 above 7, then subtracts column by column. What will go wrong?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '211_220', 'medium',
            $stem$Diego is solving 7.04 − 3.27. He writes the problem with 7 above 3, 0 above 2, and 4 above 7, then subtracts column by column. What will go wrong?$stem$,
            NULL,
            $exp$Diego aligned the digits on the right instead of aligning the decimal points. The 4 in 7.04 is in the hundredths column, but the 7 in 3.27 is also in the hundredths column — they DO line up correctly. The issue is that this is a regrouping problem (4 < 7 in hundredths), not an alignment one. Reading the question again: the digits ARE in the right columns (since both numbers have 2 decimal places). Diego's setup is correct; the error he WILL make next is a borrowing error.$exp$,
            $note$Khan Academy: Subtract decimals (hundredths)$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$His decimal points are not lined up.$body$, false, $msc$Assumed the alignment is wrong without checking that both numbers have 2 decimal places.$msc$, 'decimal_align_decimal_point', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$He will subtract 4 − 7 by getting 3 instead of borrowing.$body$, true, NULL, NULL, 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$He will read 7.04 as 70.4.$body$, false, $msc$Picked a place-value misread when the numbers were given clearly.$msc$, 'decimal_place_value_misread', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$He will add instead of subtract.$body$, false, $msc$Picked an operation error when the question described setting up subtraction correctly.$msc$, 'operation_swap_add_subtract', 4);
  END IF;

  -- q4
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Sofia walked 3.50 km. Hiroshi walked 2.78 km. How much farther did Sofia walk than Hiroshi?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '211_220', 'medium',
            $stem$Sofia walked 3.50 km. Hiroshi walked 2.78 km. How much farther did Sofia walk than Hiroshi?$stem$,
            NULL,
            $exp$3.50 − 2.78. Hundredths: 0 < 8, borrow → 10 − 8 = 2; tenths now 4, 4 < 7, borrow → 14 − 7 = 7; ones 2 − 2 = 0. Answer: 0.72 km.$exp$,
            $note$Khan Academy: Adding & subtracting decimals word problems$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$0.72 km$body$, true, NULL, NULL, 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$1.28 km$body$, false, $msc$Borrowed extra: subtracted as if from 4.00 instead of 3.50.$msc$, 'regrouping_borrow_error', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$1.32 km$body$, false, $msc$Subtracted smaller from larger in each column, no borrowing: |0−8|=8, |5−7|=2, |3−2|=1.$msc$, 'regrouping_borrow_error', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$6.28 km$body$, false, $msc$Added instead of subtracting.$msc$, 'operation_swap_add_subtract', 4);
  END IF;

  -- q5
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$A bag of flour weighs 2.35 kg. After Ava uses some, the bag weighs 1.46 kg. How much flour did Ava use?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '211_220', 'medium',
            $stem$A bag of flour weighs 2.35 kg. After Ava uses some, the bag weighs 1.46 kg. How much flour did Ava use?$stem$,
            NULL,
            $exp$Use - to find the change: 2.35 − 1.46. Hundredths: 5 < 6, borrow → 15 − 6 = 9; tenths now 2, 2 < 4, borrow → 12 − 4 = 8; ones 1 − 1 = 0. Answer: 0.89 kg.$exp$,
            $note$Khan Academy: Adding & subtracting decimals word problems$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$0.89 kg$body$, true, NULL, NULL, 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$1.11 kg$body$, false, $msc$Subtracted smaller from larger digit-by-digit without borrowing.$msc$, 'regrouping_borrow_error', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$3.81 kg$body$, false, $msc$Added instead of subtracting.$msc$, 'operation_swap_add_subtract', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$0.99 kg$body$, false, $msc$Borrowed in the hundredths but didn't reduce the tenths after the borrow.$msc$, 'regrouping_borrow_error', 4);
  END IF;

END $mig$;