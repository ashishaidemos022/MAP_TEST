-- Grade 5 math seed (doc: Volume, Area & Perimeter).
-- TEKS 5.4H "Solve perimeter, area, and volume problems", band 221_230.
DO $mig$
DECLARE v_standard_id uuid; v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject='math' AND grade=5 AND teks_code='5.4H';
  IF v_standard_id IS NULL THEN RAISE EXCEPTION 'standard not found: math g5 5.4H'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$A rectangle is 8 cm long and 3 cm wide. What is its perimeter?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'221_230','medium',
      $stem$A rectangle is 8 cm long and 3 cm wide. What is its perimeter?$stem$,
      $svg$<svg viewBox='0 0 200 110' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif' font-size='11'><rect x='30' y='30' width='130' height='50' fill='none' stroke='#555'/><text x='95' y='22' fill='#333' text-anchor='middle'>8 cm</text><text x='178' y='58' fill='#333' text-anchor='middle'>3 cm</text></svg>$svg$,
      $exp$Perimeter is the distance around: 8 + 3 + 8 + 3 = 22 cm (or 2 × (8 + 3) = 22 cm).$exp$,
      $note$Khan Academy: Area & perimeter situations$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$22 cm$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$24 cm$body$,false,$msc$Found area (8 × 3) instead of perimeter.$msc$,'perimeter_used_area',2),
      (v_question_id,'C',$body$11 cm$body$,false,$msc$Added only one length and one width, not all four sides.$msc$,'perimeter_partial_sides_only',3),
      (v_question_id,'D',$body$16 cm$body$,false,$msc$Doubled only the length and ignored the width.$msc$,'perimeter_partial_sides_only',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$A rectangle is 8 cm long and 3 cm wide. What is its area?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'221_230','medium',
      $stem$A rectangle is 8 cm long and 3 cm wide. What is its area?$stem$, NULL,
      $exp$Area of a rectangle = length × width = 8 × 3 = 24 square cm.$exp$,
      $note$Khan Academy: Area & perimeter situations$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$24 square cm$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$22 square cm$body$,false,$msc$Found perimeter (2 × (8 + 3)) instead of area.$msc$,'area_used_perimeter',2),
      (v_question_id,'C',$body$11 square cm$body$,false,$msc$Added length and width instead of multiplying.$msc$,'area_used_perimeter',3),
      (v_question_id,'D',$body$16 square cm$body$,false,$msc$Doubled the length instead of multiplying length by width.$msc$,'mult_used_wrong_fact',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$A cube-shaped bin is 4 cm by 4 cm by 3 cm. What is its volume?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'221_230','medium',
      $stem$A cube-shaped bin is 4 cm by 4 cm by 3 cm. What is its volume?$stem$,
      $svg$<svg viewBox='0 0 200 150' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif' font-size='11'><g fill='none' stroke='#555'><polygon points='30,60 120,60 120,120 30,120'/><polygon points='30,60 60,35 150,35 120,60'/><polygon points='120,60 150,35 150,95 120,120'/></g><g fill='#333'><text x='70' y='138'>4 cm</text><text x='138' y='110'>3 cm</text><text x='80' y='52'>4 cm</text></g></svg>$svg$,
      $exp$Volume = 4 × 4 × 3. First 4 × 4 = 16, then 16 × 3 = 48 cubic cm.$exp$,
      $note$Khan Academy: Solve real-world volume problems$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$48 cubic cm$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$11 cubic cm$body$,false,$msc$Added 4 + 4 + 3 instead of multiplying.$msc$,'volume_added_dimensions_instead_of_multiplied',2),
      (v_question_id,'C',$body$16 cubic cm$body$,false,$msc$Multiplied 4 × 4 and forgot the height of 3.$msc$,'multi_step_skipped_step',3),
      (v_question_id,'D',$body$80 cubic cm$body$,false,$msc$Used a surface-area style sum instead of the volume product.$msc$,'volume_used_surface_area_formula',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Imani is putting a fence around a rectangular garden that is 12 m long and 5 m wide. How much fencing does she need?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'221_230','hard',
      $stem$Imani is putting a fence around a rectangular garden that is 12 m long and 5 m wide. How much fencing does she need?$stem$, NULL,
      $exp$Fencing goes around the garden, so use perimeter: 2 × (12 + 5) = 2 × 17 = 34 m.$exp$,
      $note$Khan Academy: Area & perimeter word problems$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$34 m$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$60 m$body$,false,$msc$Found area (12 × 5) instead of the distance around.$msc$,'perimeter_used_area',2),
      (v_question_id,'C',$body$17 m$body$,false,$msc$Added one length and one width only, not all four sides.$msc$,'perimeter_partial_sides_only',3),
      (v_question_id,'D',$body$24 m$body$,false,$msc$Doubled the length only and ignored the width.$msc$,'perimeter_partial_sides_only',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$A room floor is 6 m long and 4 m wide. How many square meters of carpet cover the floor?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'221_230','hard',
      $stem$A room floor is 6 m long and 4 m wide. How many square meters of carpet cover the floor?$stem$, NULL,
      $exp$Carpet covers the floor, so use area: 6 × 4 = 24 square meters.$exp$,
      $note$Khan Academy: Area & perimeter word problems$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$24 square m$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$20 square m$body$,false,$msc$Found perimeter (2 × (6 + 4)) instead of area.$msc$,'area_used_perimeter',2),
      (v_question_id,'C',$body$10 square m$body$,false,$msc$Added length and width instead of multiplying.$msc$,'area_used_perimeter',3),
      (v_question_id,'D',$body$12 square m$body$,false,$msc$Doubled the length instead of multiplying length by width.$msc$,'mult_used_wrong_fact',4);
  END IF;
END $mig$;
