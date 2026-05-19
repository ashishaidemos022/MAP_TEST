-- Grade 5 math seed (doc: Financial Literacy — Taxes / Income).
-- TEKS 5.10A "Define income, payroll, sales, property tax", band 201_210.
DO $mig$
DECLARE v_standard_id uuid; v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject='math' AND grade=5 AND teks_code='5.10A';
  IF v_standard_id IS NULL THEN RAISE EXCEPTION 'standard not found: math g5 5.10A'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Which statement best describes income?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'201_210','medium',
      $stem$Which statement best describes income?$stem$, NULL,
      $exp$Income is money a person receives, such as pay from a job or money earned from work. It is money coming in, not money already saved or money spent.$exp$,
      $note$Khan Academy: Understanding income$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$Money a person earns or receives$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$Money a person has already saved in the bank$body$,false,$msc$Confused income with savings already set aside.$msc$,'financial_confused_income_with_savings',2),
      (v_question_id,'C',$body$Money a person spends on things they buy$body$,false,$msc$Described spending (expenses), not money coming in.$msc$,'_misc_other',3),
      (v_question_id,'D',$body$Money owed to the bank on a loan$body$,false,$msc$Described debt, not income.$msc$,'_misc_other',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Money taken out of a worker's paycheck for taxes is called what?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'201_210','medium',
      $stem$Money taken out of a worker's paycheck for taxes is called what?$stem$, NULL,
      $exp$A payroll tax is money withheld directly from a worker's pay. Sales tax is added to purchases; property tax is on owned property.$exp$,
      $note$Khan Academy: Introduction to taxes$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$Payroll tax$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$Sales tax$body$,false,$msc$Sales tax is added when buying goods, not taken from pay.$msc$,'_misc_other',2),
      (v_question_id,'C',$body$Property tax$body$,false,$msc$Property tax is on land or a home, not a paycheck.$msc$,'_misc_other',3),
      (v_question_id,'D',$body$Income$body$,false,$msc$Income is money received, not a tax withheld.$msc$,'financial_confused_income_with_savings',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Extra money added to the price when you buy something at a store is called what?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'201_210','medium',
      $stem$Extra money added to the price when you buy something at a store is called what?$stem$, NULL,
      $exp$Sales tax is a percentage added to the price of goods or services at purchase.$exp$,
      $note$Khan Academy: Introduction to taxes$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$Sales tax$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$Payroll tax$body$,false,$msc$Payroll tax comes out of wages, not store purchases.$msc$,'_misc_other',2),
      (v_question_id,'C',$body$Property tax$body$,false,$msc$Property tax is on owned property, not a store purchase.$msc$,'_misc_other',3),
      (v_question_id,'D',$body$Income$body$,false,$msc$Income is money received, not an added charge on a purchase.$msc$,'financial_confused_income_with_savings',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$A family pays a yearly tax based on the value of the home and land they own. What is this tax called?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'201_210','hard',
      $stem$A family pays a yearly tax based on the value of the home and land they own. What is this tax called?$stem$, NULL,
      $exp$Property tax is charged on the value of property a person owns, such as a house and the land it sits on.$exp$,
      $note$Khan Academy: Introduction to taxes$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$Property tax$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$Sales tax$body$,false,$msc$Sales tax applies to purchases, not owned property.$msc$,'_misc_other',2),
      (v_question_id,'C',$body$Payroll tax$body$,false,$msc$Payroll tax comes from wages, not property value.$msc$,'_misc_other',3),
      (v_question_id,'D',$body$Income tax only on the house$body$,false,$msc$A home's value is taxed as property, not as income.$msc$,'financial_confused_income_with_savings',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Ravi earns $30 mowing lawns this weekend. The $30 he receives is an example of what?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'201_210','hard',
      $stem$Ravi earns $30 mowing lawns this weekend. The $30 he receives is an example of what?$stem$, NULL,
      $exp$Money earned from doing work is income — it is money coming in to Ravi.$exp$,
      $note$Khan Academy: Understanding income$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$Income$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$Savings$body$,false,$msc$It only becomes savings if he sets it aside; first it is income.$msc$,'financial_confused_income_with_savings',2),
      (v_question_id,'C',$body$Sales tax$body$,false,$msc$No purchase was taxed; this is earned money.$msc$,'_misc_other',3),
      (v_question_id,'D',$body$An expense$body$,false,$msc$An expense is money spent, not money earned.$msc$,'_misc_other',4);
  END IF;
END $mig$;
