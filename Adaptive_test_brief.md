# Feature Brief: Adaptive Test Composition

> Hand this entire document to Claude Code. It evolves the existing `src/lib/sessionBuilder.ts` from balanced-random into MAP-style band-adaptive selection. Read end-to-end before starting. Append to `CLAUDE.md` Phase 2 section when done.

---

## 1. What we are and aren't building

**Are:** A 25-question test where the *band* of the next question is chosen based on the student's rolling performance during the test. Student gets too many right → next question is from a higher band. Too many wrong → lower band. This is what makes a real MAP test feel like it "knows" you.

**Are NOT:**
- Rasch IRT or 2PL/3PL item response theory. We don't have item-level difficulty calibrations, just band labels. Don't fake it with random logits.
- Variable-length termination based on standard error. Phase 1 is fixed at 25 questions. Period.
- Adaptive boost sets. Boost stays targeted to the misconception. Don't reuse this code path there.

**Hard rules — do not violate:**

- The student starts every test at their `current_band` (from `map_v_student_current_band`). Default `181_190` if no history.
- The band can move at most **±2 bands** from the start band during a single test. A 2nd-grader at `181_190` should never see `below_161` or `above_210` in the same session.
- A single answer never moves the band. We use a rolling window of the last 3 (warmup) or 5 (steady-state) answers.
- Stretch questions (above `current_band`) are capped at **20% of the test**. So at most 5 of 25 can be above where the student started.
- Same question never repeats in a session.
- Questions answered correctly in the last 7 days are excluded.
- The 40% growth-area cap from the Mastery Tracker brief still applies. Adaptivity layers on top of it, doesn't replace it.
- For **reading**: the band decision is made *between passages*, never within. Passages always stay intact.

If a band has fewer than 3 eligible questions for a student at the moment of selection, fall back one step toward `current_band` rather than crash. Log the fallback.

---

## 2. The algorithm (math and language)

```
function composeAdaptiveTest(studentId, subject, n=25):
  // 1. Anchor
  start_band = SELECT current_band FROM map_v_student_current_band
               WHERE student_id = studentId
               (default '181_190')
  current_band = start_band
  floor_band  = max(below_161, start_band - 2)   // lookup in band ordinal
  ceil_band   = min(above_210, start_band + 2)

  // 2. Pre-compute mastery buckets (same as Mastery Tracker brief §5)
  mastery = SELECT * FROM map_v_mastery_by_standard
            WHERE student_id = studentId AND subject = subject
  growth      = mastery WHERE status='growth'
  developing  = mastery WHERE status='developing'
  mastered    = mastery WHERE status='mastered'
  unseen      = standards NOT IN mastery

  // 3. Targets (caps, not floors)
  growth_remaining   = min(round(n*0.25), len(growth)*2)   // 40% rule
  stretch_remaining  = round(n * 0.20)                     // ≤ 5 stretch
  selected = []
  recent_window = []   // booleans, max length 5
  standards_touched = {}

  // 4. Selection loop — but note: at compose time we DO NOT know answers
  //    yet. So we run this loop at runtime, in the test runner, after each
  //    answer comes in. See §3 for the runtime contract. Below is the
  //    PER-QUESTION selection logic.
  for i in 1..n:
    target_band = decideBand(recent_window, current_band, floor_band, ceil_band)
    if target_band > start_band:
      if stretch_remaining <= 0:
        target_band = start_band   // cap stretches
      else:
        stretch_remaining -= 1

    candidates = SELECT q.* FROM map_questions q
                 JOIN map_standards s ON s.id = q.standard_id
                 WHERE q.subject = subject
                   AND q.is_active
                   AND q.rit_band = target_band
                   AND q.id NOT IN selected
                   AND q.id NOT IN (recently_correct_7d)
                   AND s.id NOT IN standards_touched   // first pass: spread
                   AND apply_mastery_bucket_caps(s)    // growth/dev/mast/unseen
    if len(candidates) < 3:
      // relax standard-spread filter, re-query
      candidates = same query without standards_touched filter
    if len(candidates) < 1:
      // fall back one band toward start_band, retry once
      target_band = step_toward(target_band, start_band)
      candidates = retry
    if len(candidates) < 1:
      // hard fallback — pick anything eligible at any band ±1
      candidates = wider net
      log_warning('adaptive_fallback', studentId, target_band)

    pick = random_choice(candidates)
    selected.append(pick)
    standards_touched.add(pick.standard_id)
    if pick is in growth_standards: growth_remaining -= 1
    current_band = target_band
    yield pick   // runtime: hand to test runner, wait for answer

  return selected

function decideBand(recent_window, current_band, floor_band, ceil_band):
  if len(recent_window) < 3:
    return current_band            // warm-up: stay at student's level
  acc = mean(recent_window)        // window of 3 to 5
  if acc >= 0.80:
    return min(current_band + 1, ceil_band)   // step up
  if acc <= 0.40:
    return max(current_band - 1, floor_band)  // step down
  return current_band                          // hold
```

A few things to internalize:

- **Warm-up matters.** First 3 questions are at the student's start band, no matter what. A kid getting one wrong on question 1 should not be punished by an immediate downshift.
- **The band moves, but only by 1.** Never jump 2 bands in one step. The signal isn't strong enough.
- **The window slides.** After the 6th answer, the oldest answer falls off. So the test responds to recent trend, not the whole history.
- **Standard spread is a soft constraint.** Adaptivity wins ties: if the only band-appropriate question repeats a standard already used, allow it after one retry rather than break the band logic.

---

## 3. Runtime contract — selection happens *during* the test

The current `sessionBuilder.ts` builds all 25 questions up front, then the test runner just walks the array. That has to change.

**New contract:** the session is initialized with a placeholder array of 25 slots, but only the first 3 questions are pre-selected. Each subsequent question is picked *after* the previous answer is recorded.

Two implementation options. Pick one and stay consistent:

**Option A — picker function in the test runner (recommended for Phase 2).**
- New helper `getNextAdaptiveQuestion(sessionId)` in `src/lib/sessionBuilder.ts`. Reads the session's recorded attempts, computes the next band, queries for one question, returns it.
- The test runner calls it after each `map_record_attempt` succeeds.
- `map_test_sessions.question_ids` becomes append-only during the test (length grows from 3 → 25 as the test progresses), or the column becomes nullable per slot.

**Option B — server-side stored procedure.**
- Wrap `getNextAdaptiveQuestion` as a Postgres function `map_pick_next_question(p_session_id uuid)` that does the band decision and the query in one round trip.
- Clean for atomicity but harder to debug. Skip unless Option A turns out to be too slow.

Schema change required for Option A:
```sql
-- One small migration to support adaptive session growth
ALTER TABLE map_test_sessions
  ADD COLUMN IF NOT EXISTS is_adaptive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS start_band map_rit_band,
  ADD COLUMN IF NOT EXISTS planned_length int NOT NULL DEFAULT 25;
```

Use `is_adaptive=true` for new test sessions. Boost sessions stay `is_adaptive=false` and use the existing non-adaptive composer.

---

## 4. Reading is different — adapt by passage, not by question

Reading questions are anchored to passages. You cannot mid-passage swap to a harder question without confusing the kid. So:

```
function composeAdaptiveReadingTest(studentId, n=25):
  start_band = ... (same as math)
  current_band = start_band
  selected = []
  recent_window = []
  passages_used = set()

  while len(selected) < n:
    target_band = decideBand(recent_window, current_band, floor, ceil)
    passage = pick a passage at target_band
              that has not been used in this session
              and was not used by this student in the last 14 days
    questions = ALL questions for that passage (4–6)
    selected.extend(questions)
    passages_used.add(passage.id)

  trim selected to exactly n   // last passage may overshoot

  return selected
```

The window updates **per passage**, not per question. Specifically:
- After each passage finishes, compute accuracy on just *that passage*.
- Append a single boolean to `recent_window` based on whether the student got ≥ 60% of the passage's questions right.
- This is a coarser signal than math, but it's the right grain — comprehension at a band is a passage-level property.

**Stretch cap for reading:** at most one passage above `start_band` per session. (Reading stretch is much harder than math stretch; one is enough.)

If reading runs out of band-appropriate untouched passages, fall back to any unused passage at `current_band - 1` before going further afield. Log the fallback so we know to author more passages.

---

## 5. Updates to `CLAUDE.md`

When this brief is implemented, add this section to `CLAUDE.md` replacing the current §5.2 ("Test session creation algorithm — for Phase 1 (non-adaptive but balanced)"):

> ### 5.2 Adaptive test session creation (Phase 2)
>
> Test sessions use band-stepping adaptivity. Implementation: `src/lib/sessionBuilder.ts` → `getNextAdaptiveQuestion()`.
>
> The algorithm anchors at the student's `current_band` (from `map_v_student_current_band`), then steps the band ±1 based on rolling accuracy of the last 5 answers. Hard caps: ±2 bands from start, ≤ 20% stretch above start, ≤ 40% growth-area standards (per Mastery Tracker §5). Reading adapts at passage boundaries, not within passages.
>
> Boost sessions are intentionally non-adaptive and use a separate composer.

---

## 6. Acceptance criteria

All of these must pass before this is done:

1. A new test session for a student with no history starts at band `181_190` and has its first 3 questions all at `181_190`.
2. A simulated student who answers all questions correctly causes the band sequence to step up to `start_band + 2` and stay capped — never `start_band + 3` or higher.
3. A simulated student who answers all questions wrong causes the band sequence to step down to `start_band - 2` and stay capped.
4. A simulated student with mixed answers (around 70% correct) hovers within `start_band ± 1`, with band changes happening at most every 3-5 questions, never on every single answer.
5. Stretch questions never exceed 5 in a 25-question test.
6. Growth-area questions never exceed 10 in a 25-question test (the 40% cap from Mastery Tracker).
7. No question ID appears twice in the same session.
8. No question that the student answered correctly in the last 7 days appears.
9. Reading sessions never split a passage. The total question count may overshoot 25 by at most the size of the last passage minus 1, then trim to 25.
10. Reading sessions never include the same passage twice in the same session, and skip passages the student saw in the last 14 days when alternatives exist.
11. Boost sessions still work and are unaffected — they don't go through `getNextAdaptiveQuestion`.
12. There is a unit test (or manual verification script) that simulates 100 random-answer test sessions and confirms band sequences are sane.

---

## 7. What to do FIRST

In order, with checkpoints:

1. Apply the schema migration in §3. Stop and verify the new columns exist.
2. Build a `decideBand(window, current, floor, ceil)` pure function with unit tests covering the warm-up case, step-up, step-down, and ceiling/floor caps. Stop and confirm tests pass.
3. Build `getNextAdaptiveQuestion(sessionId)` as the per-question picker for math and language. Wire it into the test runner. Test with one real session.
4. Add the reading-specific picker `getNextAdaptivePassage(sessionId)`. Test with one real reading session.
5. Update `composeTest` in `src/lib/sessionBuilder.ts` so adaptive sessions start with only 3 pre-picked questions and the rest get filled in at runtime.
6. Run the simulated-session validator from §6.12.
7. Update `CLAUDE.md` per §5.

Do not skip ahead. Each step has tests in §6 that depend on the prior step.

---

## 8. What NOT to build

These were considered and rejected. Don't add them.

- IRT-based item selection. No.
- Variable-length tests (stop early when SE < threshold). Phase 3 maybe.
- Adaptive boost sets. Boost is intentionally non-adaptive — it stays on the misconception.
- "Difficulty hints" to the kid mid-test. The whole point is the test feels seamless. Never tell a 7-year-old "this next one is harder."
- Backtracking. If the picker makes a bad choice (e.g., a question the kid hated), too bad — we don't redo questions mid-test. Phase 1 of adaptive: forward-only.

---

## 9. When in doubt

- If the algorithm picks something obviously bad in testing, log everything (window, target band, candidate count, fallback path) and surface the log to the user. Don't hide the bug under "well, it's adaptive."
- If the question bank doesn't have enough questions in adjacent bands for the algorithm to work cleanly, surface that finding before forcing the algorithm to limp. Coverage thinness is a real constraint that adaptivity *exposes* rather than hides.
- If anything in this brief contradicts the Mastery Tracker brief, the Mastery Tracker brief wins — that one is more deeply integrated.
