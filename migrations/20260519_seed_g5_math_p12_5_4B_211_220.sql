-- Grade 5 math seed (doc: Algebra Foundations — multi-step / equations).
-- TEKS 5.4B "Multi-step problems with whole numbers using equations with a letter unknown", band 211_220.
DO $mig$
DECLARE v_standard_id uuid; v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject='math' AND grade=5 AND teks_code='5.4B';
  IF v_standard_id IS NULL THEN RAISE EXCEPTION 'standard not found: math g5 5.4B'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Maya buys 3 equal packs of pens and ends up with 24 pens. If p is the number of pens in each pack, how many pens are in one pack?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','medium',
      $stem$Maya buys 3 equal packs of pens and ends up with 24 pens. If p is the number of pens in each pack, how many pens are in one pack?$stem$, NULL,
      $exp$The equation is 3 × p = 24. To find p, divide: p = 24 ÷ 3 = 8 pens per pack.$exp$,
      $note$Khan Academy: Represent problems using equations$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$8$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$72$body$,false,$msc$Multiplied 24 by 3 instead of dividing to undo the multiplication.$msc$,'division_used_wrong_inverse',2),
      (v_question_id,'C',$body$21$body$,false,$msc$Subtracted 3 from 24 instead of dividing.$msc$,'operation_swap_add_subtract',3),
      (v_question_id,'D',$body$27$body$,false,$msc$Added 3 to 24 instead of dividing.$msc$,'operation_wrong_keyword',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Ethan had $40. He spent $12, then split the rest equally over 4 weeks. How much can he spend each week (w)?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','hard',
      $stem$Ethan had $40. He spent $12, then split the rest equally over 4 weeks. How much can he spend each week (w)?$stem$, NULL,
      $exp$First find what is left: 40 − 12 = 28. Then split over 4 weeks: w = 28 ÷ 4 = $7 each week. The equation is (40 − 12) ÷ 4 = w.$exp$,
      $note$Khan Academy: Multi-step word problems with whole numbers$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$$7$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$$10$body$,false,$msc$Divided 40 by 4 first and forgot to subtract the $12.$msc$,'multi_step_skipped_step',2),
      (v_question_id,'C',$body$$28$body$,false,$msc$Stopped after 40 − 12 and skipped splitting over 4 weeks.$msc$,'multi_step_skipped_step',3),
      (v_question_id,'D',$body$$3$body$,false,$msc$Divided then subtracted instead of subtract then divide.$msc$,'order_of_operations_left_to_right',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Six times a number n, minus 5, equals 31. What is n?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','hard',
      $stem$Six times a number n, minus 5, equals 31. What is n?$stem$, NULL,
      $exp$The equation is 6n − 5 = 31. Add 5 to both sides: 6n = 36. Divide by 6: n = 6.$exp$,
      $note$Khan Academy: Represent problems using equations$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$6$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$5$body$,false,$msc$Subtracted 5 from 31 then divided, undoing steps in the wrong order.$msc$,'order_of_operations_left_to_right',2),
      (v_question_id,'C',$body$216$body$,false,$msc$Multiplied 36 by 6 instead of dividing.$msc$,'division_used_wrong_inverse',3),
      (v_question_id,'D',$body$31$body$,false,$msc$Used the total as the answer without solving for n.$msc$,'multi_step_skipped_step',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Priya reads 15 pages each day. After d days she has read 90 pages. How many days did she read?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','medium',
      $stem$Priya reads 15 pages each day. After d days she has read 90 pages. How many days did she read?$stem$, NULL,
      $exp$The equation is 15 × d = 90. Divide both sides by 15: d = 90 ÷ 15 = 6 days.$exp$,
      $note$Khan Academy: Represent problems using equations$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$6$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$1,350$body$,false,$msc$Multiplied 90 by 15 instead of dividing.$msc$,'division_used_wrong_inverse',2),
      (v_question_id,'C',$body$75$body$,false,$msc$Subtracted 15 from 90 instead of dividing.$msc$,'operation_swap_add_subtract',3),
      (v_question_id,'D',$body$5$body$,false,$msc$Stopped one day short when counting groups of 15.$msc$,'division_equal_groups_off_by_one',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Theo had b marbles. He gave away 18, then doubled what was left and ended with 50. Which equation models this?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','hard',
      $stem$Theo had b marbles. He gave away 18, then doubled what was left and ended with 50. Which equation models this?$stem$, NULL,
      $exp$"Gave away 18" → (b − 18). "Doubled what was left" → 2 × (b − 18). That equals 50: 2(b − 18) = 50.$exp$,
      $note$Khan Academy: Represent multi-step problems using equations$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$2(b − 18) = 50$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$2b − 18 = 50$body$,false,$msc$Doubled before subtracting, missing the parentheses on (b − 18).$msc$,'order_of_operations_left_to_right',2),
      (v_question_id,'C',$body$b − 18 + 2 = 50$body$,false,$msc$Added 2 instead of doubling the remaining amount.$msc$,'operation_wrong_keyword',3),
      (v_question_id,'D',$body$2b − 36 = 50$body$,false,$msc$Skipped showing the (b − 18) step and mis-distributed.$msc$,'multi_step_skipped_step',4);
  END IF;
END $mig$;
