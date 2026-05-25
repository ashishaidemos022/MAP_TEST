# Question Reporting ("Report a problem") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone at the screen report a broken vetted question (category + reason) from the test runner and the results review, storing reports in a Supabase table the operator analyzes separately.

**Architecture:** One new family-scoped table `map_question_reports` written through a `SECURITY DEFINER` RPC `map_report_question` (matches `map_record_attempt` / `map_dismiss_bank_assignment`). A reusable `ReportQuestionButton` React component (button + modal) is wired into `TestRunner.tsx` (every vetted question) and `Results.tsx` (vetted miss cards). Custom questions are excluded. Operator reads via the Supabase SQL editor (service role bypasses RLS).

**Tech Stack:** Supabase Postgres (enums, RLS, plpgsql RPC), React + Vite + TypeScript + Tailwind, `@supabase/supabase-js`. Node ESM verification script (run with `node --env-file=.env.local`). No frontend test runner exists — TypeScript (`npm run typecheck`) + a node data-guard script + manual smoke are the gates.

**Spec:** `docs/superpowers/specs/2026-05-25-question-reporting-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `migrations/20260525_map_question_reports.sql` | **new** — enums, table, indexes, RLS, RPC. Idempotent, single transaction. |
| `scripts/test-question-reports.mjs` | **new** — RPC insert + family isolation + invalid-question + text-trim/cap verification. |
| `src/lib/types.ts` | **modify** — add `ReportReason`, `ReportStatus`, `QuestionReport` types + the label map. |
| `src/components/ReportQuestionButton.tsx` | **new** — self-contained button + modal; calls the RPC. |
| `src/pages/TestRunner.tsx` | **modify** — render the button on the vetted question card. |
| `src/pages/Results.tsx` | **modify** — render the button on vetted miss cards. |

---

## Task 1: Database migration (enums, table, RLS, RPC)

**Files:**
- Create: `migrations/20260525_map_question_reports.sql`

- [ ] **Step 1: Write the migration file**

Create `migrations/20260525_map_question_reports.sql` with exactly this content:

```sql
-- =========================================================================
-- Migration: map_question_reports  (Question Reporting — "Report a problem")
-- Project:   klhzfwxpztaojekwgzcg
-- Spec:      docs/superpowers/specs/2026-05-25-question-reporting-design.md
--
-- End users report a broken VETTED question (map_questions) with a category
-- + free-text reason. Reports are family-scoped; writes flow through the
-- SECURITY DEFINER RPC map_report_question (stamps family_id, validates the
-- question is vetted). Operator analyzes via SQL (service role bypasses RLS).
-- Idempotent, single transaction.
-- =========================================================================

BEGIN;

-- 1. Enums (Postgres has no CREATE TYPE IF NOT EXISTS; guard on duplicate_object)
DO $$ BEGIN
  CREATE TYPE public.map_report_reason AS ENUM (
    'confusing_wording',
    'wrong_answer',
    'typo_or_error',
    'image_problem',
    'off_topic_or_hard',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.map_report_status AS ENUM (
    'new',
    'triaged',
    'resolved',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Table
CREATE TABLE IF NOT EXISTS public.map_question_reports (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id        uuid NOT NULL REFERENCES public.map_questions(id)        ON DELETE CASCADE,
  family_id          uuid NOT NULL REFERENCES public.map_families(id)         ON DELETE CASCADE,
  student_id         uuid REFERENCES public.map_students(id)                  ON DELETE SET NULL,
  session_id         uuid REFERENCES public.map_test_sessions(id)             ON DELETE SET NULL,
  selected_choice_id uuid REFERENCES public.map_question_choices(id)          ON DELETE SET NULL,
  reason             public.map_report_reason  NOT NULL,
  reason_text        text,
  status             public.map_report_status  NOT NULL DEFAULT 'new',
  created_at         timestamptz               NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS map_question_reports_question_idx ON public.map_question_reports (question_id);
CREATE INDEX IF NOT EXISTS map_question_reports_status_idx   ON public.map_question_reports (status);
CREATE INDEX IF NOT EXISTS map_question_reports_created_idx  ON public.map_question_reports (created_at DESC);

-- 3. RLS: family owns its own reports (SELECT only); all writes via the RPC.
ALTER TABLE public.map_question_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qr_select_own ON public.map_question_reports;
CREATE POLICY qr_select_own ON public.map_question_reports
  FOR SELECT USING (family_id = public.map_current_family_id());

-- 4. RPC: insert one report, stamping family_id server-side.
CREATE OR REPLACE FUNCTION public.map_report_question(
  p_question_id        uuid,
  p_reason             public.map_report_reason,
  p_reason_text        text DEFAULT NULL,
  p_session_id         uuid DEFAULT NULL,
  p_student_id         uuid DEFAULT NULL,
  p_selected_choice_id uuid DEFAULT NULL
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
  uuid, public.map_report_reason, text, uuid, uuid, uuid
) TO authenticated;

COMMIT;
```

- [ ] **Step 2: Write the verification script (the test)**

Create `scripts/test-question-reports.mjs` with exactly this content:

```js
// scripts/test-question-reports.mjs
// Data guard for question reporting: RPC insert stamps family_id, trims/caps
// reason_text, rejects non-vetted question ids, and RLS isolates families.
// Run: node --env-file=.env.local scripts/test-question-reports.mjs
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!URL || !SERVICE || !ANON) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY')
  process.exit(2)
}
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

function assert(cond, label) {
  if (!cond) { console.error('FAIL:', label); process.exitCode = 1; throw new Error(label) }
  console.log('PASS:', label)
}

const tag = `reportguard_${Date.now()}`
const made = { users: [], families: [] }

async function makeFamily(n) {
  const email = `${tag}_${n}@example.com`
  const password = 'guard-pw-12345!'
  const { data: u, error: ue } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (ue) throw ue
  made.users.push(u.user.id)
  const { data: fam, error: fe } = await admin.from('map_families')
    .insert({ owner_user_id: u.user.id, family_name: `${tag}_${n}` })
    .select('id').single()
  if (fe) throw fe
  made.families.push(fam.id)
  const { data: stu, error: se } = await admin.from('map_students')
    .insert({ display_name: `${tag}_kid_${n}`, family_id: fam.id, grade: 5, school_grade: 5 })
    .select('id').single()
  if (se) throw se
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: le } = await client.auth.signInWithPassword({ email, password })
  if (le) throw le
  return { familyId: fam.id, studentId: stu.id, client }
}

async function cleanup() {
  for (const id of made.families) await admin.from('map_families').delete().eq('id', id)
  for (const id of made.users) await admin.auth.admin.deleteUser(id).catch(() => {})
}

try {
  const A = await makeFamily('A')
  const B = await makeFamily('B')

  // A vetted question + one of its choices for context.
  const { data: q } = await admin.from('map_questions').select('id').eq('is_active', true).limit(1).single()
  assert(q?.id, 'a vetted question exists')
  const { data: ch } = await admin.from('map_question_choices').select('id').eq('question_id', q.id).limit(1).single()
  assert(ch?.id, 'the vetted question has a choice')

  // 1. RPC insert stamps family_id and trims reason_text.
  const { data: reportId, error: rErr } = await A.client.rpc('map_report_question', {
    p_question_id: q.id,
    p_reason: 'confusing_wording',
    p_reason_text: '  too tricky  ',
    p_student_id: A.studentId,
    p_selected_choice_id: ch.id,
  })
  assert(!rErr && reportId, `RPC insert returns id (${rErr?.message ?? ''})`)
  const { data: row } = await admin.from('map_question_reports').select('*').eq('id', reportId).single()
  assert(row.family_id === A.familyId, 'family_id stamped server-side (not client-supplied)')
  assert(row.reason_text === 'too tricky', 'reason_text is trimmed')
  assert(row.status === 'new', 'status defaults to new')
  assert(row.question_id === q.id && row.selected_choice_id === ch.id, 'context columns persisted')

  // 2. Non-vetted / unknown question id is rejected.
  const { error: badErr } = await A.client.rpc('map_report_question', {
    p_question_id: '00000000-0000-0000-0000-000000000000',
    p_reason: 'other',
    p_reason_text: 'x',
  })
  assert(badErr && /not found in vetted bank/.test(badErr.message), 'unknown question id rejected')

  // 3. Family isolation under RLS.
  const { data: bSees } = await B.client.from('map_question_reports').select('id').eq('id', reportId)
  assert((bSees ?? []).length === 0, 'family B cannot read family A report (RLS)')
  const { data: aSees } = await A.client.from('map_question_reports').select('id').eq('id', reportId)
  assert((aSees ?? []).length === 1, 'family A can read its own report (RLS)')

  // 4. reason_text cap (1000) and empty -> null.
  const { data: capId } = await A.client.rpc('map_report_question', {
    p_question_id: q.id, p_reason: 'typo_or_error', p_reason_text: 'z'.repeat(2000),
  })
  const { data: capRow } = await admin.from('map_question_reports').select('reason_text').eq('id', capId).single()
  assert(capRow.reason_text.length === 1000, 'reason_text capped at 1000 chars')
  const { data: emptyId } = await A.client.rpc('map_report_question', {
    p_question_id: q.id, p_reason: 'other', p_reason_text: '   ',
  })
  const { data: emptyRow } = await admin.from('map_question_reports').select('reason_text').eq('id', emptyId).single()
  assert(emptyRow.reason_text === null, 'whitespace-only reason_text stored as null')

  console.log('\nAll question-report data guards passed.')
} finally {
  await cleanup()
}
```

- [ ] **Step 3: Run the script BEFORE applying the migration — verify it fails**

Run: `node --env-file=.env.local scripts/test-question-reports.mjs`
Expected: FAIL on the first RPC assertion — the function does not exist yet (message like `Could not find the function public.map_report_question` / `RPC insert returns id`). This confirms the test exercises the new code.

- [ ] **Step 4: Apply the migration**

Apply `migrations/20260525_map_question_reports.sql` to project `klhzfwxpztaojekwgzcg` using the Supabase MCP `apply_migration` tool with name `map_question_reports` and the file's SQL as the query.

If the Supabase MCP is not authenticated, paste the file contents into the Supabase dashboard SQL editor (project `klhzfwxpztaojekwgzcg`) and run it. The migration is idempotent, so re-running is safe.

- [ ] **Step 5: Run the script AFTER applying — verify it passes**

Run: `node --env-file=.env.local scripts/test-question-reports.mjs`
Expected: every line prints `PASS:` and it ends with `All question-report data guards passed.` Exit code 0.

- [ ] **Step 6: Commit**

```bash
git add migrations/20260525_map_question_reports.sql scripts/test-question-reports.mjs
git commit -m "feat(db): map_question_reports table + map_report_question RPC

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Frontend types

**Files:**
- Modify: `src/lib/types.ts` (append near the other domain types)

- [ ] **Step 1: Add the report types and the friendly-label map**

Append to `src/lib/types.ts`:

```ts
// --- Question reporting ("Report a problem") ---
export type ReportReason =
  | 'confusing_wording'
  | 'wrong_answer'
  | 'typo_or_error'
  | 'image_problem'
  | 'off_topic_or_hard'
  | 'other'

export type ReportStatus = 'new' | 'triaged' | 'resolved' | 'dismissed'

export interface QuestionReport {
  id: string
  question_id: string
  family_id: string
  student_id: string | null
  session_id: string | null
  selected_choice_id: string | null
  reason: ReportReason
  reason_text: string | null
  status: ReportStatus
  created_at: string
}

// Order here drives the radio list in ReportQuestionButton.
export const REPORT_REASON_OPTIONS: { value: ReportReason; label: string }[] = [
  { value: 'confusing_wording', label: 'The question is confusing' },
  { value: 'wrong_answer', label: 'The right answer looks wrong' },
  { value: 'typo_or_error', label: "There's a typo or mistake" },
  { value: 'image_problem', label: 'The picture is broken or wrong' },
  { value: 'off_topic_or_hard', label: "This doesn't fit / too hard" },
  { value: 'other', label: 'Something else' },
]
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): question report types + reason label map

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: ReportQuestionButton component

**Files:**
- Create: `src/components/ReportQuestionButton.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/ReportQuestionButton.tsx` with exactly this content:

```tsx
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/errorMessage'
import { REPORT_REASON_OPTIONS, type ReportReason } from '../lib/types'

interface ReportQuestionButtonProps {
  /** Vetted question id (map_questions.id). */
  questionId: string
  sessionId?: string | null
  studentId?: string | null
  selectedChoiceId?: string | null
  className?: string
}

/**
 * "Report a problem" affordance for a single vetted question. Self-contained:
 * a low-emphasis button that opens a modal, collects a reason category + optional
 * text, and writes via the map_report_question RPC (which stamps family_id and
 * rejects non-vetted ids). Only render this for vetted questions — callers gate
 * on `!custom`.
 */
export default function ReportQuestionButton({
  questionId,
  sessionId,
  studentId,
  selectedChoiceId,
  className,
}: ReportQuestionButtonProps) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reported, setReported] = useState(false)

  const needsText = reason === 'other'
  const canSubmit = !!reason && (!needsText || text.trim().length > 0) && !submitting

  async function submit() {
    if (!reason || submitting) return
    setSubmitting(true)
    setError(null)
    const { error: rErr } = await supabase.rpc('map_report_question', {
      p_question_id: questionId,
      p_reason: reason,
      p_reason_text: text.trim() || null,
      p_session_id: sessionId ?? null,
      p_student_id: studentId ?? null,
      p_selected_choice_id: selectedChoiceId ?? null,
    })
    setSubmitting(false)
    if (rErr) {
      setError(errorMessage(rErr, 'Could not send your report. Please try again.'))
      return
    }
    setReported(true)
    setOpen(false)
  }

  if (reported) {
    return (
      <span className={`text-xs font-semibold text-leaf ${className ?? ''}`}>Reported ✓</span>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`text-xs font-semibold text-ink/45 underline-offset-2 hover:text-ink/70 hover:underline ${className ?? ''}`}
        title="Tell us this question has a problem"
      >
        ⚐ Report a problem
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => !submitting && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl ring-1 ring-cloud"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-2xl">What's wrong with this question?</h2>
            <div className="mt-4 grid gap-2">
              {REPORT_REASON_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 ring-1 ${
                    reason === opt.value ? 'bg-sky/10 ring-sky' : 'ring-cloud hover:bg-cream'
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    className="h-4 w-4 accent-sky"
                    checked={reason === opt.value}
                    onChange={() => setReason(opt.value)}
                  />
                  <span className="text-sm font-semibold">{opt.label}</span>
                </label>
              ))}
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={
                needsText
                  ? 'Please tell us what went wrong.'
                  : "Tell us what's wrong — optional, but it helps us fix it."
              }
              className="mt-4 w-full rounded-2xl border border-cloud p-3 text-sm focus:border-sky focus:outline-none"
            />

            {error && <p className="mt-2 text-sm font-semibold text-berry">{error}</p>}

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={submitting}
                className="btn-secondary disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Send report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

> Note on styling: this uses the project's existing Tailwind tokens/classes
> (`btn-primary`, `btn-secondary`, `card`, `ring-cloud`, `text-ink`, `bg-cream`,
> `text-leaf`, `text-berry`, `accent-sky`) seen in `TestRunner.tsx` / `Results.tsx`.
> If `npm run typecheck`/build flags an unknown utility, swap it for the nearest
> token already used in those files.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (The component is not yet imported anywhere; this just confirms it compiles.)

- [ ] **Step 3: Commit**

```bash
git add src/components/ReportQuestionButton.tsx
git commit -m "feat(ui): ReportQuestionButton component (button + modal)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Wire into the test runner

**Files:**
- Modify: `src/pages/TestRunner.tsx`

- [ ] **Step 1: Import the component**

In `src/pages/TestRunner.tsx`, add this import next to the other component imports (after the `SvgImage` import, around line 7):

```tsx
import ReportQuestionButton from '../components/ReportQuestionButton'
```

- [ ] **Step 2: Render the button on the vetted question card**

In `src/pages/TestRunner.tsx`, find the end of the question `<section>` — the feedback block's closing `})()}` immediately followed by `</section>` (around line 629–630):

```tsx
          )
        })()}
      </section>
```

Replace it with (insert the gated button before `</section>`):

```tsx
          )
        })()}

        {!current.custom && (
          <div className="mt-4 flex justify-end">
            <ReportQuestionButton
              questionId={current.id}
              sessionId={session.id}
              studentId={session.student_id}
              selectedChoiceId={reviewingAttempt?.selected_choice_id ?? selected}
            />
          </div>
        )}
      </section>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (`current`, `session`, `reviewingAttempt`, `selected` are all in scope at that point — `current.custom` gates to vetted only.)

- [ ] **Step 4: Manual smoke**

Run: `npm run dev`. Start a math test, answer a question, click "⚐ Report a problem", pick "There's a typo or mistake", type a note, Send. The button becomes "Reported ✓". Then run:
`node --env-file=.env.local scripts/test-question-reports.mjs` is NOT for this — instead verify the row landed via the Supabase dashboard:
`select reason, reason_text, question_id from map_question_reports order by created_at desc limit 1;`
Expected: your report row is present.

- [ ] **Step 5: Commit**

```bash
git add src/pages/TestRunner.tsx
git commit -m "feat(ui): report-a-problem on test runner questions (vetted only)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Wire into the results review

**Files:**
- Modify: `src/pages/Results.tsx`

- [ ] **Step 1: Import the component**

In `src/pages/Results.tsx`, add this import after the `SvgFigure` import (around line 3):

```tsx
import ReportQuestionButton from '../components/ReportQuestionButton'
```

- [ ] **Step 2: Render the button on vetted miss cards**

In `src/pages/Results.tsx`, find the closing of the miss card's inner content block (around lines 328–332):

```tsx
                    {a.question.explanation && (
                      <p className="rounded-2xl bg-cream p-3 text-ink/85">{a.question.explanation}</p>
                    )}
                  </div>
                </div>
              )
```

Replace it with (insert the gated button after the inner `</div>`, before the card's closing `</div>`):

```tsx
                    {a.question.explanation && (
                      <p className="rounded-2xl bg-cream p-3 text-ink/85">{a.question.explanation}</p>
                    )}
                  </div>
                  {!(a as unknown as { custom_question_version_id?: string | null })
                    .custom_question_version_id && (
                    <div className="mt-3 flex justify-end">
                      <ReportQuestionButton
                        questionId={a.question.id}
                        sessionId={a.session_id}
                        studentId={a.student_id}
                        selectedChoiceId={a.selected_choice_id}
                      />
                    </div>
                  )}
                </div>
              )
```

> Why the cast: custom attempts also get `a.question` populated by the Results
> adapter (lines ~69–91), so `a.question` is not the discriminator. The
> `custom_question_version_id` column (present on the raw attempt row, not on the
> `Attempt` type) being null means this is a vetted attempt.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Manual smoke**

Run: `npm run dev`. Open a finished test's results that has at least one miss (`/test/:id/results`). Each "tricky one" card shows "⚐ Report a problem". Submit one; confirm via the dashboard query from Task 4 Step 4 that the row landed and `session_id` / `selected_choice_id` are populated.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Results.tsx
git commit -m "feat(ui): report-a-problem on results miss cards (vetted only)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Final verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: PASS (tsc + vite build succeed).

- [ ] **Step 2: Re-run the data guard**

Run: `node --env-file=.env.local scripts/test-question-reports.mjs`
Expected: all `PASS:` lines, exit 0.

- [ ] **Step 3: Confirm the operator analysis query works**

In the Supabase SQL editor, run the "most-reported questions" query from the spec
(§5) and confirm it returns rows (including the ones created during smoke testing):

```sql
SELECT r.question_id, q.subject, q.grade, left(q.stem, 80) AS stem,
       count(*) AS reports, max(r.created_at) AS last_reported
FROM public.map_question_reports r
JOIN public.map_questions q ON q.id = r.question_id
GROUP BY r.question_id, q.subject, q.grade, q.stem
ORDER BY reports DESC, last_reported DESC
LIMIT 50;
```

- [ ] **Step 4: Clean up smoke-test rows (optional)**

If you want a clean table, delete the reports you created by hand during smoke
testing (the data-guard script cleans up after itself via family cascade; only
the manual `npm run dev` reports persist):

```sql
DELETE FROM public.map_question_reports WHERE reason_text ILIKE '%smoke%' OR created_at > now() - interval '1 hour';
```

(Adjust the predicate to match what you typed — don't delete real reports.)

---

## Self-Review notes

- **Spec coverage:** table + enums (Task 1) ✓; family-scoped RPC + RLS (Task 1) ✓; vetted-only validation (Task 1 RPC + frontend gates) ✓; reusable component with 6 friendly labels + "other" requires text (Tasks 2–3) ✓; test-runner wiring all vetted questions (Task 4) ✓; results wiring vetted miss cards (Task 5) ✓; verification script (Task 1) ✓; operator SQL (Task 6) ✓; non-goals respected (no parent UI, no MCP/script for analysis, no notifications) ✓.
- **Type consistency:** `map_report_question` param names (`p_question_id`, `p_reason`, `p_reason_text`, `p_session_id`, `p_student_id`, `p_selected_choice_id`) match between the migration RPC, the verification script, and the component RPC call. `ReportReason` union matches the `map_report_reason` enum values and `REPORT_REASON_OPTIONS`. Component prop names match call sites in TestRunner and Results.
- **No placeholders:** every code/SQL/command step is complete.
```
