# CLAUDE.md — MAP Practice Test App (Phase 1: Grade 2)

This file is the operating manual for Claude (and any AI assistant) working on this codebase. Read it before doing anything. Update it when decisions change.

---

## 1. Project intent

A web app for a 2nd-grader to take MAP-style practice tests in **Math** and **Reading**. Each test is **25 multiple-choice questions** drawn from a question bank of **400 math** and **400 reading** items. Reading questions are anchored to passages.

**Built for one user (a single child) first.** Multi-tenant auth, RLS, and parent dashboards come later. Don't over-engineer Phase 1.

### Design pillars
- **Curriculum-honest.** Every question is tagged to a specific Texas TEKS standard (Plano ISD aligns to TEKS) and cross-walked to a Khan Academy unit and an NWEA MAP goal area.
- **MAP-shaped and band-adaptive (Phase 2 ✅).** Questions carry a `rit_band`. The adaptive composer steps the band ±1 based on rolling accuracy of the last 5 answers, capped at ±2 from the student's start band. Reading adapts at passage boundaries. See §5.2.
- **Distractors with intent.** Every wrong answer encodes a specific misconception (off-by-one, place-value swap, misreading the operation). Authoring discipline matters more than question count.
- **Read-aloud by default.** A 2nd-grader is still a developing reader. Every question supports browser TTS via `window.speechSynthesis`.

---

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React + Vite + TypeScript + Tailwind | Single-page app, big tap targets, kid-friendly |
| Data | Supabase (project `klhzfwxpztaojekwgzcg`) | All tables prefixed `map_`. Connection details live in `.env.local` (see `.env.example`). Run scripts with `node --env-file=.env.local scripts/<name>.mjs`. |
| Auth | None in Phase 1 | Local single-student row. Add Supabase Auth in Phase 2. |
| TTS | Browser `window.speechSynthesis` | Free, offline, no API keys |
| Hosting | Vercel | Standard Vite output |

---

## 3. Database schema (already applied)

All tables are prefixed `map_` and live in the `public` schema of project `klhzfwxpztaojekwgzcg` ("Practice Tests").

```
map_standards            -- TEKS catalog (37 math + 24 reading rows seeded)
map_reading_passages     -- Reading passages (1:N with questions)
map_questions            -- Question stems (N:1 to standards, optional N:1 to passage)
map_question_choices     -- 4 choices per question, exactly one is_correct = true
map_students             -- Lightweight: 1 row in Phase 1
map_test_sessions        -- A 25-question test attempt
map_attempts             -- Per-question answer events inside a session
map_v_student_question_stats  -- View for spaced repetition
```

### Key enums
- `map_subject`: `math` | `reading` | `language` (language enters at Grade 3 — see §9)
- `map_difficulty`: `easy` | `medium` | `hard`
- `map_rit_band`: `below_161` | `161_170` | `171_180` | `181_190` | `191_200` | `201_210` | `above_210`
- `map_passage_genre`: `literary` | `informational` | `poetry` | `drama`

### RIT bands for Grade 2 (NWEA 2020 norms)
Beginning of year ~ 160. Middle ~ 175. End ~ 188. Above-grade-level ~ 200+. Use these as the centroid when assigning questions to bands. Above-grade-level (`above_210`) questions are valuable for stretch — keep ~10% of the bank there.

### Constraints worth knowing
- `map_questions.passage_id` is **required** when `subject = 'reading'` (CHECK constraint `chk_reading_has_passage`).
- `map_question_choices` is unique on `(question_id, label)`. Labels are always `'A'..'D'`.
- `map_test_sessions.question_ids` is `uuid[]` — order is preserved, so `current_index` indexes into it.

### Schema diagram

```
map_standards ─┐
               │ N
               ▼
map_questions ─┐──────────► map_question_choices (1:4)
   ▲ N         │
   │ (reading) │
map_reading_passages
                            map_test_sessions ──► map_attempts ──► map_questions
                                  ▲                    │
                                  │                    │
                            map_students ──────────────┘
```

---

## 4. The question bank — generation playbook

This is the part that needs the most care. **Do not bulk-generate 800 questions in one prompt.** Quality collapses. Generate in batches of ~25 per standard, one standard at a time, then spot-review.

### 4.1 Targets

| Subject | Total | Per standard (avg) | Per RIT band |
|---|---|---|---|
| Math | 400 | ~11 (37 standards) | 50–60 per band, weighted toward `181_190` and `191_200` |
| Reading | 400 | ~17 (24 standards) | Same band weighting |
| Reading passages | ~80 | n/a | 4–6 questions per passage on average |

### 4.2 Authoring rules — apply to every question

1. **Stem clarity.** A 2nd-grader must be able to decode the stem without help. Aim for ≤ 25 words. Use familiar names and contexts (Maya, Ethan, Priya, classroom, recess, family, pets, sports — including cricket, since this is Texas).
2. **Exactly four choices, exactly one correct.** Labels A/B/C/D. Don't use "All of the above."
3. **Each distractor has a `misconception` field** explaining *why* a child might pick it. Examples:
   - Math: "Added the tens but forgot to regroup."
   - Math: "Counted the dots in the picture but missed the half-dot."
   - Reading: "Picked the detail that appears first instead of the main idea."
4. **`explanation` is taught, not just stated.** Show the work. "23 + 18 = 41 because 3+8 = 11, write 1 carry 1; then 2+1+1 = 4. So the answer is 41."
5. **Use SVG, not images, for figures.** Inline SVG is checked into `stem_image_svg` as a string. No external image hosting in Phase 1.
6. **Avoid US-only cultural references** that the child wouldn't get (American football idioms, Thanksgiving-specific). Cricket, Diwali, soccer, family travel are fine.
7. **No trick questions.** This is practice, not a gotcha.

### 4.3 The author prompt template

Use this exact prompt with Claude (Sonnet 4.5+ recommended for fidelity) when generating a batch. Replace `{{...}}` placeholders.

```
You are authoring practice questions for a Grade 2 MAP-style test, aligned to Texas TEKS.

Standard: {{teks_code}} — {{teks_title}}
Full description: {{teks_description}}
Khan Academy unit reference: {{khan_unit}}
Target RIT band: {{rit_band}} (e.g. 181_190 = beginning-of-year-on-grade-level)
Difficulty: {{easy|medium|hard}}

Author 5 questions. For each, output a JSON object with this exact shape:

{
  "stem": "string — the question text, ≤ 25 words, age-appropriate",
  "stem_image_svg": "string or null — inline <svg>...</svg> if a figure is needed",
  "explanation": "string — teach the solution method, do not just state the answer",
  "source_note": "Khan Academy: {{khan_unit}}",
  "choices": [
    { "label": "A", "body": "...", "is_correct": false, "misconception": "..." },
    { "label": "B", "body": "...", "is_correct": true,  "misconception": null },
    { "label": "C", "body": "...", "is_correct": false, "misconception": "..." },
    { "label": "D", "body": "...", "is_correct": false, "misconception": "..." }
  ]
}

Hard requirements:
- Exactly one is_correct = true.
- Every distractor's misconception field describes a specific Grade 2 thinking error.
- Use Maya, Ethan, Priya, Liam, Ava, Aarav, Zoe — no Sarah/John clichés.
- For geometry, place value, fractions, and measurement: use stem_image_svg.
- Output ONLY a JSON array of 5 objects. No prose, no markdown fences.
```

### 4.4 Reading passages — author them first

Generate passages **before** their questions. Each passage:
- 80–180 words for `181_190` band, 60–120 for `171_180`, 100–220 for `201_210+`.
- Genre coverage: 40% literary, 40% informational, 15% poetry, 5% drama.
- Lexile range: 420L–820L (estimate; you don't need a real Lexile API).
- 4–6 questions per passage covering: main idea, vocabulary in context, inference, author's purpose, character/setting (literary), text features (informational).

### 4.5 SQL insert pattern

After generation, insert with this pattern (transactional, idempotent on stem):

```sql
WITH new_q AS (
  INSERT INTO map_questions (subject, grade, standard_id, rit_band, difficulty,
                             stem, stem_image_svg, explanation, source_note)
  VALUES ('math', 2,
          (SELECT id FROM map_standards WHERE teks_code = '2.4B' AND subject = 'math'),
          '181_190', 'medium',
          $stem$Maya has 27 stickers. Her brother gives her 18 more. How many does she have now?$stem$,
          NULL,
          $exp$27 + 18 = 45. Add the ones: 7 + 8 = 15, write 5 carry 1. Add the tens: 2 + 1 + 1 = 4. So 45.$exp$,
          'Khan Academy: Add and subtract within 100')
  RETURNING id
)
INSERT INTO map_question_choices (question_id, label, body, is_correct, misconception, sort_order)
SELECT id, c.label, c.body, c.is_correct, c.misconception, c.sort_order FROM new_q,
(VALUES
  ('A','35',  false, 'Forgot to regroup the ones place (added 5 instead of 15).', 1),
  ('B','45',  true,  NULL, 2),
  ('C','315', false, 'Concatenated digits instead of adding (place-value confusion).', 3),
  ('D','46',  false, 'Off-by-one regrouping error.', 4)
) AS c(label, body, is_correct, misconception, sort_order);
```

---

## 5. App build plan

### 5.1 Routes

| Route | Purpose |
|---|---|
| `/` | Home — pick subject, see streaks, "Start a test" CTA |
| `/test/new?subject=math` | Builds a 25-question session, redirects to `/test/:id` |
| `/test/:id` | Test runner — one question at a time, no back button mid-test |
| `/test/:id/results` | Score, RIT estimate, per-standard breakdown, miss review |
| `/history` | Past sessions, growth chart |
| `/parent` (Phase 2) | Parent dashboard with TEKS heatmap |

### 5.2 Adaptive test session creation (Phase 2)

Test sessions use band-stepping adaptivity. New sessions are always adaptive (`is_adaptive = true`); legacy non-adaptive sessions only exist if an in-progress one was started before the cutover. The runner branches on `is_adaptive` to handle both shapes — the legacy branch can be removed once `scripts/check-legacy-sessions.mjs` reports zero in-progress non-adaptive sessions.

**Implementation:**

- `src/lib/adaptive/bands.ts` — pure helpers: `decideBand`, `bandIndex`, `bandFloor`, `bandCeil`, `clampBand`, `trimWindow`. Constants: `WARMUP_LENGTH = 3`, `WINDOW_MAX = 5`, `STEP_UP_THRESHOLD = 0.80`, `STEP_DOWN_THRESHOLD = 0.40`.
- `src/lib/adaptive/picker.ts` → `getNextAdaptiveQuestion(sessionId)` for math and language.
- `src/lib/adaptive/passagePicker.ts` → `addNextAdaptivePassage(sessionId)` for reading. Operates at passage grain.
- `src/lib/adaptive/diagnostics.ts` → `logPickDiagnostic` writes one row per pick (happy path included) to `map_pick_diagnostics`.

**Algorithm:**

```
start_band = student's current_band from map_v_student_current_band (default '181_190')
floor_band = max(below_161, start_band - 2)
ceil_band  = min(above_210, start_band + 2)

for each pick i in 1..planned_length:
  if i ≤ 3:        target_band = start_band   // warmup
  else:            target_band = decideBand(window, current_band, floor_band, ceil_band)

  // Stretch cap (counted against start_band, NOT current_band)
  if target_band > start_band and stretch_remaining ≤ 0:
    target_band = start_band

  candidates = active questions at target_band
             excluding questions already in this session
             excluding questions answered correctly in the last 7 days
             excluding standards already touched in this session (relaxable)
             respecting growth (≤ 40%) / mastered / unseen bucket caps

  if no candidates → relax standards-touched, retry
  if still none → step one band toward start_band, retry
  if still none → wider net at start_band ± 1
  log_pick_diagnostic(target, actual, candidates, fallback_path, window)
  yield pick
```

**`decideBand` (sliding-window step decision):**

- `window.length < 3` → return `current_band` (warmup; one wrong answer in the first 3 doesn't punish).
- `accuracy ≥ 0.80` → step up by 1, clamped to `ceil_band`.
- `accuracy ≤ 0.40` → step down by 1, clamped to `floor_band`.
- otherwise → hold at `current_band`.
- The window slides — `trimWindow` keeps the last 5 entries, so the algorithm responds to recent trend, not full history.

**`current_band` for reading is the band of the last picked PASSAGE, not the last question.** Reading questions sometimes have their own `rit_band` independent of their passage's band; using question band drives `current_band` up incorrectly when a passage contains a higher-band question. The picker must use `passage.rit_band`.

**Hard caps (do not violate):**

- ±2 bands from `start_band` for the entire session.
- Stretch (above `start_band`):
  - math/language: ≤ 20% of test (5 questions of 25)
  - reading: ≤ 1 stretch passage per session (per Mastery Tracker brief §5; passage-grain cap is more conservative than question-grain because passages add 4-8 questions at once)
- Growth-area standards: ≤ 40% per Mastery Tracker §5
- No question repeats in a session
- No questions answered correctly in the last 7 days

**Reading specifics (§4 of Adaptive brief):**

- Adaptation happens *between* passages, never within. Passages are added whole.
- Window updates per passage (not per question): one boolean per passage based on whether accuracy ≥ 60%.
- The stretch cap is 1 passage above `start_band` per session, not 5 questions.
- Last passage may overshoot 25 questions; trimmed to fit at append time.
- Skips passages this student saw in the last 14 days when alternatives exist.

**Schema additions (already applied):**

```sql
ALTER TABLE map_test_sessions
  ADD COLUMN is_adaptive boolean NOT NULL DEFAULT false,
  ADD COLUMN start_band map_rit_band,
  ADD COLUMN planned_length int NOT NULL DEFAULT 25;

CREATE TABLE map_pick_diagnostics (
  id, session_id, question_index, target_band, actual_band,
  picked_question_id, candidate_count, fallback_path, recent_window, picked_at
);
```

`fallback_path` values: `'standards_relaxed' | 'band_step_back' | 'wider_net' | 'passage_step_back' | 'warmup_band_unavailable' | NULL`.

**Boost sessions are intentionally non-adaptive** and use `composeBoostSet` in `src/lib/sessionBuilder.ts`. They stay on the misconception, not on the band.

**Runtime UX:**

The TestRunner calls the picker after every successful `map_record_attempt`. A loading overlay ("Picking your next question…") only shows if the pick takes longer than 400ms — fast picks feel instant, slow picks feel intentional rather than broken.

**Acceptance validator:** `scripts/test-adaptive-simulator.mjs [N]` runs N (default 100) random-answer test sessions with a deterministic mulberry32 RNG, validates §6.1-§6.11 across the batch, prints aggregate band-trajectory stats. Must pass 100/100 before any picker change is shipped.

### 5.3 RIT estimate (rough, post-test)

Phase 1 uses a simple heuristic, not real IRT:

```
band_centroid = { '171_180': 175, '181_190': 185, '191_200': 195, '201_210': 205, ... }
estimated_rit = weighted_avg(band_centroid[q.band] for q in correctly_answered)
              + 5 if accuracy > 0.85
              - 5 if accuracy < 0.50
```

Display as: *"Estimated RIT: 187 (grade-level for fall of 2nd grade)"* — never as a single number without context.

### 5.4 UI primitives

- **Big tappable choice cards** (min 56px height), label letter on the left, body on the right.
- **Read-aloud button** on every stem — uses `window.speechSynthesis.speak(new SpeechSynthesisUtterance(stem))`.
- **No timer**, no penalty for slowness. This is practice.
- **Confetti on correct, kind feedback on wrong** — show the explanation immediately on submit. Don't let the child move on without seeing it.
- **Progress dots** at top: ●●●○○...○ — never a percentage (kids fixate on it).

---

## 6. How Claude should work in this repo

### Always do
- Read this file before making changes.
- Use the existing TEKS standards in `map_standards` — don't invent new codes.
- Match existing schema before adding tables. New columns? Use `apply_migration` with a snake_case name.
- For question generation, generate in batches per `(standard, rit_band)` and validate the JSON before SQL insertion.
- When asked to generate questions, run a quick coverage query first:
  ```sql
  SELECT s.teks_code, s.teks_title, count(q.id) AS questions_so_far
  FROM map_standards s LEFT JOIN map_questions q ON q.standard_id = s.id
  WHERE s.subject = 'math' GROUP BY s.id ORDER BY questions_so_far ASC, s.sort_order;
  ```
  Author for the lowest-coverage standards first.

### Never do
- Don't drop or rename `map_*` tables without explicit approval.
- Don't put PII in the database. The student is a kid — `display_name` is the only identifier and "Student" is fine.
- Don't enable RLS in Phase 1 — there's no auth context to gate against. Phase 2 adds Supabase Auth + RLS.
- Don't add image generation APIs (Replicate, OpenAI images) for stems. Inline SVG only — it's faster, free, and reproducible.
- Don't reproduce copyrighted Khan Academy or NWEA content verbatim. Use them as topical references only; original wording always.

### Useful queries

Coverage report:
```sql
SELECT subject, count(*) AS questions,
       count(*) FILTER (WHERE rit_band IN ('171_180','181_190'))::float / count(*) AS pct_on_grade
FROM map_questions GROUP BY subject;
```

Misconception audit (find lazy distractors):
```sql
SELECT q.id, q.stem
FROM map_questions q
JOIN map_question_choices c ON c.question_id = q.id
WHERE c.is_correct = false AND (c.misconception IS NULL OR length(c.misconception) < 15)
LIMIT 50;
```

Spaced repetition candidates for next session:
```sql
SELECT q.id, s.teks_code, max(a.answered_at) AS last_seen
FROM map_questions q
JOIN map_standards s ON s.id = q.standard_id
LEFT JOIN map_attempts a ON a.question_id = q.id AND a.student_id = '<student_uuid>'
WHERE q.subject = 'math' AND q.is_active
GROUP BY q.id, s.teks_code
HAVING max(a.answered_at) IS NULL
    OR max(a.answered_at) < now() - interval '4 days'
ORDER BY last_seen NULLS FIRST LIMIT 25;
```

---

## 7. Phase roadmap

**Phase 1 — Grade 2 MVP:** Schema ✅, TEKS seed ✅, question generation ✅, test runner UI ✅, results screen ✅, history ✅.

**Phase 2 — Adaptivity, mastery tracker, parent view (current):**
- Mastery tracker ✅ — misconception taxonomy (45 tags), per-attempt signal updates via `map_record_attempt`, mastery views, boost route, parent dashboard with TEKS heatmap (PIN-gated).
- Band-stepping adaptive composer ✅ — see §5.2. 100/100 simulator pass.
- Mini-lessons ⏸ — runtime Anthropic API call, on hold pending real practice data (~2 weeks of attempts).
- Supabase Auth + RLS ⏸ — still single-student.

**Phase 3 — Grade expansion (in progress):** Grade 3 foundation seeded ✅ — see §9. Bulk question authoring is iterative; use `scripts/grade3-author-prompt.mjs` to generate batches and `scripts/grade3-coverage.mjs` to know what to author next. Grades 1 and 4 not started.

**Phase 4 — Beyond MAP:** STAAR practice mode (Grade 3+), spelling/grammar drills, parent-set custom assignments.

---

## 8. References (for question authoring)

- TEKS Math Grade 2: TAC §111.4 — https://tea.texas.gov
- TEKS ELAR Grade 2: TAC §110.4 — https://tea.texas.gov
- Khan Academy Grade 2 Math (TEKS): https://www.khanacademy.org/math/cc-2nd-grade-math
- Khan Academy Grade 2 Reading: https://www.khanacademy.org/ela/cc-2nd-reading-vocab
- NWEA RIT reference (K–2 Math/Reading bands): https://cdn.nwea.org/docs/RIT+Reference+Brochure_July19_CC.pdf
- Plano ISD ELAR alignment statement: https://www.pisd.edu/Page/16620

These are reference reading for Claude; do not embed quotes from them in the app or in generated content.

---

## 9. Grade 3 expansion

Source spec: `Grade3_Seeding_Brief.md` (full spec) and `docs/superpowers/specs/2026-04-28-grade3-foundation-design.md` (foundation work). Read those before authoring Grade 3 content. The points below are the working summary.

### 9.1 What changes from Grade 2 to Grade 3

- **A new subject — `language`.** NWEA tests Language Usage separately from Reading starting Grade 3. TEKS folds it into ELAR §110.5, but the experience (editing sentences, fixing punctuation, picking the right pronoun) is different enough to deserve its own subject. The enum already includes `language`.
- **Reading passages are longer.** Target 200–320 words (literary), 180–300 (informational). Don't shrink Grade 3 passages to feel safer — the bank will calibrate wrong.
- **Math curriculum branches.** Multiplication, division, fractions, area, perimeter all enter as first-class topics. Plan SVG patterns (arrays, area models, fraction bars, fraction number lines) up front.
- **Stem ceiling lifts to ≤ 35 words** (still aim short). Pattern A and Pattern C language items are exempt because the sentence(s) being edited *are* the workspace.
- **Two-step problems become required for ~30% of math.** Both numbers must be in the stem; no "she lost some" with the count buried in a footnote.
- **Tier-2 academic vocabulary is welcome, tier-3 is not.** "Migrated", "ancient", "burrow", "emerged" are fine. "Photosynthesis", "metamorphosis", "stratosphere" belong in science class.

### 9.2 RIT band targets for Grade 3

Beginning ~ 180. Middle ~ 189–196. End ~ 196–201. Use these per-subject bank-composition weights when picking standards × bands:

| Subject  | below_181 | 181_190 | 191_200 | 201_210 | above_210 |
|----------|-----------|---------|---------|---------|-----------|
| Math     | 5%        | 30%     | 35%     | 20%     | 10%       |
| Reading  | 5%        | 25%     | 35%     | 25%     | 10%       |
| Language | 8%        | 32%     | 32%     | 18%     | 10%       |

Below_181 should almost all be `171_180` for Grade 3. Below `171_180` is rarely worth banking.

### 9.3 Grade 3 names

Allowed: Maya, Ethan, Priya, Liam, Ava, Aarav, Zoe (Grade 2 set) plus **Noor, Diego, Mei, Caleb** (Grade 3 additions).

### 9.4 Language items — three patterns

Every language question has a `question_format` value. The runner can branch on this when ready.

**Pattern A — `edit_pick`** ("Which sentence is written correctly?"). Four full sentences, one correct, distractors model specific error types (subject-verb agreement, pronoun case, missing helper verb).

**Pattern B — `mcq`** (cloze). Stem is one sentence with a blank; the four choices are word(s) or phrases. Used for homophones, prepositional phrases, vocab-style language items.

**Pattern C — `sentence_combine`** ("Which sentence best combines these two?"). Stem lists two short sentences with bullet markers. Choices are full combined sentences. Distractors model comma splice, wrong conjunction, garbled order.

For A and C the stem can exceed 35 words because the stem *is* the workspace. Don't try to compress it.

### 9.5 Misconception tagging is the firm rule from Grade 3 forward

Every distractor (`is_correct = false`) must carry **both** a free-text `misconception` (why a kid might pick this) **and** a snake_case `misconception_tag`. This was a soft rule for Grade 2 (and was retroactively backfilled by the mastery-tracker work); from Grade 3 it is hard. The author prompt template requires it. Coverage queries enforce it. Don't author Grade 3 distractors and tag them later.

Common Grade 3 tags by subject (reuse before inventing new ones):

- **math:** `mult_as_addition`, `mult_used_wrong_fact`, `mult_skip_count_error`, `array_misread_dimensions`, `fraction_compared_numerator_only`, `fraction_compared_denominator_only`, `area_used_perimeter`, `regrouping_forgot_carry`, `place_value_concat`
- **reading:** `main_idea_picked_detail`, `inference_unsupported`, `inference_literal_only`, `vocab_similar_word`, `vocab_unrelated`, `purpose_picked_genre_mismatch`, `purpose_picked_topic_overgeneralization`, `text_evidence_misread`
- **language:** `pronoun_object_as_subject`, `pronoun_reflexive_misuse`, `subject_verb_plural_singular`, `verb_form_missing_helper`, `homophone_their_there`, `homophone_through_threw`, `homophone_through_though`, `homophone_letter_swap`, `comma_splice`, `wrong_conjunction`, `garbled_sentence`, `prep_phrase_confused_verb_phrase`, `prep_phrase_confused_adjective_phrase`

Run the misconception rollup at the end of every authoring day (`scripts/grade3-coverage.mjs`). A tag used once is a candidate for renaming (fold into a similar tag) or growing (build out 2–3 more questions exercising it).

### 9.6 Bank targets

| Subject  | Total | Per standard avg | Notes |
|----------|-------|------------------|-------|
| Math     | 600   | ~21              | 31 standards seeded |
| Reading  | 480   | ~27              | ~80 passages, 4–6 questions each |
| Language | 320   | ~20              | 16 standards seeded |

Generate in batches of **5 questions per `(standard, band)` cell** — never bulk-prompt 100 questions. Grade 2 taught us this.

### 9.7 Authoring workflow

1. Run `node scripts/grade3-coverage.mjs` to find the lowest-coverage standards.
2. Run `node scripts/grade3-author-prompt.mjs --subject <s> --teks <code> --band <band>` to print a paste-ready prompt (it auto-detects the language pattern from the TEKS code).
3. Paste the prompt into a fresh Claude conversation. Get back a JSON array of 5 question objects.
4. Validate the JSON: exactly one `is_correct`, every distractor has both `misconception` and `misconception_tag`, four choices labeled A–D.
5. Write a migration following `seed/` patterns (see existing `map_seed_grade3_*_sample` migrations) that inserts the questions in a `DO $mig$ ... $mig$;` block. SVG values use `$svg$...$svg$` dollar-quoting so single-quoted attributes inside don't need escaping.
6. Apply the migration. Re-run the coverage script to confirm the cell lit up.

### 9.8 Hard rules (don't violate)

- **No verbatim Khan Academy or NWEA content.** Topical references only. Original wording, original numbers, original passages.
- **No PII in passages or stems.** Use only the names in §9.3.
- **TEKS codes are canonical.** Don't invent codes. Check TAC §110.5 / §111.5; the code you want is almost always there under a sub-letter.
- **Don't ship a "grade picker"** that lets the child choose Grade 3 before the bank has at least 200 math, 150 reading, and 100 language items. A nearly-empty subject creates an empty test.
- **Don't backfill `misconception_tag` on Grade 2 distractors as part of Grade 3 work.** That's already done; don't re-do it.

### 9.9 References

- TEKS Math Grade 3: TAC §111.5
- TEKS ELAR Grade 3: TAC §110.5
- Khan Academy Grade 3 Math (TEKS): https://www.khanacademy.org/math/cc-third-grade-math
- Khan Academy Grade 3 Reading: https://www.khanacademy.org/ela/cc-3rd-reading-vocab
- NWEA RIT reference (3–5 norms): https://cdn.nwea.org/docs/RIT+Reference+Brochure_July19_CC.pdf

---

## 10. Family MCP Server (Phase 3)

Source spec: `Muti_user_brief.md` (the multi-tenant foundation it depends on) and the in-repo plan at `docs/superpowers/plans/2026-05-01-family-mcp-server.md`. The MCP server exposes 9 read-only tools at `POST /api/mcp` so a parent can hold their kid-progress conversations in Claude.ai (or any MCP client) instead of in our app.

### 10.1 Security model (do not violate)

- **Token → family_id is the trust boundary.** Bearer token → SHA-256 hash → `map_mcp_tokens` row → `family_id`. Every tool query filters on `family_id`. No tool accepts `family_id` from the caller.
- **Read-only.** Only writes are: `map_mcp_audit` insert and `map_mcp_tokens.last_used_at` update. The `scripts/audit-mcp-readonly.mjs` script gates this on every change.
- **Service role on server only.** `SUPABASE_SERVICE_ROLE_KEY` is read in `api/_lib/mcp/env.ts`. Never imported into anything under `src/`.
- **Token plaintext shown once.** RPC `map_create_mcp_token` returns it; UI displays it in a one-shot modal; `map_mcp_tokens` stores only hash + last 4.
- **Origin allow-list.** `claude.ai`, `*.claude.ai`, `chatgpt.com`, `cursor.so` (+ `localhost` in dev). Anything else → 403.
- **Rate limit.** 60/min, 2000/day per token, in-memory bucket (per warm Vercel instance — accepted).

### 10.2 Tools (the public API)

| Tool | Purpose |
|---|---|
| `list_kids` | Children in the family. |
| `get_kid_overview` | Snapshot for one child: totals, accuracy by subject, streak. |
| `list_recent_sessions` | Newest-first list of sittings. |
| `get_session_details` | Per-question breakdown of one session. |
| `get_recent_wrong_answers` | Recent incorrect attempts with stem/chosen/correct/tag. |
| `get_accuracy_by_standard` | Per-TEKS accuracy, weak first. |
| `get_top_misconceptions` | Most-frequent error tags with sample. |
| `get_activity_calendar` | Per-day question counts. |
| `compare_kids` | Side-by-side across kids in the family. |

Inputs are validated by zod schemas in `api/_lib/mcp/schemas.ts`. Outputs are JSON.

### 10.3 File map

```
api/mcp.ts                              # fetch-bridged Vercel handler (Node runtime, maxDuration 30)
api/_lib/mcp/
  env.ts                                # service-role supabase client
  errors.ts                             # McpError + code strings
  origin.ts                             # allow-list
  auth.ts                               # resolveContextOrThrow + bumpLastUsedAt
  rate-limit.ts                         # in-memory bucket
  audit.ts                              # logToolCall (allow-list redaction)
  db.ts                                 # getStudentInFamily / getSessionInFamily
  schemas.ts                            # zod inputs
  tools/<name>.ts                       # one file per tool
src/pages/parent/ConnectAi.tsx          # /parent/connect-ai UI
migrations/20260501_map_mcp_tokens.sql  # schema, RLS, RPCs
```

### 10.4 Adaptations from the original brief that are now binding

- The handler exports a Node-style `(req: IncomingMessage, res: ServerResponse)` and bridges internally to the Web `Request`/`Response` shape that `WebStandardStreamableHTTPServerTransport` expects. `@vercel/node` does not auto-detect single-arg fetch-style handlers in our config; the bridge is the canonical workaround.
- The transport runs in **stateless mode** (`sessionIdGenerator` omitted). Vercel Serverless can't guarantee session continuity across cold starts, and Claude.ai's MCP client is happy with stateless. `enableJsonResponse: true` skips SSE.
- `auth.ts` passes the SHA-256 hash to PostgREST as a `\xHEX` string, not a Buffer. supabase-js JSON-stringifies Buffer through its toString which produces garbage for binary data; `\xHEX` is PostgREST's bytea input format.
- pgcrypto and uuid-ossp live in the `extensions` schema, not `public`. Every SECURITY DEFINER function uses `SET search_path = ''` and fully-qualifies all references — including `extensions.gen_random_bytes` and `extensions.digest`.

### 10.5 Operations

- Generate a token: parent signs in → unlocks PIN → `/parent/connect-ai` → "Generate token". Plaintext shown once.
- Revoke: same page, "Revoke" button on a token row; sets `revoked_at`. Auth from this point onward fails for that token.
- Audit: same page shows the last N rows from `map_mcp_audit` for the family.
- Test scripts: `scripts/test-mcp-{handshake,bad-tokens,origin,rate-limit,isolation}.mjs` and `scripts/audit-mcp-readonly.mjs`. Run all before merging any change to `api/_lib/mcp/`.

### 10.6 Phase 2 (out of scope here)

OAuth 2.1 + dynamic client registration, write tools, Resources/Prompts, Upstash rate limiting, multi-token-per-agent UX, push/webhooks, token rotation. Don't build these as part of this feature.

