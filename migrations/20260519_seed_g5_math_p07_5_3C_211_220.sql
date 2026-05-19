-- Grade 5 math seed (doc: Whole Numbers — Multi-Digit Division).
-- TEKS 5.3C "Solve up to 4-digit by 2-digit division using strategies", band 211_220.
DO $mig$
DECLARE v_standard_id uuid; v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject='math' AND grade=5 AND teks_code='5.3C';
  IF v_standard_id IS NULL THEN RAISE EXCEPTION 'standard not found: math g5 5.3C'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$What is 936 ÷ 12?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','medium',
      $stem$What is 936 ÷ 12?$stem$, NULL,
      $exp$12 × 70 = 840, leaving 96. 12 × 8 = 96, leaving 0. So 70 + 8 = 78, and 936 ÷ 12 = 78.$exp$,
      $note$Khan Academy: Division by 2-digit numbers$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$78$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$87$body$,false,$msc$Reversed the digits of the quotient.$msc$,'arithmetic_slip_off_by_one',2),
      (v_question_id,'C',$body$7$body$,false,$msc$Found only the tens part (70) then dropped a zero.$msc$,'division_off_by_factor_of_ten',3),
      (v_question_id,'D',$body$924$body$,false,$msc$Subtracted 12 from 936 instead of dividing.$msc$,'division_used_wrong_inverse',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$What is 1,248 ÷ 24?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','hard',
      $stem$What is 1,248 ÷ 24?$stem$, NULL,
      $exp$24 × 50 = 1200, leaving 48. 24 × 2 = 48, leaving 0. So 50 + 2 = 52.$exp$,
      $note$Khan Academy: Division by 2-digit numbers$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$52$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$42$body$,false,$msc$Used 24 × 40 = 960 then mis-subtracted, losing a group of 10.$msc$,'division_equal_groups_off_by_one',2),
      (v_question_id,'C',$body$520$body$,false,$msc$Placed an extra zero in the quotient.$msc$,'division_off_by_factor_of_ten',3),
      (v_question_id,'D',$body$53$body$,false,$msc$Counted one extra group of 24 beyond what fits.$msc$,'division_equal_groups_off_by_one',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$What is 875 ÷ 25?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','medium',
      $stem$What is 875 ÷ 25?$stem$, NULL,
      $exp$25 × 30 = 750, leaving 125. 25 × 5 = 125, leaving 0. So 30 + 5 = 35.$exp$,
      $note$Khan Academy: Basic multi-digit division$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$35$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$34$body$,false,$msc$Stopped one group of 25 short of using all 875.$msc$,'division_equal_groups_off_by_one',2),
      (v_question_id,'C',$body$305$body$,false,$msc$Wrote the partial quotients 30 and 5 side by side instead of adding.$msc$,'place_value_concatenated_digits',3),
      (v_question_id,'D',$body$53$body$,false,$msc$Reversed the digits of the quotient.$msc$,'arithmetic_slip_off_by_one',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Aarav shares 1,000 stickers equally among 40 bags. How many stickers go in each bag?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','medium',
      $stem$Aarav shares 1,000 stickers equally among 40 bags. How many stickers go in each bag?$stem$, NULL,
      $exp$1,000 ÷ 40: think 100 ÷ 4 = 25, and the place value matches, so each bag gets 25 stickers (40 × 25 = 1000).$exp$,
      $note$Khan Academy: Basic multi-digit division$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$25$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$250$body$,false,$msc$Divided 1000 by 4 instead of by 40.$msc$,'division_off_by_factor_of_ten',2),
      (v_question_id,'C',$body$40$body$,false,$msc$Repeated the divisor instead of computing the quotient.$msc$,'division_used_wrong_dividend',3),
      (v_question_id,'D',$body$960$body$,false,$msc$Subtracted 40 from 1000 instead of dividing.$msc$,'division_used_wrong_inverse',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$535 pencils are packed 14 to a box. How many full boxes are there, and how many pencils are left over?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','hard',
      $stem$535 pencils are packed 14 to a box. How many full boxes are there, and how many pencils are left over?$stem$, NULL,
      $exp$14 × 38 = 532, which is 3 less than 535. So there are 38 full boxes with 3 pencils left over.$exp$,
      $note$Khan Academy: Division by 2-digit numbers$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$38 boxes, 3 left over$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$39 boxes, 0 left over$body$,false,$msc$Rounded the quotient up and ignored the remainder.$msc$,'division_assumed_no_remainder',2),
      (v_question_id,'C',$body$38 boxes, 0 left over$body$,false,$msc$Dropped the remainder instead of reporting it.$msc$,'division_remainder_dropped',3),
      (v_question_id,'D',$body$3 boxes, 38 left over$body$,false,$msc$Swapped the quotient and the remainder.$msc$,'division_used_wrong_dividend',4);
  END IF;
END $mig$;
