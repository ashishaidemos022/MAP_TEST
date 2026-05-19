-- Grade 5 math seed (doc: Measurement & Geometry — Quadrilaterals / Properties of Shapes).
-- TEKS 5.5A "Classify 2D figures in a hierarchy", band 201_210.
DO $mig$
DECLARE v_standard_id uuid; v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject='math' AND grade=5 AND teks_code='5.5A';
  IF v_standard_id IS NULL THEN RAISE EXCEPTION 'standard not found: math g5 5.5A'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$A square has 4 right angles and 4 equal sides. Which name is ALWAYS also true for a square?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'201_210','medium',
      $stem$A square has 4 right angles and 4 equal sides. Which name is ALWAYS also true for a square?$stem$,
      $svg$<svg viewBox='0 0 120 120' xmlns='http://www.w3.org/2000/svg'><rect x='25' y='25' width='70' height='70' fill='none' stroke='#555'/><g stroke='#555'><path d='M25 40 L40 40 L40 25' fill='none'/></g></svg>$svg$,
      $exp$A rectangle is any quadrilateral with 4 right angles. A square has 4 right angles, so every square is also a rectangle (a special one with equal sides).$exp$,
      $note$Khan Academy: Classifying shapes$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$Rectangle$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$Triangle$body$,false,$msc$A triangle has 3 sides; a square has 4.$msc$,'_misc_other',2),
      (v_question_id,'C',$body$Trapezoid only$body$,false,$msc$Matched one feature but a square fits the broader rectangle class.$msc$,'shape_attribute_partial_match',3),
      (v_question_id,'D',$body$Pentagon$body$,false,$msc$A pentagon has 5 sides; a square has 4.$msc$,'_misc_other',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Which of these figures is ALWAYS a quadrilateral?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'201_210','medium',
      $stem$Which of these figures is ALWAYS a quadrilateral?$stem$, NULL,
      $exp$A quadrilateral is a closed figure with exactly 4 sides. A rhombus has 4 sides. A triangle has 3, a pentagon 5, a hexagon 6.$exp$,
      $note$Khan Academy: Types of quadrilaterals$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$Rhombus$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$Triangle$body$,false,$msc$A triangle has only 3 sides, not 4.$msc$,'_misc_other',2),
      (v_question_id,'C',$body$Pentagon$body$,false,$msc$A pentagon has 5 sides, not 4.$msc$,'_misc_other',3),
      (v_question_id,'D',$body$Hexagon$body$,false,$msc$A hexagon has 6 sides, not 4.$msc$,'_misc_other',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Every rectangle is also which of these?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'201_210','hard',
      $stem$Every rectangle is also which of these?$stem$, NULL,
      $exp$A parallelogram has two pairs of parallel sides. A rectangle has two pairs of parallel sides (plus right angles), so every rectangle is a parallelogram.$exp$,
      $note$Khan Academy: Properties of shapes$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$Parallelogram$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$Square$body$,false,$msc$A rectangle is a square only when its sides are all equal; not always.$msc$,'shape_attribute_partial_match',2),
      (v_question_id,'C',$body$Rhombus$body$,false,$msc$A rhombus needs 4 equal sides, which a rectangle need not have.$msc$,'shape_attribute_partial_match',3),
      (v_question_id,'D',$body$Trapezoid with exactly one pair of parallel sides$body$,false,$msc$A rectangle has two pairs of parallel sides, not exactly one.$msc$,'shape_attribute_partial_match',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Which statement is true about squares and rhombuses?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'201_210','hard',
      $stem$Which statement is true about squares and rhombuses?$stem$, NULL,
      $exp$A rhombus is a quadrilateral with 4 equal sides. A square has 4 equal sides too, so every square is a rhombus (a rhombus that also has right angles).$exp$,
      $note$Khan Academy: Classifying shapes$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$Every square is a rhombus.$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$Every rhombus is a square.$body$,false,$msc$Reversed the relationship; a rhombus needs right angles to be a square.$msc$,'shape_attribute_partial_match',2),
      (v_question_id,'C',$body$A square is never a rhombus.$body$,false,$msc$Ignored that a square has 4 equal sides like a rhombus.$msc$,'shape_attribute_partial_match',3),
      (v_question_id,'D',$body$Neither is a quadrilateral.$body$,false,$msc$Both have 4 sides, so both are quadrilaterals.$msc$,'_misc_other',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$A triangle has all three sides equal in length. What is this triangle called?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'201_210','medium',
      $stem$A triangle has all three sides equal in length. What is this triangle called?$stem$,
      $svg$<svg viewBox='0 0 120 110' xmlns='http://www.w3.org/2000/svg'><polygon points='60,20 100,90 20,90' fill='none' stroke='#555'/></svg>$svg$,
      $exp$A triangle with all three sides equal is an equilateral triangle ("equi" = equal, "lateral" = sides).$exp$,
      $note$Khan Academy: Classify triangles by both sides and angles$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$Equilateral$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$Isosceles$body$,false,$msc$Isosceles needs only two equal sides; this has all three.$msc$,'shape_attribute_partial_match',2),
      (v_question_id,'C',$body$Scalene$body$,false,$msc$Scalene means no sides equal — the opposite here.$msc$,'shape_attribute_partial_match',3),
      (v_question_id,'D',$body$Right$body$,false,$msc$Named it by an angle type, not by its equal sides.$msc$,'shape_attribute_partial_match',4);
  END IF;
END $mig$;
