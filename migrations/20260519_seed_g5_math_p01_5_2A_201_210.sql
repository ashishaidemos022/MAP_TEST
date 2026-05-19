-- Grade 5 math seed (doc: "5th Grade Math Units" — Decimals: Place Value & Understanding).
-- TEKS 5.2A "Place value to the billions and decimals to the thousandths", band 201_210.
-- 5 questions × 4 choices. Idempotent (NOT EXISTS guard on stem + standard).

DO $mig$
DECLARE
  v_standard_id uuid;
  v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject = 'math' AND grade = 5 AND teks_code = '5.2A';
  IF v_standard_id IS NULL THEN
    RAISE EXCEPTION 'standard not found: math grade 5 teks 5.2A';
  END IF;

  -- q1
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$In the number 47.382, what is the value of the digit 8?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$In the number 47.382, what is the value of the digit 8?$stem$,
            NULL,
            $exp$Reading places after the decimal point: 3 is in the tenths place, 8 is in the hundredths place, and 2 is in the thousandths place. The 8 sits in the hundredths place, so its value is 8 hundredths = 0.08.$exp$,
            $note$Khan Academy: Decimal place value$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order) VALUES
      (v_question_id, 'A', $body$0.8$body$, false, $msc$Read the 8 as if it were in the tenths place — one column too far left.$msc$, 'place_value_misread_column', 1),
      (v_question_id, 'B', $body$0.08$body$, true, NULL, NULL, 2),
      (v_question_id, 'C', $body$8$body$, false, $msc$Ignored the decimal point and used the digit's face value.$msc$, 'decimal_place_value_misread', 3),
      (v_question_id, 'D', $body$0.008$body$, false, $msc$Counted one place too far, landing on thousandths instead of hundredths.$msc$, 'place_value_misread_column', 4);
  END IF;

  -- q2
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Priya builds a number with 5 in the tens place, 9 in the tenths place, and 4 in the hundredths place. Every other place is 0. What number did she build?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$Priya builds a number with 5 in the tens place, 9 in the tenths place, and 4 in the hundredths place. Every other place is 0. What number did she build?$stem$,
            $svg$<svg viewBox='0 0 360 90' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif'><g fill='none' stroke='#555'><rect x='10' y='25' width='50' height='34'/><rect x='60' y='25' width='50' height='34'/><line x1='118' y1='25' x2='118' y2='59'/><rect x='126' y='25' width='50' height='34'/><rect x='176' y='25' width='50' height='34'/><rect x='226' y='25' width='50' height='34'/></g><g font-size='10' fill='#555' text-anchor='middle'><text x='35' y='18'>tens</text><text x='85' y='18'>ones</text><text x='151' y='18'>tenths</text><text x='201' y='18'>hund.</text><text x='251' y='18'>thous.</text></g><text x='122' y='52' font-size='22' fill='#333'>.</text><g font-size='10' fill='#999' text-anchor='middle'><text x='35' y='75'>?</text><text x='85' y='75'>?</text><text x='151' y='75'>?</text><text x='201' y='75'>?</text><text x='251' y='75'>?</text></g></svg>$svg$,
            $exp$Tens = 5 and ones = 0, so the whole-number part is 50. Tenths = 9 and hundredths = 4, so the decimal part is .94. Putting them together: 50.94.$exp$,
            $note$Khan Academy: Decimal place value$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order) VALUES
      (v_question_id, 'A', $body$50.94$body$, true, NULL, NULL, 1),
      (v_question_id, 'B', $body$5.94$body$, false, $msc$Put the 5 in the ones place instead of the tens place.$msc$, 'place_value_misread_column', 2),
      (v_question_id, 'C', $body$50.094$body$, false, $msc$Shifted the decimal digits one place right, putting 9 in tenths-of-tenths.$msc$, 'decimal_place_value_misread', 3),
      (v_question_id, 'D', $body$59.4$body$, false, $msc$Strung the digits together (5, 9, 4) ignoring which place each belongs in.$msc$, 'place_value_concatenated_digits', 4);
  END IF;

  -- q3
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$In 6.205, the digit 5 stands for how much?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$In 6.205, the digit 5 stands for how much?$stem$,
            NULL,
            $exp$After the decimal point: 2 is tenths, 0 is hundredths, 5 is thousandths. The 5 is in the thousandths place, so it stands for 5 thousandths = 0.005.$exp$,
            $note$Khan Academy: Decimal place value$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order) VALUES
      (v_question_id, 'A', $body$0.005$body$, true, NULL, NULL, 1),
      (v_question_id, 'B', $body$0.05$body$, false, $msc$Read the 5 as hundredths, one place short of thousandths.$msc$, 'place_value_misread_column', 2),
      (v_question_id, 'C', $body$5$body$, false, $msc$Used the digit's face value and ignored its decimal place.$msc$, 'decimal_place_value_misread', 3),
      (v_question_id, 'D', $body$0.5$body$, false, $msc$Read the 5 as tenths, ignoring the 0 in the hundredths place.$msc$, 'place_value_misread_column', 4);
  END IF;

  -- q4
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Which number is the same as 30 + 0.7 + 0.06?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$Which number is the same as 30 + 0.7 + 0.06?$stem$,
            NULL,
            $exp$30 fills the tens place. 0.7 is 7 tenths. 0.06 is 6 hundredths. Place each into its column: tens 3, ones 0, tenths 7, hundredths 6 → 30.76.$exp$,
            $note$Khan Academy: Decimals in expanded form$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order) VALUES
      (v_question_id, 'A', $body$30.76$body$, true, NULL, NULL, 1),
      (v_question_id, 'B', $body$30.706$body$, false, $msc$Placed 0.06 in the thousandths place instead of hundredths.$msc$, 'decimal_place_value_misread', 2),
      (v_question_id, 'C', $body$3.76$body$, false, $msc$Treated 30 as 3, dropping a whole-number place.$msc$, 'place_value_misread_column', 3),
      (v_question_id, 'D', $body$37.6$body$, false, $msc$Concatenated 3, 7, 6 without honoring each place value.$msc$, 'place_value_concatenated_digits', 4);
  END IF;

  -- q5
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$In 8.444, how does the value of the 4 in the tenths place compare to the value of the 4 in the hundredths place?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'hard',
            $stem$In 8.444, how does the value of the 4 in the tenths place compare to the value of the 4 in the hundredths place?$stem$,
            NULL,
            $exp$The tenths 4 is worth 0.4; the hundredths 4 is worth 0.04. Each place to the left is 10 times the place to its right, and 0.4 ÷ 0.04 = 10. So the tenths 4 is 10 times as large.$exp$,
            $note$Khan Academy: Decimal place value$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order) VALUES
      (v_question_id, 'A', $body$It is 10 times as large.$body$, true, NULL, NULL, 1),
      (v_question_id, 'B', $body$It is the same value.$body$, false, $msc$Assumed equal digits mean equal value, ignoring place.$msc$, 'decimal_place_value_misread', 2),
      (v_question_id, 'C', $body$It is 100 times as large.$body$, false, $msc$Skipped a place, using 100 instead of 10 between adjacent columns.$msc$, 'place_value_misread_column', 3),
      (v_question_id, 'D', $body$It is one-tenth as large.$body$, false, $msc$Reversed the comparison direction between the two places.$msc$, 'comparison_ordering_misread', 4);
  END IF;
END
$mig$;
