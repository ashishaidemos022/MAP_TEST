# Grade 3 Question Authoring Guide — Math, Reading, Language

> A self-contained guide for any AI assistant authoring Grade 3 questions for the MAP practice app. Focuses on **what to write**, not how to deploy it. Schema, migrations, and infrastructure are out of scope here — this guide assumes the database is set up and the AI just needs to produce question content.
>
> Read this entire document before authoring a single question. The rules in sections 3–7 are not negotiable.

---

## 1. Who this is for and what they're producing

**The student.** A 3rd-grader, age 8–9, in Plano ISD (Texas). Reads at grade level. Has a parent or older sibling nearby for read-aloud help. Takes a 25-question practice test 2–4 times a week. Each question matters — there's no "skip if hard" option.

**The deliverable.** A JSON array of question objects, batched by `(subject, TEKS standard, RIT band)`. Five questions per batch. The shape of each object is in section 8. The author does not write SQL — the JSON is consumed by an existing import pipeline that handles inserts.

**The principle that overrides every other rule.** Every question is a small teaching moment. A child who answers wrong should learn something from the explanation. A child who answers right should feel the satisfaction of having actually thought, not having guessed. Questions that are easy to write but don't teach are the failure mode to avoid.

---

## 2. The three sources, and what each contributes

Three reference systems define what Grade 3 students are expected to know. They overlap heavily but each adds something.

**Texas TEKS (Texas Essential Knowledge and Skills)** is the legal curriculum. It's authoritative for *what topics to test*. Every question must map to exactly one TEKS code. Codes look like `3.4F` (math) or `3.6G` (reading) or `3.11D.vii` (language). The Math TEKS for Grade 3 lives in TAC §111.5; ELAR (English/Language Arts/Reading) in §110.5. **Use TEKS to choose the topic.**

**Khan Academy** is what the child probably uses for instruction outside the test. Khan organizes Grade 3 math into "units" (Place value, Intro to multiplication, Fractions, Area, etc.) and Grade 3 reading into vocabulary, comprehension, literary analysis, and informational text strands. Khan's framing tends to be cleaner than the TEKS legalese. **Use Khan to choose the question type and the level of concrete detail** — if Khan teaches multiplication first as equal groups, then as arrays, then as area models, your question bank should reflect that progression.

**Plano ISD's MAP framework** is what the school actually tracks the child against. Plano administers MAP three times a year (BOY/MOY/EOY — beginning, middle, end of year) and reports RIT scores by goal area. The four MAP Math goal areas are *Operations and Algebraic Thinking*, *Number and Operations*, *Measurement and Data*, and *Geometry*. Reading splits into *Literary Text*, *Informational Text*, *Vocabulary Use and Functions*, and (Grade 3+) *Foundational Skills*. Language Usage splits into *Grammar and Usage*, *Writing*, and *Mechanics*. **Use the MAP goal area to choose the right cognitive level** — MAP doesn't test pure recall; it tests application within a brief stem.

The best mental model: TEKS picks the topic, Khan picks the framing, MAP picks the cognitive demand.

---

## 3. RIT bands — what they mean and how they shape questions

RIT (Rasch Unit) is NWEA's vertically-equated difficulty scale. A Grade 3 student typically scores between 175 and 210, with a national average around 188 BOY → 196 MOY → 201 EOY. A high-achieving Grade 3 student in Plano (top quartile) reaches 210+ by spring. The bank uses these bands:

| Band | Means | When this question would feel right |
|---|---|---|
| `171_180` | Below grade level | A struggling 3rd-grader, or a strong 2nd-grader stretching up. Computation under 50, single-step. Reading: 1–2 sentence paragraphs, all literal. |
| `181_190` | Beginning-of-year on grade level | Average student in September. Multiplication facts to 5×5. Two-digit subtraction without regrouping. Reading: 120-word passages, retell questions. |
| `191_200` | Middle-of-year on grade level | Average student in January. Multiplication facts to 10×10. Fraction comparison with same denominator. Reading: 200-word passages, simple inference. |
| `201_210` | End-of-year on grade level / advanced | Average student in May, or above-average mid-year. Two-step multiplication problems. Equivalent fractions. Reading: 250-word passages, theme and author's purpose. |
| `above_210` | Stretch / above grade level | Advanced 3rd-grader or on-track 4th-grader. Multi-step problems combining operations. Subtle inference, multi-paragraph synthesis. |

**Authoring rule:** the band is not just about difficulty of the math — it's about the *complexity of the situation*. A `171_180` multiplication question can be `3 × 4 = ?`. A `201_210` multiplication question is "Maya has 3 packs of stickers with 8 stickers each, and gives 5 to Diego — how many does she have left?" Same operation, different cognitive load.

---

## 4. The Grade 3 TEKS catalog — what to test on

These are the standards questions get tagged to. Author for the lowest-coverage standards first; balance bands within each standard. The full descriptions are paraphrased from TAC §111.5 and §110.5 — never copy TEA's wording verbatim.

### 4.1 Math (31 standards)

**Place value and number sense (Operations and Algebraic Thinking)**
- `3.2A` — Compose and decompose numbers up to 100,000 in expanded form and with place-value pieces.
- `3.2B` — Place-value relationships in base ten: a digit represents 10× what it represents in the place to its right.
- `3.2C` — Locate numbers up to 100,000 on a number line.
- `3.2D` — Compare and order whole numbers up to 100,000 with `<`, `>`, `=`.

**Fractions (Number and Operations)**
- `3.3A` — Represent fractions with bars, strips, and number lines (halves, thirds, fourths, sixths, eighths).
- `3.3B` — Determine the corresponding fraction of a whole partitioned into b equal parts.
- `3.3C` — Unit fractions: 1/b is one part of a whole partitioned into b equal parts.
- `3.3D` — Compose and decompose fractions: a/b is a copies of 1/b.
- `3.3F` — Equivalent fractions with denominators 2, 3, 4, 6, 8.
- `3.3G` — Explain fraction equivalence using a number line.
- `3.3H` — Compare two fractions with the same numerator or same denominator.

**Whole-number operations (Operations and Algebraic Thinking)**
- `3.4A` — Add and subtract within 1,000; one- and two-step problems.
- `3.4B` — Round to the nearest 10 or 100.
- `3.4D` — Total of equal groups (foundation for multiplication).
- `3.4E` — Multiplication with arrays, area models, and skip counting on a number line.
- `3.4F` — Multiplication facts to 10×10 with automaticity.
- `3.4G` — Multiply 2-digit by 1-digit numbers.
- `3.4H` — Partition objects into equal groups (foundation for division).
- `3.4J` — Division using the inverse relationship with multiplication.
- `3.4K` — Multi-step multiplication and division within 100.

**Algebraic reasoning (Operations and Algebraic Thinking)**
- `3.5B` — Word problems with multiplication and division (one- and two-step).
- `3.5D` — Find the unknown in a multiplication or division equation (e.g., 3 × ? = 21).
- `3.5E` — Number patterns in input-output tables.

**Geometry**
- `3.6A` — Classify 2D and 3D figures by faces, edges, vertices, angles.
- `3.6C` — Area of rectangles using unit squares or by multiplying side lengths.
- `3.6D` — Area of composite figures (rectangles only, decomposed).
- `3.7B` — Perimeter of polygons; find a missing side given perimeter and other sides.

**Measurement and Data**
- `3.7C` — Time intervals; elapsed time in minutes.
- `3.7E` — Liquid volume and weight (customary and metric).
- `3.8A` — Read and create frequency tables, dot plots, pictographs, bar graphs with scaled intervals.
- `3.8B` — Solve one- and two-step problems using categorical data displays.

### 4.2 Reading (18 standards)

**Vocabulary**
- `3.3B` — Use sentence-level context to determine word meaning.
- `3.3C` — Identify meaning of common prefixes (un-, re-, dis-, mis-, pre-) and suffixes (-er, -est, -ful, -less, -ly).

**Comprehension and response**
- `3.6F` — Make inferences and use textual evidence.
- `3.6G` — Determine key ideas from supporting details.
- `3.6H` — Synthesize information across parts of a text.
- `3.7C` — Cite specific evidence from the text.
- `3.7D` — Retell, paraphrase, or summarize maintaining meaning and order.

**Literary analysis**
- `3.8A` — Infer the theme or moral.
- `3.8B` — Analyze relationships among characters.
- `3.8C` — Plot elements: rising action, climax, falling action, resolution.
- `3.8D` — Setting's influence on plot, mood, and characters.

**Genre study**
- `3.9A` — Folktales, fables, legends, myths — recognize stated lesson or moral.
- `3.9B` — Poetry: rhyme scheme, rhythm, alliteration, stanzas.
- `3.9D.i` — Text features: titles, headings, captions, graphics, sidebars, bold print, table of contents.
- `3.9D.ii` — Text structures: chronological, cause-and-effect, problem-and-solution, description, compare-contrast.

**Author's craft**
- `3.10A` — Author's purpose: inform, entertain, persuade, describe.
- `3.10D` — Imagery, simile, sensory language.
- `3.10E` — Literary devices including first- vs. third-person point of view.

### 4.3 Language (16 standards)

**Word study**
- `3.2B.vi` — Decode multisyllabic words with prefixes and suffixes.
- `3.2C.i` — Spell multisyllabic words (closed, open, consonant-le syllables).
- `3.2C.ii` — Spell common homophones (their/there/they're, to/too/two, your/you're).

**Grammar and usage**
- `3.11D.i` — Subject-verb agreement in simple and compound sentences.
- `3.11D.ii` — Past, present, future verb tense (consistent within sentence/paragraph).
- `3.11D.iii` — Singular/plural and common/proper nouns.
- `3.11D.iv` — Adjectives (descriptive: red, soft; limiting: this, that, those).
- `3.11D.v` — Adverbs of time (now, soon, later) and place (here, there, outside).
- `3.11D.vi` — Prepositions and prepositional phrases.
- `3.11D.vii` — Pronouns: subjective (I, he), objective (me, him), possessive (my, his).
- `3.11D.viii` — Coordinating conjunctions (and, but, or, so).

**Mechanics**
- `3.11D.ix` — Capitalization: titles of people, abbreviations, days, months, first word in a quotation.
- `3.11D.x` — Apostrophes (contractions and possessives), commas (series and dates).
- `3.11D.xi` — Spell grade-appropriate high-frequency words.

**Sentence construction**
- `3.11C.i` — Combine sentences using coordinating conjunctions or appositives.
- `3.11C.ii` — Recognize and correct sentence fragments and run-ons.

---

## 5. Authoring rules that apply to every question

Five rules apply to every question regardless of subject. These come before subject-specific guidance.

**Stem clarity.** A 3rd-grader must be able to decode the stem on first read. Aim for ≤ 35 words. Use simple sentence structures. Define any tier-3 vocabulary inline ("a polygon — a closed shape with straight sides") or avoid it. Names: rotate among Maya, Ethan, Priya, Liam, Ava, Aarav, Zoe, Noor, Diego, Mei, Caleb. No surnames. No "Sarah," no "John."

**Exactly four choices, exactly one correct.** Labels A/B/C/D. Never "All of the above," never "None of the above." Never two-correct-choices-pick-the-best — that's not a 3rd-grade skill.

**Every distractor encodes a specific misconception.** This is the highest-leverage rule. A wrong answer of "47" because the student forgot to carry is a teaching opportunity. A wrong answer of "purple" because it's random is wasted. Each distractor gets two fields:
- `misconception`: free-text description of the thinking error in plain language ("Added 7+8=15 but wrote only the 5 and dropped the carry.")
- `misconception_tag`: a snake_case identifier reusable across questions (`regrouping_forgot_carry`)

If you can't articulate why a 3rd-grader would pick a specific wrong answer, that's a sign the distractor is lazy — rewrite it.

**Explanations teach the method, not just the answer.** "The answer is 41" is not an explanation. "27 + 18: add the ones, 7+8=15, write 5 carry 1. Add the tens, 2+1+1=4. So 45." is an explanation. Show the work. Use the same vocabulary the child encounters in class.

**Cultural context is Texas-flexible, not US-specific.** Cricket, Diwali, soccer, family travel, public transit, recess, library day — all fine. American football idioms ("home run," "Hail Mary"), Thanksgiving-specific food references, US-historical-figure trivia — avoid. Plano is diverse; the bank should reflect that without being performative.

---

## 6. Subject-specific authoring rules

### 6.1 Math

**Use SVG figures for fractions, geometry, place value, and measurement.** Inline SVG goes in the `stem_image_svg` field. A fraction question without a visual model is a worse question than the same fraction question with a bar or pie. For multiplication, an array or area model dramatically improves a question for a child still learning facts.

**Two-step problems should put both numbers in the stem.** Don't bury one quantity in a footnote or assume the child remembers it from a setup sentence. "Maya bought 3 packs of stickers with 8 stickers each. She gave 5 to Diego. How many does she have now?" — both 3, 8, and 5 are in the stem.

**Units belong in stems and choices.** "What is the area?" — incomplete. "What is the area in square centimeters?" — complete. Distractors should sometimes use the wrong unit to surface unit-confusion misconceptions ("12 cm" when the answer should be "12 sq cm").

**Multiplication-fact questions for `3.4F` need 4–6 per band per fact family.** Don't author 50 questions all about ×3. Spread across ×2, ×3, ×4, ×5, ×6, ×7, ×8, ×9. ×1 and ×10 are too easy for grade-level; reserve for `171_180`.

**Fraction questions always include a visual model.** Bar, circle, number line, or set of objects — pick the model that matches the test. Equivalence: side-by-side bars. Comparison: number line. Part-of-set: discrete objects.

**Distractor library — common Grade 3 math misconceptions to draw from:**

| Tag | Description |
|---|---|
| `regrouping_forgot_carry` | Added ones but didn't carry the ten. (e.g., 27+18=35 instead of 45) |
| `regrouping_borrow_error` | Subtracted smaller-from-larger within a column instead of borrowing. |
| `place_value_concat` | Wrote "315" for 27+18 — concatenated digits. |
| `place_value_misread_column` | Read 47's "4" as four instead of forty. |
| `mult_as_addition` | Treated 3×8 as 3+8. |
| `mult_fact_off_by_one_group` | 3×8 = 21 (counted one group short). |
| `mult_skip_count_error` | Miscounted skip-counting jumps. |
| `division_used_wrong_inverse` | For 24÷4, computed 24+4 or 24×4. |
| `fraction_compared_numerator_only` | 3/8 > 3/4 because 8 > 4. |
| `fraction_compared_denominator_only` | 3/4 > 5/4 because the parts are bigger. |
| `fraction_part_whole_swap` | Identified 3/4 as having 3 unshaded parts instead of 3 shaded. |
| `area_used_perimeter` | Added the side lengths instead of multiplying. |
| `area_counted_only_outline` | Counted boundary squares only, not interior. |
| `perimeter_used_area` | Multiplied length × width instead of summing all sides. |
| `time_added_clock_wrap` | Failed to handle hour wrap (3:50 + 30 min = 4:20, not 3:80). |
| `data_misread_scale` | Read a bar's value off by the scale interval (each tick = 5, not 1). |
| `rounding_wrong_place` | Rounded 347 to 350 when asked for nearest 100. |
| `operation_wrong_keyword` | "More than" triggered subtraction instead of addition. |

This list isn't exhaustive — write new tags when the data demands them. But reuse before inventing.

### 6.2 Reading

**Author the passage first, then write the questions.** Don't write questions and retrofit a passage. The passage is a complete piece of writing first; questions follow from it.

**Passage length by band:**
- `171_180`: 100–180 words
- `181_190`: 150–250 words
- `191_200`: 200–300 words
- `201_210`: 250–350 words
- `above_210`: 280–400 words

These are bigger than Grade 2 by design. Don't shrink Grade 3 passages out of caution.

**Genre mix across the bank:**
- 35% literary (realistic fiction, fantasy, fable, folktale)
- 45% informational (science, history-of-everyday-things, how-things-work)
- 12% poetry (rhymed and free verse)
- 8% drama (short scenes, 2–3 characters, with stage directions)

**Topics that work and topics to avoid.**

*Work well:* monarch migration, water cycle, recycling, how seeds travel, ant colonies, tide pools, baking bread, building a sandcastle, family car trip, the night sky, paper airplanes, finding something on a hike, library day, learning to ride a bike, helping a younger sibling, a Diwali story, a cricket match, a soccer practice, the inventor of Velcro, how kites fly, sharing equipment at recess.

*Avoid:* 9/11, war, hospitalization, divorce, death of a parent, US elections, anything tied to a current news event. Also avoid: any topic that requires US-specific cultural literacy (Thanksgiving turkey traditions, pioneer days, baseball strategy).

**Vocabulary calibration.** Tier-2 academic words are welcome ("emerged," "ancient," "burrow," "migrated"). Tier-3 domain-specific words ("photosynthesis," "stratosphere," "metamorphosis") belong in science class, not a reading test — unless the passage is teaching the word and a vocabulary-in-context question follows.

**Question types per passage.** A passage gets 4–6 questions. Within those, vary across:
- 1× main idea (max one — don't ask three main-idea questions per passage)
- 1–2× inference ("Why did the character do X?" / "What can you tell about Y?")
- 1× vocabulary in context ("What does *emerged* mean as used here?")
- 0–1× text features (informational only — captions, headings, diagrams)
- 0–1× author's purpose (more relevant for `191_200+`)
- 0–1× character/setting (literary only)
- 0–1× theme/moral (literary, `201_210+`)

**Distractor library — common Grade 3 reading misconceptions:**

| Tag | Description |
|---|---|
| `main_idea_picked_detail` | Chose a true detail instead of the overall idea. |
| `main_idea_picked_first_sentence` | Picked the literal first sentence as the main idea. |
| `inference_literal_only` | Picked the literal restatement instead of the implied meaning. |
| `inference_unsupported` | Made an inference the text doesn't support. |
| `vocab_similar_word` | Picked a word that looks/sounds like the target instead of fitting context. |
| `vocab_common_meaning_not_contextual` | Picked the most common meaning when context calls for a less common one. |
| `theme_picked_event` | Picked something that happens in the story instead of its theme. |
| `author_purpose_topic_not_purpose` | Identified what the text is *about* instead of *why it was written*. |
| `setting_picked_action_location` | Picked where one event happened instead of the overall setting. |
| `text_feature_misuse` | Said a heading is the "main idea" or a caption is the "topic." |
| `text_structure_picked_content` | Identified what the text says instead of how it's organized. |
| `evidence_wrong_paragraph` | Cited a quote that doesn't support the claim. |

### 6.3 Language

Language items are shorter than reading items but harder to author *well*. Three patterns dominate.

**Pattern A: Edit-pick.** "Which sentence is written correctly?" Four versions of the same sentence, three with errors, one correct. Use this for grammar, capitalization, punctuation, agreement.

```
Stem: Which sentence is written correctly?
A. My brother and me went to the park.       [pronoun: object form as subject]
B. My brother and I went to the park.        [correct]
C. Me and my brother went to the park.       [pronoun + ordering convention]
D. My brother and I goes to the park.        [subject-verb agreement]
```

`question_format` = `'edit_pick'`.

**Pattern B: Cloze.** Sentence with a blank, four words to choose from. Use this for word choice, homophones, prepositions, verb tense.

```
Stem: Maya quickly ran ___ the door before the rain started.
A. trough     [misspelling/wrong word]
B. through    [correct]
C. threw      [homophone]
D. though     [related-but-wrong word]
```

`question_format` = `'mcq'`.

**Pattern C: Sentence combining.** Two short sentences, four ways to combine them.

```
Stem: Which sentence best combines these two?
  • Diego likes soccer. Diego likes cricket.
A. Diego likes soccer, Diego likes cricket.        [comma splice]
B. Diego likes soccer and cricket.                  [correct]
C. Diego likes soccer but cricket.                  [wrong conjunction]
D. Diego likes soccer, and cricket too liking.      [garbled]
```

`question_format` = `'sentence_combine'`.

**For Patterns A and C, stems can run longer than 35 words** because the stem *is* the workspace. The 35-word ceiling applies to question text framing the choices, not the sentences being edited.

**Distractor library — common Grade 3 language misconceptions:**

| Tag | Description |
|---|---|
| `subject_verb_plural_singular` | "He go" instead of "He goes." |
| `subject_verb_compound_subject` | "Maya and Diego goes" instead of "go." |
| `verb_tense_inconsistent` | Mixed past and present in the same sentence. |
| `pronoun_object_as_subject` | "Me and my brother went" instead of "My brother and I went." |
| `pronoun_subject_as_object` | "She gave the book to I" instead of "to me." |
| `pronoun_possessive_apostrophe` | "her's" instead of "hers"; "your's" instead of "yours." |
| `homophone_their_there` | Confused their/there/they're. |
| `homophone_to_too_two` | Confused to/too/two. |
| `homophone_your_youre` | Confused your/you're. |
| `comma_splice` | Joined two sentences with only a comma. |
| `run_on_no_punctuation` | Two sentences run together without any mark. |
| `fragment_no_subject` | Sentence missing a subject. |
| `fragment_no_verb` | Sentence missing a verb. |
| `apostrophe_plural_misuse` | "Three apple's" instead of "Three apples." |
| `capitalization_random` | Capitalized a random common noun. |
| `capitalization_missed_proper` | Failed to capitalize a proper noun. |
| `conjunction_wrong_choice` | Used "but" where "and" is correct, or vice versa. |
| `preposition_wrong_relation` | "Sat in the table" instead of "at the table." |

---

## 7. The misconception tag discipline

The bank is only as useful as its misconception tagging. Three rules:

**Reuse before inventing.** When authoring a batch, scan section 6's tag library. If a misconception fits a listed tag, use it exactly — don't write `forgot_to_carry` if `regrouping_forgot_carry` already exists. The MCP recommendation layer (a parent-side tool) groups by tag — fragmented tags fragment the signal.

**Tag at author time, not later.** Don't write a question and "tag it later." The act of articulating *what specific error* a distractor models is what makes the distractor good. Writing tags after the fact produces lazy distractors.

**One tag per distractor.** Even if a wrong answer reflects two errors layered together, pick the dominant one. Multi-tagging defeats the rollup.

**The correct answer's misconception fields are null.** `misconception: null`, `misconception_tag: null` on the `is_correct: true` choice.

---

## 8. The output JSON shape

Every batch is a JSON array of 5 question objects. Each object follows this exact shape:

```json
{
  "subject": "math" | "reading" | "language",
  "grade": 3,
  "teks_code": "3.4F",
  "rit_band": "181_190" | "191_200" | "201_210" | "171_180" | "above_210",
  "difficulty": "easy" | "medium" | "hard",
  "question_format": "mcq" | "edit_pick" | "sentence_combine",
  "stem": "string — the question text",
  "stem_image_svg": "<svg>...</svg> or null",
  "passage_ref": "passage_uuid_or_temp_key" | null,
  "explanation": "string — teach the solution method",
  "source_note": "Khan Academy: <unit name>",
  "choices": [
    {
      "label": "A",
      "body": "...",
      "is_correct": false,
      "misconception": "Plain-language description of the thinking error.",
      "misconception_tag": "snake_case_tag"
    },
    {
      "label": "B",
      "body": "...",
      "is_correct": true,
      "misconception": null,
      "misconception_tag": null
    },
    {
      "label": "C",
      "body": "...",
      "is_correct": false,
      "misconception": "...",
      "misconception_tag": "..."
    },
    {
      "label": "D",
      "body": "...",
      "is_correct": false,
      "misconception": "...",
      "misconception_tag": "..."
    }
  ]
}
```

**Hard requirements:**
- Exactly 5 objects per batch.
- Exactly 4 choices per object.
- Exactly one `is_correct: true` per object.
- Labels are always A/B/C/D in order.
- `passage_ref` is non-null only for reading questions; null for math and language. (The pipeline links to the actual passage UUID at insert time.)
- Output is **only** the JSON array. No prose preamble. No markdown code fences. No trailing commentary.

---

## 9. Reading passages — when authoring, do these in order

When the batch is for a reading standard, two outputs are needed: the passage and the questions. Produce them as a single JSON object with this shape:

```json
{
  "passage": {
    "title": "string",
    "body": "the full passage text",
    "genre": "literary" | "informational" | "poetry" | "drama",
    "word_count": 240,
    "rit_band": "191_200",
    "topic": "monarch_migration"
  },
  "questions": [ /* 4–6 question objects, all with passage_ref pointing to a temp key */ ]
}
```

Process:

1. Pick a topic from the working list (section 6.2). Confirm it's not in the current bank by checking the existing passages.
2. Write the passage. Calibrate length to band (section 6.2). Read it back to check vocabulary, sentence rhythm, and that a 3rd-grader can follow it.
3. Identify the 4–6 question opportunities the passage supports. Vary types per the section 6.2 list — don't write three main-idea questions.
4. Author the questions using the standard JSON shape, with `passage_ref` set to a temporary key (e.g., `"temp_passage_001"`) that the pipeline replaces with the real UUID.

**For poetry,** include line breaks in the body using `\n`. For drama, use `\n` between speaker turns and italicize stage directions in markdown-style underscores (`_he sighs_`).

---

## 10. The author prompt template

When invoking an LLM to generate a batch, use this prompt. Replace `{{...}}` placeholders.

```
You are authoring practice questions for a Grade 3 MAP-style test, aligned to
Texas TEKS and used by a student in Plano ISD. Read the full briefing in
sections 1–9 of the Grade 3 Question Authoring Guide before authoring.

Subject: {{math | reading | language}}
TEKS standard: {{teks_code}} — {{teks_title}}
Standard description: {{teks_description}}
Khan Academy unit: {{khan_unit}}
NWEA MAP goal area: {{map_goal_area}}
Target RIT band: {{rit_band}} ({{band_meaning}})
Difficulty within the band: {{easy | medium | hard}}
Question format: {{mcq | edit_pick | sentence_combine}}

For language items, specify the pattern: {{Pattern A | Pattern B | Pattern C}}.

For reading, the passage to use is:
  Title: {{passage_title}}
  Body: {{passage_body}}
  Genre: {{passage_genre}}
  RIT band: {{passage_rit_band}}

Author 5 questions following the JSON shape in section 8. For reading, the
passage is provided — do NOT author a new one. For math and language,
passage_ref is null.

Misconception tags must be drawn from section 6's library where they fit.
Invent new tags only when the existing library has no match — and when you do,
note it in the source_note field of the affected question so a human can review.

Hard requirements (re-read before output):
- Exactly 5 questions.
- Exactly 4 choices each, exactly one correct.
- Every distractor has a non-null misconception and misconception_tag.
- The correct choice has both fields null.
- Names rotate among Maya, Ethan, Priya, Liam, Ava, Aarav, Zoe, Noor, Diego,
  Mei, Caleb. No surnames.
- Output ONLY the JSON array. No markdown fences. No preamble.
```

For reading **passage** authoring, use this preamble first (separately):

```
Author one Grade 3 reading passage on topic "{{topic}}".

Genre: {{literary | informational | poetry | drama}}
Target RIT band: {{rit_band}}
Word count target: {{range from section 6.2}}

Constraints:
- 3rd-grade vocabulary; tier-2 academic words allowed, tier-3 domain words avoided.
- No US-only cultural references that wouldn't transfer (Thanksgiving, etc.).
- No sensitive topics (war, death, divorce, hospitalization).
- Original writing — do not paraphrase Khan Academy or any other source.

Output the passage as a JSON object with the shape from section 9 (passage
key only — questions come in a separate call). Output ONLY the JSON. No
preamble.
```

Then a second call with both the passage and the question prompt.

---

## 11. Batch sizing and cadence

**Five questions per batch.** Don't bulk-prompt 25. Quality collapses around batch 8 in our experience with Grade 2.

**One `(standard, band)` cell per batch.** Mixing cells in one batch produces inconsistent calibration.

**Coverage targets across the bank:**

| Subject | Total target | Avg per standard | Within each (standard, band) cell |
|---|---|---|---|
| Math | 600 | ~19 | 4–6 questions |
| Reading | 480 | ~27 | 4–6 questions per passage |
| Language | 320 | ~20 | 4–6 questions |

**Band weighting within each subject's bank:**

| Band | Math share | Reading share | Language share |
|---|---|---|---|
| `171_180` (and below) | 5% | 5% | 8% |
| `181_190` | 30% | 25% | 32% |
| `191_200` | 35% | 35% | 32% |
| `201_210` | 20% | 25% | 18% |
| `above_210` | 10% | 10% | 10% |

The middle bands (`181_190`, `191_200`) carry the bank because that's where on-grade-level Grade 3 students spend most of the year.

**Per-day target during active seeding:** ~50 questions (10 batches). Higher and the misconception tags drift; lower and the bank takes too long to fill.

**End-of-day discipline:**
1. Spot-check 5 random questions from the day's batches. Read the stems aloud — do they sound like a 3rd-grader could decode them?
2. Run the misconception-tag rollup query. Are any tags used only once today? Either reuse them in future batches or fold them into existing tags.
3. Note any TEKS standards where a band is now full so the next day's planning skips them.

---

## 12. Quality bar — what "good" looks like

Five characteristics distinguish a question that earns its place from one that fills space.

**A child can articulate why each wrong answer is wrong.** "I picked C because I thought you add the bottom numbers" is the success state. "I picked C because I guessed" is the failure.

**The explanation reads like a tutor's voice.** "You're doing the right operation here, just remember that when the ones digits add to more than 10, the extra ten gets carried over to the tens column" — that's a tutor. "The answer is 45." — that's a worksheet.

**The stem doesn't telegraph the answer.** Sentence rhythm, length, and confidence should be similar across all four choices. A short answer when three others are long, or a confident-sounding choice surrounded by hedged ones, are pattern-match cues that ruin the question.

**The figure (if any) carries information, not decoration.** A fraction question with a fraction bar that the child has to read is a real visual. A multiplication question with a clipart of stickers that doesn't show *how many* stickers is decoration — and worse than no image because it implies a visual logic that isn't there.

**The question would feel familiar to the child if they saw it on the actual MAP test.** This is the highest bar. If a 3rd-grader who took NWEA MAP last week looked at the question, would it feel like the test? Or would it feel like a worksheet? The bank is calibrated against the former.

---

## 13. References

Use these as topical references when authoring. Do not copy or paraphrase content from them into questions.

- TEKS Math Grade 3: TAC §111.5 — https://tea.texas.gov
- TEKS ELAR Grade 3: TAC §110.5 — https://tea.texas.gov
- Khan Academy Grade 3 Math: https://www.khanacademy.org/math/cc-third-grade-math
- Khan Academy Grade 3 Reading: https://www.khanacademy.org/ela/cc-3rd-reading-vocab
- NWEA RIT reference (3–5 norms): https://cdn.nwea.org/docs/RIT+Reference+Brochure_July19_CC.pdf
- Plano ISD ELAR alignment: https://www.pisd.edu/Page/16620
- NWEA MAP Growth Goal Areas (Grade 3): publicly documented in the NWEA Comprehensive Norms Study and on NWEA's curriculum services pages.

---

## 14. Final check — what to confirm before submitting a batch

Before handing 5 questions back to the import pipeline, confirm:

1. The batch is exactly one `(subject, teks_code, rit_band)` cell.
2. The output is a JSON array. No fences, no preamble, no trailing commentary.
3. Each object has the exact shape from section 8.
4. Each object has 4 choices, exactly one correct.
5. Every distractor has both `misconception` and `misconception_tag` populated.
6. Every `misconception_tag` is either in the section 6 library or new-and-justified.
7. Names rotate; no name appears in more than 2 of the 5 questions.
8. The explanations teach the method, not just state the answer.
9. For math: figures are inline SVG, not external images.
10. For reading: every question's `passage_ref` is set; no orphan questions.

If any of these is off, fix before submitting. The pipeline will reject malformed batches but it won't catch lazy distractors or off-band difficulty — those are the author's responsibility.
