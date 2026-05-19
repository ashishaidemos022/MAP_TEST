-- Grade 5 math seed (doc: Multiplying & Dividing Fractions).
-- TEKS 5.3J "Divide a unit fraction by a whole number and a whole number by a unit fraction", band 211_220.
DO $mig$
DECLARE v_standard_id uuid; v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject='math' AND grade=5 AND teks_code='5.3J';
  IF v_standard_id IS NULL THEN RAISE EXCEPTION 'standard not found: math g5 5.3J'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$The model shows one half shared equally among 3 people. How much does each person get?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','medium',
      $stem$The model shows one half shared equally among 3 people. How much does each person get?$stem$,
      $svg$<svg viewBox='0 0 260 70' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif' font-size='11'><rect x='10' y='20' width='240' height='30' fill='none' stroke='#555'/><rect x='10' y='20' width='120' height='30' fill='#dce6f5' stroke='#555'/><line x1='50' y1='20' x2='50' y2='50' stroke='#999' stroke-dasharray='3'/><line x1='90' y1='20' x2='90' y2='50' stroke='#999' stroke-dasharray='3'/><line x1='130' y1='10' x2='130' y2='60' stroke='#333'/><text x='70' y='15' fill='#333' text-anchor='middle'>one half</text><text x='30' y='38' text-anchor='middle'>?</text><text x='70' y='38' text-anchor='middle'>?</text><text x='110' y='38' text-anchor='middle'>?</text></svg>$svg$,
      $exp$Splitting 1/2 into 3 equal parts: each part is 1/2 ÷ 3 = 1/(2×3) = 1/6 of the whole.$exp$,
      $note$Khan Academy: Divide unit fractions by whole numbers$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$1/6$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$3/2$body$,false,$msc$Multiplied by 3 (or flipped) instead of splitting into 3 parts.$msc$,'fraction_div_by_unit_inverted_wrong',2),
      (v_question_id,'C',$body$1/5$body$,false,$msc$Added 3 to the denominator (2+3) instead of multiplying.$msc$,'fraction_unlike_denominator_added_directly',3),
      (v_question_id,'D',$body$1/2$body$,false,$msc$Left the half unchanged, not dividing it at all.$msc$,'multi_step_skipped_step',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$What is 4 ÷ 1/3?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','medium',
      $stem$What is 4 ÷ 1/3?$stem$, NULL,
      $exp$4 ÷ 1/3 asks how many thirds are in 4. Each whole has 3 thirds, so 4 wholes have 4 × 3 = 12 thirds.$exp$,
      $note$Khan Academy: Divide whole numbers by unit fractions$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$12$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$4/3$body$,false,$msc$Multiplied 4 by 1/3 instead of dividing by it.$msc$,'division_used_wrong_inverse',2),
      (v_question_id,'C',$body$3/4$body$,false,$msc$Flipped the whole number instead of the unit fraction.$msc$,'fraction_div_by_unit_inverted_wrong',3),
      (v_question_id,'D',$body$7$body$,false,$msc$Added 4 + 3 instead of finding how many thirds fit.$msc$,'operation_wrong_keyword',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$What is 1/4 ÷ 2?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','medium',
      $stem$What is 1/4 ÷ 2?$stem$, NULL,
      $exp$Splitting 1/4 into 2 equal parts gives 1/(4×2) = 1/8.$exp$,
      $note$Khan Academy: Divide unit fractions by whole numbers$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$1/8$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$1/2$body$,false,$msc$Multiplied 1/4 by 2 instead of dividing it.$msc$,'division_used_wrong_inverse',2),
      (v_question_id,'C',$body$2/4$body$,false,$msc$Put the 2 in the numerator instead of the denominator.$msc$,'fraction_part_whole_swap',3),
      (v_question_id,'D',$body$1/6$body$,false,$msc$Added 2 to the denominator (4+2) instead of multiplying.$msc$,'fraction_unlike_denominator_added_directly',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Mei has 3 oranges. She cuts each into halves. How many half-orange pieces does she have?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','hard',
      $stem$Mei has 3 oranges. She cuts each into halves. How many half-orange pieces does she have?$stem$, NULL,
      $exp$This is 3 ÷ 1/2: how many halves are in 3? Each orange gives 2 halves, so 3 × 2 = 6 half-pieces.$exp$,
      $note$Khan Academy: Divide whole numbers by unit fractions$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$6$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$3/2$body$,false,$msc$Multiplied 3 by 1/2 instead of finding how many halves fit.$msc$,'division_used_wrong_inverse',2),
      (v_question_id,'C',$body$1.5$body$,false,$msc$Halved 3 instead of counting halves in 3.$msc$,'division_used_wrong_inverse',3),
      (v_question_id,'D',$body$5$body$,false,$msc$Added 3 + 2 instead of multiplying by halves per orange.$msc$,'operation_wrong_keyword',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$What is 1/5 ÷ 4?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'211_220','hard',
      $stem$What is 1/5 ÷ 4?$stem$, NULL,
      $exp$Splitting 1/5 into 4 equal parts gives 1/(5×4) = 1/20.$exp$,
      $note$Khan Academy: Divide unit fractions by whole numbers$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$1/20$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$4/5$body$,false,$msc$Multiplied 1/5 by 4 instead of dividing.$msc$,'division_used_wrong_inverse',2),
      (v_question_id,'C',$body$1/9$body$,false,$msc$Added 4 to the denominator (5+4) instead of multiplying.$msc$,'fraction_unlike_denominator_added_directly',3),
      (v_question_id,'D',$body$4/20$body$,false,$msc$Put the 4 in the numerator instead of multiplying the denominator only.$msc$,'fraction_part_whole_swap',4);
  END IF;
END $mig$;
