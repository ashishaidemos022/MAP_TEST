# Grade 1 Question Seeding Guide — Math, Reading, Language

> Hand this entire document to the LLM that will author Grade 1 questions and write them to Supabase. Read end-to-end before generating anything. Every section is load-bearing — skipping §3 (formats), §5 (misconception tags), or §9 (validation) will produce questions that fail at insert time or pollute the misconception signal.

> **Prerequisite already complete:** Grade 1 standards are seeded in `map_standards`. Misconception taxonomy is extended with Grade 1 codes. This guide is **only** about authoring and inserting question content.

---

## 1. What you are building

You are authoring Grade 1 practice questions across three subjects — math, reading, language — for a MAP-style test app aligned to Texas TEKS. Each question is multiple-choice, has exactly four options, and lives in `map_questions` with its choices in `map_question_choices`. Reading questions are anchored to a passage in `map_reading_passages`.

Three things make Grade 1 different from Grade 2 and 3:

1. **The reader is mid-decoding.** Stems must cap at 15 words, vocabulary stays inside the most-common ~500 English words unless the question is testing vocabulary, and the layout must work when read aloud by browser TTS.
2. **The number range is small.** No three-digit numbers in math stems. Addition and subtraction within 20 are the spine. Two-digit numbers up to 120 only in place-value, comparison, and skip-counting questions.
3. **Format is MCQ-only.** `edit_pick` and `sentence_combine` formats exist in the schema and are used at Grade 2/3 language, but **do not use them for Grade 1**. A 1st-grader cannot reliably parse four full sentences and pick the grammatically correct one.

**Figures use a hybrid approach** — see §3.1 for the rules. In short: inline SVG for abstractions (ten-frames, number lines, shapes, graphs, clocks), real-photo image references for money. Photorealistic coins matter at Grade 1 because the kid is learning to recognize *actual* pennies, nickels, dimes, and quarters — not schematic representations of them.

---

## 2. Targets

These are the totals you are working toward across the whole Grade 1 bank, not per-batch:

| Subject | Total questions | Per-standard floor | Notes |
|---|---:|---:|---|
| math | ~360 | 8 per standard | 36 standards. Heavier on 1.2 (place value to 120) and 1.3 (operations within 20). |
| reading | ~150 | n/a — measure per passage | 4–6 questions per passage. ~30 passages total. |
| language | ~140 | 12 per standard | Conventions are narrower so density is higher. |

These are reasonable bounds, not contracts. If a standard genuinely has fewer authentic Grade 1 question types, author fewer rather than padding.

### RIT band distribution (Grade 1)

NWEA Grade 1 norms: BOY ≈150, MOY ≈162, EOY ≈172, above-grade ≈180+. Distribute the bank across bands as follows:

| Band | Centroid | % of bank | Why |
|---|---:|---:|---|
| `below_161` | 156 | ~10% | Review / supports below-grade kids |
| `161_170` | 165 | ~30% | BOY–MOY on-grade |
| `171_180` | 175 | ~35% | EOY on-grade — heaviest bucket |
| `181_190` | 185 | ~20% | Stretch |
| `191_200` | 195 | ~5% | High stretch |

Note: `below_161` is currently unused at every grade. Grade 1 will be the first to populate it. That is intentional — the misconception tracker benefits from having below-grade questions for kids who need them.

---

## 3. Schema you are writing into

You will only write to three tables. The full column shape is in `CLAUDE.md` §3, but here is what matters for authoring:

### `map_questions`

| Column | Type | What you set |
|---|---|---|
| `subject` | enum `math|reading|language` | one of these three |
| `grade` | smallint | always **1** |
| `standard_id` | uuid (FK) | look up by `(grade=1, subject, teks_code)` |
| `passage_id` | uuid (FK) | **required** for `subject='reading'`, must be NULL otherwise |
| `rit_band` | enum (see §2) | one of the seven bands |
| `difficulty` | enum `easy|medium|hard` | author judgment |
| `stem` | text | the question text, ≤ 15 words |
| `stem_image_svg` | text or NULL | inline `<svg>...</svg>` markup if a figure is needed (see §3.1) |
| `audio_supported` | boolean | always `true` for Grade 1 |
| `explanation` | text | teach the solution; do not just state the answer |
| `source_note` | text | `'Khan Academy: <unit>'` mirroring the standard's `khan_unit` |
| `question_format` | text | always `'mcq'` for Grade 1 |
| `is_active` | boolean | `true` |

### `map_question_choices`

| Column | Type | What you set |
|---|---|---|
| `question_id` | uuid (FK) | the parent question id |
| `label` | char(1) | `'A'`, `'B'`, `'C'`, `'D'` exactly |
| `body` | text | the choice text |
| `body_image_svg` | text or NULL | rare — inline SVG inside the choice (e.g. four shape options) |
| `is_correct` | boolean | exactly one is `true` per question |
| `misconception` | text or NULL | for distractors only, free-text reason in one sentence |
| `misconception_tag` | text or NULL | for distractors only, **FK to `map_misconception_tags.tag`** |
| `sort_order` | smallint | 1, 2, 3, 4 in label order |

### `map_reading_passages`

| Column | Type | What you set |
|---|---|---|
| `title` | text | short, evocative |
| `body` | text | the passage itself |
| `genre` | enum `literary|informational|poetry|drama` | one of these |
| `word_count` | int | actual word count of `body` |
| `lexile` | int | estimated; you don't need a real Lexile API (see §6.1) |
| `rit_band` | enum | matches the band most of its questions will sit in |
| `source` | text | `'original'` |
| `topic` | text | one short tag like `'family-life'`, `'weather'`, `'pets'` |

There is no `grade` column on `map_reading_passages` — Grade 1 passages are identified by the questions that reference them.

### 3.1 Figure rules — when to use SVG, when to use image assets

Grade 1 figures use a **hybrid approach**. Two channels:

- **Inline SVG** for abstractions you can draw cleanly in vector
- **Image asset references** for money only (real coin and bill photographs)

#### When to use inline SVG

Use `stem_image_svg` with a string of inline `<svg>...</svg>` markup for everything except money:

| Topic | Reason |
|---|---|
| Ten-frames, base-ten blocks | Vector is crisper than any photo |
| Number lines | Need precise positioning of marks and arrows |
| 2D and 3D shapes | Schematic shapes are clearer than photos of objects |
| Fraction circles, fraction bars | Need exact equal divisions |
| Bar graphs, picture graphs | Vector aligns to grid cleanly |
| Analog clocks | Schematic clock face is clearer than a photo |
| Rulers and measuring | Need clean tick marks |

For inline SVG, follow these conventions:
- `viewBox` with a clean aspect ratio — `0 0 400 200` for landscape, `0 0 300 300` for square. Avoid hardcoded width/height attributes; let the app size it.
- High contrast, no gradients. A 1st-grader is squinting at a tablet.
- Use semantic colors: red `#dc2626` for highlight, blue `#2563eb` for primary, gray `#6b7280` for secondary marks.
- Label numbers in `font-family="sans-serif" font-size="20"` minimum.
- For ten-frames: 5×2 grid of 40px cells, filled cells are blue circles, empty cells are open squares.
- For number lines: a horizontal line, tick marks every N units, labels below ticks, an arrow or marker above the relevant position.
- For shapes: simple polygon paths with a 2px stroke, light fill or no fill.

Inline SVG must be self-contained: no `href` to external assets, no `src` attributes pointing outside, no base64-encoded raster images.

#### When to use image asset references — money only

Money questions reference real photographs of US currency hosted in the app's `/public/assets/` folder. The reader sees an actual penny, not a schematic circle with "1¢" inside. This matters at Grade 1 because the child is learning to recognize the *real coins they encounter*.

The image refs go inside a `<svg>` wrapper in `stem_image_svg`, using the `<image href="...">` tag. The wrapper SVG handles layout (positioning multiple coins/bills in a row); the `<image>` tags pull the actual photos.

**Available assets** (these are the only ones — do not reference any other asset path):

| Filename | Asset | Notes |
|---|---|---|
| `/assets/penny.jpg` | Penny (1¢) | |
| `/assets/nickel.webp` | Nickel (5¢) | **`.webp`, not `.jpg`** |
| `/assets/dime.jpg` | Dime (10¢) | |
| `/assets/quarter.jpeg` | Quarter (25¢) | **`.jpeg`, not `.jpg`** |
| `/assets/dollarbill.jpg` | $1 bill | |
| `/assets/five_dollar_bill.jpg` | $5 bill | underscores, not hyphens |

The filenames are case-sensitive and the extensions are inconsistent across files. Reference the exact filename — `penny.jpeg`, `nickel.jpg`, `quarter.jpg`, `dollar_bill.jpg` will all 404 silently.

**Asset reference template** (single coin):

```xml
<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <image href="/assets/dime.jpg" x="0" y="0" width="80" height="80"/>
</svg>
```

**Asset reference template** (a row of coins, like the example image you'd recognize):

```xml
<svg viewBox="0 0 500 80" xmlns="http://www.w3.org/2000/svg">
  <image href="/assets/quarter.jpeg" x="0"   y="0" width="80" height="80"/>
  <image href="/assets/penny.jpg"    x="100" y="0" width="80" height="80"/>
  <image href="/assets/nickel.webp"  x="200" y="0" width="80" height="80"/>
  <image href="/assets/penny.jpg"    x="300" y="0" width="80" height="80"/>
  <image href="/assets/nickel.webp"  x="400" y="0" width="80" height="80"/>
</svg>
```

Layout conventions for money rows:
- 80×80 px per coin, 100px apart (20px gap between coins)
- Bills can be wider — use 160×80 (roughly 2:1 aspect for the bill assets)
- Order coins left-to-right by value descending (quarters first, then dimes, nickels, pennies) unless the question explicitly tests counting in mixed order
- Bills come before coins in the row

#### Money question scope at Grade 1

Because the asset library is limited to four coins and two bills, money questions stay within these bounds:

- **Coin recognition (1.4A)** — show one coin, ask which it is or what value
- **Cent notation (1.4B)** — show one or more coins, ask the total in `¢`
- **Counting coin sets (1.4C)** — show up to ~6 coins, totals stay under $1
- **Bill + coin totals** — only when the answer is a clean dollar-and-cent format (e.g. $1.30 for a $1 bill plus three dimes); avoid fractional dollars expressed in cents alone

Half-dollar, $10, $20 — not in the asset library, do not author questions requiring them.

#### Universal figure constraints

- The `<svg>` wrapper element starts with `<svg` and ends with `</svg>`
- Total `stem_image_svg` length under 4000 characters (longer is usually a sign of bloated output)
- Inline SVG (non-money): no `href` or `src` to external content
- Money SVG: `<image href="...">` only references one of the six assets above. No other paths.

If you cannot represent the figure in inline SVG and the topic isn't money, the question is wrong for Grade 1 — pick a different question type.

---

## 4. The Grade 1 standards you will author against

These are the standards as actually seeded in `map_standards` for `grade = 1`. Use the `teks_code` column as the FK lookup key.

### Math (36 standards)

```
1.2A  Recognize quantities of structured arrangements
1.2B  Compose and decompose numbers up to 120
1.2C  Represent numbers up to 120
1.2D  Generate a number greater or less than a given number
1.2E  Compare whole numbers up to 120 with comparative language
1.2F  Order whole numbers up to 120 on a number line
1.2G  Compare two numbers using >, <, =
1.3A  Add a multiple of 10 and a one-digit number
1.3B  Word problems within 20 (join, separate, compare)
1.3C  Compose 10 with two or more addends
1.3D  Apply basic fact strategies within 20
1.3F  Generate problems from a number sentence
1.4A  Identify pennies, nickels, dimes, quarters by value
1.4B  Write a coin's value with the cent symbol
1.4C  Count coin sets by 2s, 5s, 10s
1.5B  Skip count by 2s, 5s, 10s up to 120
1.5C  Find 10 more / 10 less than a given number
1.5D  Represent word problems with concrete models and number sentences
1.5E  Equal sign as a same-value relationship
1.5F  Find the unknown in an addition or subtraction equation
1.5G  Apply properties of operations to add or subtract
1.6A  Classify and sort 2D shapes by attributes
1.6B  Distinguish defining vs non-defining attributes
1.6D  Identify 2D shapes and describe their attributes
1.6E  Identify 3D solids and describe their attributes
1.6F  Compose 2D shapes by joining figures
1.6G  Partition shapes into halves and fourths
1.6H  Identify examples of halves and fourths
1.7A  Use measuring tools to measure length
1.7B  Length as same-size units laid end-to-end
1.7C  Measure with two different unit sizes
1.7D  Describe length to the nearest whole unit
1.7E  Tell time to the hour and half-hour
1.8A  Collect and sort data into up to three categories
1.8B  Create picture and bar-type graphs
1.8C  Draw conclusions from picture/bar graphs
```

### Reading (26 standards)

```
1.3.A   Use a picture dictionary or digital resource to find words
1.3.B   Use illustrations and texts to learn word meanings
1.3.C   Use words with affixes -s, -ed, -ing
1.3.D   Use words from common categories
1.6.A   Establish purpose for reading
1.6.C   Make and confirm predictions
1.6.E   Make connections to personal experience
1.6.F   Make inferences with text evidence
1.6.G   Evaluate details to determine main idea
1.6.H   Synthesize information to create new understanding
1.7.A   Describe personal connections
1.7.C   Use text evidence to support response
1.7.D   Retell texts in ways that maintain meaning
1.8.A   Discuss topics and determine theme
1.8.B   Describe main characters and their actions
1.8.C   Describe plot elements
1.8.D   Describe the setting
1.9.A   Recognize children's literature: folktales, fables, fairy tales
1.9.B   Discuss rhyme, rhythm, repetition, alliteration in poems
1.9.C   Discuss elements of drama
1.9.D.i Informational text: central idea and supporting evidence
1.9.D.ii Informational text: features and graphics
1.9.D.iii Informational text: organizational patterns
1.9.E   Recognize characteristics of persuasive text
1.9.F   Recognize characteristics of multimodal and digital texts
1.10.A  Discuss the author's purpose
1.10.B  Discuss how text structure contributes to author's purpose
1.10.C  Discuss print and graphic features
1.10.D  Discuss how author uses words to help reader visualize
```

### Language (10 standards)

```
1.11.D.i     Complete sentences with subject-verb agreement
1.11.D.ii    Past and present verb tense
1.11.D.iii   Singular, plural, common, and proper nouns
1.11.D.iv    Adjectives, including articles
1.11.D.v     Adverbs that convey time
1.11.D.vi    Prepositions
1.11.D.vii   Pronouns: subjective, objective, possessive
1.11.D.viii  Capitalize sentence starts and the pronoun "I"
1.11.D.ix    End punctuation: declarative, exclamatory, interrogative
1.11.D.x     Spelling: orthographic patterns and high-frequency words
```

Note the format conventions:
- Math: no dot before the letter (`1.2A`)
- Reading and language: dot before the letter (`1.6.A`, `1.11.D.i`)

If you mistype the code, the FK lookup will fail and your insert will produce zero rows.

---

## 5. Misconception tags — the exact list

Every distractor (`is_correct = false`) must reference a `misconception_tag` from `map_misconception_tags`. The tag column is a foreign key — typos cause silent insert failures.

These are the tags that already include at least one Grade 1 TEKS code in their `related_teks` array. **Use only these tags for Grade 1 questions.** If a Grade 1 distractor genuinely doesn't fit any of these tags, stop and surface the gap before forcing it.

### Math tags (17)

| Tag | When to use |
|---|---|
| `addition_subtraction_inverse_missed` | Treats 8+? = 13 as different from 13−8. Fact-family confusion. |
| `cardinality_count_to_total` | Counts 1,2,3,4,5 but doesn't connect "5" to "the total is 5". |
| `comparison_ordering_misread` | Reads `<` and `>` backwards, sorts in the wrong direction, compares wrong place. |
| `fraction_equal_parts_or_size` | Calls unequal sections "fourths"; thinks more pieces means bigger pieces. |
| `graph_or_table_misread` | Picks wrong bar, misreads bar height, skips a row. |
| `make_a_ten_strategy_missed` | Doesn't decompose to make 10 (8+5 → 8+2+3). Resorts to counting on. |
| `measurement_unit_size` | Picks a unit too big or small for the object. |
| `money_value_or_notation` | Confuses coin values, mixes ¢ and $, forgets pennies. |
| `number_line_position` | Picks a labeled mark instead of the position shown; off-by-one mark counting. |
| `off_by_one_count` | Counts one too many or one too few. The most common Grade 1 error. |
| `operation_swap_add_subtract` | Performs the opposite operation, usually from misread keyword cue. |
| `place_value_concatenated_digits` | Writes 7+8 = 715 instead of 15. |
| `place_value_misread_column` | Treats the 4 in 47 as four (not forty); names wrong digit for "tens place". |
| `shape_attribute_partial_match` | Picks a shape matching some but not all required attributes. |
| `skip_count_wrong_amount` | Adds 1 instead of 10, adds 100 instead of 10. |
| `teen_number_reversal` | Writes 13 as "31"; confuses "fourteen" with "forty". |
| `time_clock_reading` | Reads minute hand as hour, jumps to next hour, confuses AM/PM. |

### Reading tags (12)

| Tag | When to use |
|---|---|
| `affix_meaning_confusion` | Ignores -s/-ed/-ing as meaning cues; picks word by stem alone. |
| `decoding_similar_word_picked` | Picks "hop" for "hope", "ran" for "run" — visual similarity. |
| `feelings_mismatch_evidence` | Picks "angry" when the line shows the character smiling. |
| `figurative_taken_literally` | Reads "stomach felt like butterflies" as eating butterflies. |
| `genre_or_purpose_confusion` | Treats info article as story; mislabels poem as play. |
| `inferred_without_evidence` | Adds details the text never said (character is hungry, it's raining). |
| `main_idea_picked_detail` | Picks a true detail from one paragraph instead of what the whole passage is about. |
| `opposite_of_evidence` | Says character is sad when text shows them smiling. |
| `picture_only_response` | Answers from the illustration rather than the text. |
| `response_off_topic_or_vague` | Picks something unrelated ("I'm hungry") or too generic ("Trees are tall"). |
| `sequence_wrong_step` | Picks wrong step in process or wrong event in story. |
| `setting_character_misidentified` | Names a place not in the story; picks side character as protagonist. |
| `text_features_misread` | Treats ALL CAPS as shouting; confuses stage direction with setting note. |
| `vocab_skipped_context_clues` | Picks a meaning that fits the word in general but ignores passage context. |

### Language tags (14)

| Tag | When to use |
|---|---|
| `article_a_an_misuse` | Picks "a apple" or "an dog". |
| `capitalization_rules` | Capitalizes common nouns; skips proper nouns; forgets "I". |
| `cvc_short_vowel_confusion` | Picks "cot" or "cut" when "cat" is needed. |
| `high_frequency_word_misspell` | Picks "teh", "wuz", "sed", "thay". |
| `part_of_speech_confusion` | Picks adverb when adjective asked; confuses common vs proper noun. |
| `plural_form_confusion` | "babys" instead of "babies"; "mouses" instead of "mice". |
| `preposition_use` | Picks "in" when "on" is needed. |
| `pronoun_mismatch` | "she" for plural subject; "it" for people. |
| `punctuation_rules` | Period for question; exclamation for calm sentence. |
| `sentence_completeness` | Picks jumbled-order or fragment as if correct. |
| `spelling_pattern_confusion` | Substitutes "ane" for "ai", "k" for "c". |
| `spelling_recognition` | Picks correctly spelled word when asked which is misspelled. |
| `subject_verb_agreement` | "the dogs runs"; "Maya and Aarav is here". |
| `verb_tense_confusion` | Past when present needed; bare "-ing" without helper. |

### What if no tag fits?

Do **not** invent a new tag during authoring. Do **not** use `_misc_other` casually — it pollutes the misconception signal. If a distractor genuinely doesn't fit any of these tags, it's a sign one of three things is true:

1. The distractor isn't actually a misconception — it's a random wrong answer. Rewrite it.
2. The distractor is a real Grade 1 error pattern not yet in the taxonomy. Stop authoring this batch and surface the gap.
3. You're tagging the choice, not the *reason* the kid picks it. Rewrite the misconception field to explain the thinking error, then the tag becomes obvious.

---

## 6. Authoring rules

These apply across all three subjects. Subject-specific overlays are in §7–§9.

### 6.1 Stem rules

1. **15-word maximum.** Count contractions as one word. If you cannot fit the question in 15 words, use a figure (`stem_image_svg`) to carry the context.
2. **Vocabulary inside the most-common ~500 English words** unless the question is about vocabulary. "Find out" beats "investigate." "Big" beats "enormous." If a word would stop a 1st-grader cold, replace it.
3. **Names from the shared pool**: Maya, Ethan, Priya, Liam, Ava, Aarav, Zoe, Mia, Noah, Leo, Isla. No Sarah/John clichés. Rotate so no batch over-uses one name.
4. **Cultural contexts that work for a Plano, TX audience**: family, school, recess, pets, weather, parks, sports (soccer, cricket, tee-ball), holidays (Diwali, Christmas, Lunar New Year, Eid, birthdays). Avoid America-football idioms ("touchdown", "Hail Mary") that the child won't get from context.
5. **No trick questions.** Never use double negatives. Never make the correct answer "None of the above." Never make a stem ambiguous and rely on the kid picking the "best" reading.
6. **Read the stem aloud.** If it doesn't sound natural when spoken, rewrite. The browser TTS will read it.

### 6.2 Choice rules

1. **Exactly four choices, exactly one correct.** Labels A, B, C, D in that order.
2. **Choices are roughly the same length.** A long correct answer next to three two-word distractors gives the answer away.
3. **No "All of the above" or "None of the above".** Adds reading load, doesn't test anything.
4. **Distractor order is intentional.** Don't always put the correct answer in B. Distribute roughly evenly across A/B/C/D over a batch.
5. **Each distractor has a `misconception` (free text) and a `misconception_tag` (from §5).** The free-text field is the *specific* error in one sentence ("Counted on but stopped one short."). The tag is the canonical category from the taxonomy.
6. **The misconception explains the *thinking*, not the *answer*.** Wrong: "Picked 12 instead of 13." Right: "Counted on but stopped one short."

### 6.3 Explanation rules

1. **Teach the method, don't just state the answer.** "23 + 18 = 41 because 3+8 = 11, write 1 carry 1; then 2+1+1 = 4. So 41."
2. **Use the same vocabulary as the stem.** If the stem says "more than", the explanation says "more than" — not "greater than".
3. **Two to three sentences max.** Long explanations lose a 1st-grader.
4. **Show the work in the explanation, not in the choices.** Choices are just answers; the work belongs in `explanation`.

### 6.4 What never goes in a Grade 1 question

- Three-digit numbers in math stems (except in 1.2 series, where numbers up to 120 are allowed)
- Multiplication or division (Grade 2+)
- Regrouping/borrowing in subtraction (Grade 1 stays within 20, no regrouping needed)
- Money totals over a dollar
- Time in five-minute intervals (Grade 1 is hour and half-hour only — see 1.7E)
- Reading passages over 100 words (see §8.1)
- Metalinguistic terminology in language stems ("Which word is a noun?" — say "Which word names a thing?")
- External image references inside `stem_image_svg` **except** the six money assets listed in §3.1 (used only on 1.4 series questions)

---

## 7. Math authoring playbook

### 7.1 Topic distribution

The 36 math standards are not equal-weighted. Author roughly:

| Strand | % of math bank | Why |
|---|---:|---|
| 1.2 (place value to 120) | 25% | Heaviest Grade 1 strand |
| 1.3 (operations within 20) | 25% | Spine of Grade 1 math |
| 1.5 (algebraic reasoning) | 20% | Including skip count, equality, fact-family |
| 1.6 (geometry) | 12% | 8 sub-standards |
| 1.7 (measurement) | 8% | |
| 1.8 (data) | 5% | |
| 1.4 (money) | 5% | |

### 7.2 SVG cheatsheet for Grade 1 math

Use figures generously. A 1st-grader makes more progress with a ten-frame than with a wall of text.

| Topic | When to use a figure | What to draw |
|---|---|---|
| 1.2A–C | Always | Ten-frames, base-ten blocks, dot arrangements |
| 1.2F | Always | Number line with arrow at the relevant position |
| 1.2G | Sometimes | Two number lines or two block stacks side-by-side |
| 1.3A–D | Usually | Ten-frames showing the addends; number bonds |
| 1.4A–C | Always | **Image refs to /assets/ — see §3.1.** Real coin photographs in an SVG wrapper. Quarters first, then dimes/nickels/pennies, left-to-right. |
| 1.5B–C | Usually | Number line or hundreds chart |
| 1.6 series | Always | The shapes themselves, with attribute labels |
| 1.7A–D | Always | Ruler with object, paperclip chains, unit comparisons |
| 1.7E | Always | Analog clock face plus digital readout |
| 1.8A–C | Always | Bar graph, picture graph, or sorting categories |

### 7.3 Math example (canonical reference)

This is the shape of a well-formed Grade 1 math question. Mirror it.

**Standard:** `1.3D` (Apply basic fact strategies within 20)
**RIT band:** `171_180`
**Difficulty:** `medium`

```json
{
  "stem": "Maya has 8 stickers. Liam gives her 5 more. How many now?",
  "stem_image_svg": "<svg viewBox=\"0 0 400 100\" xmlns=\"http://www.w3.org/2000/svg\"><g transform=\"translate(20,20)\"><rect width=\"200\" height=\"40\" fill=\"none\" stroke=\"#374151\" stroke-width=\"2\"/><line x1=\"40\" y1=\"0\" x2=\"40\" y2=\"40\" stroke=\"#374151\"/><line x1=\"80\" y1=\"0\" x2=\"80\" y2=\"40\" stroke=\"#374151\"/><line x1=\"120\" y1=\"0\" x2=\"120\" y2=\"40\" stroke=\"#374151\"/><line x1=\"160\" y1=\"0\" x2=\"160\" y2=\"40\" stroke=\"#374151\"/><line x1=\"100\" y1=\"0\" x2=\"100\" y2=\"40\" stroke=\"#374151\" stroke-width=\"2\"/><circle cx=\"20\" cy=\"20\" r=\"12\" fill=\"#2563eb\"/><circle cx=\"60\" cy=\"20\" r=\"12\" fill=\"#2563eb\"/><circle cx=\"100\" cy=\"20\" r=\"12\" fill=\"#2563eb\"/><circle cx=\"140\" cy=\"20\" r=\"12\" fill=\"#2563eb\"/><circle cx=\"180\" cy=\"20\" r=\"12\" fill=\"#2563eb\"/></g></svg>",
  "explanation": "8 + 5 = 13. Make a ten: 8 + 2 = 10, then 10 + 3 = 13. Two from the 5 fills the ten-frame, three more makes 13.",
  "source_note": "Khan Academy: Addition and subtraction within 20",
  "choices": [
    { "label": "A", "body": "12", "is_correct": false,
      "misconception": "Counted on from 8 but stopped one short.",
      "misconception_tag": "off_by_one_count" },
    { "label": "B", "body": "13", "is_correct": true,
      "misconception": null, "misconception_tag": null },
    { "label": "C", "body": "3",  "is_correct": false,
      "misconception": "Subtracted 5 from 8 instead of adding.",
      "misconception_tag": "operation_swap_add_subtract" },
    { "label": "D", "body": "85", "is_correct": false,
      "misconception": "Wrote the digits side-by-side instead of adding.",
      "misconception_tag": "place_value_concatenated_digits" }
  ]
}
```

(The SVG above is illustrative — your authoring tool will produce a real ten-frame matching the addends.)

### 7.3.1 Math example — money question (canonical reference)

Money questions are the only Grade 1 figures that use image assets instead of pure inline SVG. Mirror this shape.

**Standard:** `1.4C` (Count coin sets by 2s, 5s, 10s)
**RIT band:** `171_180`
**Difficulty:** `medium`

```json
{
  "stem": "How much money is shown?",
  "stem_image_svg": "<svg viewBox=\"0 0 500 80\" xmlns=\"http://www.w3.org/2000/svg\"><image href=\"/assets/quarter.jpeg\" x=\"0\" y=\"0\" width=\"80\" height=\"80\"/><image href=\"/assets/dime.jpg\" x=\"100\" y=\"0\" width=\"80\" height=\"80\"/><image href=\"/assets/nickel.webp\" x=\"200\" y=\"0\" width=\"80\" height=\"80\"/><image href=\"/assets/penny.jpg\" x=\"300\" y=\"0\" width=\"80\" height=\"80\"/><image href=\"/assets/penny.jpg\" x=\"400\" y=\"0\" width=\"80\" height=\"80\"/></svg>",
  "explanation": "Start with the biggest coin: 25¢ (quarter) + 10¢ (dime) = 35¢. Then 35¢ + 5¢ (nickel) = 40¢. Then 40¢ + 1¢ + 1¢ (two pennies) = 42¢.",
  "source_note": "Khan Academy: Counting money",
  "choices": [
    { "label": "A", "body": "32¢", "is_correct": false,
      "misconception": "Counted the quarter as 15¢ instead of 25¢.",
      "misconception_tag": "money_value_or_notation" },
    { "label": "B", "body": "42¢", "is_correct": true,
      "misconception": null, "misconception_tag": null },
    { "label": "C", "body": "5¢",  "is_correct": false,
      "misconception": "Counted only the coins, not their values.",
      "misconception_tag": "cardinality_count_to_total" },
    { "label": "D", "body": "50¢", "is_correct": false,
      "misconception": "Counted the dime as a quarter (mixed up the two silver coins).",
      "misconception_tag": "money_value_or_notation" }
  ]
}
```

Notes on the money example:
- Filenames match the asset library exactly: `.jpeg` for quarter, `.webp` for nickel, `.jpg` for the rest.
- Coins are 80×80 px, 100px apart, ordered left-to-right by descending value.
- The `viewBox` width is 500 to fit five coins (5 × 100).
- The misconception tags are real — `money_value_or_notation` and `cardinality_count_to_total` are both in the Grade 1 taxonomy.

### 7.4 Common Grade 1 math pitfalls to avoid

- **Stems that use addition keywords ambiguously.** "Maya had 8 stickers. Now she has 13." can be solved by `13 − 8` or `8 + ? = 13` — the latter is what 1.5F tests, the former is 1.3B. Pick a side and write to it.
- **Distractors that aren't on the wrong-thinking path.** If your distractors are "12, 13, 14, 15" they don't encode misconceptions — they encode noise. Each wrong number must come from a real error pattern.
- **Place-value stems that exceed 120.** A 1st-grader works up to 120 only. 145, 200, 1000 are out.
- **Coin questions involving quarters when the standard only requires recognizing them.** 1.4A is recognition; 1.4C is counting. Don't ask a kid to count three quarters and a nickel.

---

## 8. Reading authoring playbook

### 8.1 Author passages first, then questions

You cannot insert a reading question without a `passage_id`. So: build the passage, insert it, capture the returned id, then write the 4–6 questions that anchor to it. Do this in one transaction per passage.

**Passage word counts by RIT band:**

| Band | Word count | Lexile estimate |
|---|---:|---:|
| `below_161` | 30–60 | 100L–200L |
| `161_170` | 40–70 | 150L–280L |
| `171_180` | 50–80 | 220L–380L |
| `181_190` | 60–90 | 320L–450L |
| `191_200` | 70–100 | 400L–530L |

Lexile is estimated, not measured. You don't need a real Lexile API — pick a value inside the range that reflects the sentence complexity and vocabulary level.

### 8.2 Genre distribution across the Grade 1 reading bank

| Genre | % of passages | Approx count (of ~30) |
|---|---:|---:|
| literary | 50% | 15 |
| informational | 35% | 10 |
| poetry | 10% | 3 |
| drama | 5% | 2 |

Drama at Grade 1 is a tiny play with two speakers — keep it minimal. Poetry is rhyming, structured, and about something a 1st-grader cares about (animals, weather, family). Informational is concrete topics with familiar vocabulary (how plants grow, how a school day works).

### 8.3 Passage authoring rules

1. **Concrete settings** — family, school, parks, pets, weather, food. Avoid abstract or time-travel-y settings.
2. **Two characters maximum** in literary passages. Three+ overwhelms a 1st-grader.
3. **Short sentences** — average ~8 words per sentence at the on-grade band. Long compound sentences belong to Grade 3.
4. **One main event, one resolution** for narratives. No subplots.
5. **High-frequency vocabulary** — same ~500-word rule as stems, but with room for one or two passage-specific content words (the names of animals, weather words, place words).
6. **No politically or culturally divisive content** — no holidays as the main topic if the holiday is contested, no real public figures, no current events.

### 8.4 Question-per-passage coverage

Each passage gets 4–6 questions. Across the questions for a single passage, hit a mix:

- One **main idea** or **theme** question (links to 1.6.G or 1.8.A)
- One **detail / evidence** question (links to 1.6.F or 1.7.C)
- One **vocabulary in context** question (links to 1.3.B or 1.3.D)
- One **inference** or **prediction** question (links to 1.6.C or 1.6.F)
- (For literary) One **character / setting** question (links to 1.8.B or 1.8.D)
- (For informational) One **text features** question (links to 1.9.D.ii or 1.10.C)

Don't write all six question types for every passage. Pick the four most appropriate.

### 8.5 Reading example (canonical reference)

**Passage:**

```
Title: The Lost Sock
Genre: literary
Word count: 62
RIT band: 171_180
Lexile: 320

Body:
Liam looked under his bed.
He looked behind the couch.
He looked in the laundry basket.
He could not find his red sock.
"Maya, have you seen my red sock?" Liam asked.
Maya laughed. "It is on your foot, Liam!"
Liam looked down. His red sock was right there.
He felt silly, but he laughed too.
```

**Question 1 (main idea, 1.6.G):**

```json
{
  "stem": "What is this story mostly about?",
  "stem_image_svg": null,
  "explanation": "The whole story is about Liam looking for a sock that was on his foot the whole time. The other choices are details from one part of the story.",
  "source_note": "Khan Academy: Reading comprehension",
  "choices": [
    { "label": "A", "body": "Maya is laughing at Liam.", "is_correct": false,
      "misconception": "Picked a single moment from the story instead of what the whole story is about.",
      "misconception_tag": "main_idea_picked_detail" },
    { "label": "B", "body": "Liam looks for his sock and finds it on his foot.", "is_correct": true,
      "misconception": null, "misconception_tag": null },
    { "label": "C", "body": "Liam has a messy room.", "is_correct": false,
      "misconception": "Inferred something the story never says.",
      "misconception_tag": "inferred_without_evidence" },
    { "label": "D", "body": "Maya helps Liam clean up.", "is_correct": false,
      "misconception": "Picked an event that doesn't happen in the story.",
      "misconception_tag": "inferred_without_evidence" }
  ]
}
```

### 8.6 Common Grade 1 reading pitfalls

- **Writing a Grade 3 passage with shorter sentences.** A Grade 1 passage isn't just shorter — it's more concrete, has fewer characters, and uses high-frequency words. "The exuberant puppy bounded" is wrong even at five words.
- **Asking inference questions with no textual basis.** If the passage doesn't say *why* a character feels a certain way, don't ask. The kid will guess and you can't tag the misconception.
- **Distractors that are off-topic.** "Liam is a fish" is not a misconception — it's nonsense. Distractors must be plausible-but-wrong.
- **Vocabulary questions where the word isn't in the passage.** Test words *in context*; that's the whole point of 1.3.B.

---

## 9. Language authoring playbook

### 9.1 Question shapes that work at Grade 1

Grade 1 language is MCQ-only. These are the formats that work:

1. **Fill in the blank.** "Maya ___ to school every day." with verb-tense or article options.
2. **Pick the correct sentence.** Four versions of a sentence, one with correct grammar. Keep all four sentences under 8 words.
3. **Pick the synonym / antonym.** "Which word means the **opposite** of *big*?" with four options.
4. **Pick the correct spelling.** Four close variants, one is correct. Use sight words from the high-frequency list.
5. **Pick the right word for the meaning.** "Which word means *not happy*?" tests `un-` prefix without saying "prefix".
6. **Pick the matching plural / pronoun.** "Which is the plural of *foot*?"

### 9.2 Avoid metalinguistic terms

A 1st-grader doesn't know "noun", "verb", "adjective", "adverb", or "preposition" by name. Phrase questions around what the word *does*, not what it's called:

| Don't write | Write instead |
|---|---|
| "Which word is a noun?" | "Which word names a thing?" |
| "Which word is a verb?" | "Which word shows an action?" |
| "Which word is an adjective?" | "Which word tells what the cat is like?" |
| "Which is the proper noun?" | "Which word should start with a capital letter?" |
| "Which word is a preposition?" | "Which word tells where the cat is?" |
| "What is the verb tense?" | "Which sentence is about something that already happened?" |

### 9.3 Language example (canonical reference)

**Standard:** `1.11.D.iv` (Adjectives, including articles)
**RIT band:** `161_170`
**Difficulty:** `easy`

```json
{
  "stem": "Pick the right word: \"Aarav has ___ apple.\"",
  "stem_image_svg": null,
  "explanation": "Apple starts with a vowel sound, so we use \"an\" instead of \"a\". \"Aarav has an apple.\"",
  "source_note": "Khan Academy: Grammar",
  "choices": [
    { "label": "A", "body": "a", "is_correct": false,
      "misconception": "Didn't use the vowel-sound rule that calls for \"an\".",
      "misconception_tag": "article_a_an_misuse" },
    { "label": "B", "body": "an", "is_correct": true,
      "misconception": null, "misconception_tag": null },
    { "label": "C", "body": "the", "is_correct": false,
      "misconception": "Picked a definite article when an indefinite one was needed.",
      "misconception_tag": "article_a_an_misuse" },
    { "label": "D", "body": "and", "is_correct": false,
      "misconception": "Confused \"and\" (joining word) with \"an\" (article).",
      "misconception_tag": "article_a_an_misuse" }
  ]
}
```

### 9.4 Common Grade 1 language pitfalls

- **Using grammar terminology kids haven't been taught.** See §9.2.
- **Distractors that are obvious noise.** "Maya rocket the school" is not a misconception — it's gibberish. Distractors must be plausible mistakes a 1st-grader actually makes.
- **Spelling questions with words outside the high-frequency list.** Test "said", "was", "they", "you", "are", "have" — not "yacht", "biscuit", "though".
- **Punctuation questions that require parsing dialogue.** Quotation marks for dialogue aren't a Grade 1 standard — that's Grade 2. Stick to end punctuation, capitalization, and basic sentence completeness.

---

## 10. The author prompt template

Use this exact prompt with the LLM that's authoring batches. Replace `{{...}}` placeholders. Generate **5 questions per call** — quality drops above that.

```
You are authoring practice questions for a Grade 1 MAP-style test, aligned to Texas TEKS.

Standard: {{teks_code}} — {{teks_title}}
Subject: {{math|reading|language}}
Khan Academy unit reference: {{khan_unit}}
Target RIT band: {{rit_band}}  (centroids: below_161=156, 161_170=165, 171_180=175, 181_190=185, 191_200=195)
Difficulty: {{easy|medium|hard}}

For reading questions only, the passage is:
"""
{{passage_body}}
"""

Author 5 questions. For each, output a JSON object with this exact shape:

{
  "stem": "string — the question text, ≤ 15 words, age-appropriate",
  "stem_image_svg": "string or null — inline <svg>...</svg>. Pure inline vector for everything EXCEPT money. For money (1.4 series only), use <image href=\"/assets/<file>\"/> inside an <svg> wrapper. See allowed asset list below.",
  "explanation": "string — teach the solution method, do not just state the answer",
  "source_note": "Khan Academy: {{khan_unit}}",
  "passage_id": "{{passage_uuid_or_null}}",
  "choices": [
    { "label": "A", "body": "...", "is_correct": false,
      "misconception": "specific Grade 1 thinking error in one sentence",
      "misconception_tag": "exact tag from the allowed list below" },
    { "label": "B", "body": "...", "is_correct": true,
      "misconception": null, "misconception_tag": null },
    { "label": "C", "body": "...", "is_correct": false,
      "misconception": "...", "misconception_tag": "..." },
    { "label": "D", "body": "...", "is_correct": false,
      "misconception": "...", "misconception_tag": "..." }
  ]
}

ALLOWED money asset paths (use ONLY these, exact filenames, case-sensitive):
  /assets/penny.jpg
  /assets/nickel.webp        (note: .webp, not .jpg)
  /assets/dime.jpg
  /assets/quarter.jpeg       (note: .jpeg, not .jpg)
  /assets/dollarbill.jpg
  /assets/five_dollar_bill.jpg

Money question SVG layout: 80x80 px per coin, 100px apart, ordered left-to-right by descending value (quarters, dimes, nickels, pennies). Bills come before coins. Example wrapper: <svg viewBox="0 0 500 80" xmlns="http://www.w3.org/2000/svg">...</svg>

ALLOWED misconception_tag values for {{subject}}:
{{paste the relevant table from §5}}

Hard requirements:
- Stems ≤ 15 words.
- Exactly one is_correct = true. Distribute correct-answer position across A/B/C/D over the batch.
- Every distractor's misconception_tag is from the allowed list. Do not invent new tags.
- Every distractor's misconception field is a specific Grade 1 thinking error, not generic ("got it wrong").
- Use Maya, Ethan, Priya, Liam, Ava, Aarav, Zoe, Mia, Noah, Leo, Isla. No Sarah/John clichés.
- Math: number range stays under 120 in 1.2 series, under 20 elsewhere.
- Money (1.4 series): coin totals stay under $1; bill+coin combinations only when the answer is clean.
- Reading: every question references the passage above. No figures.
- Language: phrase grammar questions around meaning, not metalinguistic terms. No figures.
- For figures: inline SVG for ten-frames/number lines/shapes/graphs/clocks; image refs ONLY for money and ONLY from the allowed asset list above.
- Vocabulary stays inside the most-common ~500 English words unless the question tests vocab.
- Output ONLY a JSON array of 5 objects. No prose, no markdown fences.
```

After receiving the JSON array from the model, **validate it before insert** (see §11).

---

## 11. Pre-insert validation

Run these checks on every batch *before* inserting. Failed checks mean stop and fix, not warn-and-proceed.

### 11.1 JSON shape checks

For each question object:
- Has all required fields: `stem`, `explanation`, `source_note`, `choices`
- `choices` is exactly 4 items
- Exactly one choice has `is_correct = true`
- All four labels are distinct and are A, B, C, D
- For all `is_correct = false` choices: `misconception` is a non-empty string and `misconception_tag` is non-null
- For the `is_correct = true` choice: both `misconception` and `misconception_tag` are null

### 11.2 Tag membership check

For each distractor's `misconception_tag`, verify it appears in the allowed list for the subject (§5). A typo here will cause silent insert failure or pollute the signal.

### 11.3 SVG hygiene check

If `stem_image_svg` is non-null:
- Starts with `<svg` and ends with `</svg>`
- Length is under 4000 characters (longer is usually a sign of bloated output)
- Contains no `src=` attributes
- Any `href=` attributes reference **only** these six exact paths (case-sensitive):
  - `/assets/penny.jpg`
  - `/assets/nickel.webp`
  - `/assets/dime.jpg`
  - `/assets/quarter.jpeg`
  - `/assets/dollarbill.jpg`
  - `/assets/five_dollar_bill.jpg`
- If the question is **not** about money (subject != math, or standard not in 1.4 series), `href` must not appear at all
- If `href` does appear, every reference must be inside an `<image ...>` tag (not an `<a>` link or anything else)

### 11.4 Word count check on stem

Count words in `stem`. If > 15, reject.

### 11.5 For reading questions only

`passage_id` is non-null and references a passage that exists.

---

## 12. SQL insert pattern

Use this exact pattern. It is one transaction per question (or one transaction per passage + its questions, for reading).

### 12.1 Math or language question

```sql
WITH new_q AS (
  INSERT INTO map_questions
    (subject, grade, standard_id, rit_band, difficulty,
     stem, stem_image_svg, audio_supported, explanation, source_note,
     question_format, is_active)
  VALUES ('math', 1,
          (SELECT id FROM map_standards
           WHERE teks_code = '1.3D' AND subject = 'math' AND grade = 1),
          '171_180', 'medium',
          $stem$Maya has 8 stickers. Liam gives her 5 more. How many now?$stem$,
          $svg$<svg viewBox="0 0 400 100" xmlns="http://www.w3.org/2000/svg">...</svg>$svg$,
          true,
          $exp$8 + 5 = 13. Make a ten: 8 + 2 = 10, then 10 + 3 = 13.$exp$,
          'Khan Academy: Addition and subtraction within 20',
          'mcq', true)
  RETURNING id
)
INSERT INTO map_question_choices
  (question_id, label, body, is_correct, misconception, misconception_tag, sort_order)
SELECT id, c.label, c.body, c.is_correct, c.misconception, c.misconception_tag, c.sort_order
FROM new_q,
(VALUES
  ('A','12', false,
   'Counted on from 8 but stopped one short.',
   'off_by_one_count', 1),
  ('B','13', true,  NULL, NULL, 2),
  ('C','3',  false,
   'Subtracted 5 from 8 instead of adding.',
   'operation_swap_add_subtract', 3),
  ('D','85', false,
   'Wrote the digits side-by-side instead of adding.',
   'place_value_concatenated_digits', 4)
) AS c(label, body, is_correct, misconception, misconception_tag, sort_order);
```

Use `$tag$...$tag$` dollar-quoting for any text that might contain quotes or apostrophes. The custom tags (`$stem$`, `$svg$`, `$exp$`) keep adjacent strings unambiguous.

### 12.2 Reading: passage + questions in one transaction

```sql
BEGIN;

WITH new_p AS (
  INSERT INTO map_reading_passages
    (title, body, genre, word_count, lexile, rit_band, source, topic)
  VALUES ('The Lost Sock',
          $body$Liam looked under his bed.
He looked behind the couch.
... [62 words]$body$,
          'literary', 62, 320, '171_180', 'original', 'family-life')
  RETURNING id
)
INSERT INTO map_questions
  (subject, grade, standard_id, passage_id, rit_band, difficulty,
   stem, stem_image_svg, audio_supported, explanation, source_note,
   question_format, is_active)
SELECT 'reading', 1,
       (SELECT id FROM map_standards
        WHERE teks_code = '1.6.G' AND subject = 'reading' AND grade = 1),
       new_p.id, '171_180', 'medium',
       'What is this story mostly about?', NULL, true,
       'The whole story is about Liam looking for a sock...',
       'Khan Academy: Reading comprehension',
       'mcq', true
FROM new_p
RETURNING id;
-- ... then INSERT the 4 choices for each returned question id
-- Repeat the above pattern for each of the 4–6 questions on this passage

COMMIT;
```

For reading, prefer to script the multi-question insert in your authoring tool rather than as one giant SQL block — you'll need to capture multiple `RETURNING id` values to attach choices to each question.

### 12.3 Service role required

The catalog tables (`map_standards`, `map_questions`, `map_question_choices`, `map_reading_passages`, `map_misconception_tags`) have RLS with **SELECT-only** policies for the `authenticated` role. INSERT must be done with the service role key, or via Supabase migration tooling. Inserts via anon/authenticated keys will silently produce zero rows — not an error, just nothing.

If you're using the Supabase MCP tools, `apply_migration` is the right channel for batches. `execute_sql` runs as service role and is fine for one-off inserts.

---

## 13. Post-insert validation queries

Run these after every batch. They are the same queries from `GRADE1_SEEDING_GUIDE.md` §8, scoped to recently-inserted Grade 1 questions.

### 13.1 Per-standard coverage

```sql
SELECT s.subject, s.teks_code, s.teks_title, count(q.id) AS n
FROM map_standards s
LEFT JOIN map_questions q ON q.standard_id = s.id AND q.grade = 1
WHERE s.grade = 1
GROUP BY s.id, s.subject, s.teks_code, s.teks_title
ORDER BY s.subject, n ASC, s.sort_order;
```

Author for the lowest-coverage standards first.

### 13.2 RIT band distribution

```sql
SELECT subject, rit_band, count(*) AS n,
       round(100.0 * count(*) / sum(count(*)) OVER (PARTITION BY subject), 1) AS pct
FROM map_questions WHERE grade = 1
GROUP BY subject, rit_band
ORDER BY subject, rit_band;
```

Should roughly match §2 within ±5 percentage points per band.

### 13.3 Misconception tag hygiene

```sql
-- Every Grade 1 distractor has a tag
SELECT count(*) AS untagged_grade1
FROM map_question_choices c
JOIN map_questions q ON q.id = c.question_id
WHERE q.grade = 1 AND c.is_correct = false
  AND c.misconception_tag IS NULL;
-- expect 0
```

```sql
-- Every Grade 1 distractor's tag actually exists in the taxonomy (FK check)
SELECT count(*) AS bad_tags
FROM map_question_choices c
JOIN map_questions q ON q.id = c.question_id
LEFT JOIN map_misconception_tags t ON t.tag = c.misconception_tag
WHERE q.grade = 1 AND c.is_correct = false
  AND c.misconception_tag IS NOT NULL
  AND t.tag IS NULL;
-- expect 0
```

```sql
-- _misc_other usage stays under 5%
SELECT count(*) FILTER (WHERE c.misconception_tag = '_misc_other')::float
       / NULLIF(count(*), 0) AS misc_other_share
FROM map_question_choices c
JOIN map_questions q ON q.id = c.question_id
WHERE q.grade = 1 AND c.is_correct = false;
-- expect < 0.05
```

### 13.4 SVG hygiene

```sql
-- Find any non-money question (standard not in 1.4 series) that uses href/src in its SVG.
-- These are violations — non-money figures must be pure inline SVG.
SELECT q.id, s.teks_code, q.stem
FROM map_questions q
JOIN map_standards s ON s.id = q.standard_id
WHERE q.grade = 1
  AND s.teks_code NOT LIKE '1.4%'
  AND q.stem_image_svg IS NOT NULL
  AND (q.stem_image_svg LIKE '%href=%' OR q.stem_image_svg LIKE '%src=%')
LIMIT 50;
-- expect 0 rows
```

```sql
-- Find any money question that references an asset path NOT in the allowed list.
-- These are typos that will 404 silently in production.
WITH g1_money AS (
  SELECT q.id, q.stem_image_svg
  FROM map_questions q
  JOIN map_standards s ON s.id = q.standard_id
  WHERE q.grade = 1 AND s.teks_code LIKE '1.4%'
    AND q.stem_image_svg IS NOT NULL
),
extracted_paths AS (
  SELECT id, regexp_matches(stem_image_svg, 'href="([^"]+)"', 'g') AS m
  FROM g1_money
)
SELECT id, m[1] AS bad_path
FROM extracted_paths
WHERE m[1] NOT IN (
  '/assets/penny.jpg',
  '/assets/nickel.webp',
  '/assets/dime.jpg',
  '/assets/quarter.jpeg',
  '/assets/dollarbill.jpg',
  '/assets/five_dollar_bill.jpg'
)
LIMIT 50;
-- expect 0 rows
```

Common typos this will catch: `quarter.jpg` (should be `.jpeg`), `nickel.jpg` (should be `.webp`), `dollar_bill.jpg` (should be `dollarbill.jpg`), `5_dollar_bill.jpg` (should be `five_dollar_bill.jpg`), or paths missing the leading `/` or `/assets/`.

```sql
-- Reading and language questions never use figures at Grade 1.
SELECT count(*) AS reading_or_language_with_svg
FROM map_questions
WHERE grade = 1
  AND subject IN ('reading','language')
  AND stem_image_svg IS NOT NULL;
-- expect 0
```

### 13.5 Cross-grade integrity

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

-- No Grade 1 non-reading question has a passage_id
SELECT count(*) FROM map_questions
WHERE grade = 1 AND subject IN ('math','language') AND passage_id IS NOT NULL;
-- expect 0
```

### 13.6 Stem length spot-check

```sql
-- Stems over 15 words (rough word count via space-counting)
SELECT id, stem, array_length(string_to_array(stem, ' '), 1) AS word_count
FROM map_questions
WHERE grade = 1
  AND array_length(string_to_array(stem, ' '), 1) > 15
ORDER BY word_count DESC
LIMIT 20;
-- review and rewrite or accept if borderline
```

---

## 14. Order of operations (the seeding loop)

This is the loop you run, not a one-shot. Each pass picks one `(subject, standard, rit_band)` and authors 5 questions.

```
1. Run §13.1 to find the (subject, standard) with lowest coverage.
2. Pick a target rit_band based on the §2 distribution and current actual distribution.
3. If subject = reading, check whether you need a new passage:
     - If existing passages have unfilled question slots (< 6 questions), add to them.
     - Otherwise, author a new passage first (§8.1) and capture its uuid.
4. Run the §10 author prompt with the chosen (standard, rit_band, difficulty,
    optional passage_body).
5. Receive JSON array of 5 questions.
6. Run §11 pre-insert validation. If any check fails: stop, fix, re-prompt or hand-edit.
7. Run §12 SQL inserts (service role). Use a transaction per passage for reading.
8. Run §13 post-insert validation. Investigate any non-zero result before continuing.
9. Loop back to step 1.
```

Continue until §2 totals are met and §13.1 shows no standard below its floor.

---

## 15. What NOT to do

Hard rules that override any other instruction in this document:

1. **Never use `edit_pick` or `sentence_combine` formats for Grade 1.** MCQ only.
2. **Never reference external images in `stem_image_svg` except the six money assets in §3.1.** Money questions use real coin/bill photos; everything else is pure inline vector.
3. **Never invent new misconception tags during authoring.** If a real gap exists, surface it; the taxonomy is amended through the audit process in `GRADE1_SEEDING_GUIDE.md` §5, not mid-batch.
4. **Never use `_misc_other` casually.** It's a last resort and pollutes the signal.
5. **Never author a stem over 15 words** because "the question really needs the context." Use a figure or rewrite.
6. **Never put the correct answer in B every time.** Distribute across A/B/C/D.
7. **Never insert questions before passages for reading.** The FK will fail.
8. **Never use `authenticated`-role keys for inserts.** Service role only.
9. **Never bulk-generate more than 5 questions per LLM call.** Quality collapses.
10. **Never proceed past a §13 validation failure.** Investigate first.

---

## 16. When in doubt

- If the author prompt is producing repetitive questions on a standard, the standard's question-shape diversity is exhausted at that band. Move to a different band or different standard.
- If a misconception tag's free-text field is hard to write, the distractor probably isn't a real misconception. Rewrite the distractor.
- If a passage feels too sophisticated when read aloud, it's too sophisticated. Cut a sentence.
- If two distractors describe the same misconception, you have only three real options. Rewrite one.
- If the SVG won't fit in 4000 characters, simplify. A 1st-grader doesn't need photorealism.
- If a TEKS code's title and the question you want to write don't match, you're authoring against the wrong standard. Stop and pick the right one.

---

## 17. Hand-off checklist before declaring Grade 1 questions done

- [ ] Math total ≥ 360, every standard ≥ 8 questions
- [ ] Reading total ≥ 150, ~30 passages, every passage has 4–6 questions
- [ ] Language total ≥ 140, every standard ≥ 12 questions
- [ ] §13.1 — no standard below floor
- [ ] §13.2 — band distribution within ±5pp of targets per subject
- [ ] §13.3 — zero untagged distractors, zero bad tags, `_misc_other` < 5%
- [ ] §13.4 — zero SVG external references
- [ ] §13.5 — zero cross-grade mismatches, all reading questions have passages, no non-reading questions have passages
- [ ] §13.6 — stem-length outliers reviewed
- [ ] Spot-read 10 random questions per subject — would a 1st-grader make sense of them when read aloud?

When the checklist is clean, Grade 1 question seeding is done. The next phase (test composer grade-awareness, Grade 1 RIT estimator calibration) is downstream code work — not authoring.
