# Feature Brief: Grade 3 Seeding (Math, Reading, Language)

> Hand this entire document to Claude in the MAP practice app repo. It is a complete spec — schema delta, TEKS catalog, RIT band targets, authoring rules, and a step-by-step runbook for seeding the Grade 3 question bank. Read it end-to-end before starting. Append the relevant parts to `CLAUDE.md` when done.

---

## 1. What we are building and why

Grade 2 is the working MVP. Grade 3 is the first real expansion of the schema's grade-agnostic design. Three things change at once:

1. **A new subject — Language.** NWEA MAP tests "Language Usage" separately from Reading starting in Grade 3. TEKS folds language conventions into ELAR (§110.5), but the way kids experience Language Usage on MAP — editing sentences, fixing punctuation, choosing the right pronoun — is different enough from passage-based reading that it deserves its own subject and its own slice of the bank.
2. **The center of gravity shifts up.** Grade 3 RIT centroids sit roughly 10–13 points higher than Grade 2. Question generation must follow the band weights below, not the Grade 2 weights.
3. **The math curriculum forks.** Multiplication, division, fractions, area, and perimeter all enter as full first-class topics. Plan for SVG patterns (arrays, area models, fraction bars, fraction number lines) up front.

This brief is for **seeding** — building the question bank. The runner already handles `grade` correctly. Once Grade 3 questions exist with `grade = 3`, the existing UI picks them up.

### Hard rules

- **No verbatim Khan Academy or NWEA content.** Topical references only. Original wording, original numbers, original passages.
- **No PII in passages or stems.** Use the Grade 2 name set (Maya, Ethan, Priya, Liam, Ava, Aarav, Zoe) plus four Grade 3 additions: Noor, Diego, Mei, Caleb.
- **TEKS codes are canonical.** Don't invent codes. If a code feels missing, check §110.5 and §111.5 — it's almost always there under a sub-letter you didn't expect.
- **Tag distractors at author time.** We are keeping the `misconception_tag` column from the (otherwise-deferred) mastery brief because it costs nothing to populate during authoring and pays off massively for the MCP recommendation layer (Appendix A). Don't author Grade 3 distractors and tag them later.

---

## 2. What changes from Grade 2 to Grade 3

| Dimension | Grade 2 | Grade 3 |
|---|---|---|
| Subjects | math, reading | math, reading, **language** |
| Math RIT centroid (BOY/MOY/EOY) | 160 / 175 / 188 | 180 / 189 / 196 |
| Reading RIT centroid (BOY/MOY/EOY) | 165 / 178 / 188 | 188 / 196 / 201 |
| Language RIT centroid (BOY/MOY/EOY) | n/a | 185 / 192 / 197 |
| Math: dominant topics | place value to 1,000; add/sub within 100 | multiplication, division, fractions, area |
| Reading: passage length | 60–220 words | 120–350 words |
| Reading: genre mix (lit/info/poetry/drama) | 40 / 40 / 15 / 5 | 35 / 45 / 12 / 8 |
| Vocabulary | concrete, frequent | tier-2 academic words enter |
| Stem length ceiling | ≤ 25 words | ≤ 35 words (still aim short) |
| Two-step problems | rare | required for ~30% of math |

The reading-passage length jump matters. A Grade 3 informational passage on monarch migration runs 250–320 words; the Grade 2 version on the same topic would be 110. Don't shrink Grade 3 passages to feel safer — the bank will calibrate wrong.

---

## 3. Schema additions

Apply this as migration `map_grade3_language_subject`. Additive only.

```sql
-- 3.1: Add 'language' to the subject enum.
-- Postgres requires this commit before any later statement uses the new value,
-- so apply this migration on its own and let it commit before running 3.2+.
ALTER TYPE map_subject ADD VALUE IF NOT EXISTS 'language';
```

Then in a **separate migration** (`map_grade3_language_support`):

```sql
-- 3.2: The chk_reading_has_passage CHECK is unchanged — it only fires for
-- subject='reading'. Language items live in map_questions with passage_id
-- NULL, which the constraint allows. Verify with:
--   \d+ map_questions
-- and confirm the constraint reads roughly:
--   CHECK ((subject <> 'reading') OR (passage_id IS NOT NULL))

-- 3.3: Carry forward the misconception_tag column from the mastery tracker
-- brief. We are keeping ONLY this piece of that brief — it is cheap at
-- author time and unlocks the MCP recommendation layer (Appendix A).
ALTER TABLE map_question_choices
  ADD COLUMN IF NOT EXISTS misconception_tag text;

CREATE INDEX IF NOT EXISTS idx_map_choices_misconception_tag
  ON map_question_choices(misconception_tag)
  WHERE misconception_tag IS NOT NULL;

-- 3.4: Optional — question_format lets the runner render language-edit
-- items differently from a standard MCQ if it wants to highlight a target
-- span. Skip if you'd rather encode the format in the stem text itself.
ALTER TABLE map_questions
  ADD COLUMN IF NOT EXISTS question_format text
    DEFAULT 'mcq'
    CHECK (question_format IN ('mcq', 'edit_pick', 'sentence_combine'));

-- 3.5: Helpful composite index for the test composer's grade-aware queries.
CREATE INDEX IF NOT EXISTS idx_map_questions_grade_subject_band
  ON map_questions(grade, subject, rit_band)
  WHERE is_active;
```

Validate:

```sql
SELECT enumlabel FROM pg_enum
  WHERE enumtypid = 'map_subject'::regtype
  ORDER BY enumsortorder;
-- expect: math, reading, language
```

---

## 4. RIT band weighting for Grade 3

The Grade 2 builder uses `['171_180','181_190','181_190','191_200','201_210']`. Grade 3 shifts up. Use these distributions when picking standards × band targets in seeding (these are bank-composition targets, not per-test targets — the test composer remains the source of truth for what shows up in a session).

| Subject | below_181 | 181_190 | 191_200 | 201_210 | above_210 |
|---|---|---|---|---|---|
| Math | 5% | 30% | 35% | 20% | 10% |
| Reading | 5% | 25% | 35% | 25% | 10% |
| Language | 8% | 32% | 32% | 18% | 10% |

The "below_181" allocation lumps `below_161 / 161_170 / 171_180`. For Grade 3, almost all of it should be `171_180` — there is little reason to bank questions below `171_180` for a 3rd-grader.

---

## 5. TEKS catalog seeds

These are the rows to insert into `map_standards`. Codes are from TAC §111.5 (math) and §110.5 (ELAR). Title text is paraphrased — do not copy TEA's wording verbatim into the database (it's their text). The cross-walk to Khan Academy units and NWEA MAP goal areas is informational and gives Claude context during authoring.

> Schema assumption: `map_standards (id uuid pk, subject map_subject, grade int, teks_code text, teks_title text, teks_description text, khan_unit text, map_goal_area text, sort_order int)`. If your table differs, drop the columns you don't have — the `teks_code` + `subject` + `grade` triple is the only thing the rest of the pipeline depends on.

### 5.1 Math — Grade 3 (28 standards)

```sql
INSERT INTO map_standards (subject, grade, teks_code, teks_title, teks_description, khan_unit, map_goal_area, sort_order) VALUES
('math', 3, '3.2A', 'Compose and decompose numbers up to 100,000',
 'Build numbers up to 100,000 in more than one way using place-value pieces and expanded form.',
 'Place value', 'Operations and Algebraic Thinking', 10),
('math', 3, '3.2B', 'Place-value relationships in base ten',
 'A digit in one place represents ten times what it represents in the place to its right.',
 'Place value', 'Operations and Algebraic Thinking', 11),
('math', 3, '3.2C', 'Represent a number on a number line',
 'Locate, name, and place whole numbers up to 100,000 on a number line.',
 'Place value', 'Operations and Algebraic Thinking', 12),
('math', 3, '3.2D', 'Compare and order whole numbers up to 100,000',
 'Use <, >, = with whole numbers up to 100,000.',
 'Place value', 'Operations and Algebraic Thinking', 13),
('math', 3, '3.3A', 'Represent fractions with bars, strips, and number lines',
 'Halves, thirds, fourths, sixths, and eighths greater than zero.',
 'Intro to fractions', 'Number and Operations', 20),
('math', 3, '3.3B', 'Fractions of a whole or set',
 'Determine the corresponding fraction of a whole partitioned into b equal parts.',
 'Intro to fractions', 'Number and Operations', 21),
('math', 3, '3.3C', 'Unit fractions',
 '1/b is one part of a whole partitioned into b equal parts.',
 'Intro to fractions', 'Number and Operations', 22),
('math', 3, '3.3D', 'Compose and decompose fractions',
 'A fraction a/b is the sum of a copies of the unit fraction 1/b.',
 'Adding and subtracting fractions', 'Number and Operations', 23),
('math', 3, '3.3F', 'Equivalent fractions',
 'Recognize and generate equivalent fractions with denominators 2, 3, 4, 6, 8.',
 'Equivalent fractions', 'Number and Operations', 24),
('math', 3, '3.3G', 'Explain fraction equivalence',
 'Explain that two fractions are equivalent if and only if they are the same point on a number line.',
 'Equivalent fractions', 'Number and Operations', 25),
('math', 3, '3.3H', 'Compare two fractions',
 'Compare fractions with the same numerator or same denominator using >, <, =.',
 'Comparing fractions', 'Number and Operations', 26),
('math', 3, '3.4A', 'Add and subtract within 1,000',
 'Solve one- and two-step problems with addition and subtraction within 1,000.',
 'Add and subtract within 1000', 'Operations and Algebraic Thinking', 30),
('math', 3, '3.4B', 'Round to the nearest 10 or 100',
 'Round whole numbers to the nearest 10 or 100 using place-value understanding.',
 'Rounding', 'Operations and Algebraic Thinking', 31),
('math', 3, '3.4D', 'Total of equal groups',
 'Determine the total number of objects when equally-sized groups are joined.',
 'Intro to multiplication', 'Operations and Algebraic Thinking', 40),
('math', 3, '3.4E', 'Multiplication with arrays and area models',
 'Represent multiplication facts using arrays, area models, equal jumps on a number line, and skip counting.',
 'Multiplication concepts', 'Operations and Algebraic Thinking', 41),
('math', 3, '3.4F', 'Multiplication facts to 10 × 10',
 'Recall facts to multiply up to 10 by 10 with automaticity.',
 'Multiplication facts', 'Operations and Algebraic Thinking', 42),
('math', 3, '3.4G', 'Multiply 2-digit by 1-digit',
 'Use strategies and the standard algorithm to multiply 2-digit by 1-digit numbers.',
 '2-digit by 1-digit multiplication', 'Operations and Algebraic Thinking', 43),
('math', 3, '3.4H', 'Partition objects into equal groups',
 'Determine the number of objects in each group when partitioned equally.',
 'Intro to division', 'Operations and Algebraic Thinking', 44),
('math', 3, '3.4J', 'Division as inverse of multiplication',
 'Determine a quotient using the relationship between multiplication and division.',
 'Division concepts', 'Operations and Algebraic Thinking', 45),
('math', 3, '3.4K', 'Multi-step multiplication and division problems',
 'Solve one-step and two-step problems involving multiplication and division within 100.',
 'Multiplication and division word problems', 'Operations and Algebraic Thinking', 46),
('math', 3, '3.5B', 'Multiplication and division word problems',
 'Represent and solve one- and two-step multiplication and division problems with arrays, equations, and pictures.',
 'Multiplication and division word problems', 'Operations and Algebraic Thinking', 50),
('math', 3, '3.5D', 'Find the unknown in a multiplication or division equation',
 'Determine the unknown whole number in a multiplication or division equation relating three whole numbers.',
 'Multiplication and division', 'Operations and Algebraic Thinking', 51),
('math', 3, '3.5E', 'Number pairs in tables',
 'Represent additive and multiplicative number patterns using input-output tables and rules.',
 'Patterns', 'Operations and Algebraic Thinking', 52),
('math', 3, '3.6A', 'Classify 2D and 3D figures',
 'Classify and sort two- and three-dimensional figures by number and shape of faces, edges, vertices, and angles.',
 'Geometry', 'Geometry', 60),
('math', 3, '3.6C', 'Area of rectangles using unit squares',
 'Determine the area of rectangles by tiling or multiplying side lengths.',
 'Area', 'Geometry', 61),
('math', 3, '3.6D', 'Area of composite figures',
 'Decompose composite figures formed of rectangles to find total area.',
 'Area', 'Geometry', 62),
('math', 3, '3.7B', 'Perimeter of polygons',
 'Determine the perimeter of a polygon or a missing side length when given perimeter and other sides.',
 'Perimeter', 'Geometry', 70),
('math', 3, '3.7C', 'Time intervals',
 'Determine elapsed time and solve problems with time intervals in minutes.',
 'Time', 'Measurement and Data', 71),
('math', 3, '3.7E', 'Liquid volume and weight',
 'Determine liquid volume and weight using customary and metric units.',
 'Measurement', 'Measurement and Data', 72),
('math', 3, '3.8A', 'Read and make data displays',
 'Summarize a data set with multiple categories using a frequency table, dot plot, pictograph, or bar graph with scaled intervals.',
 'Data', 'Measurement and Data', 80),
('math', 3, '3.8B', 'Solve problems using categorical data',
 'Solve one- and two-step problems using information from data displays.',
 'Data', 'Measurement and Data', 81);
```

### 5.2 Reading — Grade 3 (18 standards)

```sql
INSERT INTO map_standards (subject, grade, teks_code, teks_title, teks_description, khan_unit, map_goal_area, sort_order) VALUES
('reading', 3, '3.3B', 'Use context within a sentence to determine word meaning',
 'Use context clues — definitions, examples, restatements — to determine the meaning of unfamiliar words.',
 'Vocabulary', 'Vocabulary Use and Functions', 10),
('reading', 3, '3.3C', 'Affixes and roots',
 'Identify the meaning of common prefixes (un-, re-, dis-, mis-, pre-) and suffixes (-er, -est, -ful, -less, -ly).',
 'Word study', 'Vocabulary Use and Functions', 11),
('reading', 3, '3.6F', 'Make inferences and use evidence',
 'Make inferences and use textual evidence to support understanding.',
 'Reading comprehension', 'Literary Text', 20),
('reading', 3, '3.6G', 'Determine key ideas',
 'Evaluate details to determine key ideas in a text.',
 'Reading comprehension', 'Informational Text', 21),
('reading', 3, '3.6H', 'Synthesize information',
 'Synthesize information across parts of a text to create new understanding.',
 'Reading comprehension', 'Informational Text', 22),
('reading', 3, '3.7C', 'Use text evidence to support a response',
 'Cite specific evidence from the text when answering or explaining.',
 'Reading response', 'Informational Text', 23),
('reading', 3, '3.7D', 'Retell, paraphrase, and summarize',
 'Retell or paraphrase texts in ways that maintain meaning and logical order.',
 'Reading response', 'Informational Text', 24),
('reading', 3, '3.8A', 'Infer the theme of a literary work',
 'Infer the theme or moral of a story, poem, fable, folktale, or drama.',
 'Literary analysis', 'Literary Text', 30),
('reading', 3, '3.8B', 'Character relationships',
 'Explain the relationships among characters and how they change throughout a story.',
 'Literary analysis', 'Literary Text', 31),
('reading', 3, '3.8C', 'Plot elements',
 'Analyze plot — rising action, climax, falling action, resolution — and the role each plays.',
 'Literary analysis', 'Literary Text', 32),
('reading', 3, '3.8D', 'Setting''s influence on plot',
 'Explain the influence of the setting (time and place) on plot, mood, and characters.',
 'Literary analysis', 'Literary Text', 33),
('reading', 3, '3.9A', 'Folktales, fables, legends, and myths',
 'Recognize the characteristics and structures of traditional literature, including a stated lesson or moral.',
 'Genre study', 'Literary Text', 40),
('reading', 3, '3.9B', 'Poetry — rhyme, rhythm, sound devices',
 'Identify rhyme scheme, rhythm, alliteration, and stanzas in poetry.',
 'Poetry', 'Literary Text', 41),
('reading', 3, '3.9D.i', 'Text features',
 'Use titles, headings, captions, graphics, sidebars, bold print, and tables of contents to locate or clarify information.',
 'Text features', 'Informational Text', 50),
('reading', 3, '3.9D.ii', 'Text structures',
 'Recognize organizational patterns: chronological, cause-and-effect, problem-and-solution, description, compare-and-contrast.',
 'Text structures', 'Informational Text', 51),
('reading', 3, '3.10A', 'Author''s purpose',
 'Explain the author''s purpose — to inform, entertain, persuade, or describe — and how it shapes the text.',
 'Author''s craft', 'Informational Text', 60),
('reading', 3, '3.10D', 'Figurative and descriptive language',
 'Describe how the author''s use of imagery, simile, and sensory language creates effect.',
 'Author''s craft', 'Literary Text', 61),
('reading', 3, '3.10E', 'Literary devices',
 'Identify the use of literary devices, including first or third-person point of view.',
 'Author''s craft', 'Literary Text', 62);
```

### 5.3 Language — Grade 3 (16 standards)

These map to TEKS §110.5 strands 3.2 (foundational language skills — decoding/spelling) and 3.11 (conventions in composition). NWEA's "Language Usage" sub-test in Grade 3 maps cleanly to these.

```sql
INSERT INTO map_standards (subject, grade, teks_code, teks_title, teks_description, khan_unit, map_goal_area, sort_order) VALUES
('language', 3, '3.2B.vi', 'Decoding words with prefixes and suffixes',
 'Decode and recognize multisyllabic words with common prefixes and suffixes.',
 'Word study', 'Language: Word Study', 10),
('language', 3, '3.2C.i', 'Spell multisyllabic words',
 'Spell multisyllabic words with closed, open, and consonant-le syllable patterns.',
 'Spelling', 'Language: Word Study', 11),
('language', 3, '3.2C.ii', 'Spell homophones',
 'Spell common homophones correctly in context (their/there/they''re, to/too/two, your/you''re).',
 'Spelling', 'Language: Word Study', 12),
('language', 3, '3.11D.i', 'Subject-verb agreement',
 'Use complete simple and compound sentences with correct subject-verb agreement.',
 'Grammar', 'Language: Grammar and Usage', 20),
('language', 3, '3.11D.ii', 'Verb tense — past, present, future',
 'Use past, present, and future verb tenses correctly and consistently within a sentence or paragraph.',
 'Grammar', 'Language: Grammar and Usage', 21),
('language', 3, '3.11D.iii', 'Singular, plural, common, and proper nouns',
 'Identify and use singular, plural, common, and proper nouns appropriately.',
 'Grammar', 'Language: Grammar and Usage', 22),
('language', 3, '3.11D.iv', 'Adjectives',
 'Use adjectives, including descriptive (red, soft) and limiting (this, that, those, several).',
 'Grammar', 'Language: Grammar and Usage', 23),
('language', 3, '3.11D.v', 'Adverbs of time and place',
 'Use adverbs that convey time (now, soon, later) and place (here, there, outside).',
 'Grammar', 'Language: Grammar and Usage', 24),
('language', 3, '3.11D.vi', 'Prepositions and prepositional phrases',
 'Identify and use prepositions and prepositional phrases (under the table, before lunch).',
 'Grammar', 'Language: Grammar and Usage', 25),
('language', 3, '3.11D.vii', 'Pronouns',
 'Use subjective (I, he), objective (me, him), and possessive (my, his) pronouns correctly.',
 'Grammar', 'Language: Grammar and Usage', 26),
('language', 3, '3.11D.viii', 'Coordinating conjunctions',
 'Use coordinating conjunctions (and, but, or, so) to connect words, phrases, and clauses.',
 'Grammar', 'Language: Grammar and Usage', 27),
('language', 3, '3.11D.ix', 'Capitalization',
 'Capitalize official titles of people, abbreviations, days, months, and the first word in a quotation.',
 'Conventions', 'Language: Mechanics', 30),
('language', 3, '3.11D.x', 'Punctuation — apostrophes and commas',
 'Use apostrophes in contractions and possessives, and commas in items in a series and in dates.',
 'Conventions', 'Language: Mechanics', 31),
('language', 3, '3.11D.xi', 'Spelling high-frequency words',
 'Spell grade-appropriate high-frequency words correctly.',
 'Spelling', 'Language: Word Study', 32),
('language', 3, '3.11C.i', 'Combining sentences',
 'Revise drafts to combine short sentences using coordinating conjunctions or appositives.',
 'Sentence construction', 'Writing: Revision', 40),
('language', 3, '3.11C.ii', 'Sentence boundaries — fragments and run-ons',
 'Recognize and correct sentence fragments and run-on sentences.',
 'Sentence construction', 'Writing: Revision', 41);
```

After insert, validate:

```sql
SELECT subject, count(*) AS standards
FROM map_standards
WHERE grade = 3
GROUP BY subject
ORDER BY subject;
-- expect: language 16, math 28 (give or take if you collapse codes), reading 18
```

---

## 6. Question bank targets

| Subject | Total questions | Avg per standard | Notes |
|---|---|---|---|
| Math | 600 | ~21 | Heavier than Gr 2 because the curriculum branches into more sub-topics. |
| Reading | 480 | ~27 | Anchored to ~80 passages, 4–6 questions each. |
| Language | 320 | ~20 | Smaller bank — items are shorter and faster to author. |

Within each subject, distribute across RIT bands per the table in section 4. Within each (standard, band) cell, target 4–6 questions.

Generate in batches of 5 questions per `(standard, band)` cell — never bulk-prompt 100 questions. Quality collapses. The Grade 2 experience taught us this.

---

## 7. Authoring rules — Grade 3 deltas

The Grade 2 rules in `CLAUDE.md` §4.2 still apply. These are the additions and overrides for Grade 3.

### 7.1 Math

- **Multiplication and division get visuals.** For 3.4D / 3.4E / 3.4F / 3.4H, use SVG arrays or area models for at least one of every three questions in the band. A 7-year-old who's just learned 6 × 4 needs to see 6 rows of 4 dots, not just digits.
- **Fractions always get a model.** For 3.3A / 3.3B / 3.3F / 3.3H, every question gets either a fraction bar, a circle/pie, a number line, or a set of objects — pick the one that matches what the question is testing. Equivalent-fraction questions especially benefit from side-by-side bars.
- **Two-step problems carry both numbers in the stem.** "Maya bought 3 packs of stickers with 8 stickers each. She gave 5 to Diego. How many does she have now?" — both 3×8 and the subtraction must be in the stem. No "she lost some" with the count buried in a footnote.
- **Area uses square units explicitly.** Don't just say "area" — say "square inches" or "square units" so the unit is part of what's being tested.

### 7.2 Reading

- **Passages first, then questions.** Author the passage, then author 4–6 questions on it, then move on. Do not author questions and try to retrofit a passage.
- **Tier-2 vocabulary is welcome, tier-3 is not.** "Migrated," "ancient," "burrow," "emerged" are fine. "Photosynthesis," "metamorphosis," "stratosphere" are not — those are tier-3 and out of scope for a 3rd-grade reading test (they belong in science class).
- **One main-idea question per passage maximum.** It's tempting to ask three. Don't. Vary across inference, vocabulary-in-context, text features, author's purpose, character, or theme depending on the passage type.
- **Informational passages benefit from a heading and one inline graphic cue.** Use `stem_image_svg` on the passage row (or a separate field if your schema has one) — a pictograph, a simple diagram label, a map. A Grade 3 informational passage without any visual cue feels flat.

### 7.3 Language — special patterns

Language items don't follow the math/reading shape. Three patterns dominate:

**Pattern A — "Fix the sentence" (edit_pick)**

```
Stem: Which sentence is written correctly?
Choices:
  A. My brother and me went to the park.       [pronoun: object form as subject]
  B. My brother and I went to the park.        [correct]
  C. Me and my brother went to the park.       [pronoun + ordering]
  D. My brother and I goes to the park.        [subject-verb agreement]
```

The misconception_tag captures *which kind of error* the wrong choice models. This is the highest-density teaching pattern in the language bank.

**Pattern B — "Pick the missing word" (mcq with cloze)**

```
Stem: Maya quickly ran ___ the door before the rain started.
Choices:
  A. trough     [spelling/word confusion]
  B. through    [correct]
  C. threw      [homophone]
  D. though     [related-but-wrong word]
```

**Pattern C — "Combine these sentences" (sentence_combine)**

```
Stem: Which sentence best combines these two?
  • Diego likes soccer. Diego likes cricket.
Choices:
  A. Diego likes soccer, Diego likes cricket.   [comma splice]
  B. Diego likes soccer and cricket.             [correct]
  C. Diego likes soccer but cricket.             [wrong conjunction]
  D. Diego likes soccer, and cricket too liking. [garbled]
```

Use `question_format = 'edit_pick'` for Pattern A, `'sentence_combine'` for Pattern C, and `'mcq'` for Pattern B.

For Patterns A and C, **stems can be longer than 35 words** because the stem *is* the workspace. The 35-word ceiling applies to the question text, not the sentence(s) being edited.

### 7.4 Misconception tagging at author time

Every distractor gets a `misconception_tag` in snake_case at the moment the question is authored. Don't defer. Examples:

| Subject | Tag | Description |
|---|---|---|
| math | `regrouping_forgot_carry` | Added the ones but didn't carry the ten. |
| math | `place_value_concat` | Wrote "315" for 27+18 — concatenated digits. |
| math | `mult_as_addition` | Treated 3 × 8 as 3 + 8. |
| math | `fraction_compared_numerator_only` | Picked 3/8 > 3/4 because 8 > 4. |
| math | `area_used_perimeter` | Added the side lengths instead of multiplying. |
| reading | `main_idea_picked_detail` | Chose a true detail instead of the overall idea. |
| reading | `inference_literal_only` | Picked the literal restatement instead of the implied meaning. |
| reading | `vocab_similar_word` | Picked a word that looks/sounds similar instead of fitting context. |
| language | `subject_verb_plural_singular` | "He go" instead of "He goes." |
| language | `pronoun_object_as_subject` | "Me and my brother went" instead of "My brother and I went." |
| language | `homophone_their_there` | Confused their/there/they're. |
| language | `comma_splice` | Joined two sentences with only a comma. |

Don't try to enumerate all tags up front. Author a batch, write the tags as you go, then deduplicate at the end of each authoring day. The MCP layer (Appendix A) does the cross-question rollup at query time, not at write time.

Update the JSON shape in the author prompt template (CLAUDE.md §4.3) to require:

```json
"choices": [
  {
    "label": "A",
    "body": "...",
    "is_correct": false,
    "misconception": "Free-text human explanation.",
    "misconception_tag": "snake_case_tag"
  },
  ...
]
```

The correct choice has `misconception: null` and `misconception_tag: null`.

---

## 8. Reading passages — Grade 3 specifics

| Genre | Share of passages | Word range | Typical structure |
|---|---|---|---|
| Literary (realistic fiction, fantasy) | 35% | 200–320 words | One scene, one or two characters, a small problem and resolution. |
| Informational | 45% | 180–300 words | Heading + 2–3 paragraphs. Often includes a diagram cue or simple table reference. |
| Poetry | 12% | 8–24 lines | Rhyme scheme stanzas; one figurative-language device per poem. |
| Drama | 8% | 120–250 words | 2–3 characters, stage directions in italics, one short exchange. |

Topic ideas that work for Grade 3 and don't require US-only context: monarch migration, water cycle, recycling, the inventor of Velcro, how kites fly, how seeds travel, ant colonies, tide pools, baking bread, building a sandcastle, family car trip, the night sky, paper airplanes, an unexpected pet, sharing equipment at recess, learning to ride a bike, helping a younger sibling, a Diwali story, a cricket match, a soccer practice gone wrong, finding something on a hike, library day.

Avoid: 9/11, war, abuse, divorce, death of a parent, hospitalization, US elections, anything tied to a current news event.

For the SQL insert pattern of a passage + its questions, see CLAUDE.md §4.5 — it's unchanged.

---

## 9. Khan Academy and reference mapping

Use these as topical references when authoring (do not embed quotes or content):

- Khan Academy Grade 3 Math (TEKS): https://www.khanacademy.org/math/cc-third-grade-math
- Khan Academy Grade 3 Reading: https://www.khanacademy.org/ela/cc-3rd-reading-vocab
- TEKS Math Grade 3: TAC §111.5
- TEKS ELAR Grade 3: TAC §110.5
- NWEA RIT reference (K–2 and 3–5 norms): https://cdn.nwea.org/docs/RIT+Reference+Brochure_July19_CC.pdf

---

## 10. Coverage queries

Run these after each authoring batch to know what to author next.

**Per-standard coverage:**

```sql
SELECT s.subject, s.teks_code, s.teks_title,
       count(q.id) AS questions,
       count(q.id) FILTER (WHERE q.rit_band = '171_180') AS b171,
       count(q.id) FILTER (WHERE q.rit_band = '181_190') AS b181,
       count(q.id) FILTER (WHERE q.rit_band = '191_200') AS b191,
       count(q.id) FILTER (WHERE q.rit_band = '201_210') AS b201,
       count(q.id) FILTER (WHERE q.rit_band = 'above_210') AS b211
FROM map_standards s
LEFT JOIN map_questions q
  ON q.standard_id = s.id AND q.grade = 3
WHERE s.grade = 3
GROUP BY s.id, s.subject, s.teks_code, s.teks_title
ORDER BY s.subject, questions ASC, s.sort_order;
```

**Misconception tag coverage (after each authoring day):**

```sql
SELECT subject,
       c.misconception_tag,
       count(*) AS uses,
       count(DISTINCT q.standard_id) AS standards_touched
FROM map_question_choices c
JOIN map_questions q ON q.id = c.question_id
WHERE q.grade = 3 AND c.is_correct = false
GROUP BY q.subject, c.misconception_tag
ORDER BY q.subject, uses DESC;
```

A tag used only once is a candidate for either renaming (fold into a similar tag) or expanding (build out 2–3 more questions that exercise it).

**Untagged distractors (should be 0 by end of each day):**

```sql
SELECT count(*)
FROM map_question_choices c
JOIN map_questions q ON q.id = c.question_id
WHERE q.grade = 3
  AND c.is_correct = false
  AND c.misconception_tag IS NULL;
```

---

## 11. Runbook — what to do, in order

Each step has a clear stop-and-validate before the next.

1. **Apply the schema migrations** (section 3). Run the validation query for the enum. Confirm `language` appears.
2. **Insert the math standards** (section 5.1). Validate `count(*) = 28` (or whatever you collapsed to) for `subject='math' AND grade=3`.
3. **Insert the reading standards** (section 5.2). Validate `count(*) = 18`.
4. **Insert the language standards** (section 5.3). Validate `count(*) = 16`.
5. **Author math first.** Pick the lowest-coverage standards and generate 5 questions per (standard, band) cell. Validate each batch's JSON before SQL insertion. Run the coverage query after each authoring session.
6. **Author reading passages, then their questions.** Build to ~80 passages over the seeding cycle. After each passage + question batch, validate with the coverage query.
7. **Author language items.** Use the three patterns from section 7.3. Don't mix patterns within a single 5-question batch — it diffuses the authoring focus.
8. **At the end of each authoring day, run the misconception-tag rollup** (section 10) and dedupe. Aim to converge to 25–40 distinct tags across all three subjects by the end of seeding.
9. **Do a final pass:** the untagged-distractors query must return 0. The per-standard coverage must show no standard with fewer than 6 questions.
10. **Smoke-test the test composer** with `subject='math', grade=3` and `subject='language', grade=3`. Confirm interleaved bands and no monotonic difficulty ramp.

Do not skip ahead. Step 5 onward depends on the standards rows existing.

---

## 12. What NOT to do

- **Don't enable RLS or auth as part of this work.** Phase 1 is still single-student. The MCP layer (Appendix A) is a personal tool for the parent, not a multi-tenant feature.
- **Don't build a Grade 3 parent dashboard.** The MCP layer replaces it for now. If a UI is wanted later, build it after the bank is full and you've used the MCP for a few weeks.
- **Don't auto-translate Grade 2 questions into Grade 3.** Tempting but lazy. The standards differ enough that a translated question is almost always wrong-band, wrong-vocab, or wrong-rigor.
- **Don't backfill `misconception_tag` on Grade 2 distractors as part of this work.** Keep that scoped to Grade 3. If the MCP layer turns out to need cross-grade rollups later, do that as a separate small task.
- **Don't ship a "grade picker" that lets the child choose Grade 3 before the bank has at least 200 math, 150 reading, and 100 language items.** A nearly-empty subject creates an empty test, which is the worst experience.

---

## 13. When in doubt

- If a TEKS code in the seed lists feels off (a real one is missing, or a listed one doesn't actually exist in §110.5/§111.5), check the source and fix the catalog before authoring. The catalog is the foundation — fix it once, not per-question.
- If the coverage query shows a standard that simply can't generate good distractors at a given band, log the gap and move on. Some standards (e.g., 3.5E patterns) are easier to author at `181_190` than at `201_210`.
- If a passage runs long (>320 words), split it into two passages with two distinct question sets rather than cramming.
- If a question feels like it belongs to two standards, pick the one closer to what's being *tested*, not what's *referenced*. A word problem that uses fractions to set up a multiplication is a multiplication question.

---

## Appendix A — MCP recommendation layer (sketch)

Replacing the mastery tracker brief is an MCP server that exposes student data to Claude in chat. Read-only, no automation. The parent asks; Claude reasons and recommends.

### A.1 Tools to expose

| Tool | Purpose |
|---|---|
| `get_student_summary` | Last 30 days: tests taken, accuracy by subject, RIT estimates, current band per subject. |
| `get_recent_sessions(n=10)` | Session list with subject, score, RIT estimate, duration, date. |
| `get_attempts_by_standard(subject, days=30)` | Per-TEKS rollup: attempts, accuracy, weighted-recent accuracy, last-seen date. |
| `get_misconception_rollup(subject, days=30)` | Per-tag rollup: count, standards touched, last-seen date, recent accuracy on questions with this tag in distractors. |
| `get_question_details(question_id)` | The stem, all choices with their tags, correct answer, the student's history with that question. |

### A.2 Implementation sketch

A single TypeScript server in the existing Vercel project, mounted at `/api/mcp`. Five SQL queries behind five tool handlers. ~300 lines total. Authenticate with a static token in an env var — this is a parent-only tool.

### A.3 What "good" looks like

A typical Saturday morning conversation:

> *Parent:* What did Caleb work on this week and where is he stuck?
>
> *Claude (using the MCP):* He took 3 math sessions and 2 reading. Math accuracy is 78%, language wasn't attempted. The pattern that jumps out: across three different fraction standards (3.3F, 3.3G, 3.3H), he keeps picking the answer where the larger denominator means a larger fraction — that's the `fraction_compared_denominator_only` misconception. He's gotten 6 of 9 fraction-comparison questions wrong this week, and 5 of those 6 picked the same kind of distractor. I'd suggest a 10-minute fraction-bar exercise before his next session.

The MCP doesn't *do* the exercise. It tells the parent what to do. That's the right division of labor for one kid.

### A.4 Parking lot

Things deliberately not in scope for the first MCP version: writing recommendations to the database, scheduling future tests, generating content. All read, no write. Resist the temptation to add a write tool early — it will regret-of-Friday-afternoon you.
