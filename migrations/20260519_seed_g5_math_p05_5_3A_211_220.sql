-- Grade 5 math seed (doc: Whole Numbers — Estimation).
-- TEKS 5.3A "Estimate to determine reasonable solutions", band 211_220.
DO $mig$
DECLARE v_standard_id uuid; v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject='math' AND grade=5 AND teks_code='5.3A';
  IF v_standard_id IS NULL THEN RAISE EXCEPTION 'standard not found: math g5 5.3A'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Estimate 487 + 312 by rounding each number to the nearest hundred.$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','medium',
      $stem$Estimate 487 + 312 by rounding each number to the nearest hundred.$stem$, NULL,
      $exp$487 rounds to 500 (tens digit 8 ≥ 5). 312 rounds to 300 (tens digit 1 < 5). 500 + 300 = 800.$exp$,
      $note$Khan Academy: Estimate to add multi-digit numbers$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$800$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$700$body$,false,$msc$Rounded 487 down to 400 instead of up to 500.$msc$,'rounding_wrong_place',2),
      (v_question_id,'C',$body$799$body$,false,$msc$Added the exact numbers instead of rounding first.$msc$,'estimation_didnt_round_first',3),
      (v_question_id,'D',$body$1000$body$,false,$msc$Rounded both numbers up to the nearest thousand.$msc$,'rounding_wrong_place',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Estimate 6,182 − 2,945 by rounding each number to the nearest thousand.$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','medium',
      $stem$Estimate 6,182 − 2,945 by rounding each number to the nearest thousand.$stem$, NULL,
      $exp$6,182 rounds to 6,000 (hundreds digit 1 < 5). 2,945 rounds to 3,000 (hundreds digit 9 ≥ 5). 6,000 − 3,000 = 3,000.$exp$,
      $note$Khan Academy: Estimate to subtract multi-digit numbers$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$3,000$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$4,000$body$,false,$msc$Rounded 2,945 down to 2,000 instead of up to 3,000.$msc$,'rounding_wrong_place',2),
      (v_question_id,'C',$body$3,237$body$,false,$msc$Subtracted the exact numbers instead of estimating.$msc$,'estimation_didnt_round_first',3),
      (v_question_id,'D',$body$9,000$body$,false,$msc$Added the rounded numbers instead of subtracting.$msc$,'operation_swap_add_subtract',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Which is the best estimate for 39 × 21?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','medium',
      $stem$Which is the best estimate for 39 × 21?$stem$, NULL,
      $exp$Round to easy numbers: 39 ≈ 40 and 21 ≈ 20. 40 × 20 = 800, which is close to the exact 819.$exp$,
      $note$Khan Academy: Estimate multi-digit multiplication$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$800$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$600$body$,false,$msc$Rounded 39 down to 30 instead of up to 40.$msc$,'rounding_wrong_place',2),
      (v_question_id,'C',$body$60$body$,false,$msc$Added the rounded factors instead of multiplying them.$msc$,'operation_wrong_keyword',3),
      (v_question_id,'D',$body$819$body$,false,$msc$Found the exact product instead of an estimate.$msc$,'estimation_didnt_round_first',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Theo buys 4 books that each cost $19.75. About how much will he spend in all?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','hard',
      $stem$Theo buys 4 books that each cost $19.75. About how much will he spend in all?$stem$, NULL,
      $exp$Round $19.75 to about $20. Then 4 × $20 = $80, a reasonable estimate for the total.$exp$,
      $note$Khan Academy: Multi-digit estimation word problems$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$about $80$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$about $24$body$,false,$msc$Added $20 + 4 instead of multiplying price by quantity.$msc$,'operation_wrong_keyword',2),
      (v_question_id,'C',$body$about $60$body$,false,$msc$Multiplied by 3 books instead of the 4 stated.$msc$,'arithmetic_slip_off_by_one',3),
      (v_question_id,'D',$body$about $800$body$,false,$msc$Rounded $19.75 up to $200 by misplacing a digit.$msc$,'rounding_wrong_place',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Which is the best estimate for 812 ÷ 38?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','hard',
      $stem$Which is the best estimate for 812 ÷ 38?$stem$, NULL,
      $exp$Use compatible numbers: 812 ≈ 800 and 38 ≈ 40. 800 ÷ 40 = 20, close to the exact value (about 21).$exp$,
      $note$Khan Academy: Estimate multi-digit division$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$20$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$200$body$,false,$msc$Divided 800 by 4 instead of by 40, misplacing a zero.$msc$,'division_off_by_factor_of_ten',2),
      (v_question_id,'C',$body$2$body$,false,$msc$Divided 80 by 40 by dropping a digit from 800.$msc$,'division_off_by_factor_of_ten',3),
      (v_question_id,'D',$body$40$body$,false,$msc$Used the divisor 40 itself as the answer.$msc$,'division_used_wrong_dividend',4);
  END IF;
END $mig$;
