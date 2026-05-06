-- Grade 5 math seed batch 01, part 07/10 — TEKS 5.6B, band 211_220.
-- Sub-skill (§17): volume_rect_prisms_formula.
-- 5 questions × 4 choices. Idempotent (NOT EXISTS guard on stem + standard).

DO $mig$
DECLARE
  v_standard_id uuid;
  v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject = 'math' AND grade = 5 AND teks_code = '5.6B';
  IF v_standard_id IS NULL THEN
    RAISE EXCEPTION 'standard not found: math grade 5 teks 5.6B';
  END IF;

  -- q1
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$A rectangular prism has length 5 cm, width 3 cm, and height 4 cm. What is its volume?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '211_220', 'medium',
            $stem$A rectangular prism has length 5 cm, width 3 cm, and height 4 cm. What is its volume?$stem$,
            $svg$<svg viewBox='0 0 220 180' xmlns='http://www.w3.org/2000/svg'><g stroke='#333' stroke-width='1.5' fill='none'><polygon points='30,140 130,140 170,110 70,110' fill='#cfe4ff'/><polygon points='130,140 170,110 170,40 130,70' fill='#9bb8d4'/><polygon points='30,140 130,140 130,70 30,70' fill='#e4f0ff'/><polyline points='30,70 70,40 170,40' /><polyline points='70,40 70,110' stroke-dasharray='3,3'/></g><text x='70' y='160' font-family='sans-serif' font-size='14'>length 5 cm</text><text x='150' y='90' font-family='sans-serif' font-size='14'>height 4 cm</text><text x='5' y='100' font-family='sans-serif' font-size='14'>w 3 cm</text></svg>$svg$,
            $exp$Volume of a rectangular prism = length × width × height. V = 5 × 3 × 4 = 60 cubic centimeters.$exp$,
            $note$Khan Academy: Volume of rectangular prisms (formula)$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$12 cm³$body$, false, $msc$Added the three dimensions (5 + 3 + 4) instead of multiplying.$msc$, 'volume_added_dimensions_instead_of_multiplied', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$60 cm³$body$, true, NULL, NULL, 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$94 cm³$body$, false, $msc$Computed surface area (2(5·3 + 5·4 + 3·4) = 94) instead of volume.$msc$, 'volume_used_surface_area_formula', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$47 cm³$body$, false, $msc$Halved the surface area, thinking volume is half of surface area.$msc$, 'volume_used_surface_area_formula', 4);
  END IF;

  -- q2
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$What is the volume of a rectangular prism with length 8 m, width 3 m, and height 6 m?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '211_220', 'medium',
            $stem$What is the volume of a rectangular prism with length 8 m, width 3 m, and height 6 m?$stem$,
            NULL,
            $exp$V = l × w × h = 8 × 3 × 6 = 144 cubic meters.$exp$,
            $note$Khan Academy: Volume of rectangular prisms (formula)$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$17 m³$body$, false, $msc$Added the three dimensions instead of multiplying.$msc$, 'volume_added_dimensions_instead_of_multiplied', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$24 m³$body$, false, $msc$Multiplied length × width but forgot the height.$msc$, 'multi_step_skipped_step', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$144 m³$body$, true, NULL, NULL, 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$180 m³$body$, false, $msc$Computed surface area (2(8·3 + 8·6 + 3·6) = 180) instead of volume.$msc$, 'volume_used_surface_area_formula', 4);
  END IF;

  -- q3
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$A box has area of base 24 in² and height 5 in. What is its volume?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '211_220', 'medium',
            $stem$A box has area of base 24 in² and height 5 in. What is its volume?$stem$,
            NULL,
            $exp$Volume = (area of base) × height = 24 × 5 = 120 cubic inches.$exp$,
            $note$Khan Academy: Volume as (area of base × height)$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$29 in³$body$, false, $msc$Added base area and height instead of multiplying.$msc$, 'volume_added_dimensions_instead_of_multiplied', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$120 in³$body$, true, NULL, NULL, 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$60 in³$body$, false, $msc$Halved the volume, treating it like the formula for a triangular prism.$msc$, 'volume_used_surface_area_formula', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$12 in³$body$, false, $msc$Halved the area of the base before multiplying, thinking only half is filled.$msc$, 'fraction_part_whole_swap', 4);
  END IF;

  -- q4
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Hiroshi builds a fish tank shaped like a rectangular prism. It is 10 in long, 5 in wide, and 8 in tall. How many cubic inches of water can it hold?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '211_220', 'medium',
            $stem$Hiroshi builds a fish tank shaped like a rectangular prism. It is 10 in long, 5 in wide, and 8 in tall. How many cubic inches of water can it hold?$stem$,
            NULL,
            $exp$V = 10 × 5 × 8 = 400 cubic inches.$exp$,
            $note$Khan Academy: Solve real-world volume problems$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$23 in³$body$, false, $msc$Added the three dimensions instead of multiplying.$msc$, 'volume_added_dimensions_instead_of_multiplied', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$50 in³$body$, false, $msc$Multiplied length × width but forgot the height.$msc$, 'multi_step_skipped_step', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$400 in³$body$, true, NULL, NULL, 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$340 in³$body$, false, $msc$Computed surface area (2(50 + 80 + 40) = 340) instead of volume.$msc$, 'volume_used_surface_area_formula', 4);
  END IF;

  -- q5
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$A storage cube has all sides of length 4 ft. What is its volume?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '211_220', 'medium',
            $stem$A storage cube has all sides of length 4 ft. What is its volume?$stem$,
            NULL,
            $exp$A cube has equal length, width, and height. V = 4 × 4 × 4 = 64 cubic feet.$exp$,
            $note$Khan Academy: Volume of rectangular prisms (formula)$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$12 ft³$body$, false, $msc$Added 4 + 4 + 4 instead of multiplying.$msc$, 'volume_added_dimensions_instead_of_multiplied', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$16 ft³$body$, false, $msc$Multiplied two dimensions (computing area, not volume).$msc$, 'area_used_perimeter', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$64 ft³$body$, true, NULL, NULL, 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$96 ft³$body$, false, $msc$Computed surface area (6 × 16 = 96) of the cube instead of volume.$msc$, 'volume_used_surface_area_formula', 4);
  END IF;

END $mig$;