-- Grade 5 math seed batch 01, part 10/10 — TEKS 5.10E, band 231_240.
-- 5 questions × 4 choices. Idempotent (NOT EXISTS guard on stem + standard).

DO $mig$
DECLARE
  v_standard_id uuid;
  v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject = 'math' AND grade = 5 AND teks_code = '5.10E';
  IF v_standard_id IS NULL THEN
    RAISE EXCEPTION 'standard not found: math grade 5 teks 5.10E';
  END IF;

  -- q1
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Imani's monthly income is $40 from chores. Her expenses are $15 (savings), $20 (snacks), and $12 (gifts). Does her budget balance? If not, by how much?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '231_240', 'hard',
            $stem$Imani's monthly income is $40 from chores. Her expenses are $15 (savings), $20 (snacks), and $12 (gifts). Does her budget balance? If not, by how much?$stem$,
            $svg$<svg viewBox='0 0 320 180' xmlns='http://www.w3.org/2000/svg'><g font-family='sans-serif' font-size='12'><rect x='10' y='10' width='140' height='160' fill='#e8f5e9' stroke='#333'/><text x='50' y='30' font-weight='bold'>INCOME</text><line x1='10' y1='40' x2='150' y2='40' stroke='#333'/><text x='20' y='60'>Chores</text><text x='110' y='60'>$40</text><line x1='10' y1='140' x2='150' y2='140' stroke='#333'/><text x='20' y='160' font-weight='bold'>Total</text><text x='110' y='160' font-weight='bold'>$40</text><rect x='170' y='10' width='140' height='160' fill='#ffebee' stroke='#333'/><text x='210' y='30' font-weight='bold'>EXPENSES</text><line x1='170' y1='40' x2='310' y2='40' stroke='#333'/><text x='180' y='60'>Savings</text><text x='275' y='60'>$15</text><text x='180' y='80'>Snacks</text><text x='275' y='80'>$20</text><text x='180' y='100'>Gifts</text><text x='275' y='100'>$12</text><line x1='170' y1='140' x2='310' y2='140' stroke='#333'/><text x='180' y='160' font-weight='bold'>Total</text><text x='275' y='160' font-weight='bold'>$47</text></g></svg>$svg$,
            $exp$Total expenses: 15 + 20 + 12 = $47. Income is $40. Expenses ($47) exceed income ($40) by $47 − $40 = $7. The budget does NOT balance — she is over by $7.$exp$,
            $note$Khan Academy: Balancing a budget$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$Yes, it balances.$body$, false, $msc$Counted savings as part of income, getting $40 + $15 = $55 income vs $32 in 'real' expenses.$msc$, 'financial_confused_income_with_savings', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$No — she is over budget by $7.$body$, true, NULL, NULL, 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$No — she is under budget by $7.$body$, false, $msc$Subtracted in the wrong direction (income − expenses gives a negative; reversed the sign).$msc$, 'operation_swap_add_subtract', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$No — she is over budget by $5.$body$, false, $msc$Forgot the gifts row when summing expenses.$msc$, 'multi_step_skipped_step', 4);
  END IF;

  -- q2
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Jamal earns $50 a month babysitting. His monthly expenses are $30 (snacks) and $15 (movies). How much can he save?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '231_240', 'hard',
            $stem$Jamal earns $50 a month babysitting. His monthly expenses are $30 (snacks) and $15 (movies). How much can he save?$stem$,
            NULL,
            $exp$Income − expenses = savings. $50 − ($30 + $15) = $50 − $45 = $5.$exp$,
            $note$Khan Academy: Balancing a budget$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$$5$body$, true, NULL, NULL, 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$$35$body$, false, $msc$Subtracted only one expense ($50 − $15 = $35).$msc$, 'multi_step_skipped_step', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$$95$body$, false, $msc$Added income and expenses instead of subtracting.$msc$, 'operation_swap_add_subtract', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$$45$body$, false, $msc$Returned the total expenses as the savings.$msc$, 'financial_confused_income_with_savings', 4);
  END IF;

  -- q3
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$A budget shows: income $80, expenses $35 (food), $25 (clothes), $20 (entertainment), and $10 'savings'. Is 'savings' an expense, an income, or neither?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '231_240', 'hard',
            $stem$A budget shows: income $80, expenses $35 (food), $25 (clothes), $20 (entertainment), and $10 'savings'. Is 'savings' an expense, an income, or neither?$stem$,
            NULL,
            $exp$Savings is what you set aside AFTER covering expenses. It's a planned use of leftover income, not income itself. In a budget worksheet, savings is treated like an expense category — money allocated out of income — even though the money 'stays.'$exp$,
            $note$Khan Academy: Balancing a budget$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$Income$body$, false, $msc$Counted savings as part of monthly income.$msc$, 'financial_confused_income_with_savings', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$Expense (allocation)$body$, true, NULL, NULL, 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$Neither — it's a separate category that doesn't affect the balance.$body$, false, $msc$Tried to exclude savings from the budget math entirely.$msc$, 'financial_confused_income_with_savings', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$Both — half is income, half is expense.$body$, false, $msc$Made up a halfway rule that contradicts the standard treatment.$msc$, 'financial_confused_income_with_savings', 4);
  END IF;

  -- q4
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Sofia's budget last month was: income $90, expenses $95. This month, she wants to save $10. By how much must she cut expenses (or earn more) to make her budget balance with $10 saved?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '231_240', 'hard',
            $stem$Sofia's budget last month was: income $90, expenses $95. This month, she wants to save $10. By how much must she cut expenses (or earn more) to make her budget balance with $10 saved?$stem$,
            NULL,
            $exp$She needs income − expenses = $10. If income stays $90, expenses must be $90 − $10 = $80. She is currently at $95, so she needs to reduce expenses by $95 − $80 = $15 (or earn $15 more, or some mix).$exp$,
            $note$Khan Academy: Balancing a budget$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$$5$body$, false, $msc$Only fixed last month's deficit ($95 − $90 = $5) without accounting for the new $10 savings goal.$msc$, 'multi_step_skipped_step', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$$10$body$, false, $msc$Used only the savings goal and forgot the existing deficit.$msc$, 'multi_step_skipped_step', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$$15$body$, true, NULL, NULL, 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$$25$body$, false, $msc$Added the deficit twice.$msc$, 'multi_step_skipped_step', 4);
  END IF;

  -- q5
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Hiroshi spent $30 on a video game using his debit card. The store charges 8% sales tax. About how much was the total charge to his account, rounded to the nearest dollar?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '231_240', 'hard',
            $stem$Hiroshi spent $30 on a video game using his debit card. The store charges 8% sales tax. About how much was the total charge to his account, rounded to the nearest dollar?$stem$,
            NULL,
            $exp$Sales tax = 8% of $30 = 0.08 × 30 = $2.40. Total = $30 + $2.40 = $32.40, which rounds to $32.$exp$,
            $note$Khan Academy: Introduction to taxes$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$$30$body$, false, $msc$Forgot to add the tax to the price.$msc$, 'multi_step_skipped_step', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$$32$body$, true, NULL, NULL, 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$$38$body$, false, $msc$Computed 8% as $8 instead of $2.40.$msc$, 'decimal_count_zeros_in_product', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$$24$body$, false, $msc$Subtracted the tax instead of adding it.$msc$, 'operation_swap_add_subtract', 4);
  END IF;

END $mig$;