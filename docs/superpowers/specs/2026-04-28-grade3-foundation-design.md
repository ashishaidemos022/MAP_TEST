# Grade 3 Foundation — Design (Option A)

**Date:** 2026-04-28
**Source brief:** `Grade3_Seeding_Brief.md`
**Scope:** Foundation work only. No bulk question authoring. Apply schema deltas, seed TEKS catalog, anchor each subject with one sample batch, ship two helper scripts, update `CLAUDE.md`.

---

## 1. State of the world (before this work)

Discovered by querying the live Supabase project `mnrseaapxpofdznnqrsv`:

| Brief item | Status | Notes |
|---|---|---|
| §3.1 — `language` in `map_subject` enum | ✅ already applied | migration `map_add_language_subject` (2026-04-27) |
| §3.2 — `chk_reading_has_passage` allows language items | ✅ correct as-is | constraint reads `((subject <> 'reading') OR (passage_id IS NOT NULL))` |
| §3.3 — `map_question_choices.misconception_tag` + index | ✅ already applied | `map_taxonomy_extensions_and_language_tags` |
| §3.4 — `map_questions.question_format` column | ❌ missing | needed for `edit_pick`/`sentence_combine` |
| §3.5 — `idx_map_questions_grade_subject_band` | ❌ missing | only `idx_map_q_subject_band` (no `grade`) exists |
| Grade 3 standards (any subject) | ❌ none | brief specifies 28 + 18 + 16 = 62 rows |
| Grade 3 questions | ❌ none | brief targets 600 + 480 + 320 = 1400 (out of scope here) |

Grade 2 already has 37 math + 24 reading + 20 language standards, so the language-as-subject precedent in this codebase is established. The Grade 2 author prompt template in `CLAUDE.md` §4.3 already requires `misconception_tag` on every distractor (per the precedent set by Grade 2 language and the mastery-tracker work).

## 2. Deliverables

### 2.1 Migration: `map_grade3_question_format_and_index`

```sql
ALTER TABLE map_questions
  ADD COLUMN IF NOT EXISTS question_format text
    DEFAULT 'mcq'
    CHECK (question_format IN ('mcq', 'edit_pick', 'sentence_combine'));

CREATE INDEX IF NOT EXISTS idx_map_questions_grade_subject_band
  ON map_questions(grade, subject, rit_band)
  WHERE is_active;
```

Decision: include §3.4 even though the brief calls it optional. Pattern A (edit_pick) and Pattern C (sentence_combine) from §7.3 read as a different UI shape than a stem-with-four-choices. Costs nothing now; lets the runner branch on it later without another migration.

### 2.2 Migration: `map_seed_grade3_teks_standards`

Inserts the 62 standards verbatim from brief §5.1 / §5.2 / §5.3. Idempotent via `ON CONFLICT (subject, grade, teks_code) DO NOTHING` (or equivalent unique constraint check). Validates with `count(*) = 62` grouped by subject before commit.

### 2.3 Migration: `map_seed_grade3_math_sample` — 5 questions on `3.4F`

Standard: `3.4F` (Multiplication facts to 10×10).
RIT band: `181_190` (mid-Grade-3 anchor).
Pattern: 3 with arrays in `stem_image_svg` (per §7.1 "use SVG arrays or area models for at least one of every three"), 2 plain.
Every distractor carries a `misconception_tag` from §7.4 (`mult_as_addition`, `mult_off_by_one_factor`, `mult_skip_count_error`, etc.).
`grade=3`, `subject='math'`, `question_format='mcq'`.

### 2.4 Migration: `map_seed_grade3_reading_sample` — 1 passage + 5 questions on `3.6F`

Passage: ~240-word informational about monarch migration (genre `informational`, RIT band `191_200`, lexile estimate ~620L).
Questions: 1 main idea, 1 inference, 1 vocabulary in context, 1 text-feature-ish, 1 author's purpose. Anchored to mixed standards but each row's `standard_id` honors §13's "pick the closer-to-tested" rule. The brief's §7.2 "one main-idea question per passage maximum" is honored (exactly 1).
Distractors carry `misconception_tag` (`main_idea_picked_detail`, `inference_literal_only`, `vocab_similar_word`, etc.).

### 2.5 Migration: `map_seed_grade3_language_sample` — 5 questions across patterns A/B/C

- 2 Pattern A (`edit_pick`) — pronoun (3.11D.vii) and subject-verb agreement (3.11D.i)
- 2 Pattern B (`mcq` cloze) — homophone (3.2C.ii) and prepositional phrase (3.11D.vi)
- 1 Pattern C (`sentence_combine`) — coordinating conjunction (3.11D.viii)

Tags: `pronoun_object_as_subject`, `subject_verb_plural_singular`, `homophone_their_there`, `comma_splice`, etc. — established Grade 2 tags reused where applicable so the misconception taxonomy doesn't sprawl across grades.

### 2.6 `scripts/grade3-coverage.mjs`

Reads `src/lib/supabase.ts` client. Runs and prints, in order:

1. Per-standard coverage (brief §10 query 1) — flag any standard with < 6 questions in red
2. Misconception-tag rollup (§10 query 2) — sorted by uses, flag tags used only once
3. Untagged-distractor count (§10 query 3) — must be 0 by end of each authoring day

Run: `node scripts/grade3-coverage.mjs`

### 2.7 `scripts/grade3-author-prompt.mjs`

Args: `--subject <math|reading|language> --teks <code> --band <rit_band> [--count 5]`
Reads the standard's `teks_title`, `teks_description`, `khan_unit` from the DB.
Prints the §7.4-extended author prompt (§4.3 in CLAUDE.md, plus the `misconception_tag` field) with placeholders filled. No live LLM call — prompt-as-text only. The output is paste-ready into a Claude/Sonnet conversation that returns JSON, which then becomes the next migration.

### 2.8 `CLAUDE.md` update

Append section to existing file (do not replace anything). Captures:

- §1 update: subjects now `math | reading | language`, grades supported `2 | 3`
- §3 enum: `language` is now in `map_subject`; `map_question_choices.misconception_tag` exists; `map_questions.question_format` exists
- §4 adds Grade 3 deltas: name additions (Noor, Diego, Mei, Caleb), 35-word stem ceiling (Pattern A/C exempt), tier-2-not-tier-3 vocab rule, two-step-problem requirement
- §5 RIT band targets per subject for Grade 3 (table from brief §4)
- §7.3 Three language patterns + when to use each `question_format` value
- §7.4 `misconception_tag` is required on every distractor at author time (this is the firm rule going forward; Grade 2 was a soft rule)
- New §9: pointer to `scripts/grade3-coverage.mjs` and `scripts/grade3-author-prompt.mjs`

## 3. What's deliberately not in scope

- Bulk authoring of remaining ~1395 questions
- Mini-lessons, MCP recommendation layer (Appendix A of brief)
- Grade picker UI gate (brief §12)
- Backfill of Grade 2 distractors (brief §12)
- Auth / RLS

## 4. Verification gate

Before declaring done, all of these must pass against `mnrseaapxpofdznnqrsv`:

```sql
-- (a) enum has language
SELECT enumlabel FROM pg_enum WHERE enumtypid='map_subject'::regtype;
-- expect: math, reading, language

-- (b) Grade 3 standards
SELECT subject, count(*) FROM map_standards WHERE grade=3 GROUP BY subject;
-- expect: math 28, reading 18, language 16

-- (c) Grade 3 questions present
SELECT subject, count(*) FROM map_questions WHERE grade=3 GROUP BY subject;
-- expect: math 5, reading 5, language 5

-- (d) no untagged Grade 3 distractors
SELECT count(*) FROM map_question_choices c
JOIN map_questions q ON q.id = c.question_id
WHERE q.grade=3 AND c.is_correct=false AND c.misconception_tag IS NULL;
-- expect: 0

-- (e) every Grade 3 question has exactly 4 choices, one correct
SELECT q.id FROM map_questions q
JOIN map_question_choices c ON c.question_id = q.id
WHERE q.grade=3
GROUP BY q.id
HAVING count(*) <> 4 OR count(*) FILTER (WHERE c.is_correct) <> 1;
-- expect: 0 rows
```

Plus: `node scripts/grade3-coverage.mjs` runs without error and prints a sane report.

## 5. Risk / open questions

- The `question_format` column defaults to `'mcq'`, which is correct for all existing Grade 2 rows. No backfill needed — the default handles it.
- Sample-batch authoring is human-in-the-loop quality work. The agent does the writing here in this session and embeds it directly into migrations rather than generating a JSON file and inserting separately. This is a one-time exception (5 questions per subject); for ongoing batch authoring, use `scripts/grade3-author-prompt.mjs` to generate a prompt, paste into a fresh Claude window, get JSON back, then write a migration to insert.
- Brief §6 says "Generate in batches of 5 per (standard, band) cell." Sample batches honor this — math sample is 5 on one cell, reading sample is 5 on one passage (which is one band), language sample mixes patterns within one band but stays at 5 total. The brief's §7.3 caveat ("don't mix patterns within a single 5-question batch — it diffuses the authoring focus") is consciously broken once for the language sample so all three patterns are exercised at minimum cost; future language batches will follow the rule.
