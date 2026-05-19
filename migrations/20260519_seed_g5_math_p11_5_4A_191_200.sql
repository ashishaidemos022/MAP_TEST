-- Grade 5 math seed (doc: Factors, Multiples & Algebra — Prime and Composite Numbers).
-- TEKS 5.4A "Identify prime and composite numbers", band 191_200.
DO $mig$
DECLARE v_standard_id uuid; v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject='math' AND grade=5 AND teks_code='5.4A';
  IF v_standard_id IS NULL THEN RAISE EXCEPTION 'standard not found: math g5 5.4A'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Which of these is a prime number?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'191_200','medium',
      $stem$Which of these is a prime number?$stem$, NULL,
      $exp$A prime has exactly two factors: 1 and itself. 17 = only 1 × 17. But 9 = 3 × 3, 15 = 3 × 5, 21 = 3 × 7, so those are composite. 17 is prime.$exp$,
      $note$Khan Academy: Identify prime numbers$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$17$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$9$body$,false,$msc$Thought 9 is prime because it is odd; 9 = 3 × 3.$msc$,'even_odd_ending_digit',2),
      (v_question_id,'C',$body$15$body$,false,$msc$Missed that 15 = 3 × 5, so it is composite.$msc$,'mult_used_wrong_fact',3),
      (v_question_id,'D',$body$21$body$,false,$msc$Missed that 21 = 3 × 7, so it is composite.$msc$,'mult_used_wrong_fact',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Which of these is a composite number?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'191_200','medium',
      $stem$Which of these is a composite number?$stem$, NULL,
      $exp$A composite number has more than two factors. 21 = 1, 3, 7, 21 — four factors. 2, 7, and 11 are each prime (only 1 and themselves). So 21 is composite.$exp$,
      $note$Khan Academy: Identify composite numbers$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$21$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$2$body$,false,$msc$Thought 2 is composite because it is even; 2 is the only even prime.$msc$,'even_odd_ending_digit',2),
      (v_question_id,'C',$body$7$body$,false,$msc$Treated the prime 7 as composite.$msc$,'_misc_other',3),
      (v_question_id,'D',$body$11$body$,false,$msc$Treated the prime 11 as composite.$msc$,'_misc_other',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$The dots can be arranged in a full 3-by-4 rectangle. Is 12 prime or composite?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'191_200','medium',
      $stem$The dots can be arranged in a full 3-by-4 rectangle. Is 12 prime or composite?$stem$,
      $svg$<svg viewBox='0 0 170 110' xmlns='http://www.w3.org/2000/svg'><g fill='#4a90e2'><circle cx='30' cy='25' r='7'/><circle cx='60' cy='25' r='7'/><circle cx='90' cy='25' r='7'/><circle cx='120' cy='25' r='7'/><circle cx='30' cy='55' r='7'/><circle cx='60' cy='55' r='7'/><circle cx='90' cy='55' r='7'/><circle cx='120' cy='55' r='7'/><circle cx='30' cy='85' r='7'/><circle cx='60' cy='85' r='7'/><circle cx='90' cy='85' r='7'/><circle cx='120' cy='85' r='7'/></g></svg>$svg$,
      $exp$Because 12 dots form a 3 × 4 rectangle, 3 and 4 are factors of 12 besides 1 and 12. Having more than two factors makes 12 composite.$exp$,
      $note$Khan Academy: Understand prime vs composite numbers$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$Composite$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$Prime$body$,false,$msc$Ignored that the rectangle proves factors other than 1 and 12.$msc$,'equal_groups_or_array_count',2),
      (v_question_id,'C',$body$Neither$body$,false,$msc$Confused 12 with the special case of 1, which is neither.$msc$,'_misc_other',3),
      (v_question_id,'D',$body$Both$body$,false,$msc$A number cannot be both; misunderstood the definitions.$msc$,'_misc_other',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Is the number 1 prime, composite, or neither?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'191_200','hard',
      $stem$Is the number 1 prime, composite, or neither?$stem$, NULL,
      $exp$A prime has exactly two different factors (1 and itself). 1 has only one factor — just 1. It is neither prime nor composite by definition.$exp$,
      $note$Khan Academy: Understand prime vs composite numbers$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$Neither$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$Prime$body$,false,$msc$Counted 1 as prime; a prime needs two different factors.$msc$,'_misc_other',2),
      (v_question_id,'C',$body$Composite$body$,false,$msc$Thought 1 has many factors; it has only one.$msc$,'equal_groups_or_array_count',3),
      (v_question_id,'D',$body$Both$body$,false,$msc$A number cannot be both prime and composite.$msc$,'_misc_other',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Which number is prime?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'191_200','hard',
      $stem$Which number is prime?$stem$, NULL,
      $exp$37 has only factors 1 and 37, so it is prime. 33 = 3 × 11, 35 = 5 × 7, 39 = 3 × 13 — all composite.$exp$,
      $note$Khan Academy: Identify prime numbers$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$37$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$33$body$,false,$msc$Missed that 33 = 3 × 11.$msc$,'mult_used_wrong_fact',2),
      (v_question_id,'C',$body$35$body$,false,$msc$Missed that 35 = 5 × 7.$msc$,'mult_used_wrong_fact',3),
      (v_question_id,'D',$body$39$body$,false,$msc$Missed that 39 = 3 × 13.$msc$,'mult_used_wrong_fact',4);
  END IF;
END $mig$;
