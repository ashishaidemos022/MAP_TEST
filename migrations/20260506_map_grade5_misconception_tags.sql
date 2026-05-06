-- Grade5_Seeding_Brief §10 — Grade 5 misconception tag additions.
--
-- 46 new tags (16 math, 11 reading, 19 language) covering the new Grade 5
-- skill ground: decimals, fraction add/sub/×/÷, volume, coordinate plane,
-- order of operations, theme vs topic, polysemous vocab, perfect-tense
-- helpers, comma rules, homophones, and run-on / fragment patterns.
--
-- Already applied 2026-05-06 via mcp__plugin_supabase_supabase__apply_migration.
-- This file is for repo audit / replay parity.
-- Idempotent: ON CONFLICT (tag) DO NOTHING.

INSERT INTO public.map_misconception_tags
  (tag, subject, display_name, description, remediation_hint, related_teks, child_cta)
VALUES

-- ---- math (16) ----

('decimal_place_value_misread', 'math',
 'Misread the place value of a decimal',
 $d$Treated 0.04 as 0.4 (or 4) — read the decimal as if the leading zeros didn't shift the value.$d$,
 $r$Line up the decimal point and check each digit's place: tenths, hundredths, thousandths. The number of zeros after the decimal point matters.$r$,
 ARRAY['5.2A','5.2B','5.2C'],
 'Count the places after the decimal point. Each one is ten times smaller than the last.'),

('decimal_align_decimal_point', 'math',
 'Aligned digits on the right instead of aligning decimal points',
 'Added or subtracted decimals by right-aligning digits instead of stacking decimal points. Produces a wrong place-value sum.',
 'Always line up the decimal points, then add or subtract column by column. Add zeros to make the columns match if needed.',
 ARRAY['5.3K'],
 'Stack the decimal points first. The dots have to be on top of each other.'),

('decimal_count_zeros_in_product', 'math',
 'Counted zeros instead of decimal places when placing the decimal in a product',
 'Multiplied decimals correctly but placed the decimal point by counting zeros instead of total decimal places in both factors.',
 $r$Count total decimal places in both factors (e.g., 0.4 × 0.03 has 1 + 2 = 3 places); the product has that many decimal places.$r$,
 ARRAY['5.3D','5.3E'],
 'Count the digits after the decimal in both numbers, then move the decimal that many places in your answer.'),

('decimal_division_shifted_wrong_direction', 'math',
 'Shifted the decimal the wrong direction when dividing by a decimal',
 'When dividing by 0.1, multiplied by 0.1 instead of by 10 (or shifted both decimals the wrong way).',
 'Dividing by 0.1 is the same as multiplying by 10 — the answer should get bigger. If your answer got smaller, check the shift direction.',
 ARRAY['5.3G'],
 'Dividing by 0.1 means the answer gets BIGGER, not smaller. Check your shift.'),

('estimation_didnt_round_first', 'math',
 'Computed exactly, then rounded the answer',
 'Solved the problem exactly and then rounded the result, which defeats the purpose of estimation and gets a different answer than rounding the inputs first.',
 'Estimation rounds BEFORE computing. Round each number to a friendly value, then add/subtract/multiply with those friendly values.',
 ARRAY['5.3A'],
 $c$Round the numbers first, THEN add. That's estimating.$c$),

('fraction_unlike_denominator_added_directly', 'math',
 'Added unlike-denominator fractions by adding numerators and denominators',
 'Added 1/2 + 1/3 as 2/5 by treating numerators and denominators as separate sums.',
 'Find a common denominator first. Rewrite both fractions with that denominator, THEN add the numerators only.',
 ARRAY['5.3H','5.3K'],
 $c$Find a common bottom number first. The bottom doesn't change when you add — just the top.$c$),

('fraction_mixed_did_not_regroup', 'math',
 'Subtracted mixed numbers without regrouping the whole part',
 'Tried to subtract a larger fraction from a smaller fraction in mixed-number form without regrouping a whole into a fraction.',
 'When the top fraction is smaller than the bottom one, regroup: borrow 1 from the whole and add it as a fraction with the same denominator.',
 ARRAY['5.3H','5.3K'],
 'When the fraction part on top is too small, borrow a whole from the next column.'),

('fraction_div_by_unit_inverted_wrong', 'math',
 'Flipped the wrong fraction in fraction division',
 'In a ÷ b problem, flipped the dividend (a) instead of the divisor (b), or flipped both.',
 'Keep–Change–Flip: keep the first number, change ÷ to ×, flip the SECOND fraction (the divisor).',
 ARRAY['5.3J','5.3L'],
 'Keep, change, flip — but only flip the second fraction.'),

('volume_used_surface_area_formula', 'math',
 'Computed surface area instead of volume',
 'For a rectangular prism, found the surface area (sum of face areas) when the question asked for volume (l × w × h).',
 'Volume fills the inside (cubic units); surface area covers the outside (square units). Match the question to the right formula.',
 ARRAY['5.4G','5.4H','5.6A','5.6B'],
 'Volume = inside (l × w × h). Surface area = outside (the wrapping paper).'),

('volume_added_dimensions_instead_of_multiplied', 'math',
 'Added length + width + height instead of multiplying',
 'Treated volume like a perimeter sum and added the three dimensions instead of multiplying them.',
 'Volume of a rectangular prism is l × w × h — multiplied, not added. Adding gives total edge length, not volume.',
 ARRAY['5.4G','5.4H','5.6B'],
 'Volume MULTIPLIES the three numbers. Adding gives a different thing.'),

('coordinate_swapped_x_and_y', 'math',
 'Plotted (x, y) at the location of (y, x)',
 'Swapped which number meant horizontal and which meant vertical. (3, 5) ended up where (5, 3) belongs.',
 'The x always comes first in the pair AND on the horizontal axis. Run before you climb: x first (run), then y (climb).',
 ARRAY['5.8A','5.8B','5.8C'],
 'X is run, Y is climb. The first number tells you how far across.'),

('coordinate_counted_from_one_not_zero', 'math',
 'Counted axis units starting from 1 instead of 0',
 $d$Placed (1, 1) one unit beyond where it belongs because they counted the origin gridline as "1" instead of "0".$d$,
 'The origin (0, 0) is where the axes meet. Start counting from there, not from the first gridline.',
 ARRAY['5.8A','5.8B'],
 'Start at zero, not at one. The first move counts as one.'),

('order_of_operations_left_to_right', 'math',
 'Evaluated left to right instead of following PEMDAS',
 'Computed 6 + 4 × 2 as 20 (working left to right) instead of 14 (multiplication before addition).',
 'Multiplication and division come before addition and subtraction, regardless of order. Parentheses always go first.',
 ARRAY['5.4E','5.4F'],
 'Times and divide come before plus and minus. PEMDAS rules.'),

('pattern_continued_arithmetic_when_geometric', 'math',
 'Continued a doubling pattern by adding instead of multiplying',
 'Saw 2, 4, 8, 16 and continued as 24 (added 8 each time) or 18 (added the previous step) instead of doubling to 32.',
 'Find the rule by checking BOTH ratio (÷) and difference (−) between consecutive terms. If the ratio is constant, multiply; if the difference is, add.',
 ARRAY['5.4C','5.4D'],
 $c$Check: are we adding the same amount each time, or multiplying? They're different.$c$),

('unit_conversion_wrong_direction', 'math',
 'Multiplied when should have divided (or vice versa) in unit conversion',
 'Going from meters to centimeters needs ×100 (more cm than m); the student divided instead, or the reverse.',
 'Bigger unit → smaller unit means MORE smaller units, so multiply. Smaller unit → bigger unit means divide.',
 ARRAY['5.7A'],
 'Going to a smaller unit gives a bigger number. Going bigger gives a smaller number.'),

('financial_confused_income_with_savings', 'math',
 'Counted savings as part of monthly income',
 'Listed savings (money already put aside) as a row in the income column when balancing a budget.',
 $r$Income is money coming IN this period (paycheck, allowance). Savings is what's LEFT after expenses — it sits on the balance side, not the income side.$r$,
 ARRAY['5.10B','5.10E','5.10F'],
 'Income is what comes in. Savings is what stays. They go in different rows.'),

-- ---- reading (11) ----

('inference_overgeneralized', 'reading',
 'Drew a conclusion broader than the passage supports',
 $d$Selected an answer like "all scientists agree" when the passage describes only one study or one expert.$d$,
 $r$Stick to what the text actually says. If the passage describes one example, the inference can't safely apply to "all" or "always".$r$,
 ARRAY['5.6F','5.7C'],
 $c$Did the passage really say "all" or "always"? Or just talk about one thing?$c$),

('inference_relied_on_outside_knowledge', 'reading',
 'Used real-world knowledge instead of evidence in the passage',
 'Picked the answer that matches what the student already knows about the topic, not what the passage explicitly says or implies.',
 $r$Every inference must trace back to a sentence in the passage. If the only support is "I already knew that," it's not a reading inference.$r$,
 ARRAY['5.6F','5.7C'],
 $c$Find the sentence in the passage that backs up your answer. If you can't, try a different one.$c$),

('theme_picked_topic', 'reading',
 'Confused topic with theme',
 $d$Picked "friendship" (a topic — a noun) instead of "Friends sometimes have to set hard limits with each other" (a theme — a sentence about life).$d$,
 'Theme is a complete sentence about life that you could put on a poster. Topic is a single word or phrase. The right answer to a theme question almost always has a verb.',
 ARRAY['5.8A'],
 'Theme is a SENTENCE about life. Topic is a word. Pick the sentence.'),

('summary_included_minor_detail', 'reading',
 'Included a minor detail that a high-level summary should leave out',
 $d$Picked a summary that mentions a specific name, number, or aside that's not central to the passage.$d$,
 'Summaries keep big ideas; they drop names, exact numbers, and side comments unless those ARE the main point.',
 ARRAY['5.7D'],
 'A summary keeps the big idea, not the small details.'),

('summary_copied_first_sentence', 'reading',
 $d$Picked the choice that mirrors the passage's opening sentence$d$,
 $d$Selected a summary that just rephrases the passage's introduction instead of capturing the whole passage.$d$,
 $r$A summary has to cover the WHOLE passage, not just the start. Check whether the choice's ideas appear later in the passage too.$r$,
 ARRAY['5.7D'],
 'A summary has to cover the whole passage, not just the start.'),

('vocab_wrong_sense_of_polysemous_word', 'reading',
 $d$Picked a real meaning of a multi-meaning word that doesn't fit context$d$,
 $d$For "I sat on the bank watching the river," chose the financial-institution meaning instead of riverbank.$d$,
 'Re-read the sentence around the word. Substitute each meaning into the sentence and see which keeps it making sense.',
 ARRAY['5.2B','5.2C'],
 'Try each meaning in the sentence. Which one fits the story?'),

('vocab_antonym', 'reading',
 'Picked the opposite of the correct meaning',
 $d$Selected the antonym (e.g., "sad" when the answer is "happy") — likely confusing two related but opposite words.$d$,
 'Substitute your choice into the sentence. If the sentence now means the opposite of what the passage says, you picked the antonym.',
 ARRAY['5.2B'],
 $c$Try your word in the sentence. Does it make the sentence mean the OPPOSITE? That's the wrong one.$c$),

('purpose_confused_topic_with_purpose', 'reading',
 $d$Picked the topic when the question asks for the author's purpose$d$,
 $d$Selected "to teach about volcanoes" when the answer is "to persuade readers that volcano monitoring should be funded" — i.e., picked the subject, not the goal.$d$,
 $r$Purpose answers WHY the author wrote it (to inform, persuade, entertain, describe). Topic answers WHAT it's about. The right answer usually starts with "to" + a verb.$r$,
 ARRAY['5.10A'],
 $c$Purpose = WHY. Topic = WHAT. The right answer starts with "to ___".$c$),

('argumentative_confused_claim_with_evidence', 'reading',
 $d$Picked a piece of evidence as the author's claim$d$,
 $d$Selected a fact or statistic the author cites instead of the overall claim the author is making.$d$,
 $r$The claim is the AUTHOR'S OPINION — what they're trying to convince you of. Evidence is the facts and reasons they use to back it up.$r$,
 ARRAY['5.9E'],
 'A claim is what the author wants you to BELIEVE. Evidence is what they use to convince you.'),

('text_structure_picked_first_one_recognized', 'reading',
 $d$Selected a structure based on a surface signal, not the passage's actual organization$d$,
 $d$Picked "compare-contrast" because the passage mentions two things, when the actual structure is "cause-effect" (one thing causes the other).$d$,
 $r$Look for signal words across the WHOLE passage. "Because/so/leads to" → cause-effect. "Both/unlike/whereas" → compare-contrast. "First/then/next" → sequence. The dominant pattern is the structure.$r$,
 ARRAY['5.9D.iii'],
 $c$Don't go by the first signal word you see. Look for the dominant pattern across the whole passage.$c$),

('figurative_language_literal_interpretation', 'reading',
 'Read figurative language literally',
 $d$Interpreted "her eyes were diamonds" as actual diamonds, or "the storm raged for hours" as the storm being literally angry.$d$,
 $r$When something seems exaggerated, impossible, or unreal, it's probably a metaphor or simile. Ask: what feeling or picture is the author painting?$r$,
 ARRAY['5.9B','5.10D'],
 'Does this really happen, or is it painting a picture? Picture words = figurative.'),

-- ---- language (19) ----

('verb_perfect_tense_wrong_helper', 'language',
 'Used the wrong helper verb in a perfect-tense form',
 $d$Selected "have went" instead of "have gone," or "has rode" instead of "has ridden". Mixed simple-past form with a perfect-tense helper.$d$,
 $r$Perfect tense uses the past participle with "have/has/had". The past participle is often different from the simple past: went → gone, rode → ridden, ate → eaten.$r$,
 ARRAY['5.11D.ii'],
 $c$With "have" or "has," use the special past form: gone, ridden, eaten — not went, rode, ate.$c$),

('verb_tense_inconsistent_within_passage', 'language',
 'Tense shifted within a passage in the wrong place',
 'Picked an answer that introduces a tense shift mid-paragraph (e.g., past to present) when the rest of the passage is in past tense.',
 'Read the surrounding sentences. The tense should usually stay consistent unless the passage is intentionally describing a different time.',
 ARRAY['5.11D.ii'],
 'Read the sentences before and after. Does the tense match?'),

('pronoun_compound_subject_wrong_case', 'language',
 'Used object case in a compound subject (or vice versa)',
 $d$Wrote "Me and my sister went" instead of "My sister and I went," or "him and I" instead of "he and I".$d$,
 $r$Drop the other person and check the pronoun alone. "Me went" is wrong, so "Me and my sister went" is wrong too. Use I/he/she for subjects, me/him/her for objects.$r$,
 ARRAY['5.11D.vii'],
 'Take out the other person — does the pronoun still sound right alone?'),

('pronoun_unclear_antecedent', 'language',
 'Used a pronoun whose antecedent is ambiguous or missing',
 $d$"It" or "they" appears without a clear noun it refers to, or it could refer to two different nouns in the sentence.$d$,
 'Every pronoun needs ONE clear noun it stands in for. If the reader has to guess, replace the pronoun with the noun.',
 ARRAY['5.11D.vii'],
 $c$When you read "it" or "they," can you tell exactly what or who it means? If not, name them.$c$),

('comma_after_introductory_phrase_missing', 'language',
 'Forgot the comma after an introductory phrase',
 $d$Wrote "After dinner we went to the park" without the comma after the introductory time phrase.$d$,
 'When a sentence starts with a phrase that sets the scene (After dinner, In the morning, Before the storm), put a comma between the phrase and the main clause.',
 ARRAY['5.11D.x'],
 'A phrase at the start of a sentence usually needs a comma before the main idea.'),

('comma_in_compound_sentence_missing', 'language',
 'Forgot the comma before a coordinating conjunction in a compound sentence',
 $d$"I was tired but I kept going" — missing the comma before "but" that joins two complete sentences.$d$,
 'When a coordinating conjunction (and, but, or, so, yet) joins two complete sentences, put a comma before it.',
 ARRAY['5.11D.x','5.11D.viii'],
 $c$Comma before "and / but / or / so" when both sides are full sentences.$c$),

('comma_unnecessary_between_subject_and_verb', 'language',
 'Added a comma between the subject and the verb',
 $d$Wrote "The dog, ran away" — the comma incorrectly separates the subject from its verb.$d$,
 'Never put a comma between a subject and its verb. The subject and the verb belong together.',
 ARRAY['5.11D.x'],
 $c$Don't put a comma between WHO does it and WHAT they did.$c$),

('apostrophe_its_vs_its', 'language',
 $d$Confused its (possessive) with it's (it is)$d$,
 $d$"The dog wagged it's tail" — should be "its". OR "Its raining" — should be "it's".$d$,
 $r$It's = it is (the apostrophe replaces the missing "i"). Its = belongs to it (no apostrophe, like his/hers).$r$,
 ARRAY['5.11D.x'],
 $c$Try replacing it's with "it is." If the sentence still makes sense, use the apostrophe.$c$),

('apostrophe_possessive_vs_plural', 'language',
 'Used an apostrophe in a regular plural',
 $d$Wrote "my parent's all came" or "three apple's" — the apostrophe doesn't belong; the noun is just plural.$d$,
 $r$Plurals never use apostrophes. "Apples" = more than one apple. "Apple's" = belongs to the apple.$r$,
 ARRAY['5.11D.x','5.11D.iii'],
 'More than one? Just add s — no apostrophe needed.'),

('homophone_their_there_theyre', 'language',
 $d$Confused their / there / they're$d$,
 $d$Wrote "Their going to the park" or "they're house" — picked the wrong homophone for the meaning.$d$,
 $r$Their = belongs to them (their house). There = a place (over there). They're = they are (they're going).$r$,
 ARRAY['5.11D.x','5.11D.xi'],
 $c$Their = theirs. There = a place. They're = they are. Replace and check.$c$),

('homophone_to_too_two', 'language',
 'Confused to / too / two',
 $d$Wrote "I want to go to" when meaning "too much," or "two cold" when meaning "too cold".$d$,
 'To = direction or part of a verb (to go). Too = also or more than enough (too cold). Two = the number 2.',
 ARRAY['5.11D.x','5.11D.xi'],
 'To = toward. Too = also/extra. Two = 2. Pick the meaning, then pick the spelling.'),

('homophone_your_youre', 'language',
 $d$Confused your with you're$d$,
 $d$"Your going to love this" — should be "you're" (you are). OR "you're hat" — should be "your" (belongs to you).$d$,
 $r$Your = belongs to you. You're = you are. Try replacing with "you are" — if it makes sense, use the apostrophe.$r$,
 ARRAY['5.11D.x','5.11D.xi'],
 $c$Try replacing with "you are." If it sounds right, use you're. Otherwise use your.$c$),

('capitalization_proper_noun', 'language',
 'Failed to capitalize a proper noun',
 $d$Wrote "we drove to texas" or "i love saturdays" — places, days, months, and personal names need capital letters.$d$,
 $r$Specific names (Texas, Maya, Saturday, December) take capitals. General nouns (state, girl, day, month) don't.$r$,
 ARRAY['5.11D.ix'],
 'Specific name = capital letter. General word = lowercase.'),

('capitalization_overcapitalization_common_noun', 'language',
 $d$Capitalized a common noun that doesn't need it$d$,
 $d$Wrote "we walked across the Bridge" or "the Dog barked" — these are general nouns and shouldn't be capitalized.$d$,
 $r$Only proper nouns get capitals. If "the" can come before it without changing the meaning, it's usually common.$r$,
 ARRAY['5.11D.ix'],
 $c$Could you put "the" or "a" in front of it? Then it's probably lowercase.$c$),

('dialogue_punctuation_inside_quotes', 'language',
 'Punctuation outside the closing quote when it should be inside',
 $d$Wrote: She said, "I'm going home". — the period belongs INSIDE the closing quote.$d$,
 'In American English, periods and commas always go INSIDE the closing quotation mark in dialogue.',
 ARRAY['5.11D.x'],
 'Periods and commas tuck INSIDE the closing quote in dialogue.'),

('sentence_fragment_missing_subject', 'language',
 'Marked a fragment as a complete sentence',
 $d$Selected something like "Ran across the field." or "Because he was tired." as a complete sentence — both are missing required parts.$d$,
 $r$A complete sentence needs BOTH a subject (who/what) AND a verb expressing a complete thought. "Because" alone makes a fragment.$r$,
 ARRAY['5.11C.ii','5.11C.iii'],
 'Does the sentence have BOTH a who-or-what AND a complete thought? Both are required.'),

('sentence_run_on_comma_splice', 'language',
 'Selected a comma splice as correct',
 $d$"I went home, I was tired." — a comma alone isn't enough to join two complete sentences.$d$,
 'A comma alone can't join two complete sentences. Use a period, a semicolon, or add a conjunction (and, but, so) after the comma.',
 ARRAY['5.11C.ii','5.11D.x'],
 'A comma is too weak to hold two sentences together. Add a conjunction or use a period.'),

('sentence_run_on_no_punctuation', 'language',
 'Selected a run-on as correct',
 $d$Picked "I went home I was tired" — two sentences smashed together with no punctuation.$d$,
 'Two complete sentences need either a period, a semicolon, or a comma + coordinating conjunction between them.',
 ARRAY['5.11C.ii'],
 'Two complete thoughts need a period, a semicolon, or a comma + and/but/or between them.'),

('transition_wrong_logical_relationship', 'language',
 'Used a transition word with the wrong logical relationship',
 $d$Used "however" where the sentences agree, or "therefore" where they contrast — the transition signal contradicts the actual logic.$d$,
 'Match the transition to the relationship: but/however = contrast; so/therefore = cause-effect; also/moreover = adding; first/next = sequence.',
 ARRAY['5.11D.viii'],
 'Does the transition word fit what the sentences are doing — contrasting, adding, or showing cause?')

ON CONFLICT (tag) DO NOTHING;
