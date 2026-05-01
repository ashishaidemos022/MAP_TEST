# Feature Brief: Mastery Tracker & Targeted Practice

> Hand this entire document to Claude in the MAP practice app repo. It is a complete spec — schema, backfill, algorithm, UI, acceptance criteria. Read it end-to-end before starting. Append the relevant parts to `CLAUDE.md` when done.

---

## 1. What we are building and why

The current app gives a child a score after a 25-question test. That's it. This feature turns the app into something that **finds the child's specific weak spots and helps fix them** — without ever making him feel like he's being graded.

There are three layers, and they must be built in this order:

1. **Detection** — figure out which standards and which *misconceptions* the child is consistently getting wrong.
2. **Diagnosis** — name the specific error pattern (not just the topic).
3. **Intervention** — adjust what the child sees so practice becomes targeted.

The leverage is in layer 2. Every test app does layer 1. The differentiator is the existing `map_question_choices.misconception` field — every wrong answer in this app has a tagged reason. We are going to mine that signal.

**Hard rules — do not violate these:**

- Never show the child a "weaknesses" dashboard. Surface that only in a parent view.
- Never react to N=1. A weakness signal requires ≥3 confirming attempts spread across ≥2 days.
- Never gate progress. The child can attempt anything anytime.
- Never make a test set >40% "growth-area" questions. Practice should feel achievable.
- Stretch questions (RIT band above the child's current band) do NOT count against mastery.

---

## 2. Database changes

Apply this migration as `map_mastery_tracker`. It is additive only — no existing tables or columns are modified destructively.

```sql
-- =========================================================
-- Mastery Tracker schema additions
-- =========================================================

-- 2.1: Misconception taxonomy
-- A normalized short tag for each kind of error. Free text in
-- map_question_choices.misconception stays for human readability;
-- this column is what the system actually clusters on.
ALTER TABLE map_question_choices
  ADD COLUMN IF NOT EXISTS misconception_tag text;

CREATE INDEX IF NOT EXISTS idx_map_choices_misconception_tag
  ON map_question_choices(misconception_tag)
  WHERE misconception_tag IS NOT NULL;

-- 2.2: Reference table for the taxonomy itself
CREATE TABLE IF NOT EXISTS map_misconception_tags (
  tag           text PRIMARY KEY,             -- e.g. 'regrouping_forgot_carry'
  subject       map_subject NOT NULL,
  display_name  text NOT NULL,                -- e.g. 'Forgets to carry when regrouping'
  description   text NOT NULL,                -- one-sentence parent-readable
  remediation_hint text,                       -- what a mini-lesson should cover
  related_teks  text[]                         -- TEKS codes most affected
);

-- 2.3: Misconception signals — one row per (student, tag),
-- updated as attempts come in. Captures the live state.
CREATE TABLE IF NOT EXISTS map_misconception_signals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        uuid NOT NULL REFERENCES map_students(id) ON DELETE CASCADE,
  misconception_tag text NOT NULL REFERENCES map_misconception_tags(tag),
  occurrence_count  int  NOT NULL DEFAULT 0,   -- total wrong-with-this-tag
  consecutive_correct int NOT NULL DEFAULT 0,  -- since last wrong; resets on wrong
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  cleared_at        timestamptz,                -- set when consecutive_correct >= 3
  active            boolean NOT NULL
                    GENERATED ALWAYS AS (cleared_at IS NULL) STORED,
  UNIQUE (student_id, misconception_tag)
);
CREATE INDEX IF NOT EXISTS idx_map_misc_signals_student_active
  ON map_misconception_signals(student_id) WHERE active;

-- 2.4: Per-standard mastery view. Computed on-demand from map_attempts.
-- Excludes attempts on stretch questions (rit_band above student's current).
-- The student's "current band" is the median band of their last 10 correct
-- attempts; defaults to '181_190' if no history.
CREATE OR REPLACE VIEW map_v_student_current_band AS
WITH bands_ord AS (
  SELECT 'below_161'::map_rit_band AS b, 1 AS ord UNION ALL
  SELECT '161_170', 2 UNION ALL
  SELECT '171_180', 3 UNION ALL
  SELECT '181_190', 4 UNION ALL
  SELECT '191_200', 5 UNION ALL
  SELECT '201_210', 6 UNION ALL
  SELECT 'above_210', 7
),
recent_correct AS (
  SELECT a.student_id, q.rit_band,
         row_number() OVER (PARTITION BY a.student_id
                            ORDER BY a.answered_at DESC) AS rn
  FROM map_attempts a
  JOIN map_questions q ON q.id = a.question_id
  WHERE a.is_correct
)
SELECT
  rc.student_id,
  COALESCE(
    (SELECT b FROM bands_ord
     WHERE ord = (SELECT (percentile_cont(0.5)
                  WITHIN GROUP (ORDER BY bo.ord))::int
                  FROM recent_correct rc2
                  JOIN bands_ord bo ON bo.b = rc2.rit_band
                  WHERE rc2.student_id = rc.student_id AND rc2.rn <= 10)),
    '181_190'::map_rit_band
  ) AS current_band
FROM (SELECT DISTINCT student_id FROM recent_correct) rc;

-- 2.5: Mastery score view. mastery = weighted_correct / weighted_total,
-- where weight = 1 / (1 + days_since_attempt / 7). Recent attempts count more.
-- Status thresholds: mastered (>=0.80, n>=4), growth (<=0.50, n>=3),
-- developing otherwise.
CREATE OR REPLACE VIEW map_v_mastery_by_standard AS
WITH band_ord AS (
  SELECT 'below_161'::map_rit_band AS b, 1 AS ord UNION ALL
  SELECT '161_170', 2 UNION ALL
  SELECT '171_180', 3 UNION ALL
  SELECT '181_190', 4 UNION ALL
  SELECT '191_200', 5 UNION ALL
  SELECT '201_210', 6 UNION ALL
  SELECT 'above_210', 7
),
weighted AS (
  SELECT
    a.student_id,
    q.standard_id,
    s.subject,
    s.teks_code,
    s.teks_title,
    a.is_correct,
    1.0 / (1.0 + EXTRACT(EPOCH FROM (now() - a.answered_at)) / 86400.0 / 7.0) AS w,
    q.rit_band
  FROM map_attempts a
  JOIN map_questions q ON q.id = a.question_id
  JOIN map_standards s ON s.id = q.standard_id
  JOIN map_v_student_current_band cb ON cb.student_id = a.student_id
  JOIN band_ord qbo ON qbo.b = q.rit_band
  JOIN band_ord cbo ON cbo.b = cb.current_band
  WHERE qbo.ord <= cbo.ord            -- exclude stretch
    AND a.is_correct IS NOT NULL
)
SELECT
  student_id,
  standard_id,
  subject,
  teks_code,
  teks_title,
  count(*)                                            AS attempts,
  round((sum(w) FILTER (WHERE is_correct) / NULLIF(sum(w),0))::numeric, 3)
                                                      AS mastery_score,
  CASE
    WHEN count(*) >= 4 AND sum(w) FILTER (WHERE is_correct)/NULLIF(sum(w),0) >= 0.80
      THEN 'mastered'
    WHEN count(*) >= 3 AND sum(w) FILTER (WHERE is_correct)/NULLIF(sum(w),0) <= 0.50
      THEN 'growth'
    ELSE 'developing'
  END                                                 AS status,
  max(EXTRACT(EPOCH FROM (now() - now()))::int)       AS placeholder_zero, -- keep view shape stable
  count(*) FILTER (WHERE NOT is_correct)              AS times_wrong
FROM weighted
GROUP BY student_id, standard_id, subject, teks_code, teks_title;
```

Validate the migration by querying:

```sql
SELECT count(*) FROM map_misconception_tags;             -- expect 0 until 3.1
SELECT count(*) FROM map_question_choices
  WHERE misconception_tag IS NOT NULL;                   -- expect 0 until 3.2
```

---

## 3. Backfill — taxonomy and tagging

### 3.1 Build the taxonomy

The existing question bank has ~175 distractors with free-text `misconception` strings. They cluster into a small taxonomy. **You must read all distractors before writing the taxonomy** so you cluster from real data, not imagination.

Run this query first:

```sql
SELECT subject, q.standard_id, s.teks_code, c.body, c.misconception
FROM map_question_choices c
JOIN map_questions q ON q.id = c.question_id
JOIN map_standards s ON s.id = q.standard_id
WHERE c.is_correct = false
ORDER BY s.subject, s.teks_code;
```

Then build a taxonomy of **20–35 tags** (no more — too many tags defeats the clustering). Each tag must:

- Have a snake_case key (e.g. `regrouping_forgot_carry`, `place_value_swap`, `main_idea_picked_detail`)
- Cover ≥3 existing distractors across ≥2 standards (so the signal can actually cross-pollinate)
- Be distinct from other tags (a child reading the names should be able to tell them apart)

Insert them into `map_misconception_tags`. Subject is `'math'` or `'reading'`. `display_name` is parent-readable (use full sentences — "Forgets to carry the regrouped ten when adding"). `remediation_hint` is what a mini-lesson should teach.

Example shape (illustrative — author your own from the actual data):

```sql
INSERT INTO map_misconception_tags (tag, subject, display_name, description, remediation_hint, related_teks) VALUES
('regrouping_forgot_carry', 'math',
 'Forgets to carry the regrouped ten',
 'When adding two-digit numbers and the ones add to 10 or more, the extra ten is dropped instead of carried.',
 'Show two-digit addition with place-value blocks. Make the carry physical — sliding 10 ones into the tens column.',
 ARRAY['2.4B','2.4C']),
('main_idea_picked_detail', 'reading',
 'Picks a small detail instead of the main idea',
 'On main-idea questions, chooses a true detail from the passage rather than what the whole passage is about.',
 'Practice the "every paragraph is about ___" framing. The main idea is what ties all paragraphs together.',
 ARRAY['2.6.G','2.10.A']);
-- ... 20–35 total
```

### 3.2 Tag the existing distractors

For each row in `map_question_choices` where `is_correct = false`, classify the `misconception` text into exactly one tag. Process in batches of ~25 distractors per tool call. Update with:

```sql
UPDATE map_question_choices SET misconception_tag = $1
WHERE id = $2 AND is_correct = false;
```

After backfill, validate:

```sql
SELECT
  count(*) FILTER (WHERE is_correct=false AND misconception_tag IS NULL) AS untagged,
  count(*) FILTER (WHERE is_correct=false) AS total_distractors
FROM map_question_choices;
```

`untagged` should be 0. If a distractor genuinely doesn't fit any tag, either add a tag (if ≥3 distractors share the gap) or use `'_misc_other'` as a catch-all (create that tag explicitly).

### 3.3 Update the question authoring flow

Modify the authoring playbook in `CLAUDE.md` (section 4.3) so newly generated questions include `misconception_tag` on each distractor in the JSON output. Update the SQL insert pattern in section 4.5 to include the column.

---

## 4. Live signal updates

When the app records an attempt (existing code that inserts into `map_attempts`), also update the misconception signal table. Do this in a **single SQL function** so it stays atomic and the app doesn't need to know the rules.

```sql
CREATE OR REPLACE FUNCTION map_record_attempt(
  p_session_id  uuid,
  p_student_id  uuid,
  p_question_id uuid,
  p_choice_id   uuid,
  p_time_ms     int
) RETURNS uuid AS $$
DECLARE
  v_attempt_id uuid;
  v_correct    boolean;
  v_tag        text;
BEGIN
  -- Resolve correctness and tag from the chosen choice
  SELECT c.is_correct, c.misconception_tag
    INTO v_correct, v_tag
  FROM map_question_choices c
  WHERE c.id = p_choice_id;

  -- Insert the attempt
  INSERT INTO map_attempts(session_id, student_id, question_id,
                           selected_choice_id, is_correct, time_spent_ms)
  VALUES (p_session_id, p_student_id, p_question_id, p_choice_id,
          v_correct, p_time_ms)
  RETURNING id INTO v_attempt_id;

  -- Update misconception signal
  IF v_correct = false AND v_tag IS NOT NULL THEN
    -- Wrong answer: bump occurrence and reset the consecutive-correct counter
    INSERT INTO map_misconception_signals
      (student_id, misconception_tag, occurrence_count,
       consecutive_correct, first_seen_at, last_seen_at)
    VALUES (p_student_id, v_tag, 1, 0, now(), now())
    ON CONFLICT (student_id, misconception_tag) DO UPDATE
      SET occurrence_count = map_misconception_signals.occurrence_count + 1,
          consecutive_correct = 0,
          last_seen_at = now(),
          cleared_at = NULL;
  ELSIF v_correct = true THEN
    -- Correct answer: bump consecutive_correct on every active signal whose
    -- tag relates to this question's standard. If it hits 3, mark cleared.
    UPDATE map_misconception_signals s
    SET consecutive_correct = s.consecutive_correct + 1,
        cleared_at = CASE WHEN s.consecutive_correct + 1 >= 3
                          THEN now() ELSE s.cleared_at END
    WHERE s.student_id = p_student_id
      AND s.cleared_at IS NULL
      AND EXISTS (
        SELECT 1 FROM map_misconception_tags t
        JOIN map_questions q ON q.id = p_question_id
        JOIN map_standards st ON st.id = q.standard_id
        WHERE t.tag = s.misconception_tag
          AND st.teks_code = ANY(t.related_teks)
      );
  END IF;

  RETURN v_attempt_id;
END;
$$ LANGUAGE plpgsql;
```

Replace any direct `INSERT INTO map_attempts` in the app with `SELECT map_record_attempt(...)`. The function returns the attempt id.

---

## 5. Smart test composition

Replace the current "random 25" test builder with a balanced composer. New service: `lib/testComposer.ts` (or your existing equivalent). Pseudocode:

```
function composeTest(studentId, subject, n=25):
  current_band = SELECT current_band FROM map_v_student_current_band
                 WHERE student_id = studentId
                 (default '181_190' if no row)

  mastery = SELECT * FROM map_v_mastery_by_standard
            WHERE student_id = studentId AND subject = subject

  growth_standards    = mastery WHERE status = 'growth'
  developing_standards = mastery WHERE status = 'developing'
  mastered_standards   = mastery WHERE status = 'mastered'
  unseen_standards     = standards NOT IN mastery

  // Composition targets — these are CAPS, not floors
  target = {
    growth:     min(round(n * 0.25), len(growth_standards) * 2),  // <=40% rule
    developing: round(n * 0.40),
    mastered:   round(n * 0.15),
    unseen:     remaining
  }

  picks = []
  for bucket in [growth, developing, mastered, unseen]:
    questions = SELECT q.* FROM map_questions q
                WHERE q.subject = subject
                  AND q.is_active
                  AND q.standard_id IN (bucket standards)
                  AND q.rit_band IN (current_band, current_band-1, current_band+1)
                  AND q.id NOT IN (
                    SELECT question_id FROM map_attempts
                    WHERE student_id = studentId
                      AND is_correct = true
                      AND answered_at > now() - interval '7 days'
                  )
                ORDER BY random()
                LIMIT target[bucket]
    picks.extend(questions)

  // For reading: group by passage. Pull whole passages until >= n,
  // then take the first n. Never split a passage across sessions.
  if subject == 'reading':
    picks = expandToFullPassages(picks, n)

  // Interleave — don't go monotonically harder or all-growth-first
  picks = interleaveByBand(picks)

  return picks[0:n]
```

The 40% growth cap is non-negotiable. If `growth_standards` is empty, redistribute that share to `developing`.

---

## 6. Targeted "Boost" practice sets

A new route: `/boost`. Reads `map_misconception_signals` filtered by `active = true AND occurrence_count >= 3`.

If there are no active signals meeting the threshold, the page shows: *"No boost practice needed right now. You're doing great!"* and a button back to home. Don't manufacture a signal.

If there are signals:

- Surface them as **encouraging** cards: *"Want to get stronger at carrying when adding?"* — never *"You're weak at..."*
- Tapping a card builds a 10-question targeted set:
  - All questions are at `current_band` or one below.
  - All questions are on standards in the tag's `related_teks`.
  - All questions either have a distractor with this tag, OR the correct answer being correct *demonstrates* avoiding this misconception.
  - Prefer questions the child has not seen in the last 14 days.
- After the 10-question set, show a recap: *"You got 7 of 10 right on this skill — keep going!"* Don't show the misconception name in the recap; just the topic.

Frame the experience as a power-up, not remediation. Emoji is fine here (⚡ 🎯), unlike on the test runner.

---

## 7. Mini-lessons (the AI-generated layer)

This is the highest-impact, highest-effort piece. Build it last.

### Trigger

When the app is about to show the next question in a test or boost set, check: does this child have an active misconception signal with `occurrence_count >= 3` AND `last_seen_at > now() - 7 days` that relates to the upcoming question's standard? If yes (and we haven't shown a mini-lesson for this tag in the last 24 hours):

Insert a **mini-lesson screen** before the question. The screen has:

- A friendly opener: *"Quick tip before this one!"*
- A 2-sentence explanation tailored to the misconception
- One worked example
- A "Got it!" button to continue to the question

### Generation

Use the AI-API-in-artifacts capability documented in your environment. Call Claude Sonnet 4 (`claude-sonnet-4-20250514`) at runtime with this prompt:

```
You are writing a 60-second mini-lesson for a 2nd grader who keeps making this mistake:

Misconception: {{tag.display_name}}
What it looks like: {{tag.description}}
Recent example: {{the question stem they just got wrong, plus their wrong answer}}

Write a mini-lesson with EXACTLY this JSON shape:
{
  "opener": "1 sentence, warm and brief",
  "explanation": "2 sentences max. Plain language. No jargon.",
  "worked_example": {
    "problem": "a simple problem like the one they missed",
    "solution_steps": ["step 1", "step 2", "step 3"]
  },
  "encouragement": "1 sentence, future-focused"
}

Rules:
- Reading level: 2nd grade. Short sentences.
- No baby talk. Treat the child with respect.
- No emoji in the lesson body itself (UI adds them separately).
- Reference the misconception by what it FEELS like, not by its tag name.
- Total combined word count: under 100 words.

Output ONLY the JSON. No markdown fences.
```

Cache the result keyed by `(misconception_tag, standard_id)` — the same lesson can be reused for the same tag/standard combo for ~30 days. Don't regenerate for every kid, every time.

### Fallback

If the API call fails or returns malformed JSON, skip the mini-lesson and proceed to the question. **Never block a child's practice on a network call.**

---

## 8. Parent view (`/parent`)

Add a route gated by a simple PIN (set in env / a single row in a `map_parent_settings` table — Phase 1 doesn't need real auth). The page shows:

1. **Mastery heatmap** — every TEKS standard for the chosen subject as a tile, colored:
   - Green: mastered
   - Blue: developing
   - Yellow: growth
   - Gray: not yet attempted
2. **Active misconceptions** — list, sorted by `occurrence_count DESC`. Show `display_name`, count, last-seen date, and `remediation_hint` (the parent should see the hint — the child should not).
3. **Recent sessions** — last 10 with score, RIT estimate, duration.
4. **Streak / attempts-this-week** — light gamification, parent-side only.

This is the only place "weakness" language is allowed.

---

## 9. UI rules for the child experience

Do not break these even if a future request asks you to:

- The word "weakness" never appears in any UI surface the child sees.
- Mastery scores and percentages never appear in the child UI. Use words: "getting stronger", "almost got it", "you've got this!"
- The Boost screen only appears in the home screen if there's an actual signal to act on. No empty state that nudges him to find weaknesses.
- Mini-lessons are interruptions. Cap at 1 per session and 3 per day total.
- Confetti and warmth on correct answers. On wrong answers: brief, kind, and immediately show the explanation. Never any sad sound or red flash.

---

## 10. Acceptance criteria

Before declaring this feature done, all of these must pass:

1. `SELECT count(*) FROM map_misconception_tags WHERE subject='math'` returns ≥ 12.
2. `SELECT count(*) FROM map_misconception_tags WHERE subject='reading'` returns ≥ 8.
3. `SELECT count(*) FROM map_question_choices WHERE is_correct=false AND misconception_tag IS NULL` returns 0.
4. Manually inserting 3 wrong attempts on the same tag for one student produces exactly 1 row in `map_misconception_signals` with `occurrence_count = 3` and `active = true`.
5. After 3 consecutive correct attempts on questions linked to that tag's `related_teks`, `cleared_at` becomes non-null and `active` becomes false.
6. A test built by the new composer for a student with one `growth` standard contains ≤ 10 of 25 questions on growth-area standards (the 40% cap).
7. The `/parent` route is reachable only after PIN entry; the child UI has no link to it.
8. The `/boost` route shows the empty state correctly when no active signals meet threshold.
9. A mini-lesson screen renders before a question when conditions are met, and is skipped silently when the API call fails (verify by temporarily breaking the API key).
10. The word "weakness" or "weak" appears in zero `*.tsx` files outside of `app/parent/**`.

---

## 11. What to do FIRST

In order, with checkpoints:

1. Apply the migration in section 2. Stop and run the validation queries.
2. Read all distractors (section 3.1 query). Stop and **propose the taxonomy** as a list before inserting — wait for confirmation.
3. After taxonomy confirmation, backfill tags (section 3.2). Validate untagged = 0.
4. Build `map_record_attempt()` (section 4) and switch the app to use it. Test by inserting one wrong attempt and confirming the signal row appears.
5. Build the new test composer (section 5). Run a few test compositions and inspect them before turning off the old random builder.
6. Build `/boost` (section 6).
7. Build `/parent` (section 8).
8. Build mini-lessons (section 7) last. They depend on everything above.

Do not skip ahead. Each step has tests in section 10 that depend on the prior step.

---

## 12. What NOT to build

These were considered and rejected. Don't add them.

- ELO/IRT adaptive scoring. Overkill for one student; harder to debug than the rolling-mastery model.
- "Streaks must not break" mechanics. Pressure-inducing; not appropriate for a 7-year-old.
- Push notifications / reminders. The parent decides when the child practices.
- Public leaderboards or social features. This is a single-child app.
- A "weakness dashboard" for the child. See section 1, hard rules.
- Auto-reauthoring questions the child gets wrong. Instructional content is generated for *misconceptions* (the diagnosis), not for individual missed items.

---

## 13. When in doubt

- If a design question isn't covered here, ask before deciding. Especially anything involving the child's UI tone.
- If the data says something different from this spec (e.g., the existing distractors don't actually cluster into 20+ tags), surface it before forcing the spec on the data.
- If a tool call fails or a query returns unexpected results, stop and report. Don't paper over inconsistencies.
