# Seeding Guide — Grade 2 MAP Practice Questions

> **Audience:** the parent (Ashish) and any Claude session authoring questions for this app.
> **Purpose:** every batch of questions you seed should produce content that fits the existing 179-item bank without drift. This is the authoritative reference.
> **Project context:** Plano ISD student, NWEA MAP-style practice, aligned to Texas TEKS, supplementary to Khan Academy.

---

## 1. The framing

This app exists to help one specific second-grader prepare for the MAP Growth assessment that Plano ISD administers. He sits the test on a Chromebook at school. The practice we build here should mirror the *experience* of that test as closely as possible — the question shapes, the visual style, the difficulty calibration, the timing rhythm — without copying any actual test items.

Three constraints shape every authoring decision:

1. **Plano ISD follows TEKS.** Every question is tagged to a TEKS standard from §110.4 (Grade 2 ELAR) or §111.4 (Grade 2 Math). Khan Academy's units are a useful organizational layer but TEKS is the primary alignment.
2. **NWEA MAP is computer-adaptive and uses RIT scores.** A Grade 2 student typically scores 160–200 RIT depending on time of year. Our `map_rit_band` enum bins this into `171_180`, `181_190`, `191_200`, `201_210` plus tails. Every question gets one band.
3. **MAP has three separate subtests at this grade level: Math, Reading, Language Usage.** They are distinct subjects in our schema (`map_subject` enum). Do not blur them.

Everything below follows from those three.

---

## 2. The three subjects — what each is and isn't

### Math (`subject = 'math'`)

Covers the full Grade 2 TEKS Math standards under §111.4: number sense and place value, addition/subtraction within 1,000, multiplication readiness, fractions of wholes, geometry, measurement, time, money, and data analysis (bar graphs, picture graphs, line plots).

Mix of computation, word problems, and visual reasoning. Roughly half of all Grade 2 MAP math items have a figure (number line, base-ten blocks, fraction bars, shapes, clocks, rulers, coins, bar graphs). Our bank should match that rate as it grows.

### Reading (`subject = 'reading'`)

**Passage-anchored only.** Every reading question has a `passage_id` set — this is enforced by a CHECK constraint. Reading questions test comprehension of a specific passage: main idea, supporting details, vocabulary in context, author's purpose, character feelings, sequence, genre features.

Passages span four genres: literary (fiction stories), informational, poetry, drama. Coverage in roughly that order of frequency. Lexile range 440–620 for Grade 2.

### Language Usage (`subject = 'language'`)

**Sentence-level, no passages.** Grammar, capitalization, punctuation, spelling, parts of speech, sentence types, vocabulary in isolated sentences (synonyms, antonyms, context clues, completion). Each question stands alone.

This subject lives under TEKS §110.4(b)(11)(D) — the conventions strand under composition — plus the vocabulary standards under (b)(3).

**The bright line:** if a question has no passage and tests a grammar/mechanics/spelling/single-sentence-vocabulary skill, it's Language. If it has a passage and tests comprehension of that passage, it's Reading. There is no middle ground; do not author questions that try to be both.

---

## 3. RIT band calibration — what each band means for a Grade 2 student

The four main bands map to where a Grade 2 student is across the school year. These are the calibration anchors. **Don't write questions targeting `below_161` or `above_210`** — those bands are for outliers and the existing schema accepts them but the test composer doesn't pull from them by default.

| Band | Maps to | What questions in this band feel like |
|---|---|---|
| `171_180` | Below grade level (early-year struggling student, or end-of-Grade-1 review) | Single-step. Numbers ≤20 in math. Passages 80–100 words at Lexile 440–480. Direct-recall reading questions ("Where does this story take place?"). |
| `181_190` | Early on-grade (typical fall-of-Grade-2) | Two-digit numbers without regrouping in math, or with friendly regrouping. Passages 100–130 words, Lexile 480–540. Sentence-level grammar with one rule applied. |
| `191_200` | Mid on-grade (typical winter/spring of Grade 2) | Two-digit with regrouping, three-digit place value, fractions of a whole, basic word problems. Passages 130–160 words, Lexile 540–600. Inference questions. Multi-step grammar. |
| `201_210` | Stretch (advanced Grade 2 / early Grade 3) | Three-digit operations, word problems with extraneous info, multi-step. Passages up to 160 words at Lexile 580–620. Author's purpose, theme, figurative language. Compound sentences. |

**Distribution target for any new batch:** roughly `1 : 3 : 3 : 1.5` across the four bands. Slightly heavier in the middle two. Match what's already in the bank — the math seed is at `13 / 29 / 29 / 14`, which is the right shape.

**Hard rule:** stretch questions (`201_210`) are pulled by the test composer only when the student is performing at `191_200` or above. They are *bonus*, not default. Don't over-seed them.

---

## 4. Authoring rules that apply to every question, every subject

These are the rules that make our bank look like one consistent author wrote it. They apply uniformly.

### 4.1 Stem

- Maximum 25 words. Most should be 12–18.
- Second-grade reading level for the stem itself, even when the *content* tests a higher concept. A 7-year-old should be able to read the question without help.
- No double negatives. No "all of the following EXCEPT" constructions. If you need to negate, use ONE clear negation in caps: "Which sentence is **NOT** in past tense?" not "Which of the following is not most likely to be considered as not in past tense?"
- If the question depends on a figure, the stem should reference it explicitly: "Look at the bar graph. How many students chose pizza?" not "How many students chose pizza?" alone.

### 4.2 Choices

- Exactly four choices labeled A, B, C, D with `sort_order` 1, 2, 3, 4.
- Exactly one is correct.
- All four should be plausible at first glance to a child who doesn't fully understand the concept. A choice no one would ever pick is wasted.
- Choices should be roughly the same length. A correct answer that's noticeably longer or shorter than the distractors is a tell — kids learn to pick "the long one."
- The correct answer is randomly distributed across A/B/C/D positions. Don't bias toward C.

### 4.3 The misconception field — the single most important authoring rule

**Every distractor's `misconception` field describes the specific Grade 2 thinking error that would lead a child to pick it.** Not "wrong answer." Not "incorrect." A real, named, specific error.

This field is the foundation of the Mastery Tracker feature — every misconception ties to a `misconception_tag` that drives the diagnostic system. Lazy distractors break the system.

| Bad misconception | Good misconception |
|---|---|
| "Wrong answer." | "Counted the marks instead of the spaces between them." |
| "Did not read carefully." | "Used 'most' to compare only two things." |
| "Picked the wrong one." | "Confused the gas trees take in (carbon dioxide) with the gas they give back (oxygen)." |
| "This is not correct." | "Picked the cause of the sentence instead of the effect." |

Test: read the misconception aloud. Could you imagine saying it to your son to explain *why* he picked that answer? If yes, it's good. If you'd just sigh, rewrite it.

The correct choice has `misconception = NULL`. Always.

### 4.4 Explanation field

- Teaches the *method*, not just the answer.
- 1–3 sentences typically.
- Names the rule or strategy if there is one ("When a word ends in a consonant + y, change the y to i and add -es.").
- Reading level slightly above the stem — this is what the parent might read with the child after a wrong answer.

### 4.5 Names and contexts

Use this rotation across questions: **Maya, Aarav, Ethan, Priya, Liam, Ava, Zoe, Sofia, Tomás, Kira**.

Avoid: Sarah, John, Bob, Mary, Jane (the textbook clichés).

Cricket contexts are welcome and should appear roughly every 15–20 questions where they fit naturally (sports word problems, story passages). Don't force it.

When a question needs a parent or teacher figure, use generic terms ("Mom," "Dad," "the teacher") not invented full names — keeps the question short and the focus on the skill.

### 4.6 Inline SVG figures (math only, mostly)

When a math question needs a figure, it goes in the `stem_image_svg` column as raw SVG markup. The React app renders it directly with `dangerouslySetInnerHTML`.

**Rules:**
- Use the existing color palette: `#1e3a8a` (navy, lines/text), `#dc2626` (red, arrows/highlights), `#fbbf24`/`#86efac`/`#a5b4fc`/`#fda4af` (fills — yellow/green/purple/pink).
- Use sans-serif for any text inside the SVG. Font size 10–14.
- Set `viewBox` so the figure scales cleanly on phone and Chromebook.
- Stroke widths between 1 and 2.
- No external images, no gradients, no filters, no animations.
- Don't put the answer in the figure. The figure shows the *problem*; the choices below it must do the work.

When a question doesn't need a figure (most word problems, all language questions, most reading questions), leave `stem_image_svg = NULL`. Don't add a decorative figure for atmosphere.

**Target SVG rate:** ~50% of math questions, ~0% of reading and language questions. (Reading passages get figures rarely — only when the passage genuinely depends on one, like a diagram in an informational text.)

---

## 5. Math-specific authoring guide

### 5.1 TEKS coverage

All 37 standards are seeded. As you scale, weight new questions toward STAAR-readiness standards (those with `staar_readiness = true` in `map_standards`). Supporting standards get fewer questions.

The bank should always have **at least 2 questions per standard** at minimum, with STAAR-readiness standards averaging 5–8.

### 5.2 Numbers and operations

- Addition/subtraction within 1,000 is the heart of Grade 2. Lots of these.
- Multiplication: only as repeated addition or arrays at this grade. No multiplication tables. 2.4 doesn't introduce multiplication formally; that's Grade 3.
- Fractions: halves, thirds, fourths, sixths, eighths only. As parts of a whole and beyond one whole (5 fourths, 7 fourths). Never as decimals.
- Money: pennies, nickels, dimes, quarters, dollar bills. No fractional cents.
- Time: to the nearest minute. Word problems involving elapsed time only when the elapsed amount is friendly (hours, half-hours).

### 5.3 Word problems

Use real-world contexts a 7-year-old recognizes: sharing snacks, counting toys, sports scores (cricket runs, baseball innings, soccer goals), classroom situations, family contexts. Avoid contexts that require unfamiliar vocabulary — a word problem about "inventory at the warehouse" is a vocabulary problem dressed as math.

Numbers in word problems should feel real. "Maya has 47 marbles" is fine. "Maya has 1,247 marbles" is silly.

### 5.4 Visual figures

The high-frequency types to support:

- **Number lines** — open (only endpoints labeled), labeled (every mark labeled), or with point markers
- **Base-ten blocks** — for place value
- **Fraction bars/circles** — for fraction recognition and counting beyond one whole
- **Shapes** — 2D and 3D geometry, including composing/decomposing
- **Bar graphs** — vertical or horizontal, with clear y-axis scale
- **Pictographs** — with explicit key
- **Clocks** — analog, hour and minute hands clearly drawn
- **Rulers** — inches or centimeters with tick marks
- **Coins** — pennies/nickels/dimes/quarters in clear arrangements
- **Arrays of dots/objects** — for repeated addition

### 5.5 Difficulty calibration cheat sheet

| Concept | `171_180` | `181_190` | `191_200` | `201_210` |
|---|---|---|---|---|
| Addition | within 20 | 2-digit, no regrouping | 2-digit with regrouping | 3-digit |
| Subtraction | within 20 | 2-digit, no borrowing | 2-digit with borrowing | 3-digit, across zero |
| Place value | tens and ones | hundreds, tens, ones | expanded form, comparing | rounding, between numbers |
| Fractions | halves, fourths of one whole | thirds, sixths | beyond one whole | comparing unlike fractions |
| Word problems | one step, no extra info | one step, friendly numbers | two steps OR extra info | two steps WITH extra info |

---

## 6. Reading-specific authoring guide

### 6.1 Passage authoring

Passages come first, then questions for that passage. Each passage gets 4–5 questions.

**Passage requirements:**
- Length: 80–160 words, calibrated to RIT band (see §3 table).
- Lexile: target the band's range. Use a Lexile estimator if uncertain.
- Original content. Do not copy or closely paraphrase published material. The voice should be ours.
- Title is required.
- Genre is one of: `literary`, `informational`, `poetry`, `drama`.
- Topic field is for the parent dashboard ("animals," "friendship," "perseverance"). One-word.

**Passage subject matter:**
- Age-appropriate. A 7-year-old protagonist or topic.
- Diverse names (see §4.5) and contexts. The bank should reflect a Plano ISD classroom, not a 1950s primer.
- No content involving violence, romantic content, or scary themes. A "scary" story for Grade 2 means a slightly spooky empty room, not anything genuinely frightening.
- Sports references welcome (cricket, soccer, baseball). Family contexts welcome. School contexts welcome.

**Genre balance for any new batch:** roughly 40% literary, 40% informational, 10% poetry, 10% drama. The existing seed has 4/4/1/1 across 10 passages; that's the target.

### 6.2 Question types

Every reading question requires `passage_id`. Question types span:

- **Literal recall** — "What is the first thing the character does?" (low band)
- **Vocabulary in context** — "What does the word ___ mean in this passage?" (any band)
- **Main idea** — "What is this passage mostly about?" (mid band)
- **Inference** — "Why does the character feel this way?" (mid-high band)
- **Author's purpose** — "Why did the author write this?" (high band)
- **Genre features** — "How can you tell this is a poem?" (any band)
- **Character traits** — "Which word best describes the character?" (mid band)
- **Sequence** — "What happens after ___?" (low-mid band)
- **Cause/effect** — "Why did ___ happen?" (mid band)
- **Compare/contrast** — across two parts of the passage (high band)

A good 5-question set hits 4–5 different types from this list. Don't ask 5 main-idea questions about the same passage.

### 6.3 Distractors for reading

Reading distractors are especially prone to being weak because "the wrong choice" is harder to define than in math. The strongest distractors are misreadings the child would actually make:

- **Detail confusion** — picks a detail that's in the passage but doesn't answer the question
- **Plausible inference without evidence** — could be true, but the passage doesn't say
- **Reversal** — picks the opposite of what the passage says
- **Off-topic plausible** — generally true about the world but not this passage

The misconception field for each distractor names which trap it is.

---

## 7. Language-specific authoring guide

### 7.1 TEKS coverage

Standards live under §110.4(b)(11)(D) for conventions and §110.4(b)(3) for vocabulary. Our schema seeds 20 standards using sub-codes like `2.11.D.i` through `2.11.D.xvii` plus three vocabulary standards `2.3.A.lang`, `2.3.B.lang`, `2.3.C.lang`.

The `.lang` suffix on the vocabulary standards distinguishes them from the parallel reading standards (`2.3.A`, `2.3.B`, `2.3.C`). Same TEKS code, different subject context: the language version tests vocabulary in isolated sentences; the reading version tests vocabulary in passages.

### 7.2 Question shapes

Language questions follow a small number of templates. Match them rather than inventing new shapes:

- **"Which sentence has CORRECT [feature]?"** — four sentences, identify the right one
- **"Which sentence has INCORRECT [feature]?"** — four sentences, identify the wrong one
- **"Choose the correct word: '[sentence with blank]'"** — fill-in
- **"What is the correct [form] of [word]?"** — form generation (plurals, contractions, tenses)
- **"Which word is MISSPELLED?"** — four words or four underlined words in a sentence
- **"What punctuation belongs at the end?"** — single sentence
- **"Which word means the SAME as [word]?"** — synonyms
- **"Which word means the OPPOSITE of [word]?"** — antonyms
- **"Use the sentence to figure out what '[word]' means."** — context clues
- **"Which sentence shows [emotion/cause/effect]?"** — comprehension at sentence level

### 7.3 Sentence quality

The example sentences in language questions are themselves a teaching surface. Make them clean:

- Real sentences a Grade 2 child might read or write.
- Use the rotating name list (§4.5).
- Keep sentences short — 8 to 12 words.
- The sentence should test exactly the rule the question targets, not three rules at once. If a sentence has a comma error AND a capitalization error AND a tense error, the question gets confused.

### 7.4 Spelling questions

Spelling deserves special attention because it's where MAP has lots of items and where bad authoring is easy.

- The misspelled word should look plausible. `wintur` is good; `xqzwert` is silly.
- The correct spellings on the other three options should be common words a Grade 2 reader knows.
- Avoid words where adult English speakers also disagree on spelling (gray vs grey, etc.).
- Distractors should encode specific spelling errors: vowel substitution (ranebow), missing letter (suprise), letter swap (frist), wrong ending (familee).

### 7.5 Vocabulary in language

Three sub-types under language vocabulary:

- **Synonyms** (`2.3.A.lang`) — pairs of words with similar meaning. Choices include the synonym plus three plausible misfits (different word relationship, opposite, unrelated).
- **Antonyms** (`2.3.A.lang`) — pairs with opposite meaning. Same distractor pattern.
- **Context clues** (`2.3.B.lang`) — single sentence with one word to figure out from surrounding context. The correct answer is determinable from the sentence alone; the distractors are determinable only by guessing without context.

Words at this grade should be slightly above conversational vocabulary — `hollow`, `eerie`, `gust`, `damp`, `nectar`. Aspirational but reachable.

---

## 8. The seeding workflow

When you (or Claude) author a new batch, follow this workflow exactly. It's the same one that produced the existing 179 questions cleanly.

### 8.1 Plan the batch

Before authoring, decide:

1. **Subject** — math, reading, or language. One subject per batch unless explicitly mixed.
2. **Target standards** — pick 5–10 TEKS codes the batch will cover. Don't try to cover all standards in one batch.
3. **Target size** — 25, 50, or 100 questions typically.
4. **RIT band distribution** — match the `1 : 3 : 3 : 1.5` shape unless filling a specific gap.
5. **For reading: passages first.** Decide on 5–10 passages with genres, topics, and bands; author them; then write 4–5 questions per passage.

### 8.2 Author as JSON

Write each question as a JSON object in a file under `seed/`. The schema:

```json
{
  "teks_code": "2.11.D.i",
  "rit_band": "181_190",
  "difficulty": "medium",
  "stem": "Which sentence has CORRECT subject-verb agreement?",
  "stem_image_svg": null,
  "explanation": "When the subject is plural...",
  "source_note": "Khan Academy: Grammar",
  "choices": [
    {"label": "A", "body": "...", "is_correct": false, "misconception": "..."},
    {"label": "B", "body": "...", "is_correct": true, "misconception": null},
    {"label": "C", "body": "...", "is_correct": false, "misconception": "..."},
    {"label": "D", "body": "...", "is_correct": false, "misconception": "..."}
  ]
}
```

Reading questions also need `passage_id` resolution at insert time (see §8.4).

### 8.3 Validate the JSON

Run a validation pass before generating any SQL:

- Every question has exactly 4 choices.
- Exactly 1 choice has `is_correct: true`.
- Labels are A, B, C, D in order.
- Every wrong choice has a `misconception` of at least 15 characters.
- The correct choice's `misconception` is `null`.
- Every `teks_code` exists in `map_standards` for the relevant subject.
- Every `rit_band` is one of the valid enum values.

If any check fails, fix the JSON and re-run. Don't generate SQL with errors in it.

### 8.4 Generate batched SQL

Group questions into batches of 5–10 and generate one SQL file per batch in `seed/`. Each question is one CTE-based statement that inserts the question and its four choices atomically:

```sql
WITH new_q AS (
  INSERT INTO map_questions (subject, grade, standard_id, rit_band, difficulty, stem, stem_image_svg, explanation, source_note)
  SELECT '<subject>', 2, s.id, '<rit_band>'::map_rit_band, '<difficulty>'::map_difficulty,
         '<stem>', <svg or NULL>, '<explanation>', '<source_note>'
  FROM map_standards s WHERE s.teks_code = '<teks>' AND s.subject = '<subject>'
  RETURNING id
)
INSERT INTO map_question_choices (question_id, label, body, is_correct, misconception, sort_order)
SELECT n.id, v.label, v.body, v.is_correct, v.misconception, v.sort_order
FROM new_q n,
(VALUES
    ('A', '<body>', false, '<misconception>', 1),
    ('B', '<body>', true, NULL, 2),
    ('C', '<body>', false, '<misconception>', 3),
    ('D', '<body>', false, '<misconception>', 4)
) AS v(label, body, is_correct, misconception, sort_order);
```

**For reading questions**, the pattern is different: insert the passage first within a CTE, then insert each of its questions with `passage_id = (SELECT id FROM p)`, then insert all the choices in one final statement. See `passage_0.sql` through `passage_9.sql` in the existing seed for the template.

### 8.5 Apply, then verify

Insert each SQL batch, then run the standard verification:

```sql
-- All questions valid (4 choices, exactly 1 correct)
WITH q_check AS (
  SELECT q.id, q.subject, count(c.id) AS n_c, count(c.id) FILTER (WHERE c.is_correct) AS n_correct
  FROM map_questions q LEFT JOIN map_question_choices c ON c.question_id = q.id
  WHERE q.subject = '<subject>'
  GROUP BY q.id, q.subject
)
SELECT count(*) AS total, count(*) FILTER (WHERE n_c = 4 AND n_correct = 1) AS valid,
       count(*) FILTER (WHERE n_c <> 4 OR n_correct <> 1) AS broken
FROM q_check;

-- Coverage by standard
SELECT s.teks_code, count(q.id) AS questions
FROM map_standards s
LEFT JOIN map_questions q ON q.standard_id = s.id AND q.subject = '<subject>'
WHERE s.subject = '<subject>'
GROUP BY s.teks_code ORDER BY s.sort_order;

-- RIT distribution
SELECT rit_band, count(*) FROM map_questions WHERE subject = '<subject>'
GROUP BY rit_band ORDER BY rit_band;
```

`broken` must be 0. If it's not, find the offending row and fix it before declaring done.

### 8.6 Tag distractor misconceptions

If you authored questions with new misconception patterns that don't fit existing tags in `map_misconception_tags`, propose new tags **before** running the backfill UPDATE. See `MASTERY_TRACKER_BRIEF.md` §3.

If your distractors map cleanly to existing tags, run the tagging UPDATE in the same session. Don't ship questions with `misconception_tag IS NULL` — that's how the Mastery Tracker silently undercounts.

---

## 9. What NOT to do

These are things I've seen go wrong in past sessions or that the existing bank has fixed:

- **Don't copy questions from TestingMom or any other commercial source.** Use them as references for shape and difficulty. Author original content. Several TestingMom items have typos and weak distractors anyway — copying inherits their bugs.
- **Don't write a question that requires a figure as a text-only question.** "An analog clock shows the hour hand between 3 and 4..." is not a clock question, it's a reading-comprehension-of-clock-descriptions question. If the standard is "tell time on an analog clock," the question must include the SVG.
- **Don't seed the same stem twice with different choices.** That breaks the random-pull test composer.
- **Don't use TEKS codes that don't exist in `map_standards`.** Always run the SELECT against `map_standards` first to confirm the code matches exactly (including dots: `2.8.A` not `2.8A` for reading).
- **Don't author reading questions without a passage.** The CHECK constraint will reject them and you'll wonder why. They belong in `language` if they're sentence-level.
- **Don't pad with `_misc_other` distractors.** Every distractor must be a real misconception. If you can't name the error, you haven't designed the distractor yet.
- **Don't expand scope without permission.** If the user asks for 50 math questions and you discover 90 distractors that need tagging, surface that as a decision, don't fold it in silently.

---

## 10. Quick reference card

When you're authoring, keep this in front of you:

```
EVERY question:
  ✓ stem ≤25 words, Grade-2 reading level
  ✓ exactly 4 choices A/B/C/D
  ✓ exactly 1 correct
  ✓ every distractor has named misconception (≥15 chars)
  ✓ explanation teaches the method
  ✓ rotating names: Maya, Aarav, Ethan, Priya, Liam, Ava, Zoe, Sofia, Tomás, Kira
  ✓ tagged to a real TEKS code in map_standards
  ✓ rit_band targets 171–210 (one of 4 bands)

MATH:
  ~50% have inline SVG (palette: navy/red/yellow/green/purple/pink)
  Numbers and contexts age-appropriate
  Word problems use familiar settings

READING:
  Passages FIRST, questions reference passage_id
  4–5 questions per passage, varied types
  80–160 words, Lexile 440–620
  Genre mix: 40% literary / 40% informational / 10% poetry / 10% drama

LANGUAGE:
  Sentence-level only, no passages
  Templates from §7.2 — don't invent new shapes
  Spelling distractors encode specific error patterns
  Example sentences clean and short

BATCH workflow:
  Plan → JSON → Validate → SQL → Apply → Verify → Tag misconceptions
```

---

## 11. When this guide should change

Update this document when:

- You move to Grade 3 (write a parallel `SEEDING_GUIDE_GRADE3.md`)
- A new TEKS standard gets added to the schema
- The taxonomy grows enough that the misconception authoring section needs more detail
- You discover a question pattern that recurs and deserves a template
- The RIT calibration table feels off after observing real practice data

Don't update it casually. The whole point of the guide is to keep the bank consistent across many seeding sessions over months.
