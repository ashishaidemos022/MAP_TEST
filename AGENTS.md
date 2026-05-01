# AGENTS.md — MAP Practice Test App (Phase 1: Grade 2)

This file is the operating manual for Codex (and any AI assistant) working on this codebase. Read it before doing anything. Update it when decisions change.

---

## 1. Project intent

A web app for a 2nd-grader to take MAP-style practice tests in **Math** and **Reading**. Each test is **25 multiple-choice questions** drawn from a question bank of **400 math** and **400 reading** items. Reading questions are anchored to passages.

**Built for one user (a single child) first.** Multi-tenant auth, RLS, and parent dashboards come later. Don't over-engineer Phase 1.

### Design pillars
- **Curriculum-honest.** Every question is tagged to a specific Texas TEKS standard (Plano ISD aligns to TEKS) and cross-walked to a Khan Academy unit and an NWEA MAP goal area.
- **MAP-shaped, not adaptive yet.** Questions carry a `rit_band` so test sets are balanced across difficulty bands, mirroring how real MAP feels. True computer-adaptive selection is Phase 2.
- **Distractors with intent.** Every wrong answer encodes a specific misconception (off-by-one, place-value swap, misreading the operation). Authoring discipline matters more than question count.
- **Read-aloud by default.** A 2nd-grader is still a developing reader. Every question supports browser TTS via `window.speechSynthesis`.

---

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React + Vite + TypeScript + Tailwind | Single-page app, big tap targets, kid-friendly |
| Data | Supabase (project `mnrseaapxpofdznnqrsv`) | All tables prefixed `map_` |
| Auth | None in Phase 1 | Local single-student row. Add Supabase Auth in Phase 2. |
| TTS | Browser `window.speechSynthesis` | Free, offline, no API keys |
| Hosting | Vercel | Standard Vite output |

---

## 3. Database schema (already applied)

All tables are prefixed `map_` and live in the `public` schema of project `mnrseaapxpofdznnqrsv`.

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
- `map_subject`: `math` | `reading`
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

Use this exact prompt with Codex (Sonnet 4.5+ recommended for fidelity) when generating a batch. Replace `{{...}}` placeholders.

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

### 5.2 Test session creation algorithm

For Phase 1 (non-adaptive but balanced):

```
function buildTestSet(subject, n=25):
  bands = ['171_180','181_190','181_190','191_200','201_210']  // weighted distribution
  questions = []
  for each band in expand(bands, n):
    pick a random active question in that band
      preferring standards the student has NOT seen recently
      excluding questions answered correctly in the last 7 days
  shuffle so bands are interleaved (don't go monotonically harder)
  return questions
```

For reading: **group questions by passage** — never split a passage across sessions. Pull whole passages until you have ≥ 25 questions, then trim.

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

## 6. How Codex should work in this repo

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

**Phase 1 — Grade 2 MVP (current):** Schema ✅, TEKS seed ✅, question generation (in progress), test runner UI, results screen, history.

**Phase 2 — Adaptivity & parent view:** Real Rasch-style adaptive selection (start at on-grade band, step ±1 band based on rolling accuracy). Parent dashboard with TEKS heatmap. Supabase Auth + RLS. Multiple students per family.

**Phase 3 — Grade expansion:** Grades 1, 3, 4. Same schema, more rows in `map_standards`. The `grade` column is already there.

**Phase 4 — Beyond MAP:** STAAR practice mode (Grade 3+), spelling/grammar drills, parent-set custom assignments.

---

## 8. References (for question authoring)

- TEKS Math Grade 2: TAC §111.4 — https://tea.texas.gov
- TEKS ELAR Grade 2: TAC §110.4 — https://tea.texas.gov
- Khan Academy Grade 2 Math (TEKS): https://www.khanacademy.org/math/cc-2nd-grade-math
- Khan Academy Grade 2 Reading: https://www.khanacademy.org/ela/cc-2nd-reading-vocab
- NWEA RIT reference (K–2 Math/Reading bands): https://cdn.nwea.org/docs/RIT+Reference+Brochure_July19_CC.pdf
- Plano ISD ELAR alignment statement: https://www.pisd.edu/Page/16620

These are reference reading for Codex; do not embed quotes from them in the app or in generated content.
