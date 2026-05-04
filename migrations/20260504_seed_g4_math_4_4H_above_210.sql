-- Seed batch: Grade 4 math, TEKS 4.4H (one- and two-step × ÷ problems), band above_210.
-- 5 questions × 4 choices, plus 4 new misconception tags they introduce.
--
-- Origin: scripts/grade4-author-prompt.mjs --subject math --teks 4.4H --band above_210
-- Already applied 2026-05-04 via tmp/seed-g4-math-4.4H-above_210.mjs (service-role direct insert).
-- This file exists for audit / replay parity with migration history.
--
-- Idempotency: ON CONFLICT DO NOTHING on tags (unique tag), and stem-text uniqueness check
-- on questions (no DB constraint enforces it — duplicates would reflect a re-run, not a bug).

DO $mig$
DECLARE
  v_standard_id uuid;
  v_question_id uuid;
BEGIN
  -- ---- 4 new misconception tags (skip if a prior run already inserted them) ----

  INSERT INTO public.map_misconception_tags
    (tag, subject, display_name, description, remediation_hint, related_teks, child_cta)
  VALUES
    ('division_remainder_dropped', 'math',
     'Dropped the remainder when context required rounding up',
     'Returned the integer quotient and ignored the remainder, in a context where the remainder still has to be accommodated (e.g., needing 33 buses for 32 full + 1 partial).',
     'Ask: what does the remainder mean here? If anything is left over and still has to be handled, you need one more group.',
     ARRAY['4.4F','4.4H'],
     'If anything is left over, you need one more bus / box / group.'),
    ('division_decimal_for_whole_units', 'math',
     'Gave a decimal answer when only whole units make sense',
     'Continued the division to a decimal (e.g., 32.25 buses) when the unit being counted can only be a whole number.',
     'Check what you are counting. Buses, boxes, kids, and jars are always whole. Stop dividing at the integer answer + remainder.',
     ARRAY['4.4F','4.4H'],
     'You can''t have half a bus. Use whole numbers for whole things.'),
    ('division_assumed_no_remainder', 'math',
     'Assumed the division was exact (zero remainder)',
     'Wrote the answer as 0 left over without actually checking, in a context where the dividend does not divide evenly.',
     'Always do the multiplication check: quotient × divisor + remainder = dividend. If the multiplication doesn''t hit the dividend exactly, there IS a remainder.',
     ARRAY['4.4F','4.4H'],
     'Check by multiplying back. If it doesn''t match, there''s a remainder.'),
    ('division_used_wrong_dividend', 'math',
     'Divided the wrong number in a multi-step problem',
     'In a multi-step problem, divided one of the input quantities instead of the result of an earlier step (e.g., split the cost of one purchase among the friends instead of splitting the leftover money).',
     'In a multi-step problem, identify which quantity actually needs to be divided. Re-read the question to be sure.',
     ARRAY['4.4H','4.5A'],
     'Which number is the question really asking you to divide? Re-read it.')
  ON CONFLICT (tag) DO NOTHING;

  -- ---- Standard lookup ----

  SELECT id INTO v_standard_id
    FROM public.map_standards
   WHERE subject = 'math' AND grade = 4 AND teks_code = '4.4H';
  IF v_standard_id IS NULL THEN
    RAISE EXCEPTION 'standard 4.4H not found for grade 4 math';
  END IF;

  -- ---- Question 1: round-up division (buses) ----

  INSERT INTO public.map_questions
    (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, is_active)
  VALUES
    ('math', 4, v_standard_id, 'above_210', 'hard',
     $stem$Maya's school has 387 students going to the museum. Each bus holds 12 students. What is the fewest number of buses needed so every student has a seat?$stem$,
     NULL,
     $exp$Divide 387 ÷ 12 = 32 remainder 3. Thirty-two buses hold 384 students; the remaining 3 students still need a ride, so one more bus is required. The answer is 33 buses.$exp$,
     'Khan Academy: Multiplication and division word problems',
     true)
  RETURNING id INTO v_question_id;

  INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order) VALUES
    (v_question_id, 'A', '32',     false, 'Returned the quotient (32) without accounting for the 3 students left over who still need a bus.', 'division_remainder_dropped',         1),
    (v_question_id, 'B', '33',     true,  NULL,                                                                                                  NULL,                                  2),
    (v_question_id, 'C', '32.25',  false, 'Continued the division into decimals — but a fractional bus is not a real thing; bus counts are whole numbers.', 'division_decimal_for_whole_units', 3),
    (v_question_id, 'D', '31',     false, 'Multiplied 12 × 31 = 372 and stopped, missing the next group of twelve.',                              'mult_fact_off_by_one_group',          4);

  -- ---- Question 2: working backwards (trading cards) ----

  INSERT INTO public.map_questions
    (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, is_active)
  VALUES
    ('math', 4, v_standard_id, 'above_210', 'hard',
     $stem$Diego gave 6 trading cards to each of his 7 friends. He had 9 cards left in his collection. How many cards did Diego have to start?$stem$,
     NULL,
     $exp$First find the cards given away: 7 friends × 6 cards each = 42. Add the 9 cards he kept: 42 + 9 = 51. Diego started with 51 cards.$exp$,
     'Khan Academy: Multiplication and division word problems',
     true)
  RETURNING id INTO v_question_id;

  INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order) VALUES
    (v_question_id, 'A', '42', false, 'Computed only the cards given away and stopped — forgot to add the 9 cards Diego still had.', 'multi_step_skipped_step',     1),
    (v_question_id, 'B', '51', true,  NULL,                                                                                          NULL,                          2),
    (v_question_id, 'C', '33', false, 'Subtracted 9 from 42 instead of adding it. The 9 cards were KEPT, so they belong in the starting total.', 'operation_swap_add_subtract', 3),
    (v_question_id, 'D', '22', false, 'Added 7 + 6 + 9 = 22 instead of multiplying — did not see the "6 cards each" as repeated groups.',         'operation_wrong_keyword',     4);

  -- ---- Question 3: remainder interpretation (cookies) ----

  INSERT INTO public.map_questions
    (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, is_active)
  VALUES
    ('math', 4, v_standard_id, 'above_210', 'hard',
     $stem$Soren is packing 175 cookies into boxes. Each box holds 8 cookies. After he fills as many complete boxes as he can, how many cookies are left over?$stem$,
     NULL,
     $exp$Divide 175 ÷ 8. The largest multiple of 8 not over 175 is 21 × 8 = 168. The remainder is 175 − 168 = 7. So 7 cookies are left over.$exp$,
     'Khan Academy: Multiplication and division word problems',
     true)
  RETURNING id INTO v_question_id;

  INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order) VALUES
    (v_question_id, 'A', '21', false, 'Returned the number of complete boxes (the quotient) instead of the leftover cookies (the remainder).', 'multi_step_skipped_step',          1),
    (v_question_id, 'B', '7',  true,  NULL,                                                                                                    NULL,                               2),
    (v_question_id, 'C', '8',  false, 'Repeated the number of cookies per box from the question — that is the box capacity, not the leftover.', 'operation_wrong_keyword',          3),
    (v_question_id, 'D', '0',  false, 'Assumed the division was exact. It is not: 175 is not a multiple of 8 (the closest are 168 and 176).',   'division_assumed_no_remainder',    4);

  -- ---- Question 4: multi-step money (Mei's friends) ----

  INSERT INTO public.map_questions
    (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, is_active)
  VALUES
    ('math', 4, v_standard_id, 'above_210', 'hard',
     $stem$Mei has $90. She spends $36 on art supplies and $14 on a magazine. She wants to split the rest equally among her 4 friends. How much does each friend receive?$stem$,
     NULL,
     $exp$First add what she spent: 36 + 14 = 50. Subtract from her starting money: 90 − 50 = 40 left. Divide among 4 friends: 40 ÷ 4 = 10. Each friend gets $10.$exp$,
     'Khan Academy: Multiplication and division word problems',
     true)
  RETURNING id INTO v_question_id;

  INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order) VALUES
    (v_question_id, 'A', '$10',    true,  NULL,                                                                                          NULL,                               1),
    (v_question_id, 'B', '$22.50', false, 'Divided $90 ÷ 4 directly, ignoring everything Mei already spent.',                            'multi_step_skipped_step',          2),
    (v_question_id, 'C', '$9',     false, 'Divided the art-supplies cost ($36 ÷ 4) instead of the leftover money — picked the wrong dividend.', 'division_used_wrong_dividend', 3),
    (v_question_id, 'D', '$14',    false, 'Picked the magazine price as the answer — never actually computed the per-friend amount.',     'multi_step_skipped_step',          4);

  -- ---- Question 5: multi-step time (soccer practice) ----

  INSERT INTO public.map_questions
    (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, is_active)
  VALUES
    ('math', 4, v_standard_id, 'above_210', 'hard',
     $stem$Soccer practice lasts 90 minutes. The coach divides each practice into 6 equal-length drills. After 4 drills are finished, how many minutes are left in practice?$stem$,
     NULL,
     $exp$Each drill is 90 ÷ 6 = 15 minutes long. After 4 drills, 6 − 4 = 2 drills remain. The remaining time is 2 × 15 = 30 minutes.$exp$,
     'Khan Academy: Multiplication and division word problems',
     true)
  RETURNING id INTO v_question_id;

  INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order) VALUES
    (v_question_id, 'A', '15 min', false, 'Gave the length of one drill (15 minutes) instead of the total time for the 2 remaining drills.', 'multi_step_skipped_step',     1),
    (v_question_id, 'B', '30 min', true,  NULL,                                                                                              NULL,                          2),
    (v_question_id, 'C', '60 min', false, 'Computed the time ALREADY USED (4 × 15) instead of the time still remaining.',                    'multi_step_skipped_step',     3),
    (v_question_id, 'D', '4 min',  false, 'Returned the count of completed drills (4) as if it were a duration.',                            'operation_wrong_keyword',     4);
END
$mig$;
