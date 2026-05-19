-- Grade 5 math seed (doc: Volume — Volume of Rectangular Prisms).
-- TEKS 5.4G "Develop volume formulas for rectangular prisms", band 211_220.
DO $mig$
DECLARE v_standard_id uuid; v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject='math' AND grade=5 AND teks_code='5.4G';
  IF v_standard_id IS NULL THEN RAISE EXCEPTION 'standard not found: math g5 5.4G'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$The prism is 5 units long, 3 units wide, and 2 units tall. What is its volume?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','medium',
      $stem$The prism is 5 units long, 3 units wide, and 2 units tall. What is its volume?$stem$,
      $svg$<svg viewBox='0 0 200 150' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif' font-size='11'><g fill='none' stroke='#555'><polygon points='30,60 130,60 130,120 30,120'/><polygon points='30,60 70,30 170,30 130,60'/><polygon points='130,60 170,30 170,90 130,120'/></g><g fill='#333'><text x='75' y='138'>length 5</text><text x='150' y='110'>height 2</text><text x='85' y='48'>width 3</text></g></svg>$svg$,
      $exp$Volume of a rectangular prism = length × width × height = 5 × 3 × 2 = 30 cubic units.$exp$,
      $note$Khan Academy: Volume of rectangular prisms$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$30 cubic units$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$10 cubic units$body$,false,$msc$Added 5 + 3 + 2 instead of multiplying the dimensions.$msc$,'volume_added_dimensions_instead_of_multiplied',2),
      (v_question_id,'C',$body$15 cubic units$body$,false,$msc$Multiplied only length × width and ignored the height.$msc$,'multi_step_skipped_step',3),
      (v_question_id,'D',$body$62 cubic units$body$,false,$msc$Used a surface-area style sum instead of the volume formula.$msc$,'volume_used_surface_area_formula',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$A rectangular prism has a base area of 12 square cm and a height of 4 cm. What is its volume?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','medium',
      $stem$A rectangular prism has a base area of 12 square cm and a height of 4 cm. What is its volume?$stem$, NULL,
      $exp$Volume = area of base × height = 12 × 4 = 48 cubic cm.$exp$,
      $note$Khan Academy: Volume as area of base times height$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$48 cubic cm$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$16 cubic cm$body$,false,$msc$Added base area and height instead of multiplying.$msc$,'volume_added_dimensions_instead_of_multiplied',2),
      (v_question_id,'C',$body$3 cubic cm$body$,false,$msc$Divided the base area by the height instead of multiplying.$msc$,'division_used_wrong_inverse',3),
      (v_question_id,'D',$body$12 cubic cm$body$,false,$msc$Reported the base area and ignored the height.$msc$,'multi_step_skipped_step',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Which expression gives the volume of a rectangular prism with length l, width w, and height h?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','medium',
      $stem$Which expression gives the volume of a rectangular prism with length l, width w, and height h?$stem$, NULL,
      $exp$Volume measures how many unit cubes fill the prism: it is the product l × w × h.$exp$,
      $note$Khan Academy: Develop volume formulas$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$l × w × h$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$l + w + h$body$,false,$msc$Added the dimensions instead of multiplying for volume.$msc$,'volume_added_dimensions_instead_of_multiplied',2),
      (v_question_id,'C',$body$2(l + w + h)$body$,false,$msc$Used an edge-sum style expression, not the volume product.$msc$,'volume_used_surface_area_formula',3),
      (v_question_id,'D',$body$l × w$body$,false,$msc$Gave only the base area, leaving out the height.$msc$,'multi_step_skipped_step',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$A box has length 6 cm, width 4 cm, and volume 72 cubic cm. What is its height?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','hard',
      $stem$A box has length 6 cm, width 4 cm, and volume 72 cubic cm. What is its height?$stem$,
      $svg$<svg viewBox='0 0 200 150' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif' font-size='11'><g fill='none' stroke='#555'><polygon points='30,60 130,60 130,120 30,120'/><polygon points='30,60 70,30 170,30 130,60'/><polygon points='130,60 170,30 170,90 130,120'/></g><g fill='#333'><text x='70' y='138'>6 cm</text><text x='150' y='110'>h = ?</text><text x='90' y='48'>4 cm</text></g></svg>$svg$,
      $exp$Volume = l × w × h, so 72 = 6 × 4 × h = 24 × h. Then h = 72 ÷ 24 = 3 cm.$exp$,
      $note$Khan Academy: Volume of rectangular prisms$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$3 cm$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$62 cm$body$,false,$msc$Subtracted 6 + 4 from 72 instead of dividing by their product.$msc$,'operation_swap_add_subtract',2),
      (v_question_id,'C',$body$12 cm$body$,false,$msc$Divided 72 by 6 only, forgetting the width.$msc$,'multi_step_skipped_step',3),
      (v_question_id,'D',$body$1,728 cm$body$,false,$msc$Multiplied 72 by 24 instead of dividing.$msc$,'division_used_wrong_inverse',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$A storage box is 10 cm long, 5 cm wide, and 4 cm tall. What is its volume?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','hard',
      $stem$A storage box is 10 cm long, 5 cm wide, and 4 cm tall. What is its volume?$stem$, NULL,
      $exp$Volume = 10 × 5 × 4. First 10 × 5 = 50, then 50 × 4 = 200 cubic cm.$exp$,
      $note$Khan Academy: Solve real-world volume problems$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$200 cubic cm$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$19 cubic cm$body$,false,$msc$Added 10 + 5 + 4 instead of multiplying.$msc$,'volume_added_dimensions_instead_of_multiplied',2),
      (v_question_id,'C',$body$50 cubic cm$body$,false,$msc$Multiplied length × width and forgot the height.$msc$,'multi_step_skipped_step',3),
      (v_question_id,'D',$body$220 cubic cm$body$,false,$msc$Used a surface-area style sum instead of the volume product.$msc$,'volume_used_surface_area_formula',4);
  END IF;
END $mig$;
