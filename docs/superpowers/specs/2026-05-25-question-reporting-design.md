# Question Reporting ("Report a problem") — Design

**Date:** 2026-05-25
**Status:** Approved, ready for implementation plan
**Project:** MAP Practice Test App (Supabase project `klhzfwxpztaojekwgzcg`)

---

## 1. Problem & intent

The vetted question bank (`map_questions`, ~thousands of items across Grades 1–5) is
authored in batches and spot-reviewed, but errors slip through: a confusing stem, a
mis-keyed correct answer, a typo, a broken SVG, an off-topic or mis-banded item. Today
the only way a bad question gets fixed is if the operator happens to notice it.

We want **end users to report a bad vetted question, with a clear reason, from inside the
app**, so the operator can collect those reports in the backend and **analyze them
separately** to drive bank fixes.

### Scope decisions (settled during brainstorming)

- **Who/where:** Anyone at the screen (kid or a helping parent) can report, via a
  "Report a problem" button on **every vetted question** — in the **test runner** and on
  the **results review** (missed-question cards).
- **What's captured:** a **reason category** (required) plus **free-text reason**
  (optional, except for "Other").
- **Analysis:** reports land in **one Supabase table**; the operator analyzes via the
  **Supabase dashboard / SQL** (service role bypasses RLS). No in-app operator UI.
- **Vetted only:** reporting applies to `map_questions`. Custom (parent-authored)
  questions are the family's own content — the button does not appear on them.

### Non-goals (v1)

- No parent-facing "my reports" screen.
- No operator dashboard, MCP tool, or analysis read-script.
- No notifications/email on a new report.
- No server-side rate limiting (the client disables the button after one submit per
  question per view).
- No reporting on custom questions.

---

## 2. Data model

One new table and two new enums, following the existing `map_`-prefixed,
family-scoped conventions (mirrors `map_question_banks` / `map_bank_assignments`).

```sql
-- enums
CREATE TYPE map_report_reason AS ENUM (
  'confusing_wording',  -- stem/choices unclear
  'wrong_answer',       -- the keyed correct answer looks wrong
  'typo_or_error',      -- typo or factual/math mistake
  'image_problem',      -- SVG figure broken or doesn't match the question
  'off_topic_or_hard',  -- doesn't fit the topic / mis-banded / way too hard
  'other'               -- something else (free text required by UI)
);

CREATE TYPE map_report_status AS ENUM (
  'new',        -- default; operator hasn't looked yet
  'triaged',    -- operator has read it, action pending
  'resolved',   -- question fixed / handled
  'dismissed'   -- not actionable
);

-- table
CREATE TABLE public.map_question_reports (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id        uuid NOT NULL REFERENCES public.map_questions(id) ON DELETE CASCADE,
  family_id          uuid NOT NULL REFERENCES public.map_families(id)  ON DELETE CASCADE,
  student_id         uuid REFERENCES public.map_students(id)           ON DELETE SET NULL,
  session_id         uuid REFERENCES public.map_test_sessions(id)      ON DELETE SET NULL,
  selected_choice_id uuid REFERENCES public.map_question_choices(id)   ON DELETE SET NULL,
  reason             map_report_reason  NOT NULL,
  reason_text        text,
  status             map_report_status  NOT NULL DEFAULT 'new',
  created_at         timestamptz        NOT NULL DEFAULT now()
);

CREATE INDEX map_question_reports_question_idx ON public.map_question_reports (question_id);
CREATE INDEX map_question_reports_status_idx   ON public.map_question_reports (status);
CREATE INDEX map_question_reports_created_idx  ON public.map_question_reports (created_at DESC);
```

Notes:
- `family_id` is **stamped server-side** from `map_current_family_id()`; the client never
  supplies it.
- `student_id` / `session_id` / `selected_choice_id` are **best-effort context**
  (nullable). They cost nothing to capture and make "the right answer looks wrong"
  reports actionable (you can see exactly what the kid picked).
- `reason_text` is nullable in the DB; the **UI** requires it only for `other`. The RPC
  trims it and caps length at 1000 chars.

---

## 3. Write path — `SECURITY DEFINER` RPC

Writes go through an RPC (consistent with `map_record_attempt`,
`map_dismiss_bank_assignment`), not a raw client insert. This keeps `family_id`
authoritative and validates the target question.

```sql
CREATE OR REPLACE FUNCTION public.map_report_question(
  p_question_id        uuid,
  p_reason             map_report_reason,
  p_reason_text        text   DEFAULT NULL,
  p_session_id         uuid   DEFAULT NULL,
  p_student_id         uuid   DEFAULT NULL,
  p_selected_choice_id uuid   DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family uuid := public.map_current_family_id();
  v_text   text := nullif(btrim(left(coalesce(p_reason_text, ''), 1000)), '');
  v_id     uuid;
BEGIN
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'no family for current user';
  END IF;
  -- Vetted-only: reject custom version ids and junk.
  IF NOT EXISTS (SELECT 1 FROM public.map_questions WHERE id = p_question_id) THEN
    RAISE EXCEPTION 'question not found in vetted bank';
  END IF;

  INSERT INTO public.map_question_reports
    (question_id, family_id, student_id, session_id, selected_choice_id, reason, reason_text)
  VALUES
    (p_question_id, v_family, p_student_id, p_session_id, p_selected_choice_id, p_reason, v_text)
  RETURNING id INTO v_id;

  RETURN v_id;
END
$$;

GRANT EXECUTE ON FUNCTION public.map_report_question(
  uuid, map_report_reason, text, uuid, uuid, uuid
) TO authenticated;
```

### RLS

```sql
ALTER TABLE public.map_question_reports ENABLE ROW LEVEL SECURITY;

-- Family owns its own reports (readable for a possible future "you reported this" UI).
CREATE POLICY qr_select_own ON public.map_question_reports
  FOR SELECT USING (family_id = public.map_current_family_id());

-- No client INSERT/UPDATE/DELETE policy: all writes flow through the SECURITY DEFINER
-- RPC, which bypasses RLS and stamps family_id itself.
```

The migration is **idempotent and single-transaction** (`BEGIN; … COMMIT;`), using
`IF NOT EXISTS` / `CREATE OR REPLACE` and a guarded `DO` block for the enums (Postgres
has no `CREATE TYPE IF NOT EXISTS`).

---

## 4. Frontend

### 4.1 Reusable component — `src/components/ReportQuestionButton.tsx`

A self-contained button + modal. Props:

```ts
interface ReportQuestionButtonProps {
  questionId: string
  sessionId?: string | null
  studentId?: string | null
  selectedChoiceId?: string | null
  className?: string
}
```

Behavior:
- Renders a small, low-emphasis ghost button: **"⚐ Report a problem"**.
- Click opens a modal with:
  - a radio list of the six friendly reason labels (table below),
  - a textarea: *"Tell us what's wrong — optional, but it helps us fix it."*
  - Submit + Cancel.
- **"Something else" (`other`) requires** non-empty text; Submit is disabled until then.
- Submit calls `supabase.rpc('map_report_question', { p_question_id, p_reason,
  p_reason_text, p_session_id, p_student_id, p_selected_choice_id })`.
- On success: modal closes, the button becomes **"Reported ✓"** (disabled) for that
  question instance. On error: show `errorMessage(e, …)` inline in the modal; stay open.
- Local component state only; no global store.

Friendly label → enum mapping:

| Label shown to user | `map_report_reason` |
|---|---|
| The question is confusing | `confusing_wording` |
| The right answer looks wrong | `wrong_answer` |
| There's a typo or mistake | `typo_or_error` |
| The picture is broken or wrong | `image_problem` |
| This doesn't fit / too hard | `off_topic_or_hard` |
| Something else | `other` |

### 4.2 Test runner — `src/pages/TestRunner.tsx`

- Render `<ReportQuestionButton>` in the question card (header area near the stem/speaker,
  or footer), shown **only for vetted questions** (`!current.custom`).
- Available whether or not the question is answered yet.
- Pass: `questionId={current.id}`, `sessionId={session.id}`,
  `studentId={session.student_id}`, and the in-play choice
  (`selectedChoiceId={reviewingAttempt?.selected_choice_id ?? selected}`).

### 4.3 Results — `src/pages/Results.tsx`

- Render `<ReportQuestionButton>` on each **missed-question** card (the existing `misses`
  section), **vetted only**. Note: custom attempts also get `a.question` populated (via
  the Results adapter at lines ~69–91), so `a.question != null` is *not* the
  discriminator — gate on the attempt having a real vetted `question_id` (i.e.
  `custom_question_version_id` is null). The button is skipped on custom miss cards.
- Pass: `questionId={a.question.id}`, `sessionId={a.session_id}`,
  `studentId={a.student_id}`, `selectedChoiceId={a.selected_choice_id}`.

> Results-side reporting is intentionally limited to missed questions (that's where the
> "right answer looks wrong" complaint surfaces). Every question — correct or not — is
> still reportable live in the test runner.

---

## 5. Analyzing separately (operator, no in-app UI)

Run from the Supabase SQL editor (service role bypasses RLS). Canonical queries:

**Most-reported questions, with stem and counts:**
```sql
SELECT r.question_id,
       q.subject, q.grade, q.rit_band,
       left(q.stem, 80) AS stem,
       count(*)                          AS reports,
       count(*) FILTER (WHERE r.status = 'new') AS unreviewed,
       max(r.created_at)                 AS last_reported
FROM public.map_question_reports r
JOIN public.map_questions q ON q.id = r.question_id
GROUP BY r.question_id, q.subject, q.grade, q.rit_band, q.stem
ORDER BY reports DESC, last_reported DESC
LIMIT 50;
```

**Counts by category:**
```sql
SELECT reason, count(*)
FROM public.map_question_reports
GROUP BY reason ORDER BY count(*) DESC;
```

**Recent new reports with the reason text (and what was picked):**
```sql
SELECT r.created_at, r.reason, r.reason_text,
       left(q.stem, 100) AS stem,
       ch.label AS picked_label, ch.body AS picked_body
FROM public.map_question_reports r
JOIN public.map_questions q ON q.id = r.question_id
LEFT JOIN public.map_question_choices ch ON ch.id = r.selected_choice_id
WHERE r.status = 'new'
ORDER BY r.created_at DESC
LIMIT 50;
```

**Triage:**
```sql
UPDATE public.map_question_reports
SET status = 'resolved'  -- or 'triaged' / 'dismissed'
WHERE id = '<report_id>';
```

---

## 6. Verification

`scripts/test-question-reports.mjs` (mirrors the repo's `test-*.mjs` convention, e.g.
`test-mcp-isolation.mjs`). Asserts:
1. RPC insert as an authenticated family member succeeds and returns an id; the row has
   the correct `family_id` stamped (not client-supplied).
2. Reporting a non-existent / custom question id raises `question not found in vetted bank`.
3. Family isolation: family A cannot `SELECT` family B's reports under RLS.
4. `reason_text` is trimmed, empty → NULL, and capped at 1000 chars.

Manual smoke: report from the test runner and from a results miss card; confirm rows
appear via the SQL above; confirm the button does not render on a custom question.

---

## 7. Files touched

| File | Change |
|---|---|
| `migrations/20260525_map_question_reports.sql` | new — enums, table, indexes, RLS, RPC (idempotent, single tx) |
| `src/components/ReportQuestionButton.tsx` | new — button + modal component |
| `src/pages/TestRunner.tsx` | wire button into the vetted question card |
| `src/pages/Results.tsx` | wire button into vetted miss cards |
| `src/lib/types.ts` | (optional) add `ReportReason` / `ReportStatus` / `QuestionReport` types |
| `scripts/test-question-reports.mjs` | new — RPC + RLS verification |

No changes to the adaptive picker, session builder, or MCP server.
