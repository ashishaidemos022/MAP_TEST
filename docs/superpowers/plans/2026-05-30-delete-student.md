# Delete a Student Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a parent permanently delete a kid (and all their practice data) from the family, via a "Danger zone" in the per-kid settings tab.

**Architecture:** A `SECURITY DEFINER` Postgres RPC (`map_delete_student`) deletes per-student rows in a controlled order to avoid a known cascade-ordering trap, then deletes the student. The UI calls the RPC from `ParentSettings.tsx`, refreshes the student list, clears the active student if needed, and redirects to the profile picker. A Node data-guard script proves the cascade, the trap case, anonymized report survival, and cross-family isolation.

**Tech Stack:** Supabase (Postgres + RLS + RPC), React + TypeScript (Vite), `@supabase/supabase-js`.

**Spec:** `docs/superpowers/specs/2026-05-30-delete-student-design.md`

---

## File Structure

- **Create:** `migrations/20260530_map_delete_student.sql` — the `map_delete_student(p_student_id uuid)` RPC.
- **Create:** `scripts/test-delete-student.mjs` — data-guard test (cascade, trap case, report survival, isolation, already-deleted).
- **Modify:** `src/pages/parent/ParentSettings.tsx` — add a "Danger zone" section + confirm dialog + delete handler + post-delete navigation.

The migration is applied via the Supabase MCP `apply_migration` (project `klhzfwxpztaojekwgzcg`). The test runs with `node --env-file=.env.local`.

---

## Task 1: The `map_delete_student` RPC (migration)

**Files:**
- Create: `migrations/20260530_map_delete_student.sql`

- [ ] **Step 1: Write the migration file**

Create `migrations/20260530_map_delete_student.sql` with exactly this content:

```sql
-- =========================================================================
-- Migration: map_delete_student  (Delete a Student)
-- Project:   klhzfwxpztaojekwgzcg
-- Spec:      docs/superpowers/specs/2026-05-30-delete-student-design.md
--
-- Adds map_delete_student(p_student_id): family-scoped HARD delete of a
-- student and all their per-student data. Deletes in a controlled order to
-- avoid the session->assignment trap: deleting a map_test_sessions row fires
-- map_bank_assignments.session_id ON DELETE SET NULL, which violates the
-- map_ba_status_coherent CHECK (23514) on an in_progress assignment. So we
-- delete assignments BEFORE sessions. Idempotent (CREATE OR REPLACE), single
-- transaction. Models 20260520_map_delete_bank.sql.
--
-- Blast radius (confirmed against migrations):
--   map_test_sessions         student_id CASCADE  -> deleted (cascades attempts, pick_diagnostics)
--   map_misconception_signals student_id CASCADE  -> deleted
--   map_bank_assignments      student_id CASCADE  -> deleted (explicitly, first)
--   map_question_reports      student_id SET NULL -> survives, anonymized
-- =========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.map_delete_student(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family uuid := public.map_current_family_id();
BEGIN
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'no family for current user';
  END IF;

  -- Ownership check (also the not-found guard).
  IF NOT EXISTS (
    SELECT 1 FROM public.map_students
     WHERE id = p_student_id AND family_id = v_family
  ) THEN
    RAISE EXCEPTION 'student not found or not yours';
  END IF;

  -- Controlled order: assignments first (else the session delete below trips
  -- map_bank_assignments.session_id SET NULL -> map_ba_status_coherent 23514).
  DELETE FROM public.map_bank_assignments WHERE student_id = p_student_id;
  DELETE FROM public.map_test_sessions    WHERE student_id = p_student_id; -- cascades attempts + pick_diagnostics
  DELETE FROM public.map_students         WHERE id = p_student_id;          -- cascades signals; reports -> SET NULL
END
$$;

GRANT EXECUTE ON FUNCTION public.map_delete_student(uuid) TO authenticated;

COMMIT;
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool with name `map_delete_student` and the SQL body above (the tool wraps its own transaction; if it rejects the explicit `BEGIN/COMMIT`, strip those two lines and apply the inner statements).

Expected: success, no error.

- [ ] **Step 3: Verify the function exists**

Run (via Supabase MCP `execute_sql`):

```sql
SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc WHERE proname = 'map_delete_student';
```

Expected: one row — `map_delete_student | p_student_id uuid`.

- [ ] **Step 4: Commit**

```bash
git add migrations/20260530_map_delete_student.sql
git commit -m "feat(db): map_delete_student RPC — family-scoped hard delete of a kid

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Data-guard test script

**Files:**
- Create: `scripts/test-delete-student.mjs`

This test seeds two throwaway families (A, B). For A's kid it builds a real bank
assignment, admin-inserts a session and one attempt (service role bypasses RLS),
links the assignment via `map_start_bank_assignment` so it becomes
**in_progress** (the cascade trap), and files a question report through the
`map_report_question` RPC (the reports table is SELECT-only under RLS — all
writes go through that RPC). It then deletes the kid via `map_delete_student` and
asserts the full cascade, anonymized report survival, and cross-family
isolation. Cleanup deletes the families/users it created.

API shapes used here are taken verbatim from `scripts/test-banks-phase1-data.mjs`
(assign/start), `src/pages/TestRunner.tsx` (`map_record_attempt` args), and
`migrations/20260525_map_question_reports.sql` (`map_report_question` args).

- [ ] **Step 1: Write the test script**

Create `scripts/test-delete-student.mjs` with exactly this content:

```js
// scripts/test-delete-student.mjs
// Delete-student data guard: hard delete cascades sessions/attempts/signals and
// bank assignments; the in_progress-assignment trap case succeeds (assignments
// deleted before sessions); question reports survive with student_id NULL;
// cross-family blocked; already-deleted raises.
// Run: node --env-file=.env.local scripts/test-delete-student.mjs
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!URL || !SERVICE || !ANON) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY')
  process.exit(2)
}
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
function assert(c, l) { if (!c) { console.error('FAIL:', l); process.exitCode = 1; throw new Error(l) } console.log('PASS:', l) }

const tag = `delstu_${Date.now()}`
const made = { users: [], families: [] }

async function makeFamily(n) {
  const email = `${tag}_${n}@example.com`, password = 'guard-pw-12345!'
  const { data: u, error: ue } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (ue) throw ue
  made.users.push(u.user.id)
  const { data: fam, error: fe } = await admin.from('map_families')
    .insert({ owner_user_id: u.user.id, family_name: `${tag}_${n}` }).select('id').single()
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

  // A vetted math/G5 standard to build a bank from.
  const { data: std } = await admin.from('map_standards')
    .select('teks_code').eq('subject', 'math').eq('grade', 5).limit(1).single()
  assert(std?.teks_code, 'a vetted math/G5 standard exists')

  // A real active question + one of its choices, to make the attempt meaningful.
  const { data: q } = await admin.from('map_questions')
    .select('id').eq('is_active', true).limit(1).single()
  assert(q?.id, 'an active question exists')
  const { data: ch } = await admin.from('map_question_choices')
    .select('id').eq('question_id', q.id).limit(1).single()
  assert(ch?.id, 'the question has a choice')

  // A creates + assigns a bank (assign returns an array of assignment ids).
  const { data: bankId, error: cErr } = await A.client.rpc('map_create_bank', {
    p_name: 'DelStu Set', p_subject: 'math', p_grade: 5, p_lane: 'vetted',
    p_standard_codes: [std.teks_code], p_planned_length: 5, p_difficulty: 'any',
  })
  assert(!cErr && bankId, 'map_create_bank returns a bank id')
  const { data: aids, error: aErr } = await A.client.rpc('map_assign_bank', {
    p_bank_id: bankId, p_student_ids: [A.studentId], p_due_by: null, p_parent_note: null,
  })
  assert(!aErr && Array.isArray(aids) && aids.length === 1, 'map_assign_bank creates one assignment')
  const assignmentId = aids[0]

  // Admin-insert a session for the kid (same shape as test-banks-phase1-data.mjs).
  const { data: sess, error: seErr } = await admin.from('map_test_sessions').insert({
    student_id: A.studentId, subject: 'math', grade: 5, status: 'in_progress',
    question_ids: [q.id], current_index: 0, correct_count: 0, kind: 'custom',
    is_adaptive: false, planned_length: 5,
    custom_config: { standard_ids: [], requested_count: 5, actual_count: 5, shortfall_reason: null },
  }).select('id').single()
  assert(!seErr && sess?.id, 'composed a session row for the kid')
  const sessionId = sess.id

  // Admin-insert one attempt in that session (proves the session-cascade path).
  const { error: atErr } = await admin.from('map_attempts').insert({
    session_id: sessionId, student_id: A.studentId, question_id: q.id,
    selected_choice_id: ch.id, is_correct: false, time_spent_ms: 1000,
  })
  assert(!atErr, 'inserted one attempt in the session')

  // Link the assignment to the session -> in_progress (this is the trap case).
  const { error: startErr } = await A.client.rpc('map_start_bank_assignment', {
    p_assignment_id: assignmentId, p_session_id: sessionId,
  })
  assert(!startErr, 'map_start_bank_assignment links session (assigned -> in_progress)')
  const { data: aRow } = await admin.from('map_bank_assignments')
    .select('status, session_id').eq('id', assignmentId).single()
  assert(aRow.status === 'in_progress' && aRow.session_id === sessionId, 'assignment is in_progress + linked')

  // A files a question report tied to the kid + session, via the RPC (reports
  // are SELECT-only under RLS; writes only through map_report_question).
  const { data: reportId, error: rErr } = await A.client.rpc('map_report_question', {
    p_question_id: q.id, p_reason: 'wrong_answer',
    p_session_id: sessionId, p_student_id: A.studentId,
  })
  assert(!rErr && reportId, 'A files a question report tied to the kid')

  // 1. Cross-family: B cannot delete A's kid.
  const { error: dX } = await B.client.rpc('map_delete_student', { p_student_id: A.studentId })
  assert(!!dX, 'family B cannot delete family A kid')
  const { data: stillThere } = await admin.from('map_students')
    .select('id').eq('id', A.studentId).maybeSingle()
  assert(!!stillThere, "A's kid untouched by B's delete attempt")

  // 2. A deletes its own kid -> succeeds despite the in_progress assignment (trap case).
  const { error: d1 } = await A.client.rpc('map_delete_student', { p_student_id: A.studentId })
  assert(!d1, 'map_delete_student succeeds with an in_progress bank assignment (trap handled)')

  // 3. Student + all per-student data gone.
  const { data: goneStu } = await admin.from('map_students')
    .select('id').eq('id', A.studentId).maybeSingle()
  assert(!goneStu, 'student row deleted')
  const afterSessions = await admin.from('map_test_sessions')
    .select('id', { count: 'exact', head: true }).eq('student_id', A.studentId)
  assert((afterSessions.count ?? 0) === 0, 'sessions deleted')
  const afterAttempts = await admin.from('map_attempts')
    .select('id', { count: 'exact', head: true }).eq('session_id', sessionId)
  assert((afterAttempts.count ?? 0) === 0, 'attempts deleted (session cascade)')
  const afterDiag = await admin.from('map_pick_diagnostics')
    .select('id', { count: 'exact', head: true }).eq('session_id', sessionId)
  assert((afterDiag.count ?? 0) === 0, 'pick diagnostics deleted (session cascade)')
  const afterSignals = await admin.from('map_misconception_signals')
    .select('id', { count: 'exact', head: true }).eq('student_id', A.studentId)
  assert((afterSignals.count ?? 0) === 0, 'misconception signals deleted')
  const afterAssign = await admin.from('map_bank_assignments')
    .select('id', { count: 'exact', head: true }).eq('student_id', A.studentId)
  assert((afterAssign.count ?? 0) === 0, 'bank assignments deleted')

  // 4. Question report survives, anonymized (student_id NULL).
  const { data: survived } = await admin.from('map_question_reports')
    .select('id, student_id').eq('id', reportId).maybeSingle()
  assert(!!survived, 'question report survives the kid delete')
  assert(survived.student_id === null, 'surviving report is anonymized (student_id NULL)')

  // 5. Deleting an already-deleted kid -> raises.
  const { error: d2 } = await A.client.rpc('map_delete_student', { p_student_id: A.studentId })
  assert(!!d2, 'deleting an already-deleted kid raises')

  console.log('\nDelete-student data checks complete.')
} finally {
  await cleanup()
}
```

- [ ] **Step 2: Run the test (expect it to PASS against the applied RPC)**

Run: `node --env-file=.env.local scripts/test-delete-student.mjs`
Expected: a list of `PASS:` lines ending with `Delete-student data checks complete.` and exit code 0.

If `map_start_bank_assignment`'s or `map_assign_bank`'s argument shape differs,
reconcile against `scripts/test-banks-phase1-data.mjs` (the canonical example) —
do not change the assertions.

- [ ] **Step 3: Commit**

```bash
git add scripts/test-delete-student.mjs
git commit -m "test(db): data guard for map_delete_student

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Danger zone UI in ParentSettings

**Files:**
- Modify: `src/pages/parent/ParentSettings.tsx`

`ParentSettings` renders under `KidDetail`'s `settings` tab and receives
`studentId` + `displayName` props (resolved into `resolvedStudentId` /
`resolvedDisplayName`). It already calls `useActiveStudent()` for `activeStudent`.
We add: `setActiveStudent` + `refreshStudents` from that hook, `useNavigate`,
delete state, a handler, a Danger-zone section, and a confirm dialog component.

- [ ] **Step 1: Add the `useNavigate` import**

In `src/pages/parent/ParentSettings.tsx`, the first import line is currently:

```ts
import { useEffect, useMemo, useState } from 'react'
```

Add a React Router import immediately after it:

```ts
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
```

- [ ] **Step 2: Pull extra values from the hook and add navigate + delete state**

Find this line (~91):

```ts
  const { activeStudent } = useActiveStudent()
```

Replace it with:

```ts
  const { activeStudent, setActiveStudent, refreshStudents } = useActiveStudent()
  const navigate = useNavigate()
```

Then find the state block ending with:

```ts
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
```

Replace it with (adds two delete-related state vars):

```ts
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
```

- [ ] **Step 3: Add the delete handler**

Insert this handler immediately before the line `const summary = useMemo(() => {`:

```ts
  // Hard delete: the RPC erases the kid and all their data (sessions, attempts,
  // diagnostics, signals, bank assignments). Question reports survive,
  // anonymized. After it lands we drop the active student if it was this kid
  // and bounce to the profile picker (which shows the empty state for the
  // last-kid case).
  const deleteStudent = async () => {
    if (!resolvedStudentId) return
    setDeleting(true)
    setError(null)
    const { error: delErr } = await supabase.rpc('map_delete_student', {
      p_student_id: resolvedStudentId,
    })
    if (delErr) {
      setDeleting(false)
      setConfirmingDelete(false)
      setError(errorMessage(delErr, 'Could not delete this student.'))
      return
    }
    if (activeStudent?.id === resolvedStudentId) {
      setActiveStudent(null)
    }
    await refreshStudents()
    navigate('/')
  }
```

- [ ] **Step 4: Render the Danger-zone section and confirm dialog**

The final lines of the returned JSX are currently:

```tsx
      {pendingGrade != null && (
        <ConfirmDialog
          grade={pendingGrade}
          counts={counts[pendingGrade] ?? { math: 0, reading: 0, language: 0 }}
          saving={saving}
          onCancel={() => setPendingGrade(null)}
          onConfirm={() => void confirmAndSave(pendingGrade)}
        />
      )}
    </div>
  )
}
```

Replace that block with (adds the Danger-zone card and the delete confirm dialog
inside the root `<div>`, then defines the dialog component):

```tsx
      {pendingGrade != null && (
        <ConfirmDialog
          grade={pendingGrade}
          counts={counts[pendingGrade] ?? { math: 0, reading: 0, language: 0 }}
          saving={saving}
          onCancel={() => setPendingGrade(null)}
          onConfirm={() => void confirmAndSave(pendingGrade)}
        />
      )}

      <div className="mt-6 rounded-2xl border border-berry/30 bg-berry/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-berry">
              Danger zone
            </p>
            <p className="mt-0.5 text-sm text-ink/70">
              Permanently delete {resolvedDisplayName} and all of their tests,
              answers, and progress. This can&apos;t be undone.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="rounded-full bg-berry px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-berry/90"
          >
            Delete {resolvedDisplayName}
          </button>
        </div>
      </div>

      {confirmingDelete && (
        <DeleteStudentDialog
          name={resolvedDisplayName}
          deleting={deleting}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => void deleteStudent()}
        />
      )}
    </div>
  )
}

function DeleteStudentDialog({
  name,
  deleting,
  onCancel,
  onConfirm,
}: {
  name: string
  deleting: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="card w-full max-w-md p-5">
        <h3 className="font-display text-2xl">Delete {name}?</h3>
        <p className="mt-2 text-sm text-ink/70">
          This permanently erases {name} and all of their tests, answers, and
          progress. This can&apos;t be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="btn-ghost text-sm"
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-full bg-berry px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-berry/90 disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : `Yes, delete ${name}`}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit code 0, no errors. (`setActiveStudent`/`refreshStudents` exist on
`ActiveStudentContextValue` in `src/lib/activeStudent.tsx` — lines ~27, 30.)

- [ ] **Step 6: Manual smoke (recommended)**

Run `npm run dev`, sign in, open a kid → Settings tab → Danger zone → Delete →
confirm. Expect to land on the profile picker with that kid gone. Deleting the
last kid shows the "add your first kid" empty state.

- [ ] **Step 7: Commit**

```bash
git add src/pages/parent/ParentSettings.tsx
git commit -m "feat(parent): Danger zone to delete a student

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** RPC + controlled-order trap fix (Task 1) ✓; blast radius incl. anonymized report survival, each asserted (Task 2) ✓; UI placement in settings-tab Danger zone + simple confirm dialog (Task 3) ✓; post-delete clear-active + redirect-to-picker, last-kid empty state (Task 3 Steps 3/6) ✓; verification script + typecheck (Tasks 2/3) ✓.
- **Type consistency:** `deleteStudent`, `DeleteStudentDialog`, `confirmingDelete`, `deleting` defined and referenced consistently. `setActiveStudent`/`refreshStudents` come from `ActiveStudentContextValue` (already exported). RPC param is `p_student_id` everywhere (migration, test, UI).
- **API fidelity:** `map_assign_bank` returns an id array (→ `aids[0]`); `map_start_bank_assignment` takes `{ p_assignment_id, p_session_id }`; reports are written via the `map_report_question` RPC (table is SELECT-only). All taken from existing code, not invented.
- **`berry`** is a real Tailwind token (`tailwind.config.js`: `#E11D48`) already used for error text in this file.
- **No placeholders.**
