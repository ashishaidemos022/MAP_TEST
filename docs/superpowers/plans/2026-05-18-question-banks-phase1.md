# Question Banks — Phase 1 (Substrate + Vetted Lane) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A parent can build a vetted-question test, name it, save it as a reusable Bank, assign it to one or more kids, and the kid takes a freshly-composed test that reports back to the parent — all on the legacy `/parent` page, on `main`.

**Architecture:** Three new family-scoped tables (`map_question_banks`, `map_question_bank_items`, `map_bank_assignments`) + a read view + RPCs, applied as one idempotent migration mirroring `migrations/20260428_map_multi_tenant.sql` conventions. The vetted kid composer reuses the proven `createCustomTest`. Assignment completion is detected by an AFTER UPDATE trigger on `map_test_sessions` (no `TestRunner.tsx` change). Custom-lane columns exist but custom RPC paths raise a clear "Phase 2" error so the schema is whole and stable.

**Tech Stack:** Supabase Postgres (RLS, SECURITY DEFINER `SET search_path=''`, **text+CHECK not PG enums**), React + Vite + TS + React Router v6, Tailwind. Verification = Node `--env-file=.env.local` data-guard script + `npm run typecheck && npm run build` + manual QA (no React test runner — repo convention).

**Spec:** `docs/superpowers/specs/2026-05-18-question-banks-and-assignment-design.md` (Phase 1 = §8 first bullet).

**Branch:** `feat/question-banks` (already created off `main`; the spec is committed there as `5e74bfc`). Do NOT touch the shelved `feat/parent-area-*` branches.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `migrations/20260518_map_question_banks.sql` | Full Phase-1 schema: 3 tables, RLS, coherence CHECK, completion trigger, overview view, RPCs | Create |
| `src/lib/customTest.ts` | Lift `CUSTOM_MAX_COUNT` 50→60 (+ range message) | Modify (lines 11–12 + error string) |
| `src/lib/banks/types.ts` | TS types for Bank, BankAssignmentOverview rows | Create |
| `src/lib/banks/queries.ts` | `listBanks`, `getBankAssignmentOverview` | Create |
| `src/lib/banks/mutations.ts` | `createVettedBank`, `assignBank`, `revokeBankAssignment` (RPC wrappers) | Create |
| `src/lib/banks/startAssignedBank.ts` | Kid composer: vetted lane → `createCustomTest` → `map_start_bank_assignment`; ported error policy | Create |
| `src/pages/parent/TestsAndBanks.tsx` | Parent section: saved-banks list + entry points + Assignments view | Create |
| `src/pages/parent/SaveVettedBank.tsx` | Vetted builder reused, ending in Name + Save-as-Bank | Create |
| `src/components/parent/AssignBankDialog.tsx` | Pick kids + optional due/note → `assignBank` | Create |
| `src/pages/parent/Parent.tsx` | Render `<TestsAndBanks/>` | Modify (1 import + 1 element) |
| `src/App.tsx` | Route `/parent/banks/new` → `SaveVettedBank` | Modify (1 route) |
| `src/components/AssignedBanksPanel.tsx` | Kid-home additive "Assigned: … Start" | Create |
| `src/pages/Home.tsx` (kid home) | Render `<AssignedBanksPanel/>` | Modify (1 import + 1 element) |
| `scripts/test-banks-phase1-data.mjs` | Data-guard: create→assign→compose→complete→revoke→cross-family RLS | Create |

---

## Conventions the engineer MUST follow (verified against `main`)

- **No PG enums.** `subject` is `text NOT NULL CHECK (subject IN ('math','reading','language'))`. Assignment status is `text ... CHECK (status IN ('assigned','in_progress','completed','revoked'))`. Do **not** `CREATE TYPE`.
- **Migration file:** one `BEGIN; … COMMIT;` transaction, fully idempotent (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`, `CREATE OR REPLACE FUNCTION`), with the `-- ===` header comment block exactly like `20260428_map_multi_tenant.sql` lines 1–26.
- **RLS:** four policies per family-scoped table (`_select_own`/`_insert_own`/`_update_own`/`_delete_own`) using `family_id = public.map_current_family_id()`. Enable RLS with `ALTER TABLE … ENABLE ROW LEVEL SECURITY;`.
- **Functions:** `LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''`, every reference fully qualified (`public.`, `auth.uid()`). Resolve family with `public.map_current_family_id()`; never accept `family_id` as a parameter.
- **Apply migrations** with the Supabase MCP `apply_migration` tool (name `map_question_banks`). Project ref `klhzfwxpztaojekwgzcg`. Verify with `execute_sql`.
- **Client queries never filter `family_id`** — RLS scopes automatically (see `src/lib/activeStudent.tsx:61`).

---

## Task 1: Schema — tables, constraints, RLS

**Files:**
- Create: `migrations/20260518_map_question_banks.sql`

- [ ] **Step 1: Write the migration header + the three tables + RLS**

Create `migrations/20260518_map_question_banks.sql` with exactly:

```sql
-- =========================================================================
-- Migration: map_question_banks  (Question Banks — Phase 1)
-- Project:   klhzfwxpztaojekwgzcg
-- Spec:      docs/superpowers/specs/2026-05-18-question-banks-and-assignment-design.md (§8 Phase 1)
--
-- Adds the assignable "Bank" substrate + vetted lane:
--   * map_question_banks       (the assignable unit: vetted recipe OR custom set)
--   * map_question_bank_items  (custom lane's curated questions; Phase-2 use)
--   * map_bank_assignments     (bank x kid, status-tracked, frozen snapshot col)
--   * map_v_bank_assignment_overview (security_invoker read view)
--   * RPCs: map_create_bank / map_assign_bank / map_revoke_bank_assignment /
--           map_start_bank_assignment  (vetted fully; custom raises Phase-2)
--   * AFTER UPDATE trigger on map_test_sessions → flips linked assignment
--     to 'completed' when its session completes (no client change)
--
-- Properties:
--   * Idempotent. Safe to re-run end-to-end. Single transaction.
--   * No PG enums (repo convention: text + CHECK).
--   * RLS on every new table via family_id = public.map_current_family_id().
--   * Custom-lane columns exist now; custom RPC paths raise a clear Phase-2
--     error so the schema is stable and Phase 2 adds no schema churn.
-- =========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.map_question_banks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       uuid NOT NULL REFERENCES public.map_families(id) ON DELETE CASCADE,
  owner_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name            text NOT NULL,
  subject         text NOT NULL,
  grade           int  NOT NULL,
  lane            text NOT NULL,
  standard_codes  text[] NOT NULL DEFAULT '{}',
  planned_length  int,
  difficulty      text,
  soft_deleted_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_qb_name_len   CHECK (char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT map_qb_subject    CHECK (subject IN ('math','reading','language')),
  CONSTRAINT map_qb_grade      CHECK (grade BETWEEN 0 AND 12),
  CONSTRAINT map_qb_lane       CHECK (lane IN ('vetted','custom')),
  CONSTRAINT map_qb_difficulty CHECK (difficulty IS NULL OR difficulty IN ('easy','medium','hard','any')),
  CONSTRAINT map_qb_length_rng CHECK (planned_length IS NULL OR planned_length BETWEEN 5 AND 60),
  CONSTRAINT map_qb_lane_coherent CHECK (
    (lane = 'vetted' AND planned_length IS NOT NULL)
    OR
    (lane = 'custom' AND standard_codes = '{}' AND planned_length IS NULL AND difficulty IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.map_question_bank_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id            uuid NOT NULL REFERENCES public.map_question_banks(id) ON DELETE CASCADE,
  custom_question_id uuid NOT NULL REFERENCES public.map_custom_questions(id) ON DELETE CASCADE,
  sort_order         int  NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_qbi_unique UNIQUE (bank_id, custom_question_id)
);

CREATE TABLE IF NOT EXISTS public.map_bank_assignments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id             uuid NOT NULL REFERENCES public.map_families(id) ON DELETE CASCADE,
  bank_id               uuid NOT NULL REFERENCES public.map_question_banks(id) ON DELETE CASCADE,
  student_id            uuid NOT NULL REFERENCES public.map_students(id) ON DELETE CASCADE,
  assigned_by_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at           timestamptz NOT NULL DEFAULT now(),
  due_by                timestamptz,
  parent_note           text,
  status                text NOT NULL DEFAULT 'assigned',
  session_id            uuid REFERENCES public.map_test_sessions(id) ON DELETE SET NULL,
  snapshot_question_ids uuid[],
  started_at            timestamptz,
  completed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_ba_status CHECK (status IN ('assigned','in_progress','completed','revoked')),
  CONSTRAINT map_ba_status_coherent CHECK (
    (status = 'assigned'    AND session_id IS NULL     AND started_at IS NULL     AND completed_at IS NULL)
    OR (status = 'in_progress' AND session_id IS NOT NULL AND started_at IS NOT NULL AND completed_at IS NULL)
    OR (status = 'completed'   AND session_id IS NOT NULL AND started_at IS NOT NULL AND completed_at IS NOT NULL)
    OR (status = 'revoked'     AND session_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_map_qb_family       ON public.map_question_banks(family_id) WHERE soft_deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_map_qbi_bank        ON public.map_question_bank_items(bank_id);
CREATE INDEX IF NOT EXISTS idx_map_ba_family       ON public.map_bank_assignments(family_id);
CREATE INDEX IF NOT EXISTS idx_map_ba_student      ON public.map_bank_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_map_ba_session      ON public.map_bank_assignments(session_id);

ALTER TABLE public.map_question_banks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_question_bank_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_bank_assignments    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qb_select_own ON public.map_question_banks;
DROP POLICY IF EXISTS qb_insert_own ON public.map_question_banks;
DROP POLICY IF EXISTS qb_update_own ON public.map_question_banks;
DROP POLICY IF EXISTS qb_delete_own ON public.map_question_banks;
CREATE POLICY qb_select_own ON public.map_question_banks FOR SELECT USING (family_id = public.map_current_family_id());
CREATE POLICY qb_insert_own ON public.map_question_banks FOR INSERT WITH CHECK (family_id = public.map_current_family_id());
CREATE POLICY qb_update_own ON public.map_question_banks FOR UPDATE USING (family_id = public.map_current_family_id()) WITH CHECK (family_id = public.map_current_family_id());
CREATE POLICY qb_delete_own ON public.map_question_banks FOR DELETE USING (family_id = public.map_current_family_id());

DROP POLICY IF EXISTS qbi_select_own ON public.map_question_bank_items;
DROP POLICY IF EXISTS qbi_insert_own ON public.map_question_bank_items;
DROP POLICY IF EXISTS qbi_update_own ON public.map_question_bank_items;
DROP POLICY IF EXISTS qbi_delete_own ON public.map_question_bank_items;
CREATE POLICY qbi_select_own ON public.map_question_bank_items FOR SELECT USING (bank_id IN (SELECT id FROM public.map_question_banks WHERE family_id = public.map_current_family_id()));
CREATE POLICY qbi_insert_own ON public.map_question_bank_items FOR INSERT WITH CHECK (bank_id IN (SELECT id FROM public.map_question_banks WHERE family_id = public.map_current_family_id()));
CREATE POLICY qbi_update_own ON public.map_question_bank_items FOR UPDATE USING (bank_id IN (SELECT id FROM public.map_question_banks WHERE family_id = public.map_current_family_id())) WITH CHECK (bank_id IN (SELECT id FROM public.map_question_banks WHERE family_id = public.map_current_family_id()));
CREATE POLICY qbi_delete_own ON public.map_question_bank_items FOR DELETE USING (bank_id IN (SELECT id FROM public.map_question_banks WHERE family_id = public.map_current_family_id()));

DROP POLICY IF EXISTS ba_select_own ON public.map_bank_assignments;
DROP POLICY IF EXISTS ba_insert_own ON public.map_bank_assignments;
DROP POLICY IF EXISTS ba_update_own ON public.map_bank_assignments;
DROP POLICY IF EXISTS ba_delete_own ON public.map_bank_assignments;
CREATE POLICY ba_select_own ON public.map_bank_assignments FOR SELECT USING (family_id = public.map_current_family_id());
CREATE POLICY ba_insert_own ON public.map_bank_assignments FOR INSERT WITH CHECK (family_id = public.map_current_family_id());
CREATE POLICY ba_update_own ON public.map_bank_assignments FOR UPDATE USING (family_id = public.map_current_family_id()) WITH CHECK (family_id = public.map_current_family_id());
CREATE POLICY ba_delete_own ON public.map_bank_assignments FOR DELETE USING (family_id = public.map_current_family_id());

COMMIT;
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` tool: name `map_question_banks`, the full file contents above.

- [ ] **Step 3: Verify tables + RLS exist**

Use Supabase MCP `execute_sql`:

```sql
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname='public' AND tablename IN
('map_question_banks','map_question_bank_items','map_bank_assignments')
ORDER BY tablename;
SELECT polname FROM pg_policy
WHERE polrelid = 'public.map_question_banks'::regclass ORDER BY polname;
```
Expected: 3 rows all `rowsecurity = true`; policies `qb_delete_own, qb_insert_own, qb_select_own, qb_update_own`.

- [ ] **Step 4: Commit**

```bash
git add migrations/20260518_map_question_banks.sql
git commit -m "feat(banks) schema: question_banks + bank_items + bank_assignments + RLS (Phase 1)"
```

---

## Task 2: Schema — completion trigger + overview view

**Files:**
- Modify: `migrations/20260518_map_question_banks.sql` (append before `COMMIT;`)

- [ ] **Step 1: Append the trigger + view inside the transaction**

Edit `migrations/20260518_map_question_banks.sql`: insert the following **immediately before** the final `COMMIT;`:

```sql
-- When a session linked to a bank assignment completes, flip the assignment.
CREATE OR REPLACE FUNCTION public.map_bank_assignment_on_session_complete()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'completed' AND COALESCE(OLD.status,'') <> 'completed' THEN
    UPDATE public.map_bank_assignments
       SET status = 'completed',
           completed_at = COALESCE(NEW.completed_at, now())
     WHERE session_id = NEW.id
       AND status = 'in_progress';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_map_bank_assignment_complete ON public.map_test_sessions;
CREATE TRIGGER trg_map_bank_assignment_complete
AFTER UPDATE OF status ON public.map_test_sessions
FOR EACH ROW
EXECUTE FUNCTION public.map_bank_assignment_on_session_complete();

-- Parent-facing read view (security_invoker → inherits caller RLS).
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
LEFT JOIN public.map_test_sessions sess ON sess.id = a.session_id;
```

- [ ] **Step 2: Re-apply the migration** (idempotent)

Supabase MCP `apply_migration`, name `map_question_banks`, full updated file.

- [ ] **Step 3: Verify trigger + view**

`execute_sql`:
```sql
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_map_bank_assignment_complete';
SELECT viewname FROM pg_views WHERE viewname = 'map_v_bank_assignment_overview';
```
Expected: one trigger row, one view row.

- [ ] **Step 4: Commit**

```bash
git add migrations/20260518_map_question_banks.sql
git commit -m "feat(banks) schema: completion trigger + map_v_bank_assignment_overview"
```

---

## Task 3: RPCs — create / assign / revoke / start

**Files:**
- Modify: `migrations/20260518_map_question_banks.sql` (append before `COMMIT;`, after the view)

- [ ] **Step 1: Append the four RPCs inside the transaction**

Insert immediately before the final `COMMIT;`:

```sql
-- Create a bank. Vetted = recipe row. Custom = raises Phase-2 (schema only).
CREATE OR REPLACE FUNCTION public.map_create_bank(
  p_name           text,
  p_subject        text,
  p_grade          int,
  p_lane           text,
  p_standard_codes text[],
  p_planned_length int,
  p_difficulty     text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family uuid := public.map_current_family_id();
  v_id     uuid;
BEGIN
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'no family for current user';
  END IF;
  IF p_lane = 'custom' THEN
    RAISE EXCEPTION 'custom-lane banks land in Phase 2';
  END IF;
  IF p_lane <> 'vetted' THEN
    RAISE EXCEPTION 'unknown lane: %', p_lane;
  END IF;
  INSERT INTO public.map_question_banks
    (family_id, owner_user_id, name, subject, grade, lane,
     standard_codes, planned_length, difficulty)
  VALUES
    (v_family, auth.uid(), p_name, p_subject, p_grade, 'vetted',
     COALESCE(p_standard_codes, '{}'), p_planned_length,
     NULLIF(p_difficulty, 'any'))
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

-- Assign a bank to one or more kids. Vetted = no snapshot.
CREATE OR REPLACE FUNCTION public.map_assign_bank(
  p_bank_id     uuid,
  p_student_ids uuid[],
  p_due_by      timestamptz,
  p_parent_note text
) RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family uuid := public.map_current_family_id();
  v_lane   text;
  v_sid    uuid;
  v_ids    uuid[] := '{}';
  v_new    uuid;
BEGIN
  SELECT lane INTO v_lane
    FROM public.map_question_banks
   WHERE id = p_bank_id AND family_id = v_family AND soft_deleted_at IS NULL;
  IF v_lane IS NULL THEN
    RAISE EXCEPTION 'bank not found or not yours';
  END IF;
  IF v_lane = 'custom' THEN
    RAISE EXCEPTION 'custom-lane assignment lands in Phase 2';
  END IF;
  IF p_student_ids IS NULL OR array_length(p_student_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no students given';
  END IF;
  FOREACH v_sid IN ARRAY p_student_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.map_students
       WHERE id = v_sid AND family_id = v_family
    ) THEN
      RAISE EXCEPTION 'student % is not in your family', v_sid;
    END IF;
    INSERT INTO public.map_bank_assignments
      (family_id, bank_id, student_id, assigned_by_user_id,
       due_by, parent_note, status)
    VALUES
      (v_family, p_bank_id, v_sid, auth.uid(),
       p_due_by, p_parent_note, 'assigned')
    RETURNING id INTO v_new;
    v_ids := array_append(v_ids, v_new);
  END LOOP;
  RETURN v_ids;
END
$$;

-- Revoke only from 'assigned'.
CREATE OR REPLACE FUNCTION public.map_revoke_bank_assignment(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family uuid := public.map_current_family_id();
BEGIN
  UPDATE public.map_bank_assignments
     SET status = 'revoked'
   WHERE id = p_assignment_id
     AND family_id = v_family
     AND status = 'assigned';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assignment not found, not yours, or not in assigned state';
  END IF;
END
$$;

-- Link a session: assigned -> in_progress.
CREATE OR REPLACE FUNCTION public.map_start_bank_assignment(
  p_assignment_id uuid,
  p_session_id    uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family uuid := public.map_current_family_id();
BEGIN
  UPDATE public.map_bank_assignments
     SET status = 'in_progress',
         session_id = p_session_id,
         started_at = now()
   WHERE id = p_assignment_id
     AND family_id = v_family
     AND status = 'assigned';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assignment not found, not yours, or not in assigned state';
  END IF;
END
$$;
```

- [ ] **Step 2: Apply + verify**

`apply_migration` (name `map_question_banks`, full file). Then `execute_sql`:
```sql
SELECT proname FROM pg_proc WHERE proname IN
('map_create_bank','map_assign_bank','map_revoke_bank_assignment',
 'map_start_bank_assignment','map_bank_assignment_on_session_complete')
ORDER BY proname;
```
Expected: 5 rows.

- [ ] **Step 3: Commit**

```bash
git add migrations/20260518_map_question_banks.sql
git commit -m "feat(banks) RPCs: create/assign/revoke/start (vetted; custom raises Phase-2)"
```

---

## Task 4: Lift the custom-test count cap 50 → 60

**Files:**
- Modify: `src/lib/customTest.ts:11-12` and the range-error string (~line 386)

- [ ] **Step 1: Change the constant**

In `src/lib/customTest.ts`, replace:
```typescript
export const CUSTOM_MIN_COUNT = 5
export const CUSTOM_MAX_COUNT = 50
```
with:
```typescript
export const CUSTOM_MIN_COUNT = 5
export const CUSTOM_MAX_COUNT = 60
```

- [ ] **Step 2: Confirm the range error references the constants (no hardcoded 50)**

The existing line is:
```typescript
throw new Error(`requested_count out of range (${CUSTOM_MIN_COUNT}-${CUSTOM_MAX_COUNT})`)
```
It already interpolates the constants — no change needed. If any literal `50` exists elsewhere in this file bounding `requestedCount`, replace it with `CUSTOM_MAX_COUNT`. (Verify: `grep -n "50" src/lib/customTest.ts` — there should be none bounding the count.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/customTest.ts
git commit -m "feat(banks) lift CUSTOM_MAX_COUNT 50->60 for bank-length parity"
```

---

## Task 5: Bank lib — types, queries, mutations

**Files:**
- Create: `src/lib/banks/types.ts`, `src/lib/banks/queries.ts`, `src/lib/banks/mutations.ts`

- [ ] **Step 1: Types**

Create `src/lib/banks/types.ts`:
```typescript
// src/lib/banks/types.ts
import type { Subject } from '../types'

export type BankLane = 'vetted' | 'custom'
export type BankAssignmentStatus =
  | 'assigned' | 'in_progress' | 'completed' | 'revoked'

export interface BankRow {
  id: string
  name: string
  subject: Subject
  grade: number
  lane: BankLane
  standard_codes: string[]
  planned_length: number | null
  difficulty: 'easy' | 'medium' | 'hard' | 'any' | null
  created_at: string
}

export interface BankAssignmentOverviewRow {
  assignment_id: string
  bank_id: string
  bank_name: string
  lane: BankLane
  subject: Subject
  grade: number
  student_id: string
  student_name: string
  status: BankAssignmentStatus
  due_by: string | null
  parent_note: string | null
  assigned_at: string
  completed_at: string | null
  session_id: string | null
  questions_correct: number | null
  questions_total: number | null
}
```
> If `../types` has no `Subject` export, use `export type Subject = 'math' | 'reading' | 'language'` locally instead and remove the import. (Check `src/lib/types.ts` first; `customTest.ts` imports `Subject` from there.)

- [ ] **Step 2: Queries**

Create `src/lib/banks/queries.ts`:
```typescript
// src/lib/banks/queries.ts
import { supabase } from '../supabase'
import type { BankRow, BankAssignmentOverviewRow } from './types'

export async function listBanks(): Promise<BankRow[]> {
  const { data, error } = await supabase
    .from('map_question_banks')
    .select('id,name,subject,grade,lane,standard_codes,planned_length,difficulty,created_at')
    .is('soft_deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as BankRow[]
}

export async function getBankAssignmentOverview(): Promise<BankAssignmentOverviewRow[]> {
  const { data, error } = await supabase
    .from('map_v_bank_assignment_overview')
    .select('*')
    .order('assigned_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as BankAssignmentOverviewRow[]
}
```

- [ ] **Step 3: Mutations**

Create `src/lib/banks/mutations.ts`:
```typescript
// src/lib/banks/mutations.ts
import { supabase } from '../supabase'
import type { Subject } from '../types'

export async function createVettedBank(args: {
  name: string
  subject: Subject
  grade: number
  standardCodes: string[]
  plannedLength: number
  difficulty: 'easy' | 'medium' | 'hard' | 'any'
}): Promise<string> {
  const { data, error } = await supabase.rpc('map_create_bank', {
    p_name: args.name,
    p_subject: args.subject,
    p_grade: args.grade,
    p_lane: 'vetted',
    p_standard_codes: args.standardCodes,
    p_planned_length: args.plannedLength,
    p_difficulty: args.difficulty,
  })
  if (error) throw error
  return data as string
}

export async function assignBank(args: {
  bankId: string
  studentIds: string[]
  dueBy: string | null
  parentNote: string | null
}): Promise<string[]> {
  const { data, error } = await supabase.rpc('map_assign_bank', {
    p_bank_id: args.bankId,
    p_student_ids: args.studentIds,
    p_due_by: args.dueBy,
    p_parent_note: args.parentNote,
  })
  if (error) throw error
  return (data ?? []) as string[]
}

export async function revokeBankAssignment(assignmentId: string): Promise<void> {
  const { error } = await supabase.rpc('map_revoke_bank_assignment', {
    p_assignment_id: assignmentId,
  })
  if (error) throw error
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exit 0. (If `Subject` import path differs, fix per Step 1 note.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/banks/types.ts src/lib/banks/queries.ts src/lib/banks/mutations.ts
git commit -m "feat(banks) lib: types + queries + RPC-wrapper mutations"
```

---

## Task 6: Kid composer — `startAssignedBank` (vetted lane)

**Files:**
- Create: `src/lib/banks/startAssignedBank.ts`

- [ ] **Step 1: Implement**

Create `src/lib/banks/startAssignedBank.ts`:
```typescript
// src/lib/banks/startAssignedBank.ts
// Vetted lane: resolve the bank's standard_codes -> standard ids, compose a
// fresh session via the proven createCustomTest, then link the assignment.
// Error policy (ported from the validated Cycle-1 startAssignedTest):
//  - compose failure  -> propagate; do NOT link; assignment stays 'assigned'
//  - link failure after a session exists -> log, still return the sessionId
import { supabase } from '../supabase'
import { createCustomTest } from '../customTest'
import type { Subject } from '../types'
import type { BankAssignmentOverviewRow } from './types'

export async function startAssignedBank(
  assignment: BankAssignmentOverviewRow,
  studentId: string,
): Promise<string> {
  if (assignment.lane !== 'vetted') {
    throw new Error('custom-lane banks are not playable in Phase 1')
  }

  const { data: bank, error: bErr } = await supabase
    .from('map_question_banks')
    .select('subject,grade,standard_codes,planned_length,difficulty')
    .eq('id', assignment.bank_id)
    .single()
  if (bErr || !bank) {
    throw new Error('This assigned test is no longer available.')
  }

  const codes = (bank.standard_codes as string[]) ?? []
  let standardIds: string[] = []
  if (codes.length > 0) {
    const { data: stds, error: sErr } = await supabase
      .from('map_standards')
      .select('id')
      .in('teks_code', codes)
      .eq('subject', bank.subject)
      .eq('grade', bank.grade)
    if (sErr) throw sErr
    standardIds = (stds ?? []).map((r) => r.id as string)
  }
  if (standardIds.length === 0) {
    throw new Error('This assigned test has no questions yet.')
  }

  const { sessionId } = await createCustomTest({
    studentId,
    subject: bank.subject as Subject,
    standardIds,
    requestedCount: bank.planned_length as number,
    difficulty: (bank.difficulty as 'easy' | 'medium' | 'hard' | 'any') ?? 'any',
  })

  try {
    const { error: linkErr } = await supabase.rpc('map_start_bank_assignment', {
      p_assignment_id: assignment.assignment_id,
      p_session_id: sessionId,
    })
    if (linkErr) throw linkErr
  } catch (e) {
    console.error('[startAssignedBank] link failed (session still valid):', e)
  }

  return sessionId
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/banks/startAssignedBank.ts
git commit -m "feat(banks) kid composer: startAssignedBank (vetted) with ported error policy"
```

---

## Task 7: Parent UI — Save-as-Bank (reuse the vetted builder)

**Files:**
- Create: `src/pages/parent/SaveVettedBank.tsx`
- Modify: `src/App.tsx` (add one route)

- [ ] **Step 1: Read the existing builder to mirror its standards/difficulty UX**

Read `src/pages/parent/CustomTestBuilder.tsx` in full. Note how it loads standards (`supabase.from('map_standards').select('id, subject, grade, teks_code, teks_title, ...').eq('subject', subject)`), the `pickedIds: Set<string>` state, the count slider (5..max step 5), and the difficulty buttons.

- [ ] **Step 2: Create the page**

Create `src/pages/parent/SaveVettedBank.tsx`. It reuses the same selection mechanics but, instead of `createCustomTest` + navigate to `/test/:id`, it collects a **Name**, calls `createVettedBank`, and returns to `/parent`. `standard_codes` are the **teks_code strings** (not ids) for the picked standards at the chosen subject+grade.

```tsx
// src/pages/parent/SaveVettedBank.tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { createVettedBank } from '../../lib/banks/mutations'
import { CUSTOM_MIN_COUNT, CUSTOM_MAX_COUNT } from '../../lib/customTest'
import type { Subject } from '../../lib/types'

type Std = { id: string; subject: Subject; grade: number; teks_code: string; teks_title: string }
const SUBJECTS: Subject[] = ['math', 'reading', 'language']
const DIFFS = ['any', 'easy', 'medium', 'hard'] as const

export default function SaveVettedBank() {
  const navigate = useNavigate()
  const [subject, setSubject] = useState<Subject>('math')
  const [stds, setStds] = useState<Std[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [count, setCount] = useState(10)
  const [difficulty, setDifficulty] = useState<(typeof DIFFS)[number]>('any')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setPicked(new Set())
    supabase
      .from('map_standards')
      .select('id, subject, grade, teks_code, teks_title')
      .eq('subject', subject)
      .order('grade')
      .order('sort_order')
      .then(({ data, error }) => {
        if (!alive) return
        if (error) { setErr(error.message); return }
        setStds((data ?? []) as Std[])
      })
    return () => { alive = false }
  }, [subject])

  const byGrade = useMemo(() => {
    const m = new Map<number, Std[]>()
    for (const s of stds) { (m.get(s.grade) ?? m.set(s.grade, []).get(s.grade)!).push(s) }
    return [...m.entries()].sort((a, b) => a[0] - b[0])
  }, [stds])

  const pickedStds = stds.filter((s) => picked.has(s.id))
  const grade = pickedStds[0]?.grade ?? 0
  const sameGrade = pickedStds.every((s) => s.grade === grade)
  const canSave =
    name.trim().length >= 1 && name.trim().length <= 120 &&
    pickedStds.length > 0 && sameGrade &&
    count >= CUSTOM_MIN_COUNT && count <= CUSTOM_MAX_COUNT && !busy

  const toggle = (id: string) => {
    setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const save = async () => {
    setBusy(true); setErr(null)
    try {
      await createVettedBank({
        name: name.trim(),
        subject,
        grade,
        standardCodes: pickedStds.map((s) => s.teks_code),
        plannedLength: count,
        difficulty,
      })
      navigate('/parent')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save the bank.')
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="font-display text-3xl">New vetted test</h1>
      <p className="mt-1 text-sm text-smoke">
        Pick standards, name it, save it as a reusable test. Each kid you assign
        it to gets a freshly composed set from these standards.
      </p>

      <div className="mt-4 flex gap-2">
        {SUBJECTS.map((s) => (
          <button key={s} type="button" onClick={() => setSubject(s)}
            className={subject === s ? 'btn-primary text-sm' : 'btn-secondary text-sm'}>
            {s}
          </button>
        ))}
      </div>

      <div className="mt-4 max-h-72 overflow-auto rounded border border-cloud p-2">
        {byGrade.map(([g, list]) => (
          <div key={g} className="mb-2">
            <p className="text-xs font-semibold uppercase text-smoke">Grade {g}</p>
            {list.map((s) => (
              <label key={s.id} className="flex items-center gap-2 py-1 text-sm">
                <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                <span className="font-mono">{s.teks_code}</span> {s.teks_title}
              </label>
            ))}
          </div>
        ))}
      </div>
      {!sameGrade && (
        <p className="mt-1 text-sm text-rust">Pick standards from a single grade.</p>
      )}

      <div className="mt-4">
        <label className="text-sm">Questions: {count}</label>
        <input type="range" min={CUSTOM_MIN_COUNT} max={CUSTOM_MAX_COUNT} step={5}
          value={count} onChange={(e) => setCount(Number(e.target.value))}
          className="ml-2 w-64 align-middle" />
      </div>

      <div className="mt-3 flex gap-2">
        {DIFFS.map((d) => (
          <button key={d} type="button" onClick={() => setDifficulty(d)}
            className={difficulty === d ? 'btn-primary text-sm' : 'btn-secondary text-sm'}>
            {d}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <input value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Name this test (e.g. Fractions Check)"
          maxLength={120}
          className="w-full rounded border border-cloud p-2 text-sm" />
      </div>

      {err && <p className="mt-2 text-sm text-rust">{err}</p>}

      <div className="mt-4 flex gap-2">
        <button type="button" disabled={!canSave} onClick={save}
          className="btn-primary disabled:opacity-50">
          {busy ? 'Saving…' : 'Save test'}
        </button>
        <button type="button" onClick={() => navigate('/parent')} className="btn-ghost">
          Cancel
        </button>
      </div>
    </div>
  )
}
```
> Glyph note: the busy label uses `…` (U+2026), not `...`.

- [ ] **Step 3: Add the route**

In `src/App.tsx`, find the existing parent custom-test route (`/parent/custom-test` → `CustomTestBuilder`, wrapped in `RequireAuth`/`RequireActiveStudent`/`RequireParentPin`). Add an analogous route directly after it:
```tsx
<Route path="/parent/banks/new" element={<RequireAuth><RequireActiveStudent><RequireParentPin><SaveVettedBank /></RequireParentPin></RequireActiveStudent></RequireAuth>} />
```
Add the import alongside the other parent-page imports:
```tsx
import SaveVettedBank from './pages/parent/SaveVettedBank'
```
> Match the exact wrapper components and import style already used for `CustomTestBuilder` in `src/App.tsx` — copy that route's wrappers verbatim, only swapping the element and path.

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/pages/parent/SaveVettedBank.tsx src/App.tsx
git commit -m "feat(banks) parent: Save-as-Bank vetted builder + /parent/banks/new route"
```

---

## Task 8: Parent UI — Tests & Banks section + Assign dialog

**Files:**
- Create: `src/components/parent/AssignBankDialog.tsx`, `src/pages/parent/TestsAndBanks.tsx`
- Modify: `src/pages/parent/Parent.tsx` (1 import + 1 element)

- [ ] **Step 1: Assign dialog**

Create `src/components/parent/AssignBankDialog.tsx`:
```tsx
// src/components/parent/AssignBankDialog.tsx
import { useState } from 'react'
import { useActiveStudent } from '../../lib/activeStudent'
import { assignBank } from '../../lib/banks/mutations'

export function AssignBankDialog(props: {
  bankId: string
  bankName: string
  onClose: () => void
  onAssigned: () => void
}) {
  const { students } = useActiveStudent()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [due, setDue] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const toggle = (id: string) =>
    setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  const submit = async () => {
    setBusy(true); setErr(null)
    try {
      await assignBank({
        bankId: props.bankId,
        studentIds: [...picked],
        dueBy: due ? new Date(due).toISOString() : null,
        parentNote: note.trim() || null,
      })
      props.onAssigned()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not assign.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 className="font-display text-xl">Assign “{props.bankName}”</h2>
        <p className="mt-2 text-xs font-semibold uppercase text-smoke">Kids</p>
        <div className="mt-1 space-y-1">
          {students.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
              {s.display_name}
            </label>
          ))}
        </div>
        <label className="mt-3 block text-sm">Due (optional)
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
            className="ml-2 rounded border border-cloud p-1 text-sm" /></label>
        <label className="mt-2 block text-sm">Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded border border-cloud p-1 text-sm" /></label>
        {err && <p className="mt-2 text-sm text-rust">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={props.onClose}>Cancel</button>
          <button type="button" className="btn-primary disabled:opacity-50"
            disabled={busy || picked.size === 0} onClick={submit}>
            {busy ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Tests & Banks section**

Create `src/pages/parent/TestsAndBanks.tsx`:
```tsx
// src/pages/parent/TestsAndBanks.tsx
import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { listBanks, getBankAssignmentOverview } from '../../lib/banks/queries'
import { revokeBankAssignment } from '../../lib/banks/mutations'
import { AssignBankDialog } from '../../components/parent/AssignBankDialog'
import type { BankRow, BankAssignmentOverviewRow } from '../../lib/banks/types'

export default function TestsAndBanks() {
  const [banks, setBanks] = useState<BankRow[]>([])
  const [rows, setRows] = useState<BankAssignmentOverviewRow[]>([])
  const [assignFor, setAssignFor] = useState<BankRow | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const reload = useCallback(() => {
    listBanks().then(setBanks).catch((e) => setErr(String(e)))
    getBankAssignmentOverview().then(setRows).catch((e) => setErr(String(e)))
  }, [])
  useEffect(reload, [reload])

  const revoke = async (id: string) => {
    try { await revokeBankAssignment(id); reload() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not revoke.') }
  }

  return (
    <section className="my-8">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl">Tests &amp; Banks</h2>
        <Link to="/parent/banks/new" className="btn-primary text-sm">+ New vetted test</Link>
      </div>
      {err && <p className="mt-2 text-sm text-rust">{err}</p>}

      <div className="mt-3 space-y-2">
        {banks.length === 0 && (
          <p className="text-sm text-smoke">No saved tests yet.</p>
        )}
        {banks.map((b) => (
          <div key={b.id} className="flex items-center justify-between rounded border border-cloud p-3">
            <div className="text-sm">
              <span className="font-semibold">{b.name}</span>{' '}
              <span className="rounded bg-cloud px-1 text-xs">{b.lane}</span>{' '}
              <span className="text-smoke">
                {b.subject} · G{b.grade}
                {b.lane === 'vetted' && ` · ${b.standard_codes.length} std · ${b.planned_length} Q · ${b.difficulty}`}
              </span>
            </div>
            <button type="button" className="btn-secondary text-sm" onClick={() => setAssignFor(b)}>
              Assign
            </button>
          </div>
        ))}
      </div>

      <h3 className="mt-6 font-display text-lg">Assignments</h3>
      <div className="mt-2 space-y-1">
        {rows.length === 0 && <p className="text-sm text-smoke">Nothing assigned yet.</p>}
        {rows.map((r) => (
          <div key={r.assignment_id} className="flex items-center justify-between rounded border border-cloud p-2 text-sm">
            <span>
              <b>{r.bank_name}</b> → {r.student_name} ·{' '}
              <span className="rounded bg-cloud px-1 text-xs">{r.status}</span>
              {r.status === 'completed' && r.questions_total != null &&
                ` · ${r.questions_correct ?? 0}/${r.questions_total}`}
              {r.due_by && ` · due ${new Date(r.due_by).toLocaleDateString()}`}
            </span>
            {r.status === 'assigned' && (
              <button type="button" className="btn-ghost text-xs" onClick={() => revoke(r.assignment_id)}>
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>

      {assignFor && (
        <AssignBankDialog
          bankId={assignFor.id}
          bankName={assignFor.name}
          onClose={() => setAssignFor(null)}
          onAssigned={() => { setAssignFor(null); reload() }}
        />
      )}
    </section>
  )
}
```
> Glyph note: use `&amp;` in JSX text, `·` (U+00B7) separators, `“ ”` (U+201C/U+201D) and `…` (U+2026) — no ASCII `...`/straight quotes in displayed copy.

- [ ] **Step 3: Render it in the legacy parent page**

In `src/pages/parent/Parent.tsx`, add the import after the existing `CustomTestList` import:
```tsx
import TestsAndBanks from './TestsAndBanks'
```
and render `<TestsAndBanks />` directly **after** `<CustomTestList />` and before `<ParentDashboard />`:
```tsx
      <ParentSettings />
      <CustomTestList />
      <TestsAndBanks />
      <ParentDashboard />
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/parent/AssignBankDialog.tsx src/pages/parent/TestsAndBanks.tsx src/pages/parent/Parent.tsx
git commit -m "feat(banks) parent: Tests & Banks section + Assign dialog on legacy /parent"
```

---

## Task 9: Kid home — additive Assigned panel

**Files:**
- Create: `src/components/AssignedBanksPanel.tsx`
- Modify: the kid home page (the component for route `/` — confirm via `src/App.tsx`; on `main` it is `src/pages/Home.tsx`)

- [ ] **Step 1: Confirm the kid-home file**

In `src/App.tsx`, find the element for `path="/"` (or the index route inside the app shell). Confirm the component file (expected `src/pages/Home.tsx`). Read it to find a stable insertion point (after the hero/heading, before the main practice CTAs) and how `useActiveStudent()` is already used there.

- [ ] **Step 2: Panel**

Create `src/components/AssignedBanksPanel.tsx`:
```tsx
// src/components/AssignedBanksPanel.tsx
// Additive kid-home affordance. Renders nothing unless the active kid has a
// vetted bank assignment in 'assigned' state. Mount-guarded.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useActiveStudent } from '../lib/activeStudent'
import { getBankAssignmentOverview } from '../lib/banks/queries'
import { startAssignedBank } from '../lib/banks/startAssignedBank'
import type { BankAssignmentOverviewRow } from '../lib/banks/types'

export function AssignedBanksPanel() {
  const { activeStudent } = useActiveStudent()
  const navigate = useNavigate()
  const mounted = useRef(true)
  const [rows, setRows] = useState<BankAssignmentOverviewRow[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    const sid = activeStudent?.id
    if (!sid) { setRows([]); return }
    getBankAssignmentOverview()
      .then((all) => {
        if (!mounted.current) return
        setRows(all.filter((r) =>
          r.student_id === sid && r.status === 'assigned' && r.lane === 'vetted'))
      })
      .catch(() => { if (mounted.current) setRows([]) })
  }, [activeStudent?.id])

  if (!activeStudent || rows.length === 0) return null

  const start = async (r: BankAssignmentOverviewRow) => {
    setBusy(r.assignment_id); setErr(null)
    try {
      const sessionId = await startAssignedBank(r, activeStudent.id)
      if (!mounted.current) return
      navigate(`/test/${sessionId}`)
    } catch (e) {
      if (!mounted.current) return
      setErr(e instanceof Error ? e.message : 'Could not start.')
      setBusy(null)
    }
  }

  return (
    <section className="mb-6">
      <p className="mb-2 font-display text-lg uppercase tracking-widest text-smoke">
        Assigned to you
      </p>
      {err && <p className="mb-2 text-sm text-rust">{err}</p>}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.assignment_id}
            className="flex items-center justify-between rounded-lg border border-cloud p-3">
            <div className="text-sm">
              <span className="font-semibold">{r.bank_name}</span>
              {r.parent_note && <span className="text-smoke"> — “{r.parent_note}”</span>}
              {r.due_by && <span className="text-smoke"> · due {new Date(r.due_by).toLocaleDateString()}</span>}
            </div>
            <button type="button" className="btn-primary text-sm disabled:opacity-50"
              disabled={busy === r.assignment_id} onClick={() => start(r)}>
              {busy === r.assignment_id ? 'Starting…' : 'Start'}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
```
> Glyph note: `—` U+2014, `“ ”` U+201C/U+201D, `·` U+00B7, `…` U+2026 — no ASCII equivalents in displayed copy.

- [ ] **Step 3: Render it on the kid home**

In the kid home file (`src/pages/Home.tsx`), add the import next to the other component imports:
```tsx
import { AssignedBanksPanel } from '../components/AssignedBanksPanel'
```
and render `<AssignedBanksPanel />` once, immediately after the page hero/heading section and before the first practice CTA block (mirror the placement style used by the existing sections). Change nothing else in the file.

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both exit 0.

- [ ] **Step 5: Verify additive-only**

Run: `git diff --stat` and confirm the kid-home file shows only +2 lines (import + element), 0 deletions.

- [ ] **Step 6: Commit**

```bash
git add src/components/AssignedBanksPanel.tsx src/pages/Home.tsx
git commit -m "feat(banks) kid home: additive Assigned-banks panel (vetted)"
```

---

## Task 10: Data-guard verification script

**Files:**
- Create: `scripts/test-banks-phase1-data.mjs`

- [ ] **Step 1: Write the guard**

Create `scripts/test-banks-phase1-data.mjs`. It uses the service-role admin client to create **two** ephemeral families (each = an auth user + a `map_families` row + a `map_students` row) and two user-scoped clients, then asserts the full Phase-1 contract incl. cross-family RLS. Mirrors `node --env-file=.env.local` convention and the flip-script's admin-client construction.

```javascript
// scripts/test-banks-phase1-data.mjs
// Phase-1 data guard: vetted bank create -> assign -> compose -> complete
// trigger -> revoke semantics -> cross-family RLS (show-stopper).
// Run: node --env-file=.env.local scripts/test-banks-phase1-data.mjs
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

const tag = `bankguard_${Date.now()}`
const made = { users: [], families: [], students: [] }

async function makeFamily(n) {
  const email = `${tag}_${n}@example.com`
  const password = 'guard-pw-12345!'
  const { data: u, error: ue } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  })
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
  made.students.push(stu.id)
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

  // A real vetted standard for math grade 5 (G5 seed is on main).
  const { data: std } = await admin.from('map_standards')
    .select('teks_code').eq('subject', 'math').eq('grade', 5).limit(1).single()
  assert(std?.teks_code, 'a vetted math/G5 standard exists')

  // 1. A creates a vetted bank.
  const { data: bankId, error: cbErr } = await A.client.rpc('map_create_bank', {
    p_name: 'Guard Fractions', p_subject: 'math', p_grade: 5, p_lane: 'vetted',
    p_standard_codes: [std.teks_code], p_planned_length: 5, p_difficulty: 'any',
  })
  assert(!cbErr && bankId, 'map_create_bank (vetted) returns an id')

  // 2. Custom lane is gated to Phase 2.
  const { error: custErr } = await A.client.rpc('map_create_bank', {
    p_name: 'x', p_subject: 'math', p_grade: 5, p_lane: 'custom',
    p_standard_codes: [], p_planned_length: null, p_difficulty: null,
  })
  assert(!!custErr, 'custom-lane map_create_bank raises Phase-2 error')

  // 3. A assigns the bank to A's kid.
  const { data: aids, error: abErr } = await A.client.rpc('map_assign_bank', {
    p_bank_id: bankId, p_student_ids: [A.studentId], p_due_by: null, p_parent_note: 'go',
  })
  assert(!abErr && Array.isArray(aids) && aids.length === 1, 'map_assign_bank creates one assignment')
  const assignmentId = aids[0]

  // 4. Cross-family: B cannot see A's bank or assignment (RLS show-stopper).
  const { data: bBanks } = await B.client.from('map_question_banks').select('id')
  assert(!(bBanks ?? []).some((r) => r.id === bankId), 'family B cannot see A bank (RLS)')
  const { data: bAsg } = await B.client.from('map_v_bank_assignment_overview').select('assignment_id')
  assert(!(bAsg ?? []).some((r) => r.assignment_id === assignmentId), 'family B cannot see A assignment (RLS)')

  // 5. B cannot assign A's bank to B's kid.
  const { error: xErr } = await B.client.rpc('map_assign_bank', {
    p_bank_id: bankId, p_student_ids: [B.studentId], p_due_by: null, p_parent_note: null,
  })
  assert(!!xErr, 'family B cannot assign family A bank (RLS/ownership)')

  // 6. Compose a session for the assignment, link via map_start_bank_assignment.
  //    (Mirror createCustomTest's session insert; admin client bypasses RLS to
  //    simulate the kid composer deterministically.)
  const { data: sess, error: seErr } = await admin.from('map_test_sessions').insert({
    student_id: A.studentId, subject: 'math', grade: 5, status: 'in_progress',
    question_ids: [], current_index: 0, correct_count: 0, kind: 'custom',
    is_adaptive: false, planned_length: 5,
    custom_config: { standard_ids: [], requested_count: 5, actual_count: 5, shortfall_reason: null },
  }).select('id').single()
  assert(!seErr && sess?.id, 'composed a custom session row')
  const { error: startErr } = await A.client.rpc('map_start_bank_assignment', {
    p_assignment_id: assignmentId, p_session_id: sess.id,
  })
  assert(!startErr, 'map_start_bank_assignment links session (assigned -> in_progress)')
  const { data: a1 } = await admin.from('map_bank_assignments')
    .select('status,session_id').eq('id', assignmentId).single()
  assert(a1.status === 'in_progress' && a1.session_id === sess.id, 'assignment is in_progress + linked')

  // 7. Revoking a non-assigned assignment is rejected.
  const { error: rvErr } = await A.client.rpc('map_revoke_bank_assignment', { p_assignment_id: assignmentId })
  assert(!!rvErr, 'map_revoke_bank_assignment rejects a non-assigned assignment')

  // 8. Completing the session flips the assignment via the trigger.
  const { error: cErr } = await admin.from('map_test_sessions')
    .update({ status: 'completed', current_index: 5, completed_at: new Date().toISOString() })
    .eq('id', sess.id)
  assert(!cErr, 'session marked completed')
  const { data: a2 } = await admin.from('map_bank_assignments')
    .select('status,completed_at').eq('id', assignmentId).single()
  assert(a2.status === 'completed' && a2.completed_at, 'trigger flipped assignment -> completed')

  // 9. Revoke works from 'assigned' (fresh assignment).
  const { data: aids2 } = await A.client.rpc('map_assign_bank', {
    p_bank_id: bankId, p_student_ids: [A.studentId], p_due_by: null, p_parent_note: null,
  })
  const { error: rv2 } = await A.client.rpc('map_revoke_bank_assignment', { p_assignment_id: aids2[0] })
  assert(!rv2, 'map_revoke_bank_assignment succeeds from assigned')

  console.log('\nPhase-1 bank data checks complete.')
} finally {
  await cleanup()
}
```

- [ ] **Step 2: Run the guard**

Run: `node --env-file=.env.local scripts/test-banks-phase1-data.mjs ; echo "exit=$?"`
Expected: every line `PASS:`, ends `Phase-1 bank data checks complete.`, `exit=0`. If a real contract assertion fails (not infra), STOP and report which `assert` failed with the exact error — do not weaken assertions.

- [ ] **Step 3: Commit**

```bash
git add scripts/test-banks-phase1-data.mjs
git commit -m "test(banks) Phase-1 data guard: create/assign/compose/complete/revoke + cross-family RLS"
```

---

## Task 11: Full verification + manual QA

**Files:** none (verification only)

- [ ] **Step 1: Typecheck + build**

Run: `npm run typecheck && npm run build ; echo "exit=$?"`
Expected: both exit 0 (pre-existing chunk-size warnings are not failures).

- [ ] **Step 2: Re-run the data guard**

Run: `node --env-file=.env.local scripts/test-banks-phase1-data.mjs ; echo "exit=$?"`
Expected: all `PASS:`, `exit=0`.

- [ ] **Step 3: Manual-QA checklist (static + interactive)**

Start the dev server (`npm run dev`), sign in as a parent with ≥1 kid, unlock the parent PIN, and verify:
1. `/parent` shows the new **Tests & Banks** section after the custom-test list; the mastery dashboard + settings are unchanged.
2. **+ New vetted test** → pick a single-grade set of standards, set count, difficulty, name it, **Save test** → returns to `/parent`; the bank appears in the list with the right summary.
3. **Assign** → pick the kid, optional due/note → the assignment appears under **Assignments** as `assigned`.
4. Kid home shows **Assigned to you** with the bank; **Start** lands in `/test/:id` with freshly-composed questions; finishing the test → the Assignments row flips to `completed` with a score.
5. **Revoke** on an `assigned` row removes it; revoke is absent once `in_progress`.
6. Flag-off invariant: a parent/kid with no banks sees `/parent` and kid home exactly as before (the panel and section render nothing/empty).

Report each item PASS/CONCERN with evidence.

- [ ] **Step 4: Final commit (if any QA-driven fixes were needed; otherwise skip)**

```bash
git add -A && git commit -m "fix(banks) Phase-1 QA adjustments"
```

---

## Self-Review

**1. Spec coverage (Phase 1 = spec §8 first bullet):**
- 3 tables + view + RPCs + RLS + 5–60 cap → Tasks 1–3 ✓
- Vetted builder → name → save → list → assign on legacy page → Tasks 7–8 ✓
- Kid affordance + `startAssignedBank` vetted path → Tasks 6, 9 ✓
- Count cap 60 → Task 4 ✓
- Completion wiring (trigger, no TestRunner change) → Task 2 ✓
- Data-guard + typecheck/build + manual QA → Tasks 10–11 ✓
- Custom-lane columns exist but custom deferred (RPCs raise Phase-2) → Tasks 1,3 ✓
- Error policy ported (compose-fail no link / link-fail non-fatal) → Task 6 ✓
- Cross-family isolation show-stopper → Task 10 steps 4–5 ✓

**2. Placeholder scan:** No TBD/TODO. Every code step has complete code. The two "read the existing file to mirror it" steps (7.1, 9.1) are reconnaissance preceding complete code, not placeholders. Kid-home insertion (9.3) names the file and exact insertion semantics; the engineer confirms the one anchor in 9.1.

**3. Type consistency:** `createVettedBank`/`assignBank`/`revokeBankAssignment` signatures defined in Task 5 are consumed identically in Tasks 7–9. `BankRow`/`BankAssignmentOverviewRow` fields used in UI (Tasks 8–9) match Task 5's `types.ts`. RPC parameter names (`p_name,p_subject,p_grade,p_lane,p_standard_codes,p_planned_length,p_difficulty`; `p_bank_id,p_student_ids,p_due_by,p_parent_note`; `p_assignment_id,p_session_id`) match between the SQL (Task 3) and the mutation wrappers (Task 5). `createCustomTest` request shape in Task 6 matches the verified `CustomTestRequest`. View column names (Task 2) match `BankAssignmentOverviewRow` (Task 5) and the UI reads (Tasks 8–9). `map_test_sessions` insert in the data-guard (Task 10) matches the columns `createCustomTest` writes.

**Deviations from spec, intentional & noted in-plan:** spec said `map_subject`/PG-enum; the repo has no enums, so `text + CHECK` is used (Conventions section + Task 1). Completion is a trigger (spec left the mechanism to the plan; §5 contract honored).
