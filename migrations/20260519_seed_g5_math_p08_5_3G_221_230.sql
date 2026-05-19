-- Grade 5 math seed (doc: Dividing Decimals).
-- TEKS 5.3G "Divide decimals to hundredths", band 221_230.
DO $mig$
DECLARE v_standard_id uuid; v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject='math' AND grade=5 AND teks_code='5.3G';
  IF v_standard_id IS NULL THEN RAISE EXCEPTION 'standard not found: math g5 5.3G'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$What is 0.36 ÷ 0.06?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'221_230','hard',
      $stem$What is 0.36 ÷ 0.06?$stem$, NULL,
      $exp$Both are hundredths: 0.36 = 36 hundredths, 0.06 = 6 hundredths. Asking how many 6-hundredths fit in 36-hundredths: 36 ÷ 6 = 6.$exp$,
      $note$Khan Academy: Divide whole numbers by decimals$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$6$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$0.6$body$,false,$msc$Kept a decimal in the quotient although both numbers had the same place value.$msc$,'decimal_division_shifted_wrong_direction',2),
      (v_question_id,'C',$body$60$body$,false,$msc$Shifted the decimal point the wrong way, scaling up by 10.$msc$,'decimal_division_shifted_wrong_direction',3),
      (v_question_id,'D',$body$0.06$body$,false,$msc$Repeated the divisor instead of dividing.$msc$,'division_used_wrong_dividend',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$What is 0.84 ÷ 4?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'221_230','medium',
      $stem$What is 0.84 ÷ 4?$stem$, NULL,
      $exp$0.84 is 84 hundredths. 84 ÷ 4 = 21, so the quotient is 21 hundredths = 0.21.$exp$,
      $note$Khan Academy: Divide decimals by whole numbers$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$0.21$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$2.1$body$,false,$msc$Placed the decimal one column too far left in the quotient.$msc$,'decimal_place_value_misread',2),
      (v_question_id,'C',$body$21$body$,false,$msc$Divided 84 ÷ 4 but dropped the hundredths place.$msc$,'division_decimal_for_whole_units',3),
      (v_question_id,'D',$body$0.2$body$,false,$msc$Stopped after the tenths and ignored the remaining hundredths.$msc$,'division_remainder_dropped',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$What is 1.5 ÷ 0.5?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'221_230','medium',
      $stem$What is 1.5 ÷ 0.5?$stem$, NULL,
      $exp$How many 0.5s are in 1.5? 0.5 + 0.5 + 0.5 = 1.5, so 1.5 ÷ 0.5 = 3.$exp$,
      $note$Khan Academy: Divide whole numbers by decimals$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$3$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$0.3$body$,false,$msc$Kept a decimal point that should clear when dividing by 0.5.$msc$,'decimal_division_shifted_wrong_direction',2),
      (v_question_id,'C',$body$0.75$body$,false,$msc$Multiplied 1.5 by 0.5 instead of dividing.$msc$,'division_used_wrong_inverse',3),
      (v_question_id,'D',$body$30$body$,false,$msc$Shifted the decimal the wrong direction, scaling the answer up by 10.$msc$,'decimal_division_shifted_wrong_direction',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Noor cuts a 4.5 m ribbon into pieces that are each 0.9 m long. How many pieces does she get?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'221_230','hard',
      $stem$Noor cuts a 4.5 m ribbon into pieces that are each 0.9 m long. How many pieces does she get?$stem$, NULL,
      $exp$4.5 ÷ 0.9: how many 0.9s fit in 4.5? 0.9 × 5 = 4.5, so she gets 5 pieces.$exp$,
      $note$Khan Academy: Divide whole numbers by decimals$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$5 pieces$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$0.5 piece$body$,false,$msc$Left a decimal in the quotient that should clear here.$msc$,'decimal_division_shifted_wrong_direction',2),
      (v_question_id,'C',$body$50 pieces$body$,false,$msc$Shifted the decimal the wrong way, scaling up by 10.$msc$,'decimal_division_shifted_wrong_direction',3),
      (v_question_id,'D',$body$4 pieces$body$,false,$msc$Estimated 4.5 ÷ 1 ≈ 4 instead of dividing by 0.9.$msc$,'estimation_didnt_round_first',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$What is 0.96 ÷ 0.03?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'221_230','hard',
      $stem$What is 0.96 ÷ 0.03?$stem$, NULL,
      $exp$Both are hundredths: 96 hundredths ÷ 3 hundredths. 96 ÷ 3 = 32.$exp$,
      $note$Khan Academy: Divide whole numbers by decimals$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$32$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$3.2$body$,false,$msc$Left a decimal point in the quotient when both numbers shared place value.$msc$,'decimal_division_shifted_wrong_direction',2),
      (v_question_id,'C',$body$320$body$,false,$msc$Shifted the decimal the wrong direction, scaling up by 10.$msc$,'decimal_division_shifted_wrong_direction',3),
      (v_question_id,'D',$body$0.32$body$,false,$msc$Divided the digits but kept hundredths in the answer.$msc$,'decimal_place_value_misread',4);
  END IF;
END $mig$;
