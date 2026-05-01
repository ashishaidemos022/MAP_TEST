# Feature Brief: Grade 1 Seeding (Math, Reading, Language)

> Hand this entire document to Claude in the MAP practice app repo. It is a complete spec — schema deltas, standards seeding, taxonomy audit, authoring playbook, validation queries. Read it end-to-end before starting. Append the relevant parts to `CLAUDE.md` when done.

---

## 1. What we are building and why

The app currently serves Grade 2 (well-stocked) and Grade 3 (at-target). This brief expands the question bank and infrastructure to **Grade 1**, covering all three subjects (math, reading, language) in a single coordinated push.

We are reusing the existing schema. No new tables. The `grade` column on `map_standards`, `map_questions`, and `map_students` does the work. The hard parts are:

1. **Seeding the Grade 1 TEKS catalog from zero.** Currently `map_standards` has zero Grade 1 rows.
2. **Auditing the existing 45-tag misconception taxonomy** for Grade 1 fit, dropping what doesn't apply, and adding what's specifically Grade 1.
3. **Calibrating RIT bands downward.** Grade 1 NWEA norms center much lower than Grade 2 — `below_161` (currently unused at any grade) becomes a real band.
4. **Authoring developmentally-appropriate content.** A 1st-grader is mid-decoding. The stem rules in `CLAUDE.md` §4.2 need to tighten further.

**Hard rules — do not violate these:**

- All Grade 1 questions are MCQ (`question_format = 'mcq'`). The `edit_pick` and `sentence_combine` formats used in Grade 3 language are too cognitively demanding for Grade 1 — they require reading-fluency the child does not yet have. Defer those formats to Grade 2+ language.
- Stems are read-aloud by default. A 1st-grader cannot reliably decode a 25-word stem. Cap Grade 1 stems at **15 words**.
- Reading passages cap at 100 words for on-grade-level. Decoding load matters more than content sophistication at this age.
- No new tables. No new columns unless explicitly listed in §2.
- Service-role only. The catalog tables (`map_standards`, `map_questions`, `map_question_choices`, `map_reading_passages`, `map_misconception_tags`) have RLS with **SELECT-only** policies for `authenticated`. Inserts must be done via the service role key or `apply_migration` — not from a logged-in user session.

---

## 2. Schema deltas (none required, but verify)

This brief introduces no new tables and no new columns. The existing schema already supports everything needed:

- `map_standards.grade smallint` ✓
- `map_questions.grade smallint` ✓
- `map_students.grade smallint` ✓
- `map_subject` enum already includes `language` ✓
- `map_rit_band` enum already includes `below_161` ✓ (currently unused — Grade 1 will be the first to populate it)
- `map_misconception_tags.related_teks text[]` accepts any TEKS string ✓

Verify before proceeding:

```sql
SELECT count(*) FROM map_standards WHERE grade = 1;     -- expect 0
SELECT count(*) FROM map_questions WHERE grade = 1;     -- expect 0
SELECT count(*) FROM map_reading_passages p
  WHERE EXISTS (SELECT 1 FROM map_questions q
                WHERE q.passage_id = p.id AND q.grade = 1); -- expect 0
SELECT enum_range(NULL::map_subject);                    -- expect {math,reading,language}
SELECT enum_range(NULL::map_rit_band);                   -- includes below_161
```

If any of these surprise you, stop and report.

---

## 3. The Grade 1 plan in three phases

Execute these in order. Each phase has a checkpoint.

| Phase | What | Checkpoint |
|---|---|---|
| **3.1 Standards** | Seed `map_standards` with all Grade 1 TEKS for math, ELAR, and language | `count(*) = 1` per row described in §4 |
| **3.2 Taxonomy** | Audit existing 45 tags + insert Grade 1-specific tags. Update `related_teks` arrays. | All tags either DROP-from-G1, KEEP-with-G1-codes-added, or ADDED-as-new |
| **3.3 Content** | Author passages first, then questions, per the playbook in §6 | Coverage queries in §8 hit thresholds |

Do not skip ahead. Phase 3.3 depends on Phase 3.1 (foreign keys) and Phase 3.2 (`misconception_tag` values must exist before distractors reference them).

---

## 4. Phase 3.1 — Seed Grade 1 standards

### 4.1 Source of truth

- **Math:** TAC §111.3 (Grade 1 Mathematics) — https://tea.texas.gov
- **ELAR (reading + language):** TAC §110.3 (Grade 1 ELAR) — https://tea.texas.gov

The Grade 1 ELAR TEKS interleave reading-comprehension, vocabulary, and language conventions in a single document. Split them into **`subject = 'reading'`** vs **`subject = 'language'`** in `map_standards` using the same convention as Grade 2:

- `reading` covers: comprehension skills (1.5 series), response skills (1.6), multi-genre comprehension (1.7, 1.8, 1.9), author's craft (1.10), vocabulary use (1.3 except phonics).
- `language` covers: conventions (1.11.D series — capitalization, punctuation, parts of speech, sentence structure, spelling patterns, subject-verb agreement, pronoun use, etc.).

Do **not** seed pure phonological-awareness or phonics standards (1.2 series) as testable items — they are oral/decoding-only and cannot be reliably tested in 4-choice MCQ.

### 4.2 Target counts

| Subject | Target standards count | Notes |
|---|---:|---|
| math | 28–32 | Process standards (1.1) excluded; 1.2–1.9 student expectations only |
| reading | 18–22 | Excludes phonics (1.2 series); includes vocab, comprehension, response, multi-genre, author's craft |
| language | 14–18 | The 1.11.D conventions sub-series |

These ranges are sanity bounds. The actual count should match what the TEKS document actually contains — if you read TAC §110.3 carefully and count 19 reading expectations, seed 19. Do not pad to fit a number.

### 4.3 Convention to match

Look at how Grade 2 standards are already seeded to mirror the style:

```sql
SELECT teks_code, teks_title, teks_description, reporting_category, khan_unit, nwea_goal_area, sort_order
FROM map_standards WHERE grade = 2 AND subject = 'math' ORDER BY sort_order LIMIT 5;
```

Conventions observed from Grade 2:
- `teks_code` is the dotted-letter form: `1.2A`, `1.6F`, `1.11.D.iii` (language sub-codes use lowercase Roman numerals)
- `teks_title` is 5–8 words, parent-readable, snake-cased only when no natural language fits
- `teks_description` is the official student-expectation language, lightly trimmed for clarity. Do not invent your own description.
- `reporting_category` uses STAAR-style umbrella names: `Number & Operations`, `Algebraic Reasoning`, `Geometry & Measurement`, `Data Analysis`, `Comprehension`, `Response`, `Multiple Genres`, `Author's Craft`, `Conventions`, `Vocabulary`
- `khan_unit` references a Khan Academy Grade 1 topic (math: https://www.khanacademy.org/math/cc-1st-grade-math; reading: https://www.khanacademy.org/ela/cc-1st-reading-vocab)
- `nwea_goal_area` is one of the standard NWEA goal areas. For Grade 1 these are typically: Operations & Algebraic Thinking, Numbers & Operations in Base Ten, Geometry, Measurement & Data, Foundational Skills, Vocabulary Use & Functions, Literary Text, Informational Text, Language & Writing
- `sort_order` uses integer gaps (10, 11, 12 …) so re-ordering later is cheap. Keep Grade 1 sort_orders distinct from Grade 2 numerically by starting at 1 and ending below 100.

### 4.4 Seeding approach

Insert in **one migration** named `seed_grade_1_standards`. One transaction means a partial seed never leaves the catalog half-done. Pattern:

```sql
INSERT INTO map_standards
  (subject, grade, teks_code, teks_title, teks_description,
   reporting_category, khan_unit, nwea_goal_area, sort_order)
VALUES
  ('math', 1, '1.2A',
   'Recognize numbers up to 120',
   'Recognize instantly the quantity of structured arrangements.',
   'Number & Operations',
   'Numbers 0 to 120',
   'Numbers & Operations in Base Ten',
   10),
  -- ... continue for all G1 standards
;
```

Validate after the migration:

```sql
SELECT subject, count(*) AS n FROM map_standards
WHERE grade = 1 GROUP BY subject ORDER BY subject;
```

Numbers should land in the §4.2 ranges. If reading and language together exceed 35, you're probably double-counting an ELAR expectation — re-read TAC §110.3.

---

## 5. Phase 3.2 — Audit and extend the misconception taxonomy

There are 45 existing tags (math 18, reading 12, language 15). Each one is either:

- **KEEP** — the tag genuinely applies to Grade 1. Add Grade 1 TEKS codes to its `related_teks` array.
- **DROP-FOR-G1** — the tag describes a Grade 2+ error pattern. Leave the tag alone, do not add Grade 1 codes to it.
- **ADD-NEW** — a Grade 1-specific error pattern that no existing tag captures. Insert as a new row.

### 5.1 Math tag audit (proposed starting point — verify against your judgment)

Of 18 existing math tags:

**KEEP and extend with Grade 1 codes** (add G1 TEKS to `related_teks`):
- `_misc_other` (catch-all)
- `comparison_ordering_misread` — Grade 1 compares within 120 (1.2 series)
- `fraction_equal_parts_or_size` — Grade 1 does halves and quarters (1.6G/H)
- `graph_or_table_misread` — Grade 1 reads picture/bar graphs (1.8 series)
- `measurement_unit_size` — Grade 1 length comparison (1.7 series)
- `money_value_or_notation` — Grade 1 coins (1.4 series)
- `number_line_position` — Grade 1 reads number lines (1.5 series)
- `off_by_one_count` — universally Grade 1
- `operation_swap_add_subtract` — Grade 1 adds/subtracts within 20 (1.3 series, 1.5 series)
- `place_value_concatenated_digits` — Grade 1 introduces tens/ones
- `place_value_misread_column` — Grade 1 introduces tens/ones (1.2 series)
- `shape_attribute_partial_match` — Grade 1 2D/3D shapes (1.6 series)
- `skip_count_wrong_amount` — Grade 1 skip counts 2/5/10 (1.5 series)
- `time_clock_reading` — Grade 1 hour/half-hour (1.7E)

**DROP from Grade 1** (do not add G1 codes — leave the tag in place for Grade 2+):
- `equal_groups_or_array_count` — multiplication concept, Grade 2+
- `even_odd_ending_digit` — Grade 2 introduces odd/even formally
- `regrouping_borrow_error` — Grade 1 subtraction within 20 doesn't require borrowing
- `regrouping_forgot_carry` — same reasoning for addition

**ADD as new Grade 1 math tags:**

| New tag | Rationale |
|---|---|
| `teen_number_reversal` | Writes 13 as "31" or hears "fourteen" as "forty". Defining Grade 1 error. |
| `make_a_ten_strategy_missed` | Doesn't decompose to make 10 (8+5 → 8+2+3). Core Grade 1 fluency strategy. |
| `cardinality_count_to_total` | Counts 1,2,3,4,5 but doesn't connect "5" to "the total is 5". Foundational K/Grade 1. |
| `addition_subtraction_inverse_missed` | Doesn't recognize 8+? = 13 as the same as 13−8. Grade 1 fact-family concept. |

### 5.2 Reading tag audit

Of 12 existing reading tags, **all 12 KEEP with Grade 1 codes added**. Reading errors are largely developmental and span grades — main-idea-vs-detail confusion happens at Grade 1 just as much as Grade 2. The relevant Grade 1 TEKS codes will likely be `1.5.F` (main idea), `1.5.G` (sequence), `1.6.E` (response), `1.7.C` (feelings), `1.8.A/B/C` (literary elements), `1.9.A/B/D` (informational features), `1.10.D` (figurative language), `1.3.A/B` (vocabulary).

Caveat to verify against the data: if `affix_meaning_confusion` doesn't fit Grade 1 ELAR (Grade 1 introduces only the simplest prefixes/suffixes — un-, re-), leave its `related_teks` Grade-2-only and skip authoring distractors with this tag in Grade 1.

**ADD as new Grade 1 reading tags:**

| New tag | Rationale |
|---|---|
| `picture_only_response` | Answers from the picture rather than the text. Grade 1 picture-book context. |
| `decoding_similar_word_picked` | Picks a visually similar wrong word ("hop" for "hope", "ran" for "run"). Decoding-stage error. |

### 5.3 Language tag audit

Of 15 existing language tags:

**KEEP with Grade 1 codes added:**
- `capitalization_rules` (1.11.D capitalization expectations)
- `confused_synonym_with_antonym` (1.3.D opposites)
- `part_of_speech_confusion` (intro level — nouns/verbs/adjectives)
- `plural_form_confusion` (singular/plural in 1.11.D)
- `pronoun_mismatch` (1.11.D pronouns)
- `punctuation_rules` (end punctuation)
- `sentence_completeness` (complete simple sentences)
- `spelling_pattern_confusion` (CVC and short-vowel patterns)
- `spelling_recognition`
- `subject_verb_agreement` (intro)
- `verb_tense_confusion` (past/present/future)
- `compound_word_formation` (light — Grade 1 introduces some compounds)
- `preposition_use` (light — Grade 1 prepositional phrases)

**DROP from Grade 1:**
- `apostrophe_use_confusion` — contractions are Grade 2+
- `conjunction_use` — coordinating conjunctions barely touched at Grade 1

**ADD as new Grade 1 language tags:**

| New tag | Rationale |
|---|---|
| `article_a_an_misuse` | "a apple" vs "an apple". Definitive Grade 1 error. |
| `cvc_short_vowel_confusion` | Picks the wrong short vowel (cat/cot/cut). Phonics-stage. |
| `high_frequency_word_misspell` | Picks the wrong sight-word spelling (the, was, said, you). Grade 1 sight-word foundation. |

### 5.4 Migration shape

Apply as `extend_misconception_taxonomy_for_grade_1`. Two operations:

```sql
-- 5.4a: Add new Grade 1-specific tags
INSERT INTO map_misconception_tags
  (tag, subject, display_name, description, remediation_hint, related_teks, child_cta)
VALUES
  ('teen_number_reversal', 'math',
   'Reverses or mishears teen numbers',
   'Hears or writes 13 as "31", or confuses "fourteen" with "forty".',
   'Use ten-frames showing 10 + 3, 10 + 4 etc. Connect the spoken word to the visible 10 plus extras.',
   ARRAY['1.2A','1.2B','1.2C','1.2D'],
   'Try teen number practice'),
  -- ... etc for all new tags
;

-- 5.4b: Extend related_teks on tags we're keeping
UPDATE map_misconception_tags
SET related_teks = array_cat(related_teks, ARRAY['1.2C','1.2D'])
WHERE tag = 'comparison_ordering_misread';
-- ... etc for each KEEP tag
```

Validate:

```sql
SELECT subject, count(*) AS n
FROM map_misconception_tags GROUP BY subject ORDER BY subject;
-- expect math >= 18, reading >= 14, language >= 16

SELECT count(*) FROM map_misconception_tags
WHERE related_teks && ARRAY(SELECT teks_code FROM map_standards WHERE grade = 1);
-- expect: most active tags should match at least one Grade 1 standard
```

---

## 6. Phase 3.3 — Author Grade 1 content

### 6.1 RIT band targets for Grade 1

NWEA 2020 norms for Grade 1: Beginning of year ~150, Middle ~162, End ~172, Above-grade-level ~180+.

Use this distribution as the target for the Grade 1 question bank:

| Band | Centroid | % of Grade 1 bank | Why |
|---|---:|---:|---|
| `below_161` | 156 | ~10% | Review / supports below-grade-level kids |
| `161_170` | 165 | ~30% | BOY-MOY on-grade |
| `171_180` | 175 | ~35% | EOY on-grade — the heaviest bucket |
| `181_190` | 185 | ~20% | Stretch |
| `191_200` | 195 | ~5% | High stretch |

`below_161` is currently unused at any grade — Grade 1 will be the first to populate it. That is correct and intentional.

The test composer (§5.2 of CLAUDE.md, and the smarter version in MASTERY_TRACKER_BRIEF.md §5) needs the band-centroid map updated to be **grade-aware** — Grade 1's 175 is on-grade, Grade 2's 175 is below-grade. Track that change as a follow-on to this brief; do not modify the composer in the same migration as the seed.

### 6.2 Authoring rules for Grade 1 (delta from CLAUDE.md §4.2)

`CLAUDE.md` §4.2 still applies. The following tighten or replace specific rules for Grade 1:

1. **Stem cap: 15 words**, not 25. A 1st-grader is mid-decoding. If you can't fit it in 15 words, cut a clause or use a figure (`stem_image_svg`).
2. **Numerals only up to 120 in math.** Don't write three-digit numbers in stems; that's Grade 2.
3. **Reading passages: 30–80 words for on-grade**, 50–100 for stretch. (Compared to 80–180 at Grade 2.)
4. **Lexile range: 190L–530L** estimated for Grade 1 (compared to 420L–820L at Grade 2). You don't need a real Lexile API — this is for author judgment.
5. **Vocabulary discipline.** Use the most common 500 words for stems and choices unless the question explicitly tests vocabulary. When you're tempted to write "discover" or "investigate," use "find out" instead.
6. **Names from the same shared pool.** Maya, Ethan, Priya, Liam, Ava, Aarav, Zoe — same as `CLAUDE.md` §4.2.6. Add Mia, Noah, Leo, Isla as additional Grade 1-friendly options if you need more variety.
7. **Math figures: use SVG.** Ten-frames, place-value blocks, number lines, picture graphs — all `stem_image_svg`. No external images.
8. **Reading passages: prefer real-world contexts** that a 1st-grader can connect to (family, school, pets, weather, parks). Avoid abstract or unfamiliar settings.
9. **Distractor `misconception_tag` is mandatory.** Every wrong answer must reference an existing tag in `map_misconception_tags`. Use `_misc_other` only when nothing else fits, and try not to.

### 6.3 Per-subject playbook

#### Math

- All MCQ.
- Generate in batches of 5 per `(standard, rit_band)`.
- Heaviest topics for Grade 1: place value to 120 (1.2 series), addition/subtraction within 20 (1.3 / 1.5), coins (1.4), shapes (1.6), measurement (1.7), data (1.8). Distribute questions roughly proportionally to TEKS coverage of these topics.
- Use SVG ten-frames generously. A ten-frame is the most powerful Grade 1 visual.
- For coin questions, draw the coin (front view) — don't just write "5¢."

#### Reading

- All MCQ. Always tied to a passage (existing schema constraint enforces this).
- **Author the passages first** — you cannot insert reading questions without a `passage_id`.
- Genre coverage for Grade 1: 50% literary, 35% informational, 10% poetry, 5% drama. Drama at Grade 1 is essentially a tiny play with two speakers — keep it minimal.
- 4–6 questions per passage covering: who/what/where/when, main idea (light), sequence, character feelings, vocabulary in context (one word), picture-text connection.

#### Language

- All MCQ. **Do NOT use `edit_pick` or `sentence_combine` formats** — defer to Grade 2+ (see §1 hard rules).
- Question shapes that work at Grade 1:
  - "Which word fits the blank? *Maya ___ to school.*" (verb tense, articles, prepositions)
  - "Which word means the **opposite** of *big*?" (synonyms/antonyms)
  - "Which word is spelled correctly?" (spelling recognition with 4 close variants)
  - "Which sentence has correct capitalization?"
  - "Which is the plural of *foot*?"
- Avoid metalinguistic terminology in stems. Don't write "Which is a noun?" — write "Which word names a thing?"

### 6.4 Reading passages — author them first

For each passage:

```sql
INSERT INTO map_reading_passages
  (title, body, genre, word_count, lexile, rit_band, source, topic)
VALUES
  ('The Lost Sock',
   'Liam looked under his bed. ... [60 words total]',
   'literary',
   60, 320, '171_180', 'original', 'family-life')
RETURNING id;
```

Then, immediately after, insert 4–6 questions referencing that `passage_id`. Do this in the same transaction — orphaned passages are noise.

Genre coverage targets across the Grade 1 reading bank:

| Genre | Target % | Rough count (assuming ~150 reading questions, ~30 passages) |
|---|---:|---:|
| literary | 50% | ~15 passages |
| informational | 35% | ~10 passages |
| poetry | 10% | ~3 passages |
| drama | 5% | ~2 passages |

### 6.5 Authoring template (extends CLAUDE.md §4.3)

Use this prompt with Claude Sonnet 4.5+ for each batch. Replace `{{...}}` placeholders.

```
You are authoring practice questions for a Grade 1 MAP-style test, aligned to Texas TEKS.

Standard: {{teks_code}} — {{teks_title}}
Full description: {{teks_description}}
Subject: {{math|reading|language}}
Khan Academy unit reference: {{khan_unit}}
Target RIT band: {{rit_band}} — see brief §6.1 for centroids
Difficulty: {{easy|medium|hard}}
Question format: mcq

For reading questions only, the passage is:
"""
{{passage_body}}
"""

Author 5 questions. For each, output a JSON object with this exact shape:

{
  "stem": "string — the question text, ≤ 15 words, age-appropriate",
  "stem_image_svg": "string or null — inline <svg>...</svg> if a figure is needed",
  "explanation": "string — teach the solution method, do not just state the answer",
  "source_note": "Khan Academy: {{khan_unit}}",
  "passage_id": "{{passage_uuid_or_null}}",
  "choices": [
    { "label": "A", "body": "...", "is_correct": false,
      "misconception": "specific Grade 1 thinking error in one sentence",
      "misconception_tag": "exact tag from map_misconception_tags" },
    { "label": "B", "body": "...", "is_correct": true,
      "misconception": null, "misconception_tag": null },
    { "label": "C", "body": "...", "is_correct": false,
      "misconception": "...", "misconception_tag": "..." },
    { "label": "D", "body": "...", "is_correct": false,
      "misconception": "...", "misconception_tag": "..." }
  ]
}

Hard requirements:
- Stems ≤ 15 words.
- Exactly one is_correct = true.
- Every distractor's misconception_tag is one of the existing tags in map_misconception_tags
  for the relevant subject. Do not invent tags.
- Every distractor's misconception field is a specific Grade 1 thinking error,
  not a generic "got it wrong."
- Use Maya, Ethan, Priya, Liam, Ava, Aarav, Zoe, Mia, Noah, Leo, Isla. No Sarah/John clichés.
- For place value, fractions, geometry, measurement, money: use stem_image_svg
  (ten-frames, blocks, number lines, coin drawings).
- Common-500-words rule: vocabulary is plain unless the question tests vocab.
- Output ONLY a JSON array of 5 objects. No prose, no markdown fences.
```

### 6.6 SQL insert pattern (extends CLAUDE.md §4.5)

The Grade 2 pattern in `CLAUDE.md` §4.5 is extended in two ways: include `grade = 1` and include `misconception_tag` on every distractor.

```sql
WITH new_q AS (
  INSERT INTO map_questions
    (subject, grade, standard_id, rit_band, difficulty,
     stem, stem_image_svg, explanation, source_note, question_format)
  VALUES ('math', 1,
          (SELECT id FROM map_standards WHERE teks_code = '1.3D' AND subject = 'math' AND grade = 1),
          '171_180', 'medium',
          $stem$Maya has 8 stickers. Liam gives her 5 more. How many now?$stem$,
          NULL,
          $exp$8 + 5 = 13. Make a ten: 8 + 2 = 10, then 10 + 3 = 13.$exp$,
          'Khan Academy: Add within 20',
          'mcq')
  RETURNING id
)
INSERT INTO map_question_choices
  (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
SELECT id, c.label, c.body, c.is_correct, c.misconception, c.misconception_tag, c.sort_order
FROM new_q,
(VALUES
  ('A','12', false,
   'Counted on but stopped one short.',
   'off_by_one_count', 1),
  ('B','13', true, NULL, NULL, 2),
  ('C','3',  false,
   'Subtracted instead of added.',
   'operation_swap_add_subtract', 3),
  ('D','85', false,
   'Wrote the digits side-by-side instead of adding.',
   'place_value_concatenated_digits', 4)
) AS c(label, body, is_correct, misconception, misconception_tag, sort_order);
```

**Run as the service role**, not as an authenticated user. The catalog tables only have SELECT policies for `authenticated` — INSERT will silently produce zero rows otherwise. If using the Supabase MCP tools, `apply_migration` is the right channel for batches; `execute_sql` runs as service role and is fine for one-off inserts during authoring.

---

## 7. Quality bar and common pitfalls

These are the failure modes most likely to creep in. Catch them in review before insert.

1. **Stem too long.** If your stem is 18 words because you "needed context," cut the context — this is Grade 1.
2. **Distractor with a generic misconception.** "Made a mistake" or "got confused" is not a misconception. The Grade 3 `edit_pick` questions in the existing bank have this problem already (e.g. `"Chose a form with the targeted Grade 3 grammar, spelling, or usage error."`) — do not repeat it for Grade 1. If you can't name a specific error, you don't understand the distractor; rewrite it.
3. **Reading passages that read like Grade 3 content with shorter sentences.** A Grade 1 passage isn't just shorter — it's more concrete, has fewer characters, and uses high-frequency words. "The exuberant puppy bounded" is wrong even at 5 words.
4. **Math problems that exceed the Grade 1 number range.** No three-digit numbers, no addition past 20 unless you're on a place-value-to-120 standard, no multiplication.
5. **Language questions using metalinguistic terms.** "Which is a proper noun?" — a 1st-grader doesn't know "proper noun." Phrase as "Which word should start with a capital letter?"
6. **Misconception tags that don't apply.** Tagging a Grade 1 addition mistake as `regrouping_forgot_carry` when the problem is 4+3 (no regrouping involved) is worse than `_misc_other` — it pollutes the signal.

---

## 8. Coverage targets and validation queries

Before declaring Grade 1 seeding done:

### 8.1 Standards coverage

```sql
SELECT subject, count(*) FROM map_standards WHERE grade = 1 GROUP BY subject;
-- expect math 28-32, reading 18-22, language 14-18
```

### 8.2 Question coverage

| Subject | Total target | Per-standard floor | Notes |
|---|---:|---:|---|
| math | 300 | 8 per standard | Heavier on 1.2 (place value) and 1.3 (operations) |
| reading | 150 | n/a — measure per passage | 4–6 questions per passage, 25–30 passages |
| language | 200 | 12 per standard | 1.11.D conventions are narrower so density is higher |

```sql
-- Per-standard math coverage
SELECT s.teks_code, s.teks_title, count(q.id) AS n
FROM map_standards s LEFT JOIN map_questions q
  ON q.standard_id = s.id
WHERE s.grade = 1 AND s.subject = 'math'
GROUP BY s.id, s.teks_code, s.teks_title
ORDER BY n ASC, s.sort_order;
```

### 8.3 RIT band distribution check

```sql
SELECT rit_band, count(*) AS n,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM map_questions WHERE grade = 1
GROUP BY rit_band ORDER BY rit_band;
```

The percentages should roughly match the §6.1 targets (within ±5 points per band).

### 8.4 Misconception tag hygiene

```sql
-- Every Grade 1 distractor has a misconception_tag
SELECT count(*) AS untagged_grade1
FROM map_question_choices c
JOIN map_questions q ON q.id = c.question_id
WHERE q.grade = 1 AND c.is_correct = false
  AND c.misconception_tag IS NULL;
-- expect 0
```

```sql
-- _misc_other should be < 5% of Grade 1 distractors (lazy-tag detection)
SELECT count(*) FILTER (WHERE c.misconception_tag = '_misc_other')::float
       / count(*) AS misc_other_share
FROM map_question_choices c
JOIN map_questions q ON q.id = c.question_id
WHERE q.grade = 1 AND c.is_correct = false;
-- expect < 0.05
```

### 8.5 Cross-grade integrity

```sql
-- No Grade 1 question references a non-Grade-1 standard
SELECT count(*) AS mismatched
FROM map_questions q JOIN map_standards s ON s.id = q.standard_id
WHERE q.grade = 1 AND s.grade != 1;
-- expect 0

-- All Grade 1 reading questions have a passage_id
SELECT count(*) FROM map_questions
WHERE grade = 1 AND subject = 'reading' AND passage_id IS NULL;
-- expect 0
```

---

## 9. What to do FIRST

In order, with checkpoints:

1. **Run the §2 verification queries.** Confirm Grade 1 is empty and the schema/enums match. Stop and report any surprises.
2. **Read TAC §111.3 (math) and TAC §110.3 (ELAR).** Build the standards list as a working draft. **Do not insert yet.** Bring the draft list back for confirmation before the migration.
3. **After standards-list confirmation, run the `seed_grade_1_standards` migration.** Validate with §4.4 query.
4. **Propose the misconception taxonomy audit** — DROP/KEEP/ADD decisions per §5, with the Grade 1 codes you'll add to each KEEP tag. Wait for confirmation.
5. **Run the `extend_misconception_taxonomy_for_grade_1` migration.** Validate with §5.4 query.
6. **Author reading passages first.** ~30 passages across genres. Insert one passage and its 4–6 questions per transaction. Spot-check 3 passages with a parent or yourself reading aloud — if a 1st-grader couldn't read it, rewrite.
7. **Author math questions** in batches of 5 per `(standard, rit_band)`. Author for the lowest-coverage standards first (use the §8.2 query).
8. **Author language questions** last — they're the most formulaic and easiest to batch.
9. **Run all §8 validation queries.** Fix any failures before declaring done.

Do not skip ahead. Each step has tests in §8 that depend on the prior step.

---

## 10. What NOT to build for Grade 1

These were considered and rejected. Don't add them.

- `edit_pick` or `sentence_combine` question formats. Save for Grade 2+ language. A 1st-grader cannot reliably parse four full sentences and pick the grammatically correct one.
- A separate Grade 1 misconception taxonomy. The point of the audit-and-extend approach is cross-grade signal — `off_by_one_count` should fire whether the kid is in Grade 1 or Grade 3.
- Audio recording of read-aloud. Browser TTS is fine; building human-recorded audio for 800+ stems is out of scope.
- Phonological-awareness MCQ items (rhyming, blending). They require audio, not text. Defer to a future phonics-specific feature.
- A separate `map_questions_g1` table. Same schema, more rows — see CLAUDE.md §7.

---

## 11. Updates needed in CLAUDE.md after Grade 1 ships

When the Grade 1 seed is complete, update `CLAUDE.md` with:

- §1 design pillars: note that `language` is now a third subject.
- §3 schema: note that `map_questions.question_format` exists with values `mcq | edit_pick | sentence_combine`, and Grade 1 is MCQ-only.
- §4.2 authoring rules: add the Grade 1 stem cap (15 words) and number-range rules.
- §4.3 authoring template: replace with the §6.5 template that includes `misconception_tag`.
- §4.5 SQL insert pattern: replace with the §6.6 pattern that includes `misconception_tag` and `question_format`.
- §5.2 test composer: note that band-centroids and target distributions are now grade-specific (Grade 1 centers lower than Grade 2).
- §5.3 RIT estimate: note grade-specific calibration.
- §7 phase roadmap: mark Grade 1 done.

---

## 12. When in doubt

- If a TEKS code in TAC §111.3 or §110.3 doesn't fit the existing reporting categories, surface it before forcing it into one.
- If a standard reads like it requires audio (phonological awareness, oral fluency), skip it from the seeded catalog — note it in a follow-up issue.
- If the existing 45 misconception tags don't cover a Grade 1 error pattern that genuinely matters, propose a new tag (and the ≥3-distractors-across-≥2-standards rule from MASTERY_TRACKER_BRIEF.md §3.1 still applies).
- If the data contradicts this brief — for example, Grade 1 NWEA norms have shifted in a more recent NWEA report than the 2020 norms cited here — surface the contradiction. Don't paper over it.
