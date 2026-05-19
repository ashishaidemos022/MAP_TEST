-- Grade 5 math seed (doc: Measurement & Geometry — Converting Units).
-- TEKS 5.7A "Measurement conversions within a system", band 211_220.
DO $mig$
DECLARE v_standard_id uuid; v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject='math' AND grade=5 AND teks_code='5.7A';
  IF v_standard_id IS NULL THEN RAISE EXCEPTION 'standard not found: math g5 5.7A'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$How many centimeters are in 3 meters?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','medium',
      $stem$How many centimeters are in 3 meters?$stem$, NULL,
      $exp$1 meter = 100 centimeters. Going from larger units to smaller, multiply: 3 × 100 = 300 cm.$exp$,
      $note$Khan Academy: Convert units (metric)$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$300 cm$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$0.03 cm$body$,false,$msc$Divided by 100 instead of multiplying — wrong conversion direction.$msc$,'unit_conversion_wrong_direction',2),
      (v_question_id,'C',$body$30 cm$body$,false,$msc$Used 10 cm per meter instead of 100.$msc$,'unit_conversion_factor_wrong',3),
      (v_question_id,'D',$body$3 cm$body$,false,$msc$Left the number unchanged, not converting at all.$msc$,'measurement_unit_size',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$How many kilograms are in 2,000 grams?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','medium',
      $stem$How many kilograms are in 2,000 grams?$stem$, NULL,
      $exp$1 kilogram = 1,000 grams. Going from smaller units to larger, divide: 2,000 ÷ 1,000 = 2 kg.$exp$,
      $note$Khan Academy: Convert units (metric)$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$2 kg$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$2,000,000 kg$body$,false,$msc$Multiplied by 1,000 instead of dividing — wrong direction.$msc$,'unit_conversion_wrong_direction',2),
      (v_question_id,'C',$body$20 kg$body$,false,$msc$Divided by 100 instead of 1,000.$msc$,'measurement_conversion_place_value',3),
      (v_question_id,'D',$body$200 kg$body$,false,$msc$Used 10 grams per kg instead of 1,000.$msc$,'unit_conversion_factor_wrong',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$How many meters are in 5 kilometers?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','medium',
      $stem$How many meters are in 5 kilometers?$stem$, NULL,
      $exp$1 kilometer = 1,000 meters. Larger to smaller, multiply: 5 × 1,000 = 5,000 m.$exp$,
      $note$Khan Academy: Convert units (metric)$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$5,000 m$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$0.005 m$body$,false,$msc$Divided by 1,000 instead of multiplying — wrong direction.$msc$,'unit_conversion_wrong_direction',2),
      (v_question_id,'C',$body$500 m$body$,false,$msc$Used 100 m per km instead of 1,000.$msc$,'unit_conversion_factor_wrong',3),
      (v_question_id,'D',$body$50 m$body$,false,$msc$Used 10 m per km instead of 1,000.$msc$,'unit_conversion_factor_wrong',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Sofia has a ribbon that is 250 cm long. How many meters is that?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','hard',
      $stem$Sofia has a ribbon that is 250 cm long. How many meters is that?$stem$, NULL,
      $exp$1 meter = 100 cm. Smaller to larger, divide: 250 ÷ 100 = 2.5 meters.$exp$,
      $note$Khan Academy: Convert metric unit word problems$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$2.5 m$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$25,000 m$body$,false,$msc$Multiplied by 100 instead of dividing — wrong direction.$msc$,'unit_conversion_wrong_direction',2),
      (v_question_id,'C',$body$25 m$body$,false,$msc$Divided by 10 instead of 100.$msc$,'measurement_conversion_place_value',3),
      (v_question_id,'D',$body$250 m$body$,false,$msc$Did not convert; reused the centimeter number as meters.$msc$,'measurement_unit_size',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$How many inches are in 4 feet?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','hard',
      $stem$How many inches are in 4 feet?$stem$, NULL,
      $exp$1 foot = 12 inches. Larger to smaller, multiply: 4 × 12 = 48 inches.$exp$,
      $note$Khan Academy: Convert units (US customary)$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$48 in$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$16 in$body$,false,$msc$Added 4 + 12 instead of multiplying.$msc$,'operation_wrong_keyword',2),
      (v_question_id,'C',$body$3 in$body$,false,$msc$Divided 12 by 4 instead of multiplying — wrong direction.$msc$,'unit_conversion_wrong_direction',3),
      (v_question_id,'D',$body$40 in$body$,false,$msc$Used 10 inches per foot instead of 12.$msc$,'unit_conversion_factor_wrong',4);
  END IF;
END $mig$;
