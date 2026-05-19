# Assignment Management (Dismiss) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A parent can dismiss terminal (completed/revoked) bank-assignment rows so they leave the Assignments lists; history is preserved at the DB layer.

**Architecture:** One nullable `map_bank_assignments.dismissed_at`; the overview view gains `WHERE a.dismissed_at IS NULL`; a family-scoped `map_dismiss_bank_assignment` RPC (terminal-only); a `dismissBankAssignment` lib wrapper; a Dismiss button on terminal rows in `TestsAndBanks` and `KidAssignmentsList`.

**Tech Stack:** Supabase Postgres (RLS, SECURITY DEFINER `SET search_path=''`), React + Vite + TS. Verification = Node data-guard + `npm run typecheck && npm run build` + no-regression.

**Spec:** `docs/superpowers/specs/2026-05-19-assignment-management-design.md`.

**Branch:** `feat/assignment-mgmt` (off `main`; spec committed `3282b7d`). No explicit `GRANT` on the RPC (consistent with the other bank RPCs).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `migrations/20260521_map_assignment_dismiss.sql` | `dismissed_at` column + view recreate + `map_dismiss_bank_assignment` RPC | Create |
| `src/lib/banks/mutations.ts` | `dismissBankAssignment` wrapper | Modify (append) |
| `src/pages/parent/TestsAndBanks.tsx` | `dismiss` handler + Dismiss button on terminal rows | Modify |
| `src/components/parent/KidAssignmentsList.tsx` | reusable loader + `dismiss` + Dismiss button | Modify |
| `scripts/test-assignment-dismiss-data.mjs` | data-guard | Create |

---

## Task 1: Migration — column + view recreate + RPC

**Files:** Create `migrations/20260521_map_assignment_dismiss.sql`

- [ ] **Step 1: Write the migration** (the view block is the current `map_v_bank_assignment_overview` DDL **verbatim** — 18 columns, same order — with only the `WHERE a.dismissed_at IS NULL` added)

```sql
-- =========================================================================
-- Migration: map_assignment_dismiss  (Assignment Management — Dismiss)
-- Project:   klhzfwxpztaojekwgzcg
-- Spec:      docs/superpowers/specs/2026-05-19-assignment-management-design.md
--
-- Adds map_bank_assignments.dismissed_at + map_dismiss_bank_assignment RPC
-- (terminal-only, family-scoped) and re-creates map_v_bank_assignment_overview
-- with a dismissed_at IS NULL filter (columns unchanged). Idempotent, single
-- transaction.
-- =========================================================================

BEGIN;

ALTER TABLE public.map_bank_assignments
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;

DROP VIEW IF EXISTS public.map_v_bank_assignment_overview;
CREATE VIEW public.map_v_bank_assignment_overview
WITH (security_invoker = true) AS
SELECT
  a.id                AS assignment_id,
  a.family_id         AS family_id,
  a.bank_id           AS bank_id,
  b.name              AS bank_name,
  b.lane              AS lane,
  b.subject           AS subject,
  b.grade             AS grade,
  a.student_id        AS student_id,
  s.display_name      AS student_name,
  a.status            AS status,
  a.due_by            AS due_by,
  a.parent_note       AS parent_note,
  a.assigned_at       AS assigned_at,
  a.completed_at      AS completed_at,
  a.session_id        AS session_id,
  sess.correct_count  AS questions_correct,
  sess.planned_length AS questions_total
FROM public.map_bank_assignments a
JOIN public.map_question_banks   b    ON b.id = a.bank_id
JOIN public.map_students         s    ON s.id = a.student_id
LEFT JOIN public.map_test_sessions sess ON sess.id = a.session_id
WHERE a.dismissed_at IS NULL;

CREATE OR REPLACE FUNCTION public.map_dismiss_bank_assignment(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family uuid := public.map_current_family_id();
BEGIN
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'no family for current user';
  END IF;
  UPDATE public.map_bank_assignments
     SET dismissed_at = now()
   WHERE id = p_assignment_id
     AND family_id = v_family
     AND dismissed_at IS NULL
     AND status IN ('completed','revoked');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assignment not found, not yours, already dismissed, or not in a dismissable (completed/revoked) state';
  END IF;
END
$$;

COMMIT;
```
> The `SELECT … FROM … LEFT JOIN …` block above is copied exactly from `migrations/20260518_map_question_banks.sql`'s `map_v_bank_assignment_overview` (verified) — same 18 output columns in the same order, so `BankAssignmentOverviewRow` and every consumer are unaffected; the only change is the trailing `WHERE a.dismissed_at IS NULL`.

- [ ] **Step 2: Apply** — Supabase MCP `apply_migration`, project `klhzfwxpztaojekwgzcg`, name `map_assignment_dismiss`, the SQL above.

- [ ] **Step 3: Verify** — Supabase MCP `execute_sql`:
```sql
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='map_bank_assignments' AND column_name='dismissed_at') AS col,
  (SELECT count(*) FROM pg_proc WHERE proname='map_dismiss_bank_assignment') AS rpc,
  (SELECT count(*) FROM pg_views WHERE viewname='map_v_bank_assignment_overview') AS view;
```
Expected: `col=1, rpc=1, view=1`.

- [ ] **Step 4: Verify the view still exposes the 18 columns** — `execute_sql`:
```sql
SELECT string_agg(column_name, ',' ORDER BY ordinal_position)
FROM information_schema.columns WHERE table_name='map_v_bank_assignment_overview';
```
Expected exactly: `assignment_id,family_id,bank_id,bank_name,lane,subject,grade,student_id,student_name,status,due_by,parent_note,assigned_at,completed_at,session_id,questions_correct,questions_total`. If it differs, STOP — the view recreate drifted.

- [ ] **Step 5: Commit**
```bash
git add migrations/20260521_map_assignment_dismiss.sql
git commit -m "feat(assignment-mgmt) dismissed_at column + view filter + map_dismiss_bank_assignment RPC"
```

---

## Task 2: Lib — `dismissBankAssignment`

**Files:** Modify `src/lib/banks/mutations.ts`

- [ ] **Step 1: Append the wrapper** after `deleteBank` (mirrors `revokeBankAssignment`):
```ts
export async function dismissBankAssignment(assignmentId: string): Promise<void> {
  const { error } = await supabase.rpc('map_dismiss_bank_assignment', {
    p_assignment_id: assignmentId,
  })
  if (error) throw error
}
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → exit 0.

- [ ] **Step 3: Commit**
```bash
git add src/lib/banks/mutations.ts
git commit -m "feat(assignment-mgmt) dismissBankAssignment lib wrapper"
```

---

## Task 3: `TestsAndBanks` — Dismiss on terminal rows

**Files:** Modify `src/pages/parent/TestsAndBanks.tsx`

- [ ] **Step 1: Import** — change
```tsx
import { revokeBankAssignment, deleteBank } from '../../lib/banks/mutations'
```
to
```tsx
import { revokeBankAssignment, deleteBank, dismissBankAssignment } from '../../lib/banks/mutations'
```

- [ ] **Step 2: Add a `dismiss` handler** directly after the existing `revoke` handler:
```tsx
  const dismiss = async (id: string) => {
    try { await dismissBankAssignment(id); reload() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not dismiss.') }
  }
```

- [ ] **Step 3: Render Dismiss on terminal rows.** The Assignments row currently ends:
```tsx
            {r.status === 'assigned' && (
              <button type="button" className="btn-ghost text-xs" onClick={() => revoke(r.assignment_id)}>
                Revoke
              </button>
            )}
          </div>
```
Add the Dismiss button right after the Revoke block (still inside the row `<div>`):
```tsx
            {r.status === 'assigned' && (
              <button type="button" className="btn-ghost text-xs" onClick={() => revoke(r.assignment_id)}>
                Revoke
              </button>
            )}
            {(r.status === 'completed' || r.status === 'revoked') && (
              <button type="button" className="btn-ghost text-xs" onClick={() => dismiss(r.assignment_id)}>
                Dismiss
              </button>
            )}
          </div>
```

- [ ] **Step 4: Typecheck + build** — `npm run typecheck && npm run build` → both exit 0.

- [ ] **Step 5: Commit**
```bash
git add src/pages/parent/TestsAndBanks.tsx
git commit -m "feat(assignment-mgmt) Dismiss action on terminal rows in Tests & Banks"
```

---

## Task 4: `KidAssignmentsList` — reusable loader + Dismiss

**Files:** Modify `src/components/parent/KidAssignmentsList.tsx`

- [ ] **Step 1: Replace the file** with this version (extracts the loader into a reusable `load` so Dismiss can refresh; adds the terminal-only Dismiss button; keeps the mount-guard):
```tsx
// src/components/parent/KidAssignmentsList.tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { getBankAssignmentOverview } from '../../lib/banks/queries'
import { dismissBankAssignment } from '../../lib/banks/mutations'
import type { BankAssignmentOverviewRow } from '../../lib/banks/types'

export function KidAssignmentsList({ studentId }: { studentId: string }) {
  const mounted = useRef(true)
  const [rows, setRows] = useState<BankAssignmentOverviewRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback(() => {
    getBankAssignmentOverview()
      .then((all) => {
        if (!mounted.current) return
        setRows(all.filter((r) => r.student_id === studentId))
      })
      .catch((e) => {
        if (!mounted.current) return
        setError(e instanceof Error ? e.message : 'Failed to load assignments.')
      })
  }, [studentId])

  useEffect(() => {
    load()
  }, [load])

  const dismiss = async (id: string) => {
    try {
      await dismissBankAssignment(id)
      if (mounted.current) load()
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : 'Could not dismiss.')
      }
    }
  }

  if (error) return <p className="card p-5 text-sm text-rust">{error}</p>
  if (!rows) return <p className="mt-6 text-center font-display text-xl">Loading…</p>
  if (rows.length === 0)
    return (
      <p className="card p-6 text-sm text-ink/60">
        No assigned banks for this kid yet. Assign one from Tests &amp; Banks.
      </p>
    )

  return (
    <div className="card divide-y divide-cloud/70">
      {rows.map((r) => (
        <div
          key={r.assignment_id}
          className="flex items-center justify-between gap-2 p-4 text-sm"
        >
          <span>
            <b>{r.bank_name}</b>{' '}
            <span className="rounded bg-cloud px-1 text-xs">{r.lane}</span>{' '}
            <span className="rounded bg-cloud px-1 text-xs">{r.status}</span>
            {r.status === 'completed' && r.questions_total != null && (
              <span className="text-ink/60">
                {' '}
                · {r.questions_correct ?? 0}/{r.questions_total}
              </span>
            )}
            {r.due_by && (
              <span className="text-ink/60">
                {' '}
                · due {new Date(r.due_by).toLocaleDateString()}
              </span>
            )}
          </span>
          {(r.status === 'completed' || r.status === 'revoked') && (
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => dismiss(r.assignment_id)}
            >
              Dismiss
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
```
> Glyph note: `·` U+00B7, `…` U+2026, `&amp;` in JSX — unchanged from the original; only the loader extraction + dismiss button are new.

- [ ] **Step 2: Typecheck + build** — `npm run typecheck && npm run build` → both exit 0.

- [ ] **Step 3: Commit**
```bash
git add src/components/parent/KidAssignmentsList.tsx
git commit -m "feat(assignment-mgmt) KidAssignmentsList: reusable loader + Dismiss on terminal rows"
```

---

## Task 5: Data-guard + full verification

**Files:** Create `scripts/test-assignment-dismiss-data.mjs`

- [ ] **Step 1: Write the guard** (Phase-1/2 harness style)

```javascript
// scripts/test-assignment-dismiss-data.mjs
// Dismiss guard: completed/revoked dismiss → hidden from the overview view;
// dismissing assigned / in_progress → raises & stays; already-dismissed →
// raises; cross-family blocked.
// Run: node --env-file=.env.local scripts/test-assignment-dismiss-data.mjs
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

const tag = `dismiss_${Date.now()}`
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
async function makeBank(client, std) {
  const { data, error } = await client.rpc('map_create_bank', {
    p_name: 'DismissGuard', p_subject: 'math', p_grade: 5, p_lane: 'vetted',
    p_standard_codes: [std], p_planned_length: 5, p_difficulty: 'any',
  })
  if (error) throw error
  return data
}
// Assign bank → return assignment id (status='assigned').
async function assign(client, bankId, studentId) {
  const { data, error } = await client.rpc('map_assign_bank', {
    p_bank_id: bankId, p_student_ids: [studentId], p_due_by: null, p_parent_note: null,
  })
  if (error) throw error
  return data[0]
}
function inView(client, aid) {
  return client.from('map_v_bank_assignment_overview').select('assignment_id')
    .eq('assignment_id', aid).maybeSingle().then(({ data }) => !!data)
}

try {
  const A = await makeFamily('A')
  const B = await makeFamily('B')
  const { data: std } = await admin.from('map_standards')
    .select('teks_code').eq('subject', 'math').eq('grade', 5).limit(1).single()
  assert(std?.teks_code, 'a vetted math/G5 standard exists')
  const bank = await makeBank(A.client, std.teks_code)

  // assigned → dismiss must RAISE and the row stays in the view.
  const aAssigned = await assign(A.client, bank, A.studentId)
  const { error: e1 } = await A.client.rpc('map_dismiss_bank_assignment', { p_assignment_id: aAssigned })
  assert(!!e1, 'dismiss of an assigned assignment raises')
  assert(await inView(A.client, aAssigned), 'assigned row still visible after blocked dismiss')

  // revoked → dismiss succeeds, row leaves the view.
  await A.client.rpc('map_revoke_bank_assignment', { p_assignment_id: aAssigned })
  const { error: e2 } = await A.client.rpc('map_dismiss_bank_assignment', { p_assignment_id: aAssigned })
  assert(!e2, 'dismiss of a revoked assignment succeeds')
  assert(!(await inView(A.client, aAssigned)), 'revoked+dismissed row gone from view')
  const { data: r1 } = await admin.from('map_bank_assignments')
    .select('dismissed_at').eq('id', aAssigned).single()
  assert(r1.dismissed_at !== null, 'dismissed_at is set')

  // already dismissed → raises.
  const { error: e3 } = await A.client.rpc('map_dismiss_bank_assignment', { p_assignment_id: aAssigned })
  assert(!!e3, 'dismissing an already-dismissed assignment raises')

  // completed → dismiss succeeds. (Drive a session to completion via admin to
  // reach status='completed' through the trigger, like the Phase-1 guard.)
  const aDone = await assign(A.client, bank, A.studentId)
  const { data: sess } = await admin.from('map_test_sessions').insert({
    student_id: A.studentId, subject: 'math', grade: 5, status: 'in_progress',
    question_ids: [], current_index: 0, correct_count: 0, kind: 'custom',
    is_adaptive: false, planned_length: 5,
    custom_config: { standard_ids: [], requested_count: 5, actual_count: 5, shortfall_reason: null },
  }).select('id').single()
  await A.client.rpc('map_start_bank_assignment', { p_assignment_id: aDone, p_session_id: sess.id })
  // in_progress now → dismiss must RAISE.
  const { error: e4 } = await A.client.rpc('map_dismiss_bank_assignment', { p_assignment_id: aDone })
  assert(!!e4, 'dismiss of an in_progress assignment raises')
  await admin.from('map_test_sessions')
    .update({ status: 'completed', current_index: 5, completed_at: new Date().toISOString() })
    .eq('id', sess.id)
  const { data: aRow } = await admin.from('map_bank_assignments').select('status').eq('id', aDone).single()
  assert(aRow.status === 'completed', 'assignment reached completed via trigger')
  const { error: e5 } = await A.client.rpc('map_dismiss_bank_assignment', { p_assignment_id: aDone })
  assert(!e5, 'dismiss of a completed assignment succeeds')
  assert(!(await inView(A.client, aDone)), 'completed+dismissed row gone from view')

  // cross-family: B cannot dismiss A's row.
  const aX = await assign(A.client, bank, A.studentId)
  await A.client.rpc('map_revoke_bank_assignment', { p_assignment_id: aX })
  const { error: e6 } = await B.client.rpc('map_dismiss_bank_assignment', { p_assignment_id: aX })
  assert(!!e6, 'family B cannot dismiss family A assignment')
  const { data: rX } = await admin.from('map_bank_assignments').select('dismissed_at').eq('id', aX).single()
  assert(rX.dismissed_at === null, "A's row untouched by B")

  console.log('\nAssignment-dismiss data checks complete.')
} finally {
  await cleanup()
}
```

- [ ] **Step 2: Run the guard** — `node --env-file=.env.local scripts/test-assignment-dismiss-data.mjs ; echo "exit=$?"` → all `PASS:`, ends `Assignment-dismiss data checks complete.`, `exit=0`. On a real assertion failure (not infra), STOP and report the failing assert + exact error.

- [ ] **Step 3: Full verification + no-regression**
```
npm run typecheck && npm run build ; echo "exit=$?"     # both 0
node --env-file=.env.local scripts/test-banks-phase1-data.mjs 2>&1 | tail -1   # …complete.
node --env-file=.env.local scripts/test-banks-phase2-data.mjs 2>&1 | tail -1   # …complete.
node --env-file=.env.local scripts/test-delete-bank-data.mjs 2>&1 | tail -1    # …complete.
```
All three existing guards must still end `…checks complete.` — they read `map_v_bank_assignment_overview` and never set `dismissed_at`, so the view recreate must not change their results. If any regresses, STOP (the view recreate drifted).

- [ ] **Step 4: Manual QA** (dev server, parent w/ terminal assignments, PIN). Report PASS/CONCERN:
  1. `/parent/tests` Assignments: rows with status `completed` or `revoked` show a **Dismiss** button; `assigned` shows Revoke (not Dismiss); `in_progress` shows neither.
  2. Click Dismiss on a completed row → it disappears from the list (and stays gone on reload).
  3. Kid Detail → Assignments: same Dismiss on terminal rows; dismissing there also removes it from the parent Tests & Banks list (same view).
  4. No console/network error; non-terminal rows have no Dismiss.

- [ ] **Step 5: Commit**
```bash
git add scripts/test-assignment-dismiss-data.mjs
git commit -m "test(assignment-mgmt) data guard: terminal-only dismiss / view filter / cross-family"
```
Then proceed to **finishing-a-development-branch**.

---

## Self-Review

**1. Spec coverage:**
- §2 soft `dismissed_at` + view filter → Task 1. ✓
- §2 terminal-only (`completed`/`revoked`); RPC enforces → Task 1 RPC `status IN ('completed','revoked')`; Task 5 asserts assigned & in_progress raise. ✓
- §2 Dismiss on both `TestsAndBanks` and `KidAssignmentsList` → Tasks 3, 4. ✓
- §4.1 migration (column, view recreate verbatim+WHERE, RPC, no GRANT) → Task 1 (+ Step 4 verifies the 18 columns unchanged). ✓
- §4.2 `dismissBankAssignment` mirrors `revokeBankAssignment` → Task 2. ✓
- §4.3 handlers mirror `revoke`, errors in existing slots, reload-on-success → Tasks 3, 4. ✓
- §6 data-guard (completed/revoked dismiss hides; assigned/in_progress raise; already-dismissed raises; cross-family) + typecheck/build + no-regression on Phase-1/2/delete-bank guards → Task 5. ✓
- §7 view-recreate fidelity is load-bearing → Task 1 Step 4 column-list assertion + Task 5 no-regression. ✓
- §7 out-of-scope respected (no un-dismiss UI, no bulk, no in_progress/assigned dismiss, no analytics change) — none added. ✓

**2. Placeholder scan:** No TBD/TODO. The view SQL is the full verbatim 18-column DDL, not an ellipsis. Every step has complete code. Task 1 Step 4 gives the exact expected column string.

**3. Type consistency:** `dismissBankAssignment(assignmentId: string): Promise<void>` defined Task 2, consumed identically Tasks 3 & 4. RPC param `p_assignment_id` consistent across Task 1 SQL / Task 2 lib / Task 5 guard. `map_dismiss_bank_assignment` name identical everywhere. `BankAssignmentOverviewRow` unchanged (view columns asserted identical in Task 1 Step 4) so `getBankAssignmentOverview` and both list components keep compiling. `KidAssignmentsList` rewrite preserves its public prop `{ studentId: string }` (KidDetail's `<KidAssignmentsList studentId={id} />` unaffected). Handlers reuse each file's existing `setErr`/`setError` + reload pattern exactly.
