-- Grade 5 math seed (doc: Whole Numbers — Multi-Digit Multiplication).
-- TEKS 5.3B "Multiply 3-digit by 2-digit using the standard algorithm", band 201_210.
DO $mig$
DECLARE v_standard_id uuid; v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject='math' AND grade=5 AND teks_code='5.3B';
  IF v_standard_id IS NULL THEN RAISE EXCEPTION 'standard not found: math g5 5.3B'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$The area model shows 243 × 12. What is the product?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'201_210','medium',
      $stem$The area model shows 243 × 12. What is the product?$stem$,
      $svg$<svg viewBox='0 0 320 130' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif' font-size='11'><g fill='none' stroke='#555'><rect x='60' y='25' width='80' height='45'/><rect x='140' y='25' width='80' height='45'/><rect x='220' y='25' width='60' height='45'/><rect x='60' y='70' width='80' height='30'/><rect x='140' y='70' width='80' height='30'/><rect x='220' y='70' width='60' height='30'/></g><g fill='#555' text-anchor='middle'><text x='100' y='18'>200</text><text x='180' y='18'>40</text><text x='250' y='18'>3</text><text x='45' y='52'>10</text><text x='45' y='88'>2</text></g><g fill='#333' text-anchor='middle'><text x='100' y='52'>2000</text><text x='180' y='52'>400</text><text x='250' y='52'>30</text><text x='100' y='88'>400</text><text x='180' y='88'>80</text><text x='250' y='88'>6</text></g></svg>$svg$,
      $exp$Add the six partial products: 2000 + 400 + 30 + 400 + 80 + 6 = 2916. So 243 × 12 = 2916.$exp$,
      $note$Khan Academy: Multiply 3-digit by 2-digit$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$2,916$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$2,816$body$,false,$msc$Lost 100 when adding the partial products (carry error).$msc$,'regrouping_forgot_carry',2),
      (v_question_id,'C',$body$729$body$,false,$msc$Multiplied 243 by only the 3 (ones) and skipped the tens.$msc$,'multi_step_skipped_step',3),
      (v_question_id,'D',$body$486$body$,false,$msc$Multiplied 243 by 2 instead of by 12.$msc$,'mult_used_wrong_fact',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$What is 156 × 24?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'201_210','medium',
      $stem$What is 156 × 24?$stem$, NULL,
      $exp$156 × 4 = 624. 156 × 20 = 3120. Add: 624 + 3120 = 3744.$exp$,
      $note$Khan Academy: Multiply 3-digit by 2-digit (standard algorithm)$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$3,744$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$3,644$body$,false,$msc$Forgot to carry when adding 624 + 3120.$msc$,'regrouping_forgot_carry',2),
      (v_question_id,'C',$body$624$body$,false,$msc$Multiplied by only the 4 and ignored the 20.$msc$,'multi_step_skipped_step',3),
      (v_question_id,'D',$body$936$body$,false,$msc$Multiplied 156 by 6 instead of by 24.$msc$,'mult_used_wrong_fact',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$What is 132 × 21?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'201_210','medium',
      $stem$What is 132 × 21?$stem$, NULL,
      $exp$132 × 1 = 132. 132 × 20 = 2640. Add: 132 + 2640 = 2772.$exp$,
      $note$Khan Academy: Multiply 3-digit by 2-digit (standard algorithm)$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$2,772$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$924$body$,false,$msc$Multiplied 132 by 7 instead of by 21.$msc$,'mult_used_wrong_fact',2),
      (v_question_id,'C',$body$396$body$,false,$msc$Multiplied 132 by 3 (added the digits of 21) instead of by 21.$msc$,'mult_as_addition',3),
      (v_question_id,'D',$body$2,652$body$,false,$msc$Computed 132 × 20 but forgot to add the 132 × 1 row.$msc$,'multi_step_skipped_step',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Selena's school orders 215 boxes of markers. Each box holds 18 markers. How many markers is that?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'201_210','hard',
      $stem$Selena's school orders 215 boxes of markers. Each box holds 18 markers. How many markers is that?$stem$, NULL,
      $exp$215 × 8 = 1720. 215 × 10 = 2150. Add: 1720 + 2150 = 3870 markers.$exp$,
      $note$Khan Academy: Multiply 3-digit by 2-digit whole numbers$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$3,870$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$3,770$body$,false,$msc$Lost 100 carrying between the partial products.$msc$,'regrouping_forgot_carry',2),
      (v_question_id,'C',$body$1,720$body$,false,$msc$Multiplied by only the 8 ones and skipped the 10.$msc$,'multi_step_skipped_step',3),
      (v_question_id,'D',$body$233$body$,false,$msc$Added 215 + 18 instead of multiplying.$msc$,'operation_wrong_keyword',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$What is 308 × 25?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'201_210','hard',
      $stem$What is 308 × 25?$stem$, NULL,
      $exp$Break it up: 300 × 25 = 7500 and 8 × 25 = 200. Add: 7500 + 200 = 7700.$exp$,
      $note$Khan Academy: Multiply 3-digit by 2-digit (standard algorithm)$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$7,700$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$7,500$body$,false,$msc$Multiplied 300 × 25 but treated the 0 in 308 as making 8 × 25 = 0.$msc$,'mult_skip_count_error',2),
      (v_question_id,'C',$body$1,540$body$,false,$msc$Multiplied 308 by 5 instead of by 25.$msc$,'mult_used_wrong_fact',3),
      (v_question_id,'D',$body$7,720$body$,false,$msc$Used 8 × 25 = 220 instead of 200.$msc$,'mult_used_wrong_fact',4);
  END IF;
END $mig$;
