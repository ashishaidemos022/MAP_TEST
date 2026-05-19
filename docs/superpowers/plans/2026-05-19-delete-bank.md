# Delete a Bank — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A parent can soft-delete a question bank from Tests & Banks; the delete is blocked if the bank has any assignment.

**Architecture:** One `SECURITY DEFINER` RPC `map_soft_delete_bank` (family-scoped, blocks when `map_bank_assignments` rows exist, else sets `soft_deleted_at`); a `deleteBank` lib wrapper; a Delete button per bank row in `TestsAndBanks` with `window.confirm`. No schema change (the `soft_deleted_at` column + `listBanks` filter already exist).

**Tech Stack:** Supabase Postgres (RLS, SECURITY DEFINER `SET search_path=''`), React + Vite + TS. Verification = Node data-guard + `npm run typecheck && npm run build`.

**Spec:** `docs/superpowers/specs/2026-05-19-delete-bank-design.md`.

**Branch:** `feat/delete-bank` (off `main`; spec committed there as `4becf8b`).

**Spec refinement (decided here):** existing bank RPCs (`map_create_bank` etc.) have **no explicit `GRANT EXECUTE`** — the project's default function privileges suffice. The spec mentioned "match the existing grant pattern"; the real pattern is *no* explicit grant, so this plan adds none.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `migrations/20260520_map_delete_bank.sql` | `map_soft_delete_bank` RPC | Create |
| `src/lib/banks/mutations.ts` | `deleteBank` wrapper | Modify (append) |
| `src/pages/parent/TestsAndBanks.tsx` | Delete button + handler per bank row | Modify |
| `scripts/test-delete-bank-data.mjs` | data-guard | Create |

---

## Task 1: `map_soft_delete_bank` RPC

**Files:** Create `migrations/20260520_map_delete_bank.sql`

- [ ] **Step 1: Write the migration**

```sql
-- =========================================================================
-- Migration: map_delete_bank  (Delete a Bank)
-- Project:   klhzfwxpztaojekwgzcg
-- Spec:      docs/superpowers/specs/2026-05-19-delete-bank-design.md
--
-- Adds map_soft_delete_bank(p_bank_id): family-scoped soft-delete of a
-- question bank. Blocks when ANY map_bank_assignments row references the
-- bank. No schema change (map_question_banks.soft_deleted_at already exists;
-- listBanks already filters it). Idempotent, single transaction.
-- =========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.map_soft_delete_bank(p_bank_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family uuid := public.map_current_family_id();
BEGIN
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'no family for current user';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.map_question_banks
     WHERE id = p_bank_id
       AND family_id = v_family
       AND soft_deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'bank not found or not yours';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.map_bank_assignments WHERE bank_id = p_bank_id
  ) THEN
    RAISE EXCEPTION 'This bank has been assigned and can''t be deleted. Revoke its assignments first.';
  END IF;
  UPDATE public.map_question_banks
     SET soft_deleted_at = now(), updated_at = now()
   WHERE id = p_bank_id AND family_id = v_family;
END
$$;

COMMIT;
```
> No `GRANT EXECUTE` — consistent with the existing bank RPCs (verified: `migrations/20260518/20260519` add none; default privileges let `authenticated` call them).

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` tool: project `klhzfwxpztaojekwgzcg`, name `map_delete_bank`, the full SQL above.

- [ ] **Step 3: Verify the function exists**

Supabase MCP `execute_sql`:
```sql
SELECT proname FROM pg_proc WHERE proname = 'map_soft_delete_bank';
```
Expected: one row `map_soft_delete_bank`.

- [ ] **Step 4: Commit**

```bash
git add migrations/20260520_map_delete_bank.sql
git commit -m "feat(delete-bank) map_soft_delete_bank RPC (block-if-assigned, soft-delete)"
```

---

## Task 2: `deleteBank` lib wrapper

**Files:** Modify `src/lib/banks/mutations.ts`

- [ ] **Step 1: Append the wrapper**

`src/lib/banks/mutations.ts` already has `revokeBankAssignment` ending:
```ts
export async function revokeBankAssignment(assignmentId: string): Promise<void> {
  const { error } = await supabase.rpc('map_revoke_bank_assignment', {
    p_assignment_id: assignmentId,
  })
  if (error) throw error
}
```
Add immediately after it (mirrors the same pattern):
```ts
export async function deleteBank(bankId: string): Promise<void> {
  const { error } = await supabase.rpc('map_soft_delete_bank', {
    p_bank_id: bankId,
  })
  if (error) throw error
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/banks/mutations.ts
git commit -m "feat(delete-bank) deleteBank lib wrapper"
```

---

## Task 3: Delete affordance in `TestsAndBanks`

**Files:** Modify `src/pages/parent/TestsAndBanks.tsx`

- [ ] **Step 1: Import `deleteBank`**

The file currently imports:
```tsx
import { revokeBankAssignment } from '../../lib/banks/mutations'
```
Change to:
```tsx
import { revokeBankAssignment, deleteBank } from '../../lib/banks/mutations'
```

- [ ] **Step 2: Add a `del` handler next to the existing `revoke` handler**

The file has:
```tsx
  const revoke = async (id: string) => {
    try { await revokeBankAssignment(id); reload() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not revoke.') }
  }
```
Add directly after it:
```tsx
  const del = async (b: BankRow) => {
    if (!window.confirm(`Delete "${b.name}"? This can't be undone.`)) return
    try { await deleteBank(b.id); reload() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not delete.') }
  }
```
> `BankRow` is already imported in this file (`import type { BankRow, BankAssignmentOverviewRow } from '../../lib/banks/types'`). `window.confirm` is dependency-free and the file has no existing modal-confirm pattern to reuse.
> Glyph note: use a real apostrophe `'` (U+2019) in `can't` and straight-safe template — actually use the curly `'` (U+2019): `This can't be undone.` and the bank name in U+201C/U+201D curly quotes: `Delete "${b.name}"?` — match the codebase's glyph-fidelity convention (e.g. AssignBankDialog uses `“ ”`). Final string: `Delete "${b.name}"? This can't be undone.` written with U+201C/U+201D and U+2019.

- [ ] **Step 3: Add the Delete button to each bank row's action area**

The bank-row action `<div className="flex gap-2">` currently is:
```tsx
            <div className="flex gap-2">
              {b.lane === 'custom' && (
                <Link to={`/parent/banks/${b.id}`} className="btn-ghost text-sm">Open</Link>
              )}
              <button type="button" className="btn-secondary text-sm" onClick={() => setAssignFor(b)}>
                Assign
              </button>
            </div>
```
Add a Delete button as the last child (both lanes):
```tsx
            <div className="flex gap-2">
              {b.lane === 'custom' && (
                <Link to={`/parent/banks/${b.id}`} className="btn-ghost text-sm">Open</Link>
              )}
              <button type="button" className="btn-secondary text-sm" onClick={() => setAssignFor(b)}>
                Assign
              </button>
              <button type="button" className="btn-ghost text-sm" onClick={() => del(b)}>
                Delete
              </button>
            </div>
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both exit 0 (pre-existing chunk-size warning is not a failure).

- [ ] **Step 5: Commit**

```bash
git add src/pages/parent/TestsAndBanks.tsx
git commit -m "feat(delete-bank) Delete action per bank row in Tests & Banks"
```

---

## Task 4: Data-guard + full verification

**Files:** Create `scripts/test-delete-bank-data.mjs`

- [ ] **Step 1: Write the guard** (mirrors the Phase-1/2 harness exactly)

```javascript
// scripts/test-delete-bank-data.mjs
// Delete-bank data guard: soft-delete with no assignments succeeds & hides
// the bank; delete blocked when an assignment exists; cross-family blocked;
// nonexistent/already-deleted raises.
// Run: node --env-file=.env.local scripts/test-delete-bank-data.mjs
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

const tag = `delbank_${Date.now()}`
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

async function makeVettedBank(client, std) {
  const { data, error } = await client.rpc('map_create_bank', {
    p_name: 'DelGuard', p_subject: 'math', p_grade: 5, p_lane: 'vetted',
    p_standard_codes: [std], p_planned_length: 5, p_difficulty: 'any',
  })
  if (error) throw error
  return data
}

try {
  const A = await makeFamily('A')
  const B = await makeFamily('B')
  const { data: std } = await admin.from('map_standards')
    .select('teks_code').eq('subject', 'math').eq('grade', 5).limit(1).single()
  assert(std?.teks_code, 'a vetted math/G5 standard exists')

  // 1. Delete with no assignments → succeeds, hidden from listBanks-shaped query.
  const bank1 = await makeVettedBank(A.client, std.teks_code)
  const { error: d1 } = await A.client.rpc('map_soft_delete_bank', { p_bank_id: bank1 })
  assert(!d1, 'map_soft_delete_bank succeeds with no assignments')
  const { data: listed } = await A.client
    .from('map_question_banks').select('id').is('soft_deleted_at', null)
  assert(!(listed ?? []).some((r) => r.id === bank1), 'deleted bank no longer in listBanks query')
  const { data: row1 } = await admin.from('map_question_banks')
    .select('soft_deleted_at').eq('id', bank1).single()
  assert(row1.soft_deleted_at !== null, 'soft_deleted_at is set')

  // 2. Re-deleting an already-soft-deleted bank → raises.
  const { error: d1b } = await A.client.rpc('map_soft_delete_bank', { p_bank_id: bank1 })
  assert(!!d1b, 'deleting an already-soft-deleted bank raises')

  // 3. Nonexistent id → raises.
  const { error: dN } = await A.client.rpc('map_soft_delete_bank', {
    p_bank_id: '00000000-0000-0000-0000-000000000000',
  })
  assert(!!dN, 'deleting a nonexistent bank raises')

  // 4. Bank with an assignment → blocked, bank still listed.
  const bank2 = await makeVettedBank(A.client, std.teks_code)
  const { error: aErr } = await A.client.rpc('map_assign_bank', {
    p_bank_id: bank2, p_student_ids: [A.studentId], p_due_by: null, p_parent_note: null,
  })
  assert(!aErr, 'assigned bank2 to A kid')
  const { error: d2 } = await A.client.rpc('map_soft_delete_bank', { p_bank_id: bank2 })
  assert(!!d2, 'map_soft_delete_bank blocked when an assignment exists')
  const { data: row2 } = await admin.from('map_question_banks')
    .select('soft_deleted_at').eq('id', bank2).single()
  assert(row2.soft_deleted_at === null, 'blocked bank is still live (not soft-deleted)')

  // 5. Cross-family: B cannot delete A's bank.
  const bank3 = await makeVettedBank(A.client, std.teks_code)
  const { error: dX } = await B.client.rpc('map_soft_delete_bank', { p_bank_id: bank3 })
  assert(!!dX, 'family B cannot delete family A bank')
  const { data: row3 } = await admin.from('map_question_banks')
    .select('soft_deleted_at').eq('id', bank3).single()
  assert(row3.soft_deleted_at === null, "A's bank untouched by B's delete attempt")

  console.log('\nDelete-bank data checks complete.')
} finally {
  await cleanup()
}
```

- [ ] **Step 2: Run the guard**

Run: `node --env-file=.env.local scripts/test-delete-bank-data.mjs ; echo "exit=$?"`
Expected: all `PASS:` lines, ends `Delete-bank data checks complete.`, `exit=0`. On a real assertion failure (not infra), STOP and report the failing assert + exact error — do not weaken assertions.

- [ ] **Step 3: Full verification**

Run: `npm run typecheck && npm run build ; echo "exit=$?"` → both 0.
No-regression: `node --env-file=.env.local scripts/test-banks-phase1-data.mjs 2>&1 | tail -1` and `…phase2-data.mjs 2>&1 | tail -1` → each ends `…checks complete.` (the new RPC doesn't touch their paths, but prove it).

- [ ] **Step 4: Manual QA** (dev server, parent w/ a bank, PIN). Report PASS/CONCERN:
  1. Tests & Banks: every bank row (vetted + custom) shows a **Delete** button.
  2. Delete a bank with no assignments → `window.confirm` → confirm → bank disappears from the list.
  3. Assign a bank, then Delete it → confirm → inline error "This bank has been assigned and can't be deleted. Revoke its assignments first." and the bank stays.
  4. Cancel on the confirm → nothing happens.
  5. A soft-deleted custom bank's `/parent/banks/:id` is no longer reachable via the list (its row is gone); navigating there directly shows the bank's actions failing cleanly (every bank RPC already guards `soft_deleted_at IS NULL`).

- [ ] **Step 5: Commit**

```bash
git add scripts/test-delete-bank-data.mjs
git commit -m "test(delete-bank) data guard: soft-delete / block-if-assigned / cross-family"
```

Then proceed to **finishing-a-development-branch**.

---

## Self-Review

**1. Spec coverage:**
- §2 soft-delete via `soft_deleted_at`, no hard delete, no schema change → Task 1. ✓
- §2 block if ANY assignment (all statuses) → Task 1 Step 1 (`EXISTS … map_bank_assignments`), Task 4 check 4. ✓
- §2 both lanes, one Delete affordance, lightweight confirm → Task 3 (button on every row, `window.confirm`). ✓
- §4.1 RPC family-scoped, `SECURITY DEFINER SET search_path=''`, error messages, fully-qualified → Task 1. ✓
- §4.2 `deleteBank` mirrors `revokeBankAssignment` → Task 2. ✓
- §4.3 button beside Open/Assign, error in existing `err` slot, `reload()` on success → Task 3. ✓
- §6 data-guard (delete-no-assignments / blocked / cross-family / nonexistent / already-deleted) + typecheck/build + no-regression → Task 4. ✓
- §7 out-of-scope respected: no un-delete UI, no item cleanup, no schema/table/view changes — none added. ✓
- Spec→reality refinement (no `GRANT`) recorded in the header and Task 1. ✓

**2. Placeholder scan:** No TBD/TODO. Every step has complete code/SQL. The glyph note in Task 3 Step 2 specifies exact codepoints (U+201C/U+201D/U+2019) — concrete, not vague.

**3. Type consistency:** `deleteBank(bankId: string): Promise<void>` defined Task 2, consumed in Task 3 (`deleteBank(b.id)`). `del(b: BankRow)` uses `BankRow` already imported in `TestsAndBanks`. RPC param `p_bank_id` consistent between Task 1 SQL, Task 2 lib, and Task 4 guard. `map_soft_delete_bank` name identical across all tasks. Error/`err` handling reuses the file's existing `setErr` + `reload()` exactly as the sibling `revoke` handler does. No mismatches.
