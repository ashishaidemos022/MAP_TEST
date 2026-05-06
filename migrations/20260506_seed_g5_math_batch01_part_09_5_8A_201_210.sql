-- Grade 5 math seed batch 01, part 09/10 — TEKS 5.8A, band 201_210.
-- 5 questions × 4 choices. Idempotent (NOT EXISTS guard on stem + standard).

DO $mig$
DECLARE
  v_standard_id uuid;
  v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject = 'math' AND grade = 5 AND teks_code = '5.8A';
  IF v_standard_id IS NULL THEN
    RAISE EXCEPTION 'standard not found: math grade 5 teks 5.8A';
  END IF;

  -- q1
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$On the coordinate plane shown, which point is located at (3, 4)?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$On the coordinate plane shown, which point is located at (3, 4)?$stem$,
            $svg$<svg viewBox='0 0 240 240' xmlns='http://www.w3.org/2000/svg'><g stroke='#ddd' stroke-width='0.5'><line x1='30' y1='30' x2='30' y2='210'/><line x1='50' y1='30' x2='50' y2='210'/><line x1='70' y1='30' x2='70' y2='210'/><line x1='90' y1='30' x2='90' y2='210'/><line x1='110' y1='30' x2='110' y2='210'/><line x1='130' y1='30' x2='130' y2='210'/><line x1='150' y1='30' x2='150' y2='210'/><line x1='170' y1='30' x2='170' y2='210'/><line x1='190' y1='30' x2='190' y2='210'/><line x1='210' y1='30' x2='210' y2='210'/><line x1='30' y1='30' x2='210' y2='30'/><line x1='30' y1='50' x2='210' y2='50'/><line x1='30' y1='70' x2='210' y2='70'/><line x1='30' y1='90' x2='210' y2='90'/><line x1='30' y1='110' x2='210' y2='110'/><line x1='30' y1='130' x2='210' y2='130'/><line x1='30' y1='150' x2='210' y2='150'/><line x1='30' y1='170' x2='210' y2='170'/><line x1='30' y1='190' x2='210' y2='190'/><line x1='30' y1='210' x2='210' y2='210'/></g><g stroke='#000' stroke-width='1.5'><line x1='30' y1='210' x2='220' y2='210'/><line x1='30' y1='210' x2='30' y2='20'/></g><g font-family='sans-serif' font-size='10'><text x='28' y='225'>0</text><text x='48' y='225'>1</text><text x='68' y='225'>2</text><text x='88' y='225'>3</text><text x='108' y='225'>4</text><text x='128' y='225'>5</text><text x='148' y='225'>6</text><text x='168' y='225'>7</text><text x='188' y='225'>8</text><text x='208' y='225'>9</text><text x='15' y='213'>0</text><text x='15' y='193'>1</text><text x='15' y='173'>2</text><text x='15' y='153'>3</text><text x='15' y='133'>4</text><text x='15' y='113'>5</text><text x='15' y='93'>6</text><text x='15' y='73'>7</text><text x='15' y='53'>8</text><text x='115' y='225' font-weight='bold'>x</text><text x='15' y='25' font-weight='bold'>y</text></g><g><circle cx='90' cy='130' r='4' fill='#d62728'/><text x='95' y='128' font-family='sans-serif' font-size='12' font-weight='bold'>P</text><circle cx='130' cy='150' r='4' fill='#1f77b4'/><text x='135' y='148' font-family='sans-serif' font-size='12' font-weight='bold'>Q</text><circle cx='150' cy='110' r='4' fill='#2ca02c'/><text x='155' y='108' font-family='sans-serif' font-size='12' font-weight='bold'>R</text><circle cx='110' cy='90' r='4' fill='#ff7f0e'/><text x='115' y='88' font-family='sans-serif' font-size='12' font-weight='bold'>S</text></g></svg>$svg$,
            $exp$(3, 4) means 3 units along the x-axis and 4 units up the y-axis. Point P is at (3, 4): three columns right of the origin and four rows up.$exp$,
            $note$Khan Academy: Coordinate plane attributes$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$Point P$body$, true, NULL, NULL, 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$Point Q (which is at (5, 3))$body$, false, $msc$Swapped x and y, plotting at (4, 3) instead of (3, 4) — and then misread the chart.$msc$, 'coordinate_swapped_x_and_y', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$Point R (which is at (6, 5))$body$, false, $msc$Started counting from 1 instead of 0 on each axis.$msc$, 'coordinate_counted_from_one_not_zero', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$Point S (which is at (4, 6))$body$, false, $msc$Plotted (4, 6) instead of (3, 4) — confused which number is x.$msc$, 'coordinate_swapped_x_and_y', 4);
  END IF;

  -- q2
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Where is the origin on the coordinate plane?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$Where is the origin on the coordinate plane?$stem$,
            NULL,
            $exp$The origin is the point where the x-axis and y-axis meet. Its coordinates are (0, 0).$exp$,
            $note$Khan Academy: Coordinate plane attributes$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$(1, 1)$body$, false, $msc$Counted axis units starting from 1 instead of 0.$msc$, 'coordinate_counted_from_one_not_zero', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$(0, 0)$body$, true, NULL, NULL, 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$On the x-axis at any point$body$, false, $msc$Confused 'origin' (one specific point) with 'on the axis' (a line).$msc$, 'coordinate_swapped_x_and_y', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$Anywhere where the gridlines cross$body$, false, $msc$Generalized 'origin' to mean any gridline intersection.$msc$, 'coordinate_counted_from_one_not_zero', 4);
  END IF;

  -- q3
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Selena plots the point (5, 2). She moves 3 units right and 1 unit up. What is her new point?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$Selena plots the point (5, 2). She moves 3 units right and 1 unit up. What is her new point?$stem$,
            NULL,
            $exp$Right increases x, up increases y. New x: 5 + 3 = 8. New y: 2 + 1 = 3. New point: (8, 3).$exp$,
            $note$Khan Academy: Coordinate plane attributes$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$(8, 3)$body$, true, NULL, NULL, 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$(3, 8)$body$, false, $msc$Swapped the new x and y coordinates.$msc$, 'coordinate_swapped_x_and_y', 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$(2, 1)$body$, false, $msc$Subtracted the moves instead of adding (treated 'right' as negative).$msc$, 'operation_swap_add_subtract', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$(6, 3)$body$, false, $msc$Added 1 to the x instead of 3 (swapped which move went with which axis).$msc$, 'coordinate_swapped_x_and_y', 4);
  END IF;

  -- q4
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$Theo says, 'In an ordered pair (a, b), the second number tells you how far across.' Is he correct?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$Theo says, 'In an ordered pair (a, b), the second number tells you how far across.' Is he correct?$stem$,
            NULL,
            $exp$No. The FIRST number (a) tells you how far across (along the x-axis). The SECOND number (b) tells you how far up (along the y-axis). 'Run before you climb.'$exp$,
            $note$Khan Academy: Coordinate plane attributes$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$Yes — the second number is x.$body$, false, $msc$Swapped which coordinate is x and which is y.$msc$, 'coordinate_swapped_x_and_y', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$No — the FIRST number tells you how far across; the second tells you how far up.$body$, true, NULL, NULL, 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$Yes — both numbers tell you how far across, but at different speeds.$body$, false, $msc$Made up a rule that doesn't match how coordinates work.$msc$, 'coordinate_swapped_x_and_y', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$It depends on which axis is on top.$body$, false, $msc$Treated coordinate convention as variable instead of standard.$msc$, 'coordinate_swapped_x_and_y', 4);
  END IF;

  -- q5
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id = v_standard_id AND stem = $stem$What is the y-coordinate of the point (7, 9)?$stem$) THEN
    INSERT INTO public.map_questions
      (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note, question_format, is_active)
    VALUES ('math', 5, v_standard_id, '201_210', 'medium',
            $stem$What is the y-coordinate of the point (7, 9)?$stem$,
            NULL,
            $exp$In (x, y), x is the first number and y is the second. The y-coordinate of (7, 9) is 9.$exp$,
            $note$Khan Academy: Coordinate plane attributes$note$,
            'mcq', true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'A', $body$7$body$, false, $msc$Picked the x-coordinate by treating the first number as y.$msc$, 'coordinate_swapped_x_and_y', 1);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'B', $body$9$body$, true, NULL, NULL, 2);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'C', $body$16$body$, false, $msc$Added the two coordinates.$msc$, 'operation_swap_add_subtract', 3);
    INSERT INTO public.map_question_choices (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
    VALUES (v_question_id, 'D', $body$63$body$, false, $msc$Multiplied the two coordinates.$msc$, 'operation_swap_add_subtract', 4);
  END IF;

END $mig$;