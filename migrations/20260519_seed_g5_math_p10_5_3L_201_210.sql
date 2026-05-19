-- Grade 5 math seed (doc: Multiplying & Dividing Fractions).
-- TEKS 5.3L "Divide whole numbers by unit fractions and unit fractions by whole numbers", band 201_210.
DO $mig$
DECLARE v_standard_id uuid; v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject='math' AND grade=5 AND teks_code='5.3L';
  IF v_standard_id IS NULL THEN RAISE EXCEPTION 'standard not found: math g5 5.3L'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$The number line from 0 to 6 is split into halves. How many one-half jumps reach 6?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'201_210','medium',
      $stem$The number line from 0 to 6 is split into halves. How many one-half jumps reach 6?$stem$,
      $svg$<svg viewBox='0 0 380 60' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif' font-size='10'><line x1='20' y1='35' x2='360' y2='35' stroke='#555'/><g stroke='#555'><line x1='20' y1='28' x2='20' y2='42'/><line x1='48' y1='31' x2='48' y2='39'/><line x1='77' y1='28' x2='77' y2='42'/><line x1='105' y1='31' x2='105' y2='39'/><line x1='133' y1='28' x2='133' y2='42'/><line x1='162' y1='31' x2='162' y2='39'/><line x1='190' y1='28' x2='190' y2='42'/><line x1='218' y1='31' x2='218' y2='39'/><line x1='247' y1='28' x2='247' y2='42'/><line x1='275' y1='31' x2='275' y2='39'/><line x1='303' y1='28' x2='303' y2='42'/><line x1='332' y1='31' x2='332' y2='39'/><line x1='360' y1='28' x2='360' y2='42'/></g><g fill='#555' text-anchor='middle'><text x='20' y='52'>0</text><text x='133' y='52'>2</text><text x='247' y='52'>4</text><text x='360' y='52'>6</text></g></svg>$svg$,
      $exp$6 ÷ 1/2 asks how many halves are in 6. Each whole has 2 halves, so 6 wholes have 6 × 2 = 12 halves.$exp$,
      $note$Khan Academy: Divide whole numbers by unit fractions$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$12$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$3$body$,false,$msc$Halved 6 instead of counting how many halves fit in 6.$msc$,'division_used_wrong_inverse',2),
      (v_question_id,'C',$body$6$body$,false,$msc$Counted whole-number jumps, not half jumps.$msc$,'fraction_missing_unit_parts',3),
      (v_question_id,'D',$body$8$body$,false,$msc$Added 6 + 2 instead of multiplying halves per whole.$msc$,'operation_wrong_keyword',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$What is 1/3 ÷ 2?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'201_210','medium',
      $stem$What is 1/3 ÷ 2?$stem$, NULL,
      $exp$Splitting 1/3 into 2 equal parts gives 1/(3×2) = 1/6.$exp$,
      $note$Khan Academy: Divide unit fractions by whole numbers$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$1/6$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$2/3$body$,false,$msc$Multiplied 1/3 by 2 instead of dividing.$msc$,'division_used_wrong_inverse',2),
      (v_question_id,'C',$body$1/5$body$,false,$msc$Added 2 to the denominator (3+2) instead of multiplying.$msc$,'fraction_unlike_denominator_added_directly',3),
      (v_question_id,'D',$body$2/6$body$,false,$msc$Put the 2 in the numerator instead of multiplying the denominator only.$msc$,'fraction_part_whole_swap',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$What is 2 ÷ 1/4?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'201_210','medium',
      $stem$What is 2 ÷ 1/4?$stem$, NULL,
      $exp$How many fourths are in 2? Each whole has 4 fourths, so 2 wholes have 2 × 4 = 8 fourths.$exp$,
      $note$Khan Academy: Divide whole numbers by unit fractions$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$8$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$1/2$body$,false,$msc$Multiplied 2 by 1/4 instead of dividing by it.$msc$,'division_used_wrong_inverse',2),
      (v_question_id,'C',$body$6$body$,false,$msc$Added 2 + 4 instead of finding how many fourths fit.$msc$,'operation_wrong_keyword',3),
      (v_question_id,'D',$body$2/4$body$,false,$msc$Flipped the whole number rather than the unit fraction.$msc$,'fraction_div_by_unit_inverted_wrong',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Liam has a 5-foot rope. He cuts it into pieces that are each 1/3 foot long. How many pieces does he get?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'201_210','hard',
      $stem$Liam has a 5-foot rope. He cuts it into pieces that are each 1/3 foot long. How many pieces does he get?$stem$, NULL,
      $exp$5 ÷ 1/3 asks how many thirds are in 5. Each foot has 3 thirds, so 5 × 3 = 15 pieces.$exp$,
      $note$Khan Academy: Divide whole numbers by unit fractions$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$15$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$5/3$body$,false,$msc$Multiplied 5 by 1/3 instead of finding how many thirds fit.$msc$,'division_used_wrong_inverse',2),
      (v_question_id,'C',$body$8$body$,false,$msc$Added 5 + 3 instead of multiplying thirds per foot.$msc$,'operation_wrong_keyword',3),
      (v_question_id,'D',$body$1.67$body$,false,$msc$Divided 5 by 3 instead of by 1/3.$msc$,'fraction_div_by_unit_inverted_wrong',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$What is 1/2 ÷ 5?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'201_210','hard',
      $stem$What is 1/2 ÷ 5?$stem$, NULL,
      $exp$Splitting 1/2 into 5 equal parts gives 1/(2×5) = 1/10.$exp$,
      $note$Khan Academy: Divide unit fractions by whole numbers$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$1/10$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$5/2$body$,false,$msc$Multiplied 1/2 by 5 instead of dividing.$msc$,'division_used_wrong_inverse',2),
      (v_question_id,'C',$body$1/7$body$,false,$msc$Added 5 to the denominator (2+5) instead of multiplying.$msc$,'fraction_unlike_denominator_added_directly',3),
      (v_question_id,'D',$body$5/10$body$,false,$msc$Put the 5 in the numerator instead of multiplying the denominator only.$msc$,'fraction_part_whole_swap',4);
  END IF;
END $mig$;
