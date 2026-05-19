-- Grade 5 math seed (doc: Financial Literacy — Payment Methods).
-- TEKS 5.10C "Methods of payment: cash, check, debit, credit, electronic", band 231_240.
DO $mig$
DECLARE v_standard_id uuid; v_question_id uuid;
BEGIN
  SELECT id INTO v_standard_id FROM public.map_standards
    WHERE subject='math' AND grade=5 AND teks_code='5.10C';
  IF v_standard_id IS NULL THEN RAISE EXCEPTION 'standard not found: math g5 5.10C'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Which payment method lets you buy something now and pay the bank back later, often with extra fees?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'231_240','medium',
      $stem$Which payment method lets you buy something now and pay the bank back later, often with extra fees?$stem$, NULL,
      $exp$A credit card borrows money from the bank to pay now; you repay later, sometimes with interest. A debit card uses your own money immediately.$exp$,
      $note$Khan Academy: Identifying payment methods$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$Credit card$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$Debit card$body$,false,$msc$A debit card uses money you already have, not borrowed money.$msc$,'_misc_other',2),
      (v_question_id,'C',$body$Cash$body$,false,$msc$Cash is paid in full at the moment, with nothing owed later.$msc$,'_misc_other',3),
      (v_question_id,'D',$body$Check$body$,false,$msc$A check draws from your own bank account, not a loan.$msc$,'_misc_other',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Which payment method takes money directly out of your own bank account using a card?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'231_240','medium',
      $stem$Which payment method takes money directly out of your own bank account using a card?$stem$, NULL,
      $exp$A debit card immediately removes money from your own checking account. A credit card borrows from the bank instead.$exp$,
      $note$Khan Academy: Identifying payment methods$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$Debit card$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$Credit card$body$,false,$msc$A credit card borrows money rather than using your own funds.$msc$,'_misc_other',2),
      (v_question_id,'C',$body$Cash$body$,false,$msc$Cash is physical money, not a card linked to an account.$msc$,'_misc_other',3),
      (v_question_id,'D',$body$Income$body$,false,$msc$Income is money received, not a way to pay.$msc$,'financial_confused_income_with_savings',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$A written, signed order telling your bank to pay a specific amount from your account is called what?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'231_240','hard',
      $stem$A written, signed order telling your bank to pay a specific amount from your account is called what?$stem$, NULL,
      $exp$A check is a written, signed instruction directing the bank to pay a stated amount from the writer's account.$exp$,
      $note$Khan Academy: Identifying payment methods$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$Check$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$Credit card$body$,false,$msc$A credit card is a plastic card on a loan, not a written order.$msc$,'_misc_other',2),
      (v_question_id,'C',$body$Cash$body$,false,$msc$Cash is bills and coins, not a written instruction.$msc$,'_misc_other',3),
      (v_question_id,'D',$body$A budget$body$,false,$msc$A budget is a spending plan, not a payment method.$msc$,'_misc_other',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Selena pays for a snack using physical bills and coins. Which payment method is she using?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'231_240','medium',
      $stem$Selena pays for a snack using physical bills and coins. Which payment method is she using?$stem$, NULL,
      $exp$Paying with physical bills and coins is paying with cash.$exp$,
      $note$Khan Academy: Identifying payment methods$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$Cash$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$Debit card$body$,false,$msc$A debit card is electronic, not bills and coins.$msc$,'_misc_other',2),
      (v_question_id,'C',$body$Check$body$,false,$msc$A check is a written order, not physical currency.$msc$,'_misc_other',3),
      (v_question_id,'D',$body$Credit card$body$,false,$msc$A credit card is borrowed money on a card, not cash.$msc$,'_misc_other',4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE standard_id=v_standard_id AND stem=$stem$Caleb buys a $20 game using money he already has in his bank account, paying online with no card and no loan. Which method is this?$stem$) THEN
    INSERT INTO public.map_questions (subject,grade,standard_id,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,question_format,is_active)
    VALUES ('math',5,v_standard_id,'231_240','hard',
      $stem$Caleb buys a $20 game using money he already has in his bank account, paying online with no card and no loan. Which method is this?$stem$, NULL,
      $exp$Paying online straight from your bank account, without a card or a loan, is an electronic (online bank) payment using your own funds.$exp$,
      $note$Khan Academy: Identifying payment methods$note$,'mcq',true)
    RETURNING id INTO v_question_id;
    INSERT INTO public.map_question_choices (question_id,label,body,is_correct,misconception,misconception_tag,sort_order) VALUES
      (v_question_id,'A',$body$Electronic payment$body$,true,NULL,NULL,1),
      (v_question_id,'B',$body$Credit card$body$,false,$msc$No loan was used; he paid with his own money.$msc$,'_misc_other',2),
      (v_question_id,'C',$body$Cash$body$,false,$msc$No physical bills or coins changed hands; it was online.$msc$,'_misc_other',3),
      (v_question_id,'D',$body$Income$body$,false,$msc$Income is money received, not the way he paid.$msc$,'financial_confused_income_with_savings',4);
  END IF;
END $mig$;
