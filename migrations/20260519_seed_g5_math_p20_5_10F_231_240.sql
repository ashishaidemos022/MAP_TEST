-- Grade 5 math seed (doc: Financial Literacy — Financial Records & Budgeting).
-- TEKS 5.10F "Balance a simple budget", band 231_240.
DO $mig$
DECLARE v_standard_id uuid; v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject='math' AND grade=5 AND teks_code='5.10F';
  IF v_standard_id IS NULL THEN RAISE EXCEPTION 'standard not found: math g5 5.10F'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Maya's income this month is $50 and her expenses are $35. How much can she put into savings?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'231_240','medium',
      $stem$Maya's income this month is $50 and her expenses are $35. How much can she put into savings?$stem$, NULL,
      $exp$Savings = income − expenses = 50 − 35 = $15.$exp$,
      $note$Khan Academy: Balancing a budget$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$$15$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$$85$body$,false,$msc$Added income and expenses instead of subtracting.$msc$,'operation_swap_add_subtract',2),
      (v_question_id,'C',$body$$35$body$,false,$msc$Reported expenses as the savings amount.$msc$,'financial_confused_income_with_savings',3),
      (v_question_id,'D',$body$$50$body$,false,$msc$Used total income without subtracting expenses.$msc$,'multi_step_skipped_step',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$When is a budget balanced?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'231_240','medium',
      $stem$When is a budget balanced?$stem$, NULL,
      $exp$A budget is balanced when spending does not go over income — total expenses are less than or equal to total income.$exp$,
      $note$Khan Academy: Balancing a budget$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$When expenses are not more than income$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$When expenses are greater than income$body$,false,$msc$That describes going over budget, not a balanced one.$msc$,'_misc_other',2),
      (v_question_id,'C',$body$When income is zero$body$,false,$msc$No income usually means expenses cannot be covered.$msc$,'_misc_other',3),
      (v_question_id,'D',$body$When all income is the same as savings$body$,false,$msc$Confused savings with the balance condition.$msc$,'financial_confused_income_with_savings',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Diego's income is $40 but his expenses add up to $52. What does this mean for his budget?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'231_240','hard',
      $stem$Diego's income is $40 but his expenses add up to $52. What does this mean for his budget?$stem$, NULL,
      $exp$Expenses ($52) are greater than income ($40). 52 − 40 = 12, so he is over budget by $12 and the budget is not balanced.$exp$,
      $note$Khan Academy: Balancing a budget$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$He is over budget by $12$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$He saved $12$body$,false,$msc$Treated a shortfall as savings.$msc$,'financial_confused_income_with_savings',2),
      (v_question_id,'C',$body$His budget is balanced$body$,false,$msc$Ignored that expenses exceed income.$msc$,'_misc_other',3),
      (v_question_id,'D',$body$He is over budget by $92$body$,false,$msc$Added 40 + 52 instead of subtracting to find the gap.$msc$,'operation_swap_add_subtract',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Imani has a $20 allowance. She wants a $14 toy and a $9 book. Can she buy both within her budget?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'231_240','hard',
      $stem$Imani has a $20 allowance. She wants a $14 toy and a $9 book. Can she buy both within her budget?$stem$, NULL,
      $exp$The two items cost 14 + 9 = $23. Her budget is $20. 23 > 20, so she cannot afford both — she is $3 short.$exp$,
      $note$Khan Academy: Balancing a budget$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$No, she is $3 short$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$Yes, with $3 left over$body$,false,$msc$Subtracted only one item or mis-added the costs.$msc$,'multi_step_skipped_step',2),
      (v_question_id,'C',$body$Yes, the costs are exactly $20$body$,false,$msc$Added 14 + 9 incorrectly as 20.$msc$,'operation_swap_add_subtract',3),
      (v_question_id,'D',$body$No, she is $23 short$body$,false,$msc$Used the total cost as the shortfall instead of cost minus budget.$msc$,'multi_step_skipped_step',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Theo earns $25. He spends $10 on lunch and $8 on a gift, and wants to save $5. How much is left for anything else?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'231_240','hard',
      $stem$Theo earns $25. He spends $10 on lunch and $8 on a gift, and wants to save $5. How much is left for anything else?$stem$, NULL,
      $exp$Start with $25. Subtract each amount: 25 − 10 = 15, 15 − 8 = 7, 7 − 5 (savings) = $2 left.$exp$,
      $note$Khan Academy: Keeping and using financial records$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$$2$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$$7$body$,false,$msc$Forgot to set aside the $5 in savings.$msc$,'multi_step_skipped_step',2),
      (v_question_id,'C',$body$$5$body$,false,$msc$Reported the savings amount instead of what is left over.$msc$,'financial_confused_income_with_savings',3),
      (v_question_id,'D',$body$$48$body$,false,$msc$Added the amounts to income instead of subtracting them.$msc$,'operation_swap_add_subtract',4);
  END IF;
END $mig$;
