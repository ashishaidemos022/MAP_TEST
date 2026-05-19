-- Grade 5 math seed (doc: Decimals — Rounding Decimals).
-- TEKS 5.2C "Round decimals to tenths or hundredths", band 201_210.
-- 5 questions × 4 choices. Idempotent (NOT EXISTS guard on stem + standard).

DO $mig$
DECLARE
  v_standard_id uuid;
  v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject = 'math' AND grade = 5 AND teks_code = '5.2C';
  IF v_standard_id IS NULL THEN
    RAISE EXCEPTION 'standard not found: math grade 5 teks 5.2C';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Round 3.47 to the nearest tenth.$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$Round 3.47 to the nearest tenth.$stem$, NULL,
            $exp$To round to the tenths place, look at the next digit (hundredths) = 7. Since 7 ≥ 5, round the tenths digit up: 4 becomes 5. So 3.47 rounds to 3.5.$exp$,
            $note$Khan Academy: Round decimals$note$, 'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order) VALUES
      (v_question_id, 'A', $body$3.5$body$, true, NULL, NULL, 1),
      (v_question_id, 'B', $body$3.4$body$, false, $msc$Dropped the hundredths digit instead of using it to round up.$msc$, 'rounding_wrong_place', 2),
      (v_question_id, 'C', $body$3.47$body$, false, $msc$Did not round at all; left the number unchanged.$msc$, 'estimation_didnt_round_first', 3),
      (v_question_id, 'D', $body$4$body$, false, $msc$Rounded to the nearest whole number instead of the nearest tenth.$msc$, 'rounding_wrong_place', 4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Round 0.953 to the nearest hundredth.$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$Round 0.953 to the nearest hundredth.$stem$, NULL,
            $exp$To round to hundredths, look at the thousandths digit = 3. Since 3 < 5, keep the hundredths digit the same and drop the rest: 0.953 rounds to 0.95.$exp$,
            $note$Khan Academy: Round decimals$note$, 'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order) VALUES
      (v_question_id, 'A', $body$0.95$body$, true, NULL, NULL, 1),
      (v_question_id, 'B', $body$0.96$body$, false, $msc$Rounded the hundredths up even though the thousandths digit 3 is less than 5.$msc$, 'rounding_wrong_place', 2),
      (v_question_id, 'C', $body$0.9$body$, false, $msc$Rounded to the nearest tenth instead of the nearest hundredth.$msc$, 'rounding_wrong_place', 3),
      (v_question_id, 'D', $body$1.0$body$, false, $msc$Rounded all the way to the nearest whole number.$msc$, 'rounding_wrong_place', 4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Round 12.96 to the nearest tenth.$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'hard',
            $stem$Round 12.96 to the nearest tenth.$stem$, NULL,
            $exp$Look at the hundredths digit = 6 ≥ 5, so round the tenths up. 9 tenths + 1 = 10 tenths, which carries: 12.9 becomes 13.0. So 12.96 rounds to 13.0.$exp$,
            $note$Khan Academy: Round decimals$note$, 'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order) VALUES
      (v_question_id, 'A', $body$13.0$body$, true, NULL, NULL, 1),
      (v_question_id, 'B', $body$12.9$body$, false, $msc$Rounded down instead of up when the hundredths digit was 6.$msc$, 'rounding_wrong_place', 2),
      (v_question_id, 'C', $body$12.10$body$, false, $msc$Wrote 9+1 as the digits "10" in the tenths place instead of carrying.$msc$, 'place_value_concatenated_digits', 3),
      (v_question_id, 'D', $body$13$body$, false, $msc$Rounded to the nearest whole number, not the nearest tenth.$msc$, 'rounding_wrong_place', 4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Liam measures his plant at 8.36 cm. For a chart he rounds it to the nearest tenth of a centimeter. What value does he record?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$Liam measures his plant at 8.36 cm. For a chart he rounds it to the nearest tenth of a centimeter. What value does he record?$stem$, NULL,
            $exp$Round 8.36 to tenths. The hundredths digit is 6 ≥ 5, so round the tenths digit 3 up to 4. He records 8.4 cm.$exp$,
            $note$Khan Academy: Decimal rounding word problems$note$, 'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order) VALUES
      (v_question_id, 'A', $body$8.4 cm$body$, true, NULL, NULL, 1),
      (v_question_id, 'B', $body$8.3 cm$body$, false, $msc$Dropped the 6 instead of using it to round the tenths up.$msc$, 'rounding_wrong_place', 2),
      (v_question_id, 'C', $body$8.0 cm$body$, false, $msc$Rounded to the nearest whole centimeter instead of the nearest tenth.$msc$, 'rounding_wrong_place', 3),
      (v_question_id, 'D', $body$9 cm$body$, false, $msc$Rounded up to the next whole number.$msc$, 'rounding_wrong_place', 4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Which number rounds to 5 when rounded to the nearest whole number?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'hard',
            $stem$Which number rounds to 5 when rounded to the nearest whole number?$stem$, NULL,
            $exp$A number rounds to 5 if it is at least 4.5 and less than 5.5. Check: 4.6 is in [4.5, 5.5) → rounds to 5. 4.4 → 4; 5.5 → 6; 5.51 → 6. Only 4.6 rounds to 5.$exp$,
            $note$Khan Academy: Round decimals$note$, 'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order) VALUES
      (v_question_id, 'A', $body$4.6$body$, true, NULL, NULL, 1),
      (v_question_id, 'B', $body$4.4$body$, false, $msc$Thought 4.4 rounds up to 5; it is below 4.5 so it rounds to 4.$msc$, 'rounding_wrong_place', 2),
      (v_question_id, 'C', $body$5.5$body$, false, $msc$Forgot that 5.5 rounds up to 6, not down to 5.$msc$, 'rounding_wrong_place', 3),
      (v_question_id, 'D', $body$5.51$body$, false, $msc$Ignored that 5.51 is past the halfway point and rounds to 6.$msc$, 'comparison_ordering_misread', 4);
  END IF;
END
$mig$;
