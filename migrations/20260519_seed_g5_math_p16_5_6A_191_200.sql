-- Grade 5 math seed (doc: Volume — Volume with Unit Cubes).
-- TEKS 5.6A "Volume as unit cubes filling a 3D figure", band 191_200.
DO $mig$
DECLARE v_standard_id uuid; v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject='math' AND grade=5 AND teks_code='5.6A';
  IF v_standard_id IS NULL THEN RAISE EXCEPTION 'standard not found: math g5 5.6A'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$This single layer is built from unit cubes: 4 cubes in a row and 2 rows. How many unit cubes are there?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'191_200','easy',
      $stem$This single layer is built from unit cubes: 4 cubes in a row and 2 rows. How many unit cubes are there?$stem$,
      $svg$<svg viewBox='0 0 180 90' xmlns='http://www.w3.org/2000/svg'><g fill='#dce6f5' stroke='#555'><rect x='20' y='20' width='30' height='30'/><rect x='50' y='20' width='30' height='30'/><rect x='80' y='20' width='30' height='30'/><rect x='110' y='20' width='30' height='30'/><rect x='20' y='50' width='30' height='30'/><rect x='50' y='50' width='30' height='30'/><rect x='80' y='50' width='30' height='30'/><rect x='110' y='50' width='30' height='30'/></g></svg>$svg$,
      $exp$Count by rows: 4 cubes in each row, 2 rows, so 4 × 2 = 8 unit cubes.$exp$,
      $note$Khan Academy: Volume using unit cubes$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$8$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$6$body$,false,$msc$Added 4 + 2 instead of multiplying rows by cubes per row.$msc$,'volume_added_dimensions_instead_of_multiplied',2),
      (v_question_id,'C',$body$4$body$,false,$msc$Counted only one row and ignored the second.$msc$,'equal_groups_or_array_count',3),
      (v_question_id,'D',$body$7$body$,false,$msc$Miscounted the cubes by one.$msc$,'off_by_one_count',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$A box is filled with unit cubes: 5 cubes in a row, 3 rows, and 2 layers. How many unit cubes fill the box?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'191_200','medium',
      $stem$A box is filled with unit cubes: 5 cubes in a row, 3 rows, and 2 layers. How many unit cubes fill the box?$stem$, NULL,
      $exp$One layer has 5 × 3 = 15 cubes. There are 2 layers, so 15 × 2 = 30 unit cubes.$exp$,
      $note$Khan Academy: Volume of rectangular prisms with unit cubes$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$30$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$10$body$,false,$msc$Added 5 + 3 + 2 instead of multiplying.$msc$,'volume_added_dimensions_instead_of_multiplied',2),
      (v_question_id,'C',$body$15$body$,false,$msc$Counted only one layer and forgot the second.$msc$,'equal_groups_or_array_count',3),
      (v_question_id,'D',$body$25$body$,false,$msc$Used 5 × 5 instead of 5 × 3 × 2.$msc$,'mult_used_wrong_fact',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$A cube is built 2 cubes long, 2 cubes wide, and 2 cubes tall. How many unit cubes is that?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'191_200','medium',
      $stem$A cube is built 2 cubes long, 2 cubes wide, and 2 cubes tall. How many unit cubes is that?$stem$,
      $svg$<svg viewBox='0 0 150 130' xmlns='http://www.w3.org/2000/svg'><g fill='#dce6f5' stroke='#555'><polygon points='30,60 90,60 90,110 30,110'/><polygon points='30,60 55,40 115,40 90,60'/><polygon points='90,60 115,40 115,90 90,110'/><line x1='60' y1='60' x2='60' y2='110'/><line x1='30' y1='85' x2='90' y2='85'/></g></svg>$svg$,
      $exp$Each layer is 2 × 2 = 4 cubes. There are 2 layers, so 4 × 2 = 8 unit cubes.$exp$,
      $note$Khan Academy: Compare volumes using unit cubes$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$8$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$6$body$,false,$msc$Added 2 + 2 + 2 instead of multiplying.$msc$,'volume_added_dimensions_instead_of_multiplied',2),
      (v_question_id,'C',$body$4$body$,false,$msc$Counted only the front layer of cubes.$msc$,'equal_groups_or_array_count',3),
      (v_question_id,'D',$body$12$body$,false,$msc$Counted the visible faces instead of the cubes.$msc$,'volume_used_surface_area_formula',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$The bottom layer of a box holds 6 unit cubes. The box is 4 layers tall. How many unit cubes fill the box?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'191_200','hard',
      $stem$The bottom layer of a box holds 6 unit cubes. The box is 4 layers tall. How many unit cubes fill the box?$stem$, NULL,
      $exp$Each layer is the same: 6 cubes. With 4 layers, 6 × 4 = 24 unit cubes.$exp$,
      $note$Khan Academy: Volume of rectangular prisms with unit cubes$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$24$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$10$body$,false,$msc$Added 6 + 4 instead of multiplying layers by cubes per layer.$msc$,'volume_added_dimensions_instead_of_multiplied',2),
      (v_question_id,'C',$body$6$body$,false,$msc$Counted only the bottom layer and ignored the height.$msc$,'equal_groups_or_array_count',3),
      (v_question_id,'D',$body$18$body$,false,$msc$Used 3 layers instead of 4.$msc$,'off_by_one_count',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$What does the volume of a solid figure tell you?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'191_200','medium',
      $stem$What does the volume of a solid figure tell you?$stem$, NULL,
      $exp$Volume is the number of unit cubes that fill the solid completely with no gaps and no overlaps.$exp$,
      $note$Khan Academy: Volume using unit cubes$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$The number of unit cubes that fill it with no gaps$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$The distance around its base$body$,false,$msc$Described perimeter, not volume.$msc$,'perimeter_used_area',2),
      (v_question_id,'C',$body$The number of squares on its outside faces$body$,false,$msc$Described surface area, not volume.$msc$,'volume_used_surface_area_formula',3),
      (v_question_id,'D',$body$The number of edges on the solid$body$,false,$msc$Counted edges, which is unrelated to volume.$msc$,'_misc_other',4);
  END IF;
END $mig$;
