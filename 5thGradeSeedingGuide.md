# Grade 5 Seeding Brief — MAP Practice Test App

> Hand this entire document to Claude Code in the MAP practice app repo. It is a complete spec for extending the backend to Grade 5 across all three subjects: math, reading, and language. Read it end-to-end before starting. Read `CLAUDE.md` (especially §3 schema, §9 Grade 3 expansion) and `Grade3_Seeding_Brief.md` first — Grade 5 reuses the Grade 3 patterns, with notable additions called out in §6 and §9. Append the relevant parts to `CLAUDE.md` as a new §11 when done.

---

## 0. Preflight reading

Before opening a file or running a query:

1. Read `CLAUDE.md` end to end. §3 (schema), §4 (authoring rules), §9 (Grade 3) are the prior art. The patterns repeat.
2. Skim `Grade3_Seeding_Brief.md` to remind yourself how a grade rolls out: TEKS seed → coverage script → author prompt script → batch authoring → migration → coverage check.
3. Skim the latest `scripts/grade3-coverage.mjs` and `scripts/grade3-author-prompt.mjs`. Grade 5 will get parallel scripts (`scripts/grade5-coverage.mjs`, `scripts/grade5-author-prompt.mjs`) that share most of their plumbing.
4. Read the included reference doc `5th_Grade_Math_Units.docx`. That's the Plano-ISD-shaped curriculum breakdown; use it as the mental scaffolding when you map units → TEKS codes → Khan Academy units in the seed.

**Don't start authoring questions in the same session that does the schema and TEKS seed work.** Schema/seed is one PR. Bank authoring is iterative and lives behind a coverage script. Conflating the two slows down both.

---

## 1. Scope and outcomes

This brief delivers the foundation needed to author Grade 5 questions across math, reading, and language. It does **not** deliver the bank itself — that's iterative authoring against the coverage script, same as Grade 3.

In scope:

- Schema extension to support Grade 5 RIT bands (the existing `above_210` is too coarse; see §2).
- A complete TEKS seed for Grade 5: math (TAC §111.7), reading (TAC §110.7), and language (the editing/composition strands of §110.7).
- RIT band targets and bank-composition weights specific to Grade 5.
- An author-prompt script keyed to Grade 5's expectations (longer stems, harder vocabulary, two-step problems are the norm not the exception).
- The set of Grade-5-specific misconception tags that don't already exist in the taxonomy.
- A coverage script that tells the human (or AI) what to author next.

Out of scope (deliberately, even if tempting):

- Authoring the actual Grade 5 questions — that's its own iterative loop, not a single PR.
- Grade 4. If the bank skips from 3 to 5, that's a product decision the human owner has already made; don't backfill Grade 4 as part of this brief.
- STAAR-specific item shapes (multi-select, open-response). Phase 4. The existing 4-choice MCQ shape covers Grade 5 MAP modeling adequately for now.
- Subdividing reading into separate "Vocabulary" and "Comprehension" subjects. NWEA tests them as one. Don't split.

Presumes:

- Phase 2 mastery tracker is live (the misconception taxonomy table exists; new tags get added to it, not invented at question-author time).
- Phase 3 MCP server is live or arriving (Grade 5 content will be readable through the same tools as Grade 2/3).
- Grade 3 is in progress or shipped. If it isn't, that's fine — Grade 5 doesn't depend on Grade 3 being complete; both can author in parallel against their own coverage scripts.

---

## 2. Schema preflight — RIT band extension (CRITICAL, do this first)

The existing `map_rit_band` enum tops out at `above_210`:

```
below_161 | 161_170 | 171_180 | 181_190 | 191_200 | 201_210 | above_210
```

This was fine for K–3. It is **not** fine for Grade 5. Per the 2020 NWEA norms, Grade 5 students score around 200 in the fall, ~205 in winter, ~213 in spring; above-grade-level Grade 5 students routinely sit in the 220s. Putting all of that into a single `above_210` band collapses the entire on-grade-level and stretch range for Grade 5 into one bucket. The adaptive composer (§5.2 of `CLAUDE.md`) cannot step the band up from there because the band is already at the ceiling. Mastery scoring, which excludes "stretch" attempts (questions in a band above the student's current band), would mark almost every Grade 5 question as stretch and refuse to attribute it to mastery.

**Apply this migration before anything else.** Migration name: `map_grade5_rit_bands`.

```sql
-- Add Grade-5-and-up bands. The enum extension is non-destructive; existing
-- rows that use 'above_210' remain valid.
ALTER TYPE map_rit_band ADD VALUE IF NOT EXISTS '211_220' AFTER '201_210';
ALTER TYPE map_rit_band ADD VALUE IF NOT EXISTS '221_230' AFTER '211_220';
ALTER TYPE map_rit_band ADD VALUE IF NOT EXISTS '231_240' AFTER '221_230';
-- Keep 'above_210' as the catchall ceiling for now; deprecate later by
-- migrating any rows still using it to '211_220' once we're confident
-- nothing in the Grade 2/3 banks slipped above grade level.
```

After applying:

1. Update `src/lib/adaptive/bands.ts` — extend the band order array and the centroid map (centroids: `211_220 = 215`, `221_230 = 225`, `231_240 = 235`) so `decideBand`, `clampBand`, `bandIndex` all see the new values.
2. Update the RIT estimator (§5.3 of `CLAUDE.md`) to know the new centroids.
3. Run the existing adaptive simulator: `node scripts/test-adaptive-simulator.mjs 100`. It must pass 100/100. If it doesn't, the band-arithmetic helpers weren't fully updated.
4. Re-derive `map_v_student_current_band` if it hard-codes the band list (it does — see the CTE in `MASTERY_TRACKER_BRIEF.md` §2.4). Add the new bands to the `bands_ord` CTE.

**Do not author a single Grade 5 question against a schema that still treats `above_210` as the ceiling.** You will produce a bank where every question is "stretch" and the adaptive composer can't pick it.

---

## 3. TEKS standards seeding

Grade 5 splits across three subjects in our schema even though TEA classifies it as two (math and ELAR). The split between reading and language inside ELAR follows the same convention as Grade 3 (§9.1 of `CLAUDE.md`): NWEA tests language usage separately from reading starting Grade 3, and we honor that separation in our subject enum because the kid-facing test experience is genuinely different (editing sentences vs. reading passages).

Migration name: `map_grade5_standards_seed`. Single transaction, idempotent on `(teks_code, subject)`.

### 3.1 Math — §111.7

Grade 5 math has 10 knowledge-and-skills clusters in TAC §111.7(b), with sub-letters under each. The relevant clusters and the breadth of sub-letters:

| Cluster | Title | Sub-letters that get a `map_standards` row |
|---|---|---|
| 5.2 | Number and operations — place value | A, B, C |
| 5.3 | Number and operations — computation | A, B, C, D, E, F, G, H, I, J, K, L |
| 5.4 | Algebraic reasoning | A, B, C, D, E, F, G, H |
| 5.5 | Geometry — classify 2D figures | A |
| 5.6 | Geometry — volume | A, B |
| 5.7 | Geometry & measurement — conversions | A |
| 5.8 | Geometry — coordinate plane | A, B, C |
| 5.9 | Data analysis | A, B, C |
| 5.10 | Personal financial literacy | A, B, C, D, E, F |

Cluster 5.1 is "mathematical process standards" — applies to everything, not a question target. Don't seed it.

That's roughly **39 math standard rows** (count again from the actual TAC text; sub-letters drift slightly between revisions). Crosswalk each to a Khan Academy unit using the breakdown in `5th_Grade_Math_Units.docx`. The provided doc is Plano-shaped, which is what we want, but you'll have to translate its unit titles ("Unit: Multiplying Decimals → Multiplying Decimals & Whole Numbers") into the Khan Academy URL paths under `https://www.khanacademy.org/math/cc-fifth-grade-math/`.

A worked example for one row, so you have the shape:

```sql
INSERT INTO map_standards (subject, grade, teks_code, teks_title, teks_description, khan_unit_ref, sort_order)
VALUES (
  'math', 5, '5.3K',
  'Add and subtract positive rational numbers fluently',
  'Add and subtract positive rational numbers fluently. Includes fractions with unlike denominators, mixed numbers, and decimals.',
  'cc-fifth-grade-math/cc-5th-add-sub-fractions',
  315
);
```

Pick `sort_order` so math 5.x rows sort after Grade 4 (if seeded) and before any Grade 6 rows. The convention in the existing seeds is `grade * 100 + cluster_number * 10 + sub_letter_index` — keep that.

**Plano-vs-TEKS gap: factors and multiples.** The reference doc `5th_Grade_Math_Units.docx` lists factor pairs, identifying factors, identifying multiples, and the relationship between factors and multiples as Grade 5 content. **TEKS Grade 5 doesn't include this as a standalone standard** — it's TEKS 4.4(D) at Grade 4, and Grade 5 only revisits the concept obliquely through 5.4(A) (prime vs composite). To honor the Plano scope without inventing a fake TEKS code, seed a synthetic non-TEKS standard:

```sql
INSERT INTO map_standards (subject, grade, teks_code, teks_title, teks_description, khan_unit_ref, sort_order, is_synthetic)
VALUES (
  'math', 5, '5.review.factors',
  'Factors and multiples (review from Grade 4)',
  'Identify factor pairs, list factors of a number, identify multiples, and recognize the relationship between factors and multiples. Reviewed in Grade 5 as a foundation for prime/composite work in 5.4(A) and for fraction equivalence work.',
  'cc-fifth-grade-math/cc-5th-factors-multiples',
  541,
  true
);
```

Add an `is_synthetic boolean NOT NULL DEFAULT false` column to `map_standards` if it doesn't already exist. The column is a flag, not a behavior change — the test composer treats synthetic and TEKS-derived standards identically. The flag exists so the parent dashboard's TEKS heatmap can label these correctly ("Review skill, not on STAAR Grade 5") and so the coverage script can break them out separately. The `5.review.` prefix on the code is the convention for any future review-skill standards.

### 3.2 Reading — §110.7 (the strands that produce comprehension questions)

ELAR §110.7 has seven strands. Three of them produce reading questions in our schema; the rest produce language questions or are not testable in MCQ form. The breakdown:

| TEKS knowledge & skill | Subject in our DB | Why |
|---|---|---|
| §110.7(b)(4) — self-sustained reading; (5) — response | reading (genre & text response) | Inference, summary, theme |
| §110.7(b)(6) — comprehension skills | reading | Main idea, prediction, monitoring |
| §110.7(b)(7) — response skills (non-overlapping with 5) | reading | Connections, text evidence |
| §110.7(b)(8) — multiple genres (literary) | reading | Plot, character, setting, theme, figurative language |
| §110.7(b)(9) — multiple genres (informational/argumentative) | reading | Text features, author's claim, organizational patterns |
| §110.7(b)(10) — author's purpose & craft | reading | Purpose, audience, voice |
| §110.7(b)(2) — vocabulary | reading | Vocabulary in context, affixes, Greek/Latin roots |
| §110.7(b)(11) — composition: writing process | language | Drafting, revising — pattern A/B/C edit items |
| §110.7(b)(12) — composition: genres | language | Generally not MCQ-testable; seed but expect low coverage |
| §110.7(b)(11)(D) — editing for grammar/punctuation/spelling | language | The bulk of language items |
| §110.7(b)(13) — inquiry & research | language (light) | Citing sources, paraphrasing — small subject-area |

Roughly **22 reading standard rows** (from §2 vocabulary, plus all of §6, §7, §8, §9, §10).

Each row's `teks_code` follows TEA's dot-letter convention: `5.6.G`, `5.8.D`, `5.10.A`. **Do not invent codes** — verify each against the official PDF at `https://tea.texas.gov/academics/curriculum-standards/teks/grade5-teks-062024-0.pdf` or the current TAC text. The dot-and-letter form (`5.6.G`) is canonical; the run-together form (`5.6G`) is a compaction we use in older Grade 2/3 rows. Pick whichever the existing seeds use and stay consistent.

### 3.3 Language — the editing strands of §110.7(b)(11)

Roughly **14 language standard rows**, mostly from §110.7(b)(11)(D) sub-letters covering:

- Subject-verb agreement (i, ii)
- Pronouns: subject vs object case, antecedent agreement, reflexive pronouns
- Verb tenses: simple, progressive, perfect; consistency within a passage
- Conjunctions: coordinating, subordinating, correlative
- Prepositional phrases as modifiers
- Adverbs: comparative and superlative
- Punctuation: commas in compound and complex sentences, dialogue, quotation marks
- Capitalization: proper nouns, titles, abbreviations
- Spelling: commonly confused words, suffixes, syllabication
- Sentence types: simple, compound, complex; fragments; run-ons

Plus a few from §110.7(b)(11)(C) (revising):

- Combining sentences for clarity (Pattern C)
- Adding transitions
- Replacing vague words with precise ones

Don't seed §110.7(b)(11)(B) (drafting) — it's writing-process, not testable in MCQ form.

### 3.4 Validation after seeding

```sql
-- Expect ~75 rows total across all three subjects
SELECT subject, count(*) FROM map_standards WHERE grade = 5 GROUP BY subject;

-- No null required fields, no duplicates
SELECT teks_code, count(*) FROM map_standards
WHERE grade = 5 GROUP BY teks_code HAVING count(*) > 1;

-- Khan unit references all populated
SELECT count(*) FROM map_standards WHERE grade = 5 AND khan_unit_ref IS NULL;
-- Expect 0
```

---

## 4. RIT band targets for Grade 5

NWEA 2020 norms put Grade 5 students at:

- Fall: ~200 (median)
- Winter: ~205–207
- Spring: ~211–213

Above-grade-level Grade 5 students sit at 220–230. Below-grade-level at 185–195.

Bank composition weights (the share of questions per cell `(standard, band)`):

| Subject  | 191_200 | 201_210 | 211_220 | 221_230 | above_210/231_240 stretch |
|----------|---------|---------|---------|---------|---------------------------|
| Math     | 10%     | 30%     | 35%     | 15%     | 10%                       |
| Reading  | 10%     | 25%     | 35%     | 20%     | 10%                       |
| Language | 12%     | 30%     | 33%     | 15%     | 10%                       |

These are bank-composition weights, not session weights. The adaptive composer at runtime chooses bands based on the student's `start_band` and rolling accuracy — see §5.2 of `CLAUDE.md`. The bank just needs to *have* enough questions across each band so the picker has options.

Stretch (`221_230` and above) earns its keep: a Grade 5 student who's actually at 215 in spring will see questions step up, and we want to have something to give them. Below `191_200` is rare for Grade 5 and isn't worth banking heavily — if a Grade 5 student is consistently below 200, they need scaffolding, not a flood of below-grade-level practice questions, and the boost mechanism (§6 of `MASTERY_TRACKER_BRIEF.md`) plus the Grade 4 bank (when it exists) are the right answer.

---

## 5. Names pool for Grade 5

Allowed names: the Grade 2 set (Maya, Ethan, Priya, Liam, Ava, Aarav, Zoe), the Grade 3 additions (Noor, Diego, Mei, Caleb), plus **Grade 5 additions: Jamal, Selena, Hiroshi, Imani, Theo, Sofia, Ravi**. Same diversity goals: roughly equal gender split, multiple cultural backgrounds, names that read naturally to a 5th grader without being so unusual the kid trips on them.

Don't introduce family-relationship-heavy contexts that don't fit a 10-year-old's life ("Maya is meeting her colleagues for happy hour"). Stick to school, home, sports, hobbies, family weekends, neighborhood, simple jobs (paper route, pet sitting, lemonade stand) — and treat the kid in the question as someone with agency, not a passive recipient of an adult's plan.

Texas-appropriate cultural references continue: cricket, Diwali, Eid, Lunar New Year, soccer (called soccer, not football), high school football references are fine, college football is fine, NBA/NFL are fine, NASCAR is recognizable in Texas. **Do not use** referenced cultural artifacts that change quickly (specific viral videos, current TikTok creators, current pop songs) — questions should age well.

---

## 6. What changes from Grade 3 to Grade 5

The biggest shifts to be aware of when authoring:

- **Stems get longer.** Cap rises to ≤ **45 words** (Grade 3 was 35; Grade 2 was 25). Two-step problems become standard, not the exception — author them deliberately, with both numbers clearly in the stem and the structure visible to a kid reading carefully. No "she lost some" with the count buried in a footnote.
- **Reading passages get substantially longer.** Target 280–420 words for literary, 240–380 for informational. STAAR Grade 5 passes routinely run 400+ words; we shouldn't shrink ours below that or the bank will calibrate too easy.
- **Math curriculum branches.** From the Plano units doc: decimals (place value, all four operations, estimation), fractions with unlike denominators, fraction × whole number AND unit fraction ÷ whole number AND whole number ÷ unit fraction, volume of rectangular prisms (with unit cubes AND with the formula), coordinate plane (first quadrant only — ordered pairs, plotting), order of operations, numerical patterns, measurement conversions (both metric and US customary), personal financial literacy (taxes, income, payment methods). Plan SVG patterns for: fraction bars, fraction number lines, decimal grids (10×10 hundredths grids), unit-cube prisms (isometric drawings), coordinate planes with gridlines, and bar/dot/stem-leaf plots.
- **Tier-2 academic vocabulary expands sharply.** "Inferred", "summarize", "perspective", "evidence", "convey", "concise", "symbolic", "rural", "urban", "sediment", "erode", "accomplish" are all fair game. Tier-3 (domain-specific) is still off-limits — "photosynthesis" belongs in science class, not in a reading question stem unless the passage just defined it.
- **Reading items reach for inference and author's craft.** A Grade 5 reading question is more likely to ask "Why did the author include this paragraph?" than "What did Jamal do at the park?" Build the bank with that proportion: **at most 30% literal recall, at least 40% inference/purpose/craft, the rest vocabulary and text-evidence.**
- **Language Pattern D — paragraph editing.** New for Grade 5 (see §9). A short editing-draft passage with 4–6 numbered sentences, multiple errors, and 3–5 questions about specific edits. This is the dominant STAAR-Grade-5 language item shape and it must be in the bank.
- **Distractors get more sophisticated.** A Grade 5 distractor that says "an obviously wrong answer" is wasted ink. Every distractor should be a *plausible* misconception path — the kind of mistake a kid who knew most of the material but missed one step would make. The bar is higher; the misconception tagging discipline matters more, not less.
- **Misconception tagging is a hard rule.** Same rule as Grade 3 (§9.5 of `CLAUDE.md`): every distractor needs both a free-text `misconception` and a snake_case `misconception_tag` from the taxonomy. Author with the tag, not without and tagged later. The mastery tracker depends on it.
- **Tighter on bias and culture.** A Grade 5 reader will notice things a 2nd grader won't. Avoid passages that lean on stereotypes (boys play sports, girls cook), passages that frame poverty as a moral failing, passages that romanticize colonization, passages that treat any single religion as the default. The reading bank is going to be read carefully by both kids and parents. Hold the bar.

---

## 7. Math content patterns

The `5th_Grade_Math_Units.docx` reference document is the curriculum spine. Map each unit to one or more TEKS codes seeded in §3.1, then plan the SVG patterns up front so the bank is visually consistent.

### 7.1 SVG patterns to standardize

Author one canonical SVG style per pattern and reuse it. Inconsistent SVGs across questions distract the kid.

- **Fraction bar.** Horizontal rectangle, divided into equal parts, shaded portions in solid neutral color, unshaded in white with thin stroke. Always show the fraction below.
- **Fraction number line.** Horizontal axis with tick marks at unit fraction intervals; the relevant fraction shown with a labeled dot or arrow. Endpoints labeled (`0` and `1`, or `0` and `2`).
- **Fraction multiplication on a number line.** A variant of the fraction number line used to show `n × (1/d)` as repeated jumps from 0. Each jump is an arc above the line; jumps are numbered. This is a different visual from placement and should not be conflated — the standard 5.3(I) explicitly calls out "multiply on the number line" as its own sub-skill.
- **Decimal grid (hundredths).** 10×10 grid of small squares; shaded cells = the decimal value. Always show the decimal below.
- **Decimal grid as an operation model.** Same 10×10 grid but used to model addition or subtraction of decimals visually — shaded region for the first addend, hatched or differently-shaded region for the second, with a caption like "0.32 + 0.41". Used for 5.3(K) "add and subtract decimals visually" items, distinct from the place-value use above.
- **Area model for multiplication.** Rectangle subdivided into a 2×2 (or larger) grid of sub-rectangles, each labeled with a partial product. Used for: decimal × whole number, decimal × decimal (5.3(D), 5.3(E)), and 3-digit × 2-digit whole-number multiplication. The widths of the sub-rectangles should reflect place-value decomposition — `47 × 23` decomposes as a `(40 + 7) × (20 + 3)` grid where the 40-wide column is visibly larger than the 7-wide column. Don't draw it to scale at the cost of legibility, but don't draw it as a uniform 2×2 grid either; the visual decomposition is the point.
- **Place-value chart.** Columns labeled (Hundreds, Tens, Ones, Tenths, Hundredths, Thousandths) with digits placed in cells. Use thin gridlines, not heavy borders.
- **Rectangular prism (unit cubes).** Isometric projection. Visible cubes shaded slightly differently from hidden ones. Annotate dimensions with simple numerals beside each axis.
- **Rectangular prism (formula form).** Same isometric projection but without unit cubes — just the box with edge labels.
- **Coordinate plane (Q1 only).** First quadrant only, gridlines at unit intervals, axis labels, origin labeled `(0, 0)`. Plotted points as filled small dots with `(x, y)` labels nearby.
- **Bar / dot / stem-leaf plots.** Match standard textbook conventions; always include axis labels and a title.

When the figure isn't standardizable (a word problem with a real-world picture), prefer **no figure**. Don't reach for a figure if the prose carries the question. SVG noise is worse than no SVG.

### 7.2 Two-step problem authoring

Roughly 30% of math questions should be two-step. Both numbers must appear in the stem. The structure should be transparent to a kid reading slowly:

> *"Sofia bought 3 packs of markers. Each pack has 12 markers. She gave 8 markers to her brother. How many markers does Sofia have left?"*

Not:

> *"Sofia bought some markers and gave a few to her brother, ending with 28. How many did she start with?"* (the second number is implicit; structure isn't transparent)

### 7.3 Estimation questions

Cluster 5.3(A) explicitly requires estimation. Author estimation items as their own questions, not as "is this answer reasonable?" tacked onto a computation. Distractors for estimation items should include: the exact answer (kid did the work instead of rounding), an under-estimate by one place (rounded too aggressively), and a wildly-off answer (place-value confusion).

### 7.4 Personal financial literacy (cluster 5.10)

This cluster is required by TEKS and tested by STAAR but rarely covered well by practice banks. Author 8–12 questions per sub-letter (so ~50 questions across the cluster). Pitch the level appropriately — a 10-year-old can reason about "spent more than earned" but doesn't need to compute compound interest. Themes:

- Income (allowance, jobs kids can do, gifts)
- Payment methods (cash, debit card, check, credit card — what each is, when each is appropriate; not which is "best")
- Budgeting (categorizing income vs expense; balancing when expenses exceed income)
- Financial records (reading a simple ledger or check register)
- Taxes (the existence of sales tax; computing simple percentages on a purchase)

Avoid loaded framings ("rich vs poor," "frugal vs wasteful"). Treat money as a topic, not a moral.

---

## 8. Reading passage shapes for Grade 5

Author passages **before** their questions, same as Grade 2/3. Each passage:

- **Length:** 280–420 words for literary, 240–380 for informational, 60–180 for poetry, 180–300 for drama scenes.
- **Genre coverage:** 35% literary, 35% informational, 10% argumentative (new for Grade 5 — letters to the editor, simple persuasive essays), 10% poetry, 10% drama. Argumentative is the strand most parents and most STAAR practice books underweight; intentionally over-author it relative to its STAAR weight to fill the gap.
- **Lexile target:** 700L–950L, with most at 800L–900L. Don't overshoot — a 1000L passage in a Grade 5 bank is a poor calibration even if the content is intrinsically interesting.
- **Questions per passage:** 4–8 covering: main idea, summary, inference, vocabulary in context, author's purpose, text structure, character development (literary), evidence-based claim (informational/argumentative), figurative language (literary, especially poetry).
- **Paired passages.** A small fraction (10–15% of reading sessions worth) should be paired: two short passages on the same topic from different perspectives, with one or two questions that compare them. This is in scope for Grade 5 even though it adds schema complexity. **Mechanism:** add a nullable `pair_id` column to `map_reading_passages` (UUID, references the same table) so two passages can be linked. Questions on a paired set still belong to one passage at a time; the `pair_id` is metadata that the test runner uses to render both passages at the top of the question.

```sql
ALTER TABLE map_reading_passages
  ADD COLUMN IF NOT EXISTS pair_id uuid REFERENCES map_reading_passages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_map_passages_pair_id ON map_reading_passages(pair_id) WHERE pair_id IS NOT NULL;
```

Two paired passages reference each other (or both reference one of them — pick one convention; recommend "lower-id passage in the pair points to itself, higher-id passage points to the lower"). Don't ship paired-passage authoring until the runner can render two passages stacked above the question; that's a small UI extension but plan it for the same PR.

### 8.1 Topics to lean into (and away from)

**Lean into:** science (animals, weather, ecosystems, simple physics), history (US, Texas, world — but avoid specific contested topics), geography, biographies of notable but non-controversial figures (Marie Curie, Roberto Clemente, Wangari Maathai), how-things-work (bridges, music instruments, cooking science, sports rules), and well-loved literary patterns (friendship stories, problem-and-solution arcs, immigrant family stories, sibling dynamics).

**Lean away from:** anything involving graphic violence (war passages should be biographical and reflective, not action), death of children or pets (complicated emotional material — appropriate sometimes, but a low fraction of the bank), politically polarizing current events, religious doctrine of any tradition (cultural references to holidays are fine; doctrinal claims are not), and anything that could read as an in-group/out-group endorsement.

### 8.2 Vocabulary in context — a careful pattern

Vocabulary-in-context items are heavily represented in STAAR Grade 5 reading. They have a specific shape that must be authored deliberately:

- The target word appears once in the passage, in a sentence that gives clear context.
- The question stem reads: *"In paragraph 3, the word **convey** most nearly means—"*
- The four choices are all real meanings of the word, only one of which fits the passage context.
- Distractors model: a different real meaning of the word (most common pattern), a similar-looking word (`convey` vs `convoy`), an antonym, a unrelated word.

The misconception tags `vocab_similar_word`, `vocab_unrelated`, `vocab_wrong_sense_of_polysemous_word`, `vocab_antonym` (new for Grade 5; see §10) are the ones to use here.

---

## 9. Language patterns for Grade 5

Grade 5 uses the three language patterns from Grade 3 (A: edit_pick, B: mcq cloze, C: sentence_combine) and adds a fourth.

### 9.1 Pattern D — paragraph editing (new for Grade 5)

The dominant STAAR-Grade-5 language item shape. A short passage of 4–6 numbered sentences, each potentially containing an error, attached to 3–5 questions that target specific sentences.

The passage *is* the workspace; it lives in `map_reading_passages` (subject = `'language'`, genre = `'editing_draft'`) so it can be referenced by multiple questions. Each language question that targets a specific sentence sets the new optional column `target_sentence_number int` on `map_questions` (see migration below).

```sql
ALTER TABLE map_questions
  ADD COLUMN IF NOT EXISTS target_sentence_number int CHECK (target_sentence_number IS NULL OR target_sentence_number BETWEEN 1 AND 20);
```

Example passage body (verbatim shape):

> (1) My family and I went to Big Bend National Park last summer. (2) The park is in west texas and it covers more than 800,000 acres. (3) We saw mountains, deserts, and rivers all in one place. (4) My favorite part was when me and my sister hiked the lost mine trail. (5) The view from the top were amazing. (6) I want to go back next year.

A Pattern D question stem then reads: *"What change should be made to sentence 2?"* with the four choices each being a corrected (or pseudo-corrected) version of sentence 2. Distractor errors target specific tags — `capitalization_proper_noun` (texas → Texas), `comma_compound_sentence`, `homophone_letter_swap`, etc.

`target_sentence_number` is null for Pattern A/B/C questions and for any non-sentence-specific Pattern D question.

### 9.2 Stem-length exemption

Patterns A, C, and D are exempt from the 45-word stem cap, because the stem *is* the workspace. Don't try to compress them. Pattern B (cloze) stays under 45 words.

### 9.3 Authoring a Pattern D set

A Pattern D set is one passage + 3–5 questions about it. Author the passage first with **specific** errors at **specific** sentences — keep an internal note of which sentence has which error. Then build each question around one targeted error or one revision opportunity.

A Pattern D set should mix sentence-targeted edit questions ("What change should be made to sentence 4?") with a couple of revision questions ("Where should the writer add the sentence 'The next morning, we packed our bags'?"). The mix matches STAAR.

**Don't** author six errors into a six-sentence passage. Real STAAR passages have 2–4 errors across 5–6 sentences plus at least one sentence that's already correct (so kids can't game the test by assuming every sentence needs fixing). Mirror that.

---

## 10. Misconception tag additions

The Grade 3 brief (§9.5 of `CLAUDE.md`) lists the existing tags. Grade 5 needs additions. **Reuse before inventing** — if a Grade 3 tag fits, use it. Add to the taxonomy table (`map_misconception_tags`) before authoring any Grade 5 questions that would use a new tag.

Migration name: `map_grade5_misconception_tags`. The shape follows §3.1 of `MASTERY_TRACKER_BRIEF.md`.

### 10.1 New math tags (Grade 5)

- `decimal_place_value_misread` — student treated 0.04 as 0.4 or 4.
- `decimal_align_decimal_point` — added/subtracted decimals by right-aligning digits instead of aligning decimal points.
- `decimal_count_zeros_in_product` — multiplied decimals correctly but placed the decimal point by counting zeros instead of decimal places.
- `decimal_division_shifted_wrong_direction` — when dividing by 0.1, multiplied by 0.1 instead of by 10.
- `fraction_unlike_denominator_added_directly` — added fractions with unlike denominators by adding numerators and denominators separately.
- `fraction_mixed_did_not_regroup` — subtracted mixed numbers without regrouping the whole part.
- `fraction_div_by_unit_inverted_wrong` — flipped the dividend instead of the divisor in fraction division.
- `volume_used_surface_area_formula` — computed surface area instead of volume for a rectangular prism.
- `volume_added_dimensions_instead_of_multiplied` — added length + width + height instead of multiplying.
- `coordinate_swapped_x_and_y` — plotted (3, 5) at the location of (5, 3).
- `coordinate_counted_from_one_not_zero` — placed (1, 1) at what should be (0, 0) plus one unit each.
- `order_of_operations_left_to_right` — evaluated 6 + 4 × 2 as 20 instead of 14 by going left to right.
- `unit_conversion_wrong_direction` — multiplied when should have divided (e.g., m → cm but divided by 100).
- `pattern_continued_arithmetic_when_geometric` — continued a doubling pattern by adding the previous step's increment instead of doubling.
- `financial_confused_income_with_savings` — counted savings as part of monthly income.
- `estimation_didnt_round_first` — computed the exact answer and then rounded, instead of rounding first.

### 10.2 New reading tags (Grade 5)

- `inference_overgeneralized` — drew a conclusion broader than the passage supports ("All scientists agree" when the passage describes one study).
- `inference_relied_on_outside_knowledge` — used real-world knowledge to answer instead of evidence in the passage.
- `theme_picked_topic` — confused topic ("friendship") with theme ("Friends sometimes have to set difficult limits with each other").
- `summary_copied_first_sentence` — selected the choice that mirrors the passage's opening sentence as the summary.
- `summary_included_minor_detail` — included a specific detail in a summary that should be high-level.
- `vocab_wrong_sense_of_polysemous_word` — picked a real meaning of a multi-meaning word that doesn't match the context (`bank` = riverbank vs financial institution).
- `vocab_antonym` — picked the opposite of the correct meaning.
- `purpose_confused_topic_with_purpose` — picked "to teach about volcanoes" when the answer is "to persuade readers that volcano monitoring should be funded."
- `text_structure_picked_first_one_recognized` — selected "compare-contrast" because the passage mentions two things, when the actual structure is "cause-effect."
- `figurative_language_literal_interpretation` — interpreted a metaphor literally.
- `argumentative_confused_claim_with_evidence` — picked a piece of evidence as the author's claim.

### 10.3 New language tags (Grade 5)

- `verb_tense_inconsistent_within_passage` — the passage shifts from past to present in the wrong place.
- `verb_perfect_tense_wrong_helper` — used "have went" instead of "have gone."
- `pronoun_unclear_antecedent` — used "it" or "they" with no clear referent.
- `pronoun_compound_subject_wrong_case` — "Me and my sister went" instead of "My sister and I went."
- `comma_after_introductory_phrase_missing` — "After dinner we went to the park" missing the comma.
- `comma_in_compound_sentence_missing` — "I was tired but I kept going" missing the comma before "but."
- `comma_unnecessary_between_subject_and_verb` — "The dog, ran away" with an unnecessary comma.
- `apostrophe_possessive_vs_plural` — "my parent's all came" instead of "my parents all came."
- `apostrophe_its_vs_its` — "the dog wagged it's tail" instead of "its."
- `dialogue_punctuation_inside_quotes` — comma or period placed outside the closing quote when it should be inside.
- `capitalization_proper_noun` — failed to capitalize a place name, day, month, or title.
- `capitalization_overcapitalization_common_noun` — capitalized "Bridge" when no proper noun is involved.
- `sentence_fragment_missing_subject` — selected a fragment as a complete sentence.
- `sentence_run_on_no_punctuation` — selected a run-on as correct.
- `sentence_run_on_comma_splice` — selected a comma-splice "I went home, I was tired" as correct.
- `transition_wrong_logical_relationship` — used "however" where "therefore" was needed.
- `homophone_their_there_theyre` — most common Grade 5 homophone confusion.
- `homophone_to_too_two` — second-most common.
- `homophone_your_youre` — common.

### 10.4 Tag hygiene rule

After two weeks of Grade 5 authoring, run the misconception rollup (`scripts/grade3-coverage.mjs` has the shape; add an equivalent for Grade 5):

```sql
SELECT misconception_tag, count(*) AS distractors
FROM map_question_choices c
JOIN map_questions q ON q.id = c.question_id
WHERE c.is_correct = false AND q.grade = 5
GROUP BY misconception_tag
ORDER BY distractors ASC;
```

Tags with count = 1 are candidates for renaming (fold into a similar tag) or growing (author 2–3 more questions exercising it). Tags with count > 30 may be candidates for splitting (the tag is too broad to drive useful diagnosis).

---

## 11. Bank targets

Author iteratively. Don't bulk-prompt 100 questions in one call — quality collapses. Generate in batches of **5 questions per `(standard, band)` cell**.

| Subject  | Total | Per standard avg | Notes |
|----------|-------|------------------|-------|
| Math     | 750   | ~19 (39 standards) | Heavier on 5.3 and 5.4 (computation, algebraic reasoning) |
| Reading  | 500   | ~23 (22 standards) | ~85 passages, 4–6 questions each; ~10 paired passage sets |
| Language | 350   | ~25 (14 standards) | ~30 Pattern D passages with 3–5 questions each, plus ~200 standalone Pattern A/B/C items |

That's 1,600 questions at full bank — a multi-month authoring effort. Don't ship a "select Grade 5" toggle in the UI until each subject hits at least:

- Math: 250 questions (enough for 10 unique 25-question tests)
- Reading: 200 questions across 35+ passages (enough for ~8 unique tests)
- Language: 140 questions across 12+ Pattern D passages (enough for ~5 unique tests)

A nearly-empty subject creates an empty test, and an empty test makes the kid (and the parent) lose trust in the app fast.

---

## 12. Authoring workflow

1. Run `node scripts/grade5-coverage.mjs` to find the lowest-coverage `(standard, band)` cells.
2. Run `node scripts/grade5-author-prompt.mjs --subject <s> --teks <code> --band <band>` to print a paste-ready prompt. The script auto-detects:
   - For language: which pattern (A/B/C/D) the TEKS code calls for.
   - For reading: whether to author a passage first (if the standard implies a new passage) or to attach to an existing low-question-count passage.
   - For math: which SVG patterns from §7.1 might apply.
3. Paste the prompt into a fresh Claude conversation (Sonnet 4.5+ recommended). Get back a JSON array of 5 question objects.
4. **Validate the JSON** before any SQL touches the DB:
   - Exactly one `is_correct: true` per question.
   - Every distractor has both `misconception` and `misconception_tag`.
   - Every `misconception_tag` exists in `map_misconception_tags`.
   - Stem ≤ 45 words (or exempt if Pattern A/C/D).
   - Names are from the §5 allow-list.
   - For math with figures, `stem_image_svg` is non-null and parses as valid SVG.
5. Write a migration following `seed/` patterns. SVG values use `$svg$...$svg$` dollar-quoting so single-quoted attributes inside don't need escaping. Wrap in `DO $mig$ ... $mig$;` block, transactional, idempotent.
6. Apply the migration. Re-run the coverage script to confirm the cell lit up.
7. **Spot-check.** Pick one of the five new questions. Read it as if you were a 10-year-old. Does it work? If not, fix it in a follow-up migration — don't leave bad questions in the bank because the migration was already applied.

Don't author for 8 hours straight. Quality declines steeply after about 50 questions in one sitting; the bank pays for that decline forever.

---

## 13. Hard rules — don't violate

- **No verbatim Khan Academy, NWEA, or STAAR content.** Topical references only. Original wording, original numbers, original passages. STAAR practice books are not okay to copy from either.
- **No PII in passages or stems.** Use only the names in §5.
- **TEKS codes are canonical.** Don't invent codes. Verify each against TAC §111.7 and §110.7.
- **Misconception tagging is required at author time, not later.** Every distractor has both `misconception` (free text) and `misconception_tag` (from `map_misconception_tags`).
- **Don't ship a Grade 5 selection toggle** until the bank hits §11's minimums. Soft-launch behind a feature flag if you must show progress, but don't put a button in front of the kid that produces an empty or skewed test.
- **Don't conflate this work with the schema preflight.** §2 (RIT band extension) is its own PR. Bank authoring is iterative behind the coverage script.
- **No raster images.** Inline SVG only. If the figure can't be SVG, the question doesn't ship in this phase.
- **Stretch questions ≥ 2 bands above start_band don't count toward mastery** (see `MASTERY_TRACKER_BRIEF.md` §1). Bear this in mind when picking the band for a new question — a 5th-grade question authored at `231_240` for a kid whose start band is `201_210` will not count toward their mastery score, so don't over-author the top band.
- **Don't backfill Grade 2 or Grade 3 misconception tags.** That's already done; don't re-do it as part of this brief.
- **Reading passage edits don't auto-update questions.** Same rule as Phase 4 (`Custom_Questions_Brief.md` §1). If you fix a passage typo, the questions referencing the old passage version stay where they are unless you explicitly upgrade them. (Phase 1/2 vetted-bank passages don't have versioning yet, so for Grade 5 vetted authoring, just don't edit a published passage in place — author a new one if the changes are substantive, and let the old questions die naturally.)
- **`above_210` is deprecated for Grade 5 authoring.** Use the new bands (`211_220`, `221_230`, `231_240`). The old band stays in the enum so existing Grade 2/3 questions don't break, but no Grade 5 question should be authored into it.

---

## 14. Validation checkpoints

These are the sequential gates. Don't skip ahead.

### After §2 (RIT band extension):

```sql
-- Bands exist in the enum
SELECT enum_range(NULL::map_rit_band);
-- Expect to include 211_220, 221_230, 231_240

-- Adaptive simulator passes
-- Run: node scripts/test-adaptive-simulator.mjs 100
-- Expect: 100/100 pass

-- Mastery view recompiles cleanly
SELECT count(*) FROM map_v_student_current_band;
-- Expect: no error
```

### After §3 (TEKS seed):

```sql
SELECT subject, count(*) FROM map_standards WHERE grade = 5 GROUP BY subject;
-- Expect: math ~39, reading ~22, language ~14

SELECT count(*) FROM map_standards
WHERE grade = 5 AND khan_unit_ref IS NULL;
-- Expect: 0
```

### After §10 (misconception tags):

```sql
SELECT count(*) FROM map_misconception_tags
WHERE description LIKE '%Grade 5%' OR tag IN (
  -- the specific new tags from §10.1, §10.2, §10.3
  ...
);
-- Expect: count matches the additions in §10
```

### After authoring begins (run weekly):

```sql
-- Coverage by (standard, band)
SELECT s.teks_code, q.rit_band, count(q.id) AS questions
FROM map_standards s LEFT JOIN map_questions q ON q.standard_id = s.id AND q.is_active
WHERE s.grade = 5
GROUP BY s.teks_code, q.rit_band
ORDER BY questions ASC, s.teks_code, q.rit_band;

-- Tag hygiene
SELECT misconception_tag, count(*) AS distractors
FROM map_question_choices c
JOIN map_questions q ON q.id = c.question_id
WHERE c.is_correct = false AND q.grade = 5
GROUP BY misconception_tag ORDER BY distractors ASC;

-- Untagged distractors (should always be 0)
SELECT count(*)
FROM map_question_choices c
JOIN map_questions q ON q.id = c.question_id
WHERE c.is_correct = false AND q.grade = 5
  AND (c.misconception_tag IS NULL OR c.misconception IS NULL);
-- Expect: 0
```

### Before shipping the Grade 5 selection toggle:

- Math: ≥ 250 active questions across ≥ 28 standards.
- Reading: ≥ 200 active questions across ≥ 35 passages, including ≥ 5 paired passage sets.
- Language: ≥ 140 active questions across ≥ 12 Pattern D passages, plus ≥ 80 standalone Pattern A/B/C items.
- Each subject's bank composition matches the §4 weights to within ±5 percentage points.
- A real human (the parent / product owner) has read 30 randomly-sampled questions per subject and approved the quality.

---

## 15. References

- **TEKS Math Grade 5:** TAC §111.7 — `https://tea.texas.gov/academics/curriculum-standards/teks/grade5-teks-062024-0.pdf`
- **TEKS ELAR Grade 5:** TAC §110.7 — same PDF (combined K–5 reference)
- **Khan Academy Grade 5 Math:** `https://www.khanacademy.org/math/cc-fifth-grade-math`
- **Khan Academy Grade 5 Reading & Vocabulary:** `https://www.khanacademy.org/ela/cc-5th-reading-vocab`
- **NWEA RIT reference (3–5 norms):** `https://cdn.nwea.org/docs/RIT+Reference+Brochure_July19_CC.pdf` (2020 norms; check for 2025 norms before final calibration — see notes below)
- **NWEA 2020 norms full study:** `https://teach.mapnwea.org/impl/NormsTables.pdf`
- **Plano ISD ELAR alignment statement:** `https://www.pisd.edu/Page/16620`
- **TEA STAAR Grade 5 reading framework:** for reference only; do NOT mine items from it. Released items are copyrighted.

A note on norms: NWEA released updated norms in 2025 that shift percentile interpretations slightly (typical RIT scores correspond to higher percentiles than under 2020 norms because national achievement has declined). The 2020 norms remain valid for bank-band-target purposes — the median student has not actually moved. Check whether the parent dashboard's percentile language needs a 2025-norms refresh as a separate ticket.

These are reference reading for the authoring agent. **Do not embed quotes from them in the app or in generated content.** TEKS code references and unit names are facts, not copyrighted text; passages, sample items, and explanatory paragraphs from these sources are copyrighted and stay where they are.

---

## 16. Ordered checkpoints for Claude Code

Do these in order. Don't skip.

1. **Read** `CLAUDE.md` (especially §3, §4, §9), `Grade3_Seeding_Brief.md`, `MASTERY_TRACKER_BRIEF.md`, and the included `5th_Grade_Math_Units.docx`. Confirm you've read them by listing each file and one key takeaway from each.
2. **Schema preflight (§2).** Apply the band extension migration. Update `bands.ts`, the RIT estimator, and `map_v_student_current_band`. Run the adaptive simulator 100/100. Open a PR for just this work; merge before continuing.
3. **TEKS seed (§3).** Build the math, reading, and language seeds. Open a PR for just the seed. Validate counts (§14).
4. **Misconception tags (§10).** Add the new tags to `map_misconception_tags`. Open a PR. Validate.
5. **Author-prompt and coverage scripts.** Build `scripts/grade5-coverage.mjs` and `scripts/grade5-author-prompt.mjs` mirroring the Grade 3 versions, parameterized for Grade 5's RIT band targets, names pool, and §6 differences. The author-prompt script should accept an optional `--sub-skill` flag that maps to the breakdowns in §17 — see that section for the full mapping. Smoke-test by running the prompt for one math, one reading, one language `(standard, band)` cell each.
6. **Stop and hand the work back to the human.** Bank authoring is iterative; whoever owns the product should kick off the first week of authoring against the coverage script and sample the output before anything bulk-runs.
7. **Update `CLAUDE.md`.** Append a new §11 summarizing: schema additions (bands, `is_synthetic`, `target_sentence_number`, `pair_id`), Grade 5 RIT targets, names additions, Pattern D, the new misconception tags, the bank targets, and the §13 hard rules. Don't paste this whole brief in — summarize. The brief stays in the repo as `Grade5_Seeding_Brief.md` for reference.

When in doubt: stop and ask. Don't paper over an inconsistency. Especially anything involving the kid's UI tone or the misconception taxonomy — those are the parts of the system that matter most and are hardest to fix later.

---

## 17. Khan-Academy sub-skill breakdowns by TEKS code

The Plano scope-and-sequence in `5th_Grade_Math_Units.docx` enumerates Grade 5 math content at finer granularity than the TEKS codes — typically 2–6 named sub-skills per TEKS sub-letter. These sub-skills aren't separate standards (don't add rows to `map_standards` for them), but they are useful authoring targets: a `(standard, band)` cell with 11 questions might still be lopsided if all 11 hit the same Khan sub-skill and leave others empty.

The author-prompt script should accept an optional `--sub-skill` flag whose values come from the table below. When set, the prompt template adds a line like *"Focus the questions on this sub-skill: {{sub_skill_label}}"* so the generation is targeted. The coverage script should display sub-skill counts as a secondary breakdown beneath the primary `(standard, band)` table — the human authoring decides whether to chase a thin sub-skill or move on.

The table is partial (math only — reading and language don't have a parallel Khan-style sub-skill axis at Grade 5; their authoring axis is genre and pattern, which §8 and §9 already cover). Sub-skill keys are snake_case for use as CLI arguments.

### 17.1 Whole-number operations and estimation

| TEKS | Sub-skill key | Plano label |
|---|---|---|
| 5.3(A) | `est_add_sub_multidigit` | Estimate to add multi-digit numbers; estimate to subtract |
| 5.3(A) | `est_add_sub_word_problems` | Multi-digit addition & subtraction estimation word problems |
| 5.3(A) | `est_mult_factors_of_10` | Multiply by taking out factors of 10 |
| 5.3(A) | `est_multidigit_mult` | Estimate multi-digit multiplication |
| 5.3(A) | `est_div_factors_of_10` | Divide by taking out factors of 10 |
| 5.3(A) | `est_multidigit_div` | Estimate multi-digit division problems |
| 5.3(A) | `est_word_problems_two_step` | 2-step estimation word problems |
| 5.3(B) | `mult_1digit_standard_algorithm` | Multiply by 1-digit numbers (standard algorithm) |
| 5.3(B) | `mult_2digit_by_2digit` | Multiply 2-digit numbers |
| 5.3(B) | `mult_3digit_by_2digit` | Multiply 3-digit by 2-digit (standard algorithm) |
| 5.3(C) | `div_basic_multidigit` | Basic multi-digit division |
| 5.3(C) | `div_by_2digit_divisor` | Division by 2-digit numbers |
| 5.4(B) | `multistep_word_problems_whole` | Multi-step word problems with whole numbers |

### 17.2 Algebraic reasoning and order of operations

| TEKS | Sub-skill key | Plano label |
|---|---|---|
| 5.4(E) | `simplify_numerical_expressions` | Simplify numerical expressions |
| 5.4(E) | `order_of_operations_intro` | Order of operations (introduction) |
| 5.4(F) | `eval_expressions_with_parentheses` | Evaluate expressions with parentheses |
| 5.4(F) | `translate_expressions_with_parens` | Translate verbal expressions involving parentheses |
| 5.4(F) | `create_expressions_with_parens` | Create expressions with parentheses |
| 5.4(F) | `expression_word_problems_basic` | Writing basic expression word problems |
| 5.review.factors | `factor_pairs` | Factor pairs |
| 5.review.factors | `identify_factors` | Identify factors of a number |
| 5.review.factors | `identify_multiples` | Identify multiples |
| 5.review.factors | `relate_factors_multiples` | Relate factors and multiples |
| 5.4(A) | `prime_composite_intro` | Identify prime numbers; identify composite numbers; understand the difference |

### 17.3 Decimals — place value, comparison, rounding

| TEKS | Sub-skill key | Plano label |
|---|---|---|
| 5.2(A) | `decimal_place_value_names` | Place value names |
| 5.2(A) | `decimal_value_of_a_digit` | Value of a digit |
| 5.2(A) | `decimal_expanded_form` | Write decimals in expanded form |
| 5.2(B) | `decimal_compare_thousandths` | Compare decimals through thousandths |
| 5.2(B) | `decimal_order` | Order decimals |
| 5.2(B) | `decimal_compare_word_problems` | Compare decimals word problems |
| 5.2(C) | `decimal_round_on_number_line` | Round decimals on the number line |
| 5.2(C) | `decimal_round` | Round decimals |
| 5.2(C) | `decimal_round_word_problems` | Decimal rounding word problems |
| 5.3(K) | `decimal_on_number_line_thousandths` | Decimals on the number line up to thousandths |

### 17.4 Decimals — operations

| TEKS | Sub-skill key | Plano label |
|---|---|---|
| 5.3(K) | `decimal_add_visually` | Add decimals visually |
| 5.3(K) | `decimal_add_tenths` | Add decimals (tenths) |
| 5.3(K) | `decimal_add_hundredths` | Add decimals (hundredths) |
| 5.3(K) | `decimal_add_thousandths` | Add decimals (thousandths) |
| 5.3(K) | `decimal_subtract_visually` | Subtract decimals visually |
| 5.3(K) | `decimal_subtract_tenths` | Subtract decimals (tenths) |
| 5.3(K) | `decimal_subtract_hundredths` | Subtract decimals (hundredths) |
| 5.3(K) | `decimal_subtract_thousandths` | Subtract decimals (thousandths) |
| 5.3(K) | `decimal_word_problems_add_sub` | Adding & subtracting decimals word problems |
| 5.3(D) | `decimal_x_whole_visual` | Multiply decimals and whole numbers visually |
| 5.3(D) | `decimal_x_powers_of_tenth` | Multiply whole numbers by 0.1 and 0.01 |
| 5.3(D) | `decimal_x_whole_word_problems` | Decimal × whole number word problems |
| 5.3(E) | `decimal_x_decimal_grid` | Multiply decimals using grids and area models |
| 5.3(E) | `decimal_x_decimal_tenths` | Multiply decimals (tenths) |
| 5.3(E) | `decimal_x_decimal_hundredths` | Decimal products (hundredths) |
| 5.3(E) | `decimal_mult_word_problems` | Multiply decimals word problems |
| 5.3(F) | `decimal_div_whole_to_decimal_quotient` | Divide whole numbers to get a decimal quotient |
| 5.3(F) | `decimal_div_by_whole_visual` | Divide decimals by whole numbers visually |
| 5.3(F) | `decimal_div_by_whole` | Divide decimals by whole numbers |
| 5.3(G) | `decimal_div_whole_by_decimal_visual` | Divide whole numbers by decimals visually |
| 5.3(G) | `decimal_div_whole_by_powers_of_tenth` | Divide whole numbers by 0.1 or 0.01 |
| 5.3(G) | `decimal_div_whole_by_decimal` | Divide whole numbers by decimals |

### 17.5 Fractions

| TEKS | Sub-skill key | Plano label |
|---|---|---|
| 5.3(H) | `frac_add_sub_visual` | Visually add and subtract fractions |
| 5.3(H) | `frac_estimate_unlike_denom` | Estimate sums and differences with unlike denominators |
| 5.3(H) | `frac_common_denominators` | Find common denominators |
| 5.3(H) | `frac_add_unlike_denom` | Add fractions with unlike denominators |
| 5.3(H) | `frac_sub_unlike_denom` | Subtract fractions with unlike denominators |
| 5.3(H) | `frac_mixed_no_regroup` | Add & subtract mixed numbers (no regrouping) |
| 5.3(H) | `frac_mixed_with_regroup` | Add & subtract mixed numbers (with regrouping) |
| 5.3(H) | `frac_add_sub_word_problems` | Add and subtract fractions word problems |
| 5.3(I) | `frac_x_whole_models` | Multiply fractions and whole numbers using fraction models |
| 5.3(I) | `frac_x_whole_number_line` | Multiply fractions on the number line |
| 5.3(I) | `frac_x_whole` | Multiply fractions and whole numbers |
| 5.3(J) | `frac_div_unit_by_whole_visual` | Divide unit fractions by whole numbers visually |
| 5.3(J) | `frac_div_unit_by_whole` | Divide unit fractions by whole numbers |
| 5.3(L) | `frac_div_whole_by_unit_visual` | Divide whole numbers by unit fractions visually |
| 5.3(L) | `frac_div_whole_by_unit` | Divide whole numbers by unit fractions |

### 17.6 Geometry, measurement, volume

| TEKS | Sub-skill key | Plano label |
|---|---|---|
| 5.7(A) | `convert_metric` | Convert metric units |
| 5.7(A) | `convert_metric_word_problems` | Convert metric unit word problems |
| 5.7(A) | `convert_metric_multistep` | Multi-step metric conversion problems |
| 5.7(A) | `convert_us_customary` | Convert US customary units |
| 5.7(A) | `convert_us_customary_word` | Convert US customary word problems |
| 5.7(A) | `convert_us_customary_multistep` | Multi-step US customary problems |
| 5.5(A) | `classify_triangles_by_angles` | Classify triangles by angles |
| 5.5(A) | `classify_triangles_by_sides_angles` | Classify triangles by sides and angles |
| 5.5(A) | `identify_quadrilaterals` | Identify quadrilaterals |
| 5.5(A) | `quadrilateral_types_hierarchy` | Types of quadrilaterals; classifying shapes; properties of shapes |
| 5.6(A) | `volume_unit_cubes` | Volume using unit cubes |
| 5.6(A) | `volume_rect_prism_unit_cubes` | Volume of rectangular prisms with unit cubes |
| 5.6(A) | `volume_compare_unit_cubes` | Compare volumes using unit cubes |
| 5.6(B) | `volume_area_of_base_x_height` | Volume as (area of base × height) |
| 5.6(B) | `volume_rect_prisms_formula` | Volume of rectangular prisms (formula) |
| 5.6(B) | `volume_real_world` | Solve real-world volume problems |
| 5.4(H) | `area_perimeter_situations` | Area and perimeter situations |
| 5.4(H) | `represent_rectangle_measurements` | Represent rectangle measurements |
| 5.4(H) | `area_perimeter_word_problems` | Area & perimeter word problems |

### 17.7 Coordinate plane, data, financial literacy

The coordinate-plane sub-letters (5.8(A)–(C)) and data-analysis sub-letters (5.9(A)–(C)) are narrow enough at Grade 5 that the TEKS code itself is the right authoring grain — don't introduce sub-skills there. Same for financial literacy (5.10(A)–(F)), where each sub-letter is already a single concept.

### 17.8 What this table is *not*

It's not a substitute for the standards table. It's a paste-into-author-prompt convenience. Don't:

- Add `sub_skill` as a column on `map_questions`. The information is implicit in the stem, doesn't need a query axis, and would invite a parallel taxonomy that drifts from the misconception tags (which are the actual diagnostic axis).
- Treat sub-skills as standalone targets the parent dashboard surfaces. They're authoring scaffolding, not user-facing.
- Try to enumerate "100% sub-skill coverage" before shipping. The §11 minimums are the ship gates; sub-skill spread beyond those minimums is a quality-of-bank concern that the human reviewer addresses by spot-sampling, not by a count.
