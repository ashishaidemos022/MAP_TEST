# Question Banks — Phase 2 (Custom-Bank Lane) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A parent can create a named custom question bank, fill it with manually-authored questions (ready immediately) and/or published AI questions, and assign it to kids; the kid takes a frozen-at-assign snapshot of those exact questions and the results screen renders them correctly.

**Architecture:** No schema changes. The runner *already* serves custom-question sessions (`createCustomTestFromMyBank` precedent + polymorphic version-id detection in `TestRunner.tsx` + `map_custom_questions_resolved` view + `map_record_custom_attempt`). Phase 2 replaces the Phase-1 "custom raises Phase-2" RPC stubs with real custom logic, adds `map_set_bank_items`, freezes ready **version ids** into `snapshot_question_ids` at assign, composes the kid session from that snapshot, and fixes the one runner-side gap: `Results.tsx` only joins `map_questions` so custom attempts vanish from RIT/standard/review.

**Tech Stack:** Supabase Postgres (RLS, SECURITY DEFINER `SET search_path=''`, text+CHECK), React + Vite + TS + RR v6, Tailwind. Verification = Node `--env-file=.env.local` data-guard + `npm run typecheck && npm run build` + manual QA.

**Spec:** `docs/superpowers/specs/2026-05-18-question-banks-and-assignment-design.md` (Phase 2 = §8 second bullet; §4.2/§4.3/§5/§6/§7 custom-lane detail).

**Branch:** `feat/question-banks-phase2` (already created off `main`, which has Phase 1). Ships as a normal PR/merge to `main`. Shelved `feat/parent-area-*` branches stay untouched.

---

## Resolved unknown (the "spike", done at planning time)

The Phase-2 runner spike is **resolved by code inspection** — no execution-time spike task needed:

- `src/lib/customTest.ts` `createCustomTestFromMyBank()` already builds a `map_test_sessions` row whose `question_ids` are **custom-question `version_id`s**, `kind='custom'`, `custom_config={ source:'mine', standard_ids:[], requested_count, actual_count, shortfall_reason }`.
- `src/pages/TestRunner.tsx` detects ids absent from `map_questions` as custom version ids → `loadCustomQuestionsByVersionIds()` (from `src/lib/customQuestionLoader.ts`, view `map_custom_questions_resolved`) → `customToLoadedQuestion()` adapter; attempt recording branches on `current.custom` → `map_record_custom_attempt`. Passages handled via the view's LEFT JOIN.
- **The only gap:** `src/pages/Results.tsx` (lines ~37–43) joins `map_questions` only; a custom-session's attempts have `question_id IS NULL` + `custom_question_version_id` set, so they're dropped from RIT/standard/"tricky ones" (score still correct via `session.correct_count`). Phase 2 must make Results polymorphic.

**Snapshot semantics:** `map_question_bank_items.custom_question_id` references the **header** `map_custom_questions(id)`. The runner consumes **version ids**. So `map_assign_bank` (custom) resolves each ready item's `current_version_id` and stores *those* in `snapshot_question_ids` — freezing both membership and exact version (later edits/new versions don't change an existing assignment). "Ready" = `map_custom_questions.status='published' AND soft_deleted_at IS NULL`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `migrations/20260519_map_question_banks_custom.sql` | Replace custom stubs in `map_create_bank`/`map_assign_bank`; add `map_set_bank_items`; add `map_v_bank_items` view | Create |
| `src/lib/banks/types.ts` | Add `BankItemRow`, `PublishableCustomQuestion` | Modify |
| `src/lib/banks/queries.ts` | Add `listBankItems`, `listAddablePublishedCustomQuestions` | Modify |
| `src/lib/banks/mutations.ts` | Add `createCustomBank`, `setBankItems`, `createManualBankQuestion` | Modify |
| `src/lib/banks/startAssignedBank.ts` | Add custom-lane branch (compose session from frozen snapshot version ids; self-heal) | Modify |
| `src/pages/parent/NewCustomBank.tsx` | Name-first custom bank create | Create |
| `src/pages/parent/BankDetail.tsx` | Bank detail: items list + readiness + add manual + add-from-AI + assign | Create |
| `src/components/parent/AddManualQuestionForm.tsx` | Minimal manual question authoring → created **published** + linked | Create |
| `src/pages/parent/TestsAndBanks.tsx` | "+ New question bank" entry; custom-bank rows link to detail | Modify |
| `src/components/AssignedBanksPanel.tsx` | Remove the `lane==='vetted'` filter (custom banks are now playable) | Modify |
| `src/App.tsx` | Routes `/parent/banks/new-custom`, `/parent/banks/:id` | Modify |
| `src/pages/Results.tsx` | Polymorphic attempt loading (vetted + custom) | Modify |
| `scripts/test-banks-phase2-data.mjs` | Phase-2 data guard | Create |

---

## Conventions (carry over from Phase 1, verified)

- No PG enums for new objects (text+CHECK). New migration = one idempotent `BEGIN;…COMMIT;` with the `-- ===` header block. `CREATE OR REPLACE FUNCTION` for the RPC redefinitions.
- Functions `SECURITY DEFINER SET search_path=''`, fully-qualified refs, family via `public.map_current_family_id()`, never a `family_id` param.
- Apply migrations via Supabase MCP `apply_migration` (project `klhzfwxpztaojekwgzcg`); verify with `execute_sql`.
- Client never filters `family_id` (RLS scopes).
- Glyph fidelity in UI copy: `…` U+2026, `“ ”` U+201C/U+201D, `·` U+00B7, `—` U+2014 — no ASCII equivalents in displayed strings.

---

## Task 1: DB — custom RPC logic + bank-items view

**Files:**
- Create: `migrations/20260519_map_question_banks_custom.sql`

- [ ] **Step 1: Write the migration**

Create `migrations/20260519_map_question_banks_custom.sql`:

```sql
-- =========================================================================
-- Migration: map_question_banks_custom  (Question Banks — Phase 2)
-- Project:   klhzfwxpztaojekwgzcg
-- Spec:      docs/superpowers/specs/2026-05-18-question-banks-and-assignment-design.md (§8 Phase 2)
--
-- Activates the custom lane:
--   * map_create_bank        — real custom branch (insert lane='custom' bank)
--   * map_set_bank_items     — replace a custom bank's item set (<=60, family
--                              -owned custom questions; draft or published)
--   * map_assign_bank        — custom branch: require >=5 READY (published,
--                              not soft-deleted) items; freeze their
--                              current_version_id into snapshot_question_ids
--   * map_v_bank_items       — bank items joined to custom-question status,
--                              for the bank-detail readiness UI
--
-- Properties: idempotent, single transaction, no schema/table changes,
--   no PG enums. RLS unchanged (inherited from Phase-1 tables).
-- =========================================================================

BEGIN;

-- Recreate map_create_bank with a real custom branch (vetted unchanged).
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
  IF p_lane = 'vetted' THEN
    INSERT INTO public.map_question_banks
      (family_id, owner_user_id, name, subject, grade, lane,
       standard_codes, planned_length, difficulty)
    VALUES
      (v_family, auth.uid(), p_name, p_subject, p_grade, 'vetted',
       COALESCE(p_standard_codes, '{}'), p_planned_length,
       NULLIF(p_difficulty, 'any'))
    RETURNING id INTO v_id;
  ELSIF p_lane = 'custom' THEN
    INSERT INTO public.map_question_banks
      (family_id, owner_user_id, name, subject, grade, lane,
       standard_codes, planned_length, difficulty)
    VALUES
      (v_family, auth.uid(), p_name, p_subject, p_grade, 'custom',
       '{}', NULL, NULL)
    RETURNING id INTO v_id;
  ELSE
    RAISE EXCEPTION 'unknown lane: %', p_lane;
  END IF;
  RETURN v_id;
END
$$;

-- Replace a custom bank's full item set. Family-owned, not soft-deleted
-- custom questions only; draft items are allowed (they just don't count as
-- "ready"). Hard cap 60. Replaces (not appends).
CREATE OR REPLACE FUNCTION public.map_set_bank_items(
  p_bank_id            uuid,
  p_custom_question_ids uuid[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family uuid := public.map_current_family_id();
  v_lane   text;
  v_n      int;
  v_owned  int;
BEGIN
  SELECT lane INTO v_lane
    FROM public.map_question_banks
   WHERE id = p_bank_id AND family_id = v_family AND soft_deleted_at IS NULL;
  IF v_lane IS NULL THEN
    RAISE EXCEPTION 'bank not found or not yours';
  END IF;
  IF v_lane <> 'custom' THEN
    RAISE EXCEPTION 'only custom banks have items';
  END IF;
  v_n := COALESCE(array_length(p_custom_question_ids, 1), 0);
  IF v_n > 60 THEN
    RAISE EXCEPTION 'a bank can hold at most 60 questions (got %)', v_n;
  END IF;
  IF v_n > 0 THEN
    SELECT count(*) INTO v_owned
      FROM public.map_custom_questions
     WHERE id = ANY(p_custom_question_ids)
       AND family_id = v_family
       AND soft_deleted_at IS NULL;
    IF v_owned <> v_n THEN
      RAISE EXCEPTION 'one or more questions are not yours or are deleted';
    END IF;
  END IF;
  DELETE FROM public.map_question_bank_items WHERE bank_id = p_bank_id;
  IF v_n > 0 THEN
    INSERT INTO public.map_question_bank_items (bank_id, custom_question_id, sort_order)
    SELECT p_bank_id, qid, ord - 1
    FROM unnest(p_custom_question_ids) WITH ORDINALITY AS t(qid, ord);
  END IF;
END
$$;

-- Recreate map_assign_bank with a real custom branch (vetted unchanged).
CREATE OR REPLACE FUNCTION public.map_assign_bank(
  p_bank_id     uuid,
  p_student_ids uuid[],
  p_due_by      timestamptz,
  p_parent_note text
) RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family   uuid := public.map_current_family_id();
  v_lane     text;
  v_sid      uuid;
  v_ids      uuid[] := '{}';
  v_new      uuid;
  v_snapshot uuid[];
BEGIN
  SELECT lane INTO v_lane
    FROM public.map_question_banks
   WHERE id = p_bank_id AND family_id = v_family AND soft_deleted_at IS NULL;
  IF v_lane IS NULL THEN
    RAISE EXCEPTION 'bank not found or not yours';
  END IF;
  IF p_student_ids IS NULL OR array_length(p_student_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no students given';
  END IF;

  IF v_lane = 'custom' THEN
    -- Freeze the current_version_id of every READY (published, live) item.
    SELECT array_agg(cq.current_version_id ORDER BY i.sort_order)
      INTO v_snapshot
      FROM public.map_question_bank_items i
      JOIN public.map_custom_questions cq ON cq.id = i.custom_question_id
     WHERE i.bank_id = p_bank_id
       AND cq.family_id = v_family
       AND cq.status = 'published'
       AND cq.soft_deleted_at IS NULL
       AND cq.current_version_id IS NOT NULL;
    IF v_snapshot IS NULL OR array_length(v_snapshot, 1) < 5 THEN
      RAISE EXCEPTION 'bank needs at least 5 ready (published) questions to assign (has %)',
        COALESCE(array_length(v_snapshot, 1), 0);
    END IF;
  END IF;

  FOREACH v_sid IN ARRAY p_student_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.map_students WHERE id = v_sid AND family_id = v_family
    ) THEN
      RAISE EXCEPTION 'student % is not in your family', v_sid;
    END IF;
    INSERT INTO public.map_bank_assignments
      (family_id, bank_id, student_id, assigned_by_user_id,
       due_by, parent_note, status, snapshot_question_ids)
    VALUES
      (v_family, p_bank_id, v_sid, auth.uid(),
       p_due_by, p_parent_note, 'assigned',
       CASE WHEN v_lane = 'custom' THEN v_snapshot ELSE NULL END)
    RETURNING id INTO v_new;
    v_ids := array_append(v_ids, v_new);
  END LOOP;
  RETURN v_ids;
END
$$;

-- Bank items joined to their custom-question readiness, for the detail UI.
DROP VIEW IF EXISTS public.map_v_bank_items;
CREATE VIEW public.map_v_bank_items
WITH (security_invoker = true) AS
SELECT
  i.id                 AS item_id,
  i.bank_id            AS bank_id,
  i.sort_order         AS sort_order,
  cq.id                AS custom_question_id,
  cq.status            AS question_status,
  cq.source            AS question_source,
  cq.soft_deleted_at   AS soft_deleted_at,
  qv.stem              AS stem,
  (cq.status = 'published' AND cq.soft_deleted_at IS NULL) AS is_ready
FROM public.map_question_bank_items i
JOIN public.map_custom_questions cq ON cq.id = i.custom_question_id
LEFT JOIN public.map_custom_question_versions qv ON qv.id = cq.current_version_id;

COMMIT;
```

- [ ] **Step 2: Apply** — Supabase MCP `apply_migration`, name `map_question_banks_custom`, full file.

- [ ] **Step 3: Verify** — `execute_sql`:
```sql
SELECT proname FROM pg_proc WHERE proname IN ('map_create_bank','map_set_bank_items','map_assign_bank') ORDER BY proname;
SELECT viewname FROM pg_views WHERE viewname='map_v_bank_items';
```
Expected: 3 procs, 1 view.

- [ ] **Step 4: Commit**
```bash
git add migrations/20260519_map_question_banks_custom.sql
git commit -m "feat(banks) Phase-2 DB: custom create/set-items/assign + map_v_bank_items"
```

---

## Task 2: Lib — custom bank types, queries, mutations

**Files:**
- Modify: `src/lib/banks/types.ts`, `src/lib/banks/queries.ts`, `src/lib/banks/mutations.ts`

- [ ] **Step 1: Add types** — append to `src/lib/banks/types.ts`:
```typescript
export interface BankItemRow {
  item_id: string
  bank_id: string
  sort_order: number
  custom_question_id: string
  question_status: 'draft' | 'published' | 'archived'
  question_source: string
  stem: string | null
  is_ready: boolean
}

export interface PublishableCustomQuestion {
  id: string
  stem: string | null
  source: string
  status: 'draft' | 'published' | 'archived'
}
```

- [ ] **Step 2: Add queries** — append to `src/lib/banks/queries.ts`:
```typescript
import type { BankItemRow, PublishableCustomQuestion } from './types'

export async function listBankItems(bankId: string): Promise<BankItemRow[]> {
  const { data, error } = await supabase
    .from('map_v_bank_items')
    .select('item_id,bank_id,sort_order,custom_question_id,question_status,question_source,stem,is_ready')
    .eq('bank_id', bankId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as BankItemRow[]
}

// Published custom questions in the family not already in this bank — the
// "Add from AI drafts" / "Add existing" picker source.
export async function listAddablePublishedCustomQuestions(
  bankId: string,
): Promise<PublishableCustomQuestion[]> {
  const { data: items, error: iErr } = await supabase
    .from('map_question_bank_items')
    .select('custom_question_id')
    .eq('bank_id', bankId)
  if (iErr) throw iErr
  const inBank = new Set((items ?? []).map((r) => r.custom_question_id as string))
  const { data, error } = await supabase
    .from('map_custom_questions')
    .select('id,status,source,map_custom_question_versions!current_version_id(stem)')
    .eq('status', 'published')
    .is('soft_deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? [])
    .filter((r) => !inBank.has(r.id as string))
    .map((r) => ({
      id: r.id as string,
      status: r.status as 'published',
      source: r.source as string,
      stem:
        ((r as { map_custom_question_versions?: { stem?: string | null } })
          .map_custom_question_versions?.stem) ?? null,
    }))
}
```

- [ ] **Step 3: Add mutations** — append to `src/lib/banks/mutations.ts`:
```typescript
import type { Subject } from '../types'

export async function createCustomBank(args: {
  name: string
  subject: Subject
  grade: number
}): Promise<string> {
  const { data, error } = await supabase.rpc('map_create_bank', {
    p_name: args.name,
    p_subject: args.subject,
    p_grade: args.grade,
    p_lane: 'custom',
    p_standard_codes: [],
    p_planned_length: null,
    p_difficulty: null,
  })
  if (error) throw error
  return data as string
}

export async function setBankItems(
  bankId: string,
  customQuestionIds: string[],
): Promise<void> {
  const { error } = await supabase.rpc('map_set_bank_items', {
    p_bank_id: bankId,
    p_custom_question_ids: customQuestionIds,
  })
  if (error) throw error
}

// Manual authoring for a bank: create the custom question, publish it
// immediately (decision: manual is ready with no review queue), then add it
// to the bank's item set. Reuses the existing custom-question RPCs.
export async function createManualBankQuestion(args: {
  bankId: string
  subject: Subject
  grade: number
  stem: string
  standardCode: string | null
  choices: Array<{ label: string; text: string; is_correct: boolean; explanation_correct: string | null; explanation_wrong: string | null }>
  currentItemIds: string[]
}): Promise<void> {
  const choicesPayload = args.choices.map((c, i) => ({
    label: c.label,
    text: c.text,
    is_correct: c.is_correct,
    ordinal: i,
    explanation_correct: c.explanation_correct,
    explanation_wrong: c.explanation_wrong,
    misconception_tag: null,
  }))
  const { data: qid, error: cErr } = await supabase.rpc('map_create_custom_question', {
    p_source: 'parent_manual',
    p_created_via: 'ui',
    p_subject: args.subject,
    p_grade: args.grade,
    p_stem: args.stem,
    p_standard_code: args.standardCode,
    p_difficulty: null,
    p_ai_metadata: null,
    p_choices: choicesPayload,
    p_passage_version_id: null,
    p_question_focus: null,
    p_stem_svg: null,
    p_stem_svg_alt_text: null,
  })
  if (cErr) throw cErr
  const newId = qid as string
  const { error: pErr } = await supabase.rpc('map_publish_custom_question', {
    p_question_id: newId,
  })
  if (pErr) throw pErr
  await setBankItems(args.bankId, [...args.currentItemIds, newId])
}
```
> The `map_create_custom_question` parameter list is verified against `migrations/20260504_map_custom_questions_and_passages.sql:495` (signature `(text,text,text,int,text,text,int,jsonb,jsonb,uuid,text,bytea,text)` → `p_source,p_created_via,p_subject,p_grade,p_stem,p_standard_code,p_difficulty,p_ai_metadata,p_choices,p_passage_version_id,p_question_focus,p_stem_svg,p_stem_svg_alt_text`). Before implementing, open that migration and confirm the exact JSON key names the RPC expects inside `p_choices` (label/text/is_correct/ordinal/explanation_correct/explanation_wrong/misconception_tag) and adjust `choicesPayload` keys to match it verbatim.

- [ ] **Step 4: Typecheck** — `npm run typecheck` → exit 0.

- [ ] **Step 5: Commit**
```bash
git add src/lib/banks/types.ts src/lib/banks/queries.ts src/lib/banks/mutations.ts
git commit -m "feat(banks) Phase-2 lib: custom bank types/queries/mutations"
```

---

## Task 3: Kid composer — custom-lane branch in `startAssignedBank`

**Files:**
- Modify: `src/lib/banks/startAssignedBank.ts`

- [ ] **Step 1: Read the precedent** — read `src/lib/customTest.ts` `createCustomTestFromMyBank` (≈ lines 281–379) and `src/lib/customQuestionLoader.ts`. The custom session contract: `map_test_sessions` row with `question_ids` = custom-question **version ids**, `kind='custom'`, `is_adaptive=false`, `custom_config={ source:'mine', standard_ids:[], requested_count, actual_count, shortfall_reason }`, `planned_length=actualCount`, `status='in_progress'`, `grade` = student grade (use `fetchStudentGrade` from `../supabase`).

- [ ] **Step 2: Add the custom branch**

Replace the early `if (assignment.lane !== 'vetted')` guard in `src/lib/banks/startAssignedBank.ts` with a real custom branch. The new file body (vetted path unchanged from Phase 1; add the custom path):

```typescript
// src/lib/banks/startAssignedBank.ts
import { supabase, fetchStudentGrade } from '../supabase'
import { createCustomTest, CUSTOM_MIN_COUNT } from '../customTest'
import type { Subject } from '../types'
import type { BankAssignmentOverviewRow } from './types'

export async function startAssignedBank(
  assignment: BankAssignmentOverviewRow,
  studentId: string,
): Promise<string> {
  if (assignment.lane === 'vetted') {
    return startVetted(assignment, studentId)
  }
  return startCustom(assignment, studentId)
}

async function startVetted(
  assignment: BankAssignmentOverviewRow,
  studentId: string,
): Promise<string> {
  const { data: bank, error: bErr } = await supabase
    .from('map_question_banks')
    .select('subject,grade,standard_codes,planned_length,difficulty')
    .eq('id', assignment.bank_id)
    .single()
  if (bErr || !bank) throw new Error('This assigned test is no longer available.')

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
  if (standardIds.length === 0) throw new Error('This assigned test has no questions yet.')

  const { sessionId } = await createCustomTest({
    studentId,
    subject: bank.subject as Subject,
    standardIds,
    requestedCount: bank.planned_length as number,
    difficulty: (bank.difficulty as 'easy' | 'medium' | 'hard' | 'any') ?? 'any',
  })
  await linkAssignment(assignment.assignment_id, sessionId)
  return sessionId
}

async function startCustom(
  assignment: BankAssignmentOverviewRow,
  studentId: string,
): Promise<string> {
  const { data: bank, error: bErr } = await supabase
    .from('map_question_banks')
    .select('subject')
    .eq('id', assignment.bank_id)
    .single()
  if (bErr || !bank) throw new Error('This assigned test is no longer available.')

  // Frozen version ids captured at assign time.
  const { data: asg, error: aErr } = await supabase
    .from('map_bank_assignments')
    .select('snapshot_question_ids')
    .eq('id', assignment.assignment_id)
    .single()
  if (aErr || !asg) throw new Error('This assigned test is no longer available.')
  const snapshot = (asg.snapshot_question_ids as string[] | null) ?? []

  // Self-heal: keep only version ids still resolvable (not soft-deleted).
  let playable: string[] = []
  if (snapshot.length > 0) {
    const { data: live, error: lErr } = await supabase
      .from('map_custom_questions_resolved')
      .select('version_id')
      .in('version_id', snapshot)
    if (lErr) throw lErr
    const ok = new Set((live ?? []).map((r) => r.version_id as string))
    playable = snapshot.filter((v) => ok.has(v))
  }
  if (playable.length < CUSTOM_MIN_COUNT) {
    throw new Error('This assigned test is not ready yet.')
  }

  const grade = await fetchStudentGrade(studentId)
  const customConfig = {
    source: 'mine',
    standard_ids: [] as string[],
    requested_count: playable.length,
    actual_count: playable.length,
    shortfall_reason: null,
  }
  const { data, error: insErr } = await supabase
    .from('map_test_sessions')
    .insert({
      student_id: studentId,
      subject: bank.subject,
      grade,
      status: 'in_progress',
      question_ids: playable,
      current_index: 0,
      correct_count: 0,
      kind: 'custom',
      is_adaptive: false,
      planned_length: playable.length,
      custom_config: customConfig,
    })
    .select('id')
    .single()
  if (insErr || !data) {
    throw new Error(insErr?.message ?? 'Failed to create custom session')
  }
  const sessionId = data.id as string
  await linkAssignment(assignment.assignment_id, sessionId)
  return sessionId
}

// Ported error policy: a link failure after a valid session exists is
// non-fatal — the kid still plays; the assignment self-heals on next load.
async function linkAssignment(assignmentId: string, sessionId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('map_start_bank_assignment', {
      p_assignment_id: assignmentId,
      p_session_id: sessionId,
    })
    if (error) throw error
  } catch (e) {
    console.error('[startAssignedBank] link failed (session still valid):', e)
  }
}
```
> Verify `createCustomTest` still exports and `CUSTOM_MIN_COUNT` is exported from `../customTest` (it is — `src/lib/customTest.ts:11`). `fetchStudentGrade` is exported from `../supabase` (used by `createCustomTestFromMyBank`).

- [ ] **Step 3: Typecheck** — `npm run typecheck` → exit 0.

- [ ] **Step 4: Commit**
```bash
git add src/lib/banks/startAssignedBank.ts
git commit -m "feat(banks) Phase-2 composer: custom-lane session from frozen snapshot + self-heal"
```

---

## Task 4: Results screen — polymorphic attempt loading

**Files:**
- Modify: `src/pages/Results.tsx`

- [ ] **Step 1: Read the current loader + the runner's adapter**

Read `src/pages/Results.tsx` fully (esp. the attempts query ≈ lines 37–43 and every `a.question` / `a.question.standard` / `a.question.rit_band` use), and `src/pages/TestRunner.tsx` `customToLoadedQuestion()` + `src/lib/customQuestionLoader.ts` `loadCustomQuestionsByVersionIds()` (the proven adapter shape). Custom attempts have `question_id IS NULL` and `custom_question_version_id` set.

- [ ] **Step 2: Make attempt loading polymorphic**

In `src/pages/Results.tsx`, after the existing attempts fetch, load custom questions for attempts whose `custom_question_version_id` is set and attach them in the same `question` shape the page already consumes (id, stem, choices, standard, rit_band). Reuse `loadCustomQuestionsByVersionIds` from `src/lib/customQuestionLoader.ts`. Concretely, replace the attempts query/use:

```typescript
import { loadCustomQuestionsByVersionIds } from '../lib/customQuestionLoader'
// ...
const { data: atts, error: aErr } = await supabase
  .from('map_attempts')
  .select(
    `*, question:map_questions(*, choices:map_question_choices(*), standard:map_standards(teks_code, teks_title))`,
  )
  .eq('session_id', id)
  .order('answered_at')
if (aErr) { setError(aErr.message); return }

const customVids = (atts ?? [])
  .filter((a) => !a.question && a.custom_question_version_id)
  .map((a) => a.custom_question_version_id as string)
if (customVids.length > 0) {
  const customs = await loadCustomQuestionsByVersionIds(customVids)
  const byVid = new Map(customs.map((c) => [c.version_id, c]))
  for (const a of atts ?? []) {
    if (a.question || !a.custom_question_version_id) continue
    const c = byVid.get(a.custom_question_version_id as string)
    if (!c) continue
    // Shape a custom question into the minimal contract Results consumes.
    a.question = {
      id: c.version_id,
      stem: c.stem,
      rit_band: null,
      standard: c.standard_code ? { teks_code: c.standard_code, teks_title: c.standard_code } : null,
      choices: c.choices.map((ch) => ({
        id: ch.id,
        label: ch.label,
        body: ch.text,
        is_correct: ch.is_correct,
      })),
    } as unknown as typeof a.question
  }
}
```
Then audit every downstream use the recon flagged: `a.is_correct && a.question` (RIT list — custom `rit_band` is null, so they correctly don't skew the band estimate but still count via `session.correct_count`); `a.question.standard` (per-standard — now populated from `standard_code` when present); the misses/"tricky ones" map (`if (!a.question) return null` now renders custom misses). Make the per-standard and misses sections tolerate a null `rit_band` and a `standard` whose `teks_title` may equal the code. Do not change the score (it already uses `session.correct_count`).

> The exact local edits depend on Results.tsx's current variable names — Step 1's read establishes them. Keep the change minimal: only the attempts-loading block + null-tolerance on `rit_band`/`standard`. No new files.

- [ ] **Step 3: Typecheck + build** — `npm run typecheck && npm run build` → both exit 0.

- [ ] **Step 4: Commit**
```bash
git add src/pages/Results.tsx
git commit -m "feat(banks) Phase-2: Results polymorphic attempt loading (vetted + custom)"
```

---

## Task 5: Manual-question form component

**Files:**
- Create: `src/components/parent/AddManualQuestionForm.tsx`

- [ ] **Step 1: Build a minimal 4-choice authoring form**

Create `src/components/parent/AddManualQuestionForm.tsx`. It collects stem + 4 choices (A–D, one correct) + optional per-choice explanations + optional standard code, and calls `createManualBankQuestion` (Task 2). It does NOT author SVG (the existing manual UI doesn't either).

```tsx
// src/components/parent/AddManualQuestionForm.tsx
import { useState } from 'react'
import { createManualBankQuestion } from '../../lib/banks/mutations'
import type { Subject } from '../../lib/types'

const LABELS = ['A', 'B', 'C', 'D'] as const

export function AddManualQuestionForm(props: {
  bankId: string
  subject: Subject
  grade: number
  currentItemIds: string[]
  onAdded: () => void
  onClose: () => void
}) {
  const [stem, setStem] = useState('')
  const [standard, setStandard] = useState('')
  const [texts, setTexts] = useState<string[]>(['', '', '', ''])
  const [correct, setCorrect] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const setText = (i: number, v: string) =>
    setTexts((t) => t.map((x, j) => (j === i ? v : x)))

  const canSave =
    stem.trim().length >= 5 &&
    texts.every((t) => t.trim().length >= 1) &&
    !busy

  const save = async () => {
    setBusy(true); setErr(null)
    try {
      await createManualBankQuestion({
        bankId: props.bankId,
        subject: props.subject,
        grade: props.grade,
        stem: stem.trim(),
        standardCode: standard.trim() || null,
        choices: LABELS.map((label, i) => ({
          label,
          text: texts[i].trim(),
          is_correct: i === correct,
          explanation_correct: null,
          explanation_wrong: null,
        })),
        currentItemIds: props.currentItemIds,
      })
      props.onAdded()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add the question.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
        <h2 className="font-display text-xl">Add a question</h2>
        <textarea value={stem} onChange={(e) => setStem(e.target.value)}
          placeholder="Question stem" rows={3}
          className="mt-3 w-full rounded border border-cloud p-2 text-sm" />
        <input value={standard} onChange={(e) => setStandard(e.target.value)}
          placeholder="TEKS code (optional)"
          className="mt-2 w-full rounded border border-cloud p-2 text-sm" />
        <div className="mt-3 space-y-2">
          {LABELS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <input type="radio" name="correct" checked={correct === i}
                onChange={() => setCorrect(i)} title="Mark correct" />
              <span className="font-mono text-sm">{label}</span>
              <input value={texts[i]} onChange={(e) => setText(i, e.target.value)}
                placeholder={`Choice ${label}`}
                className="flex-1 rounded border border-cloud p-1 text-sm" />
            </div>
          ))}
        </div>
        {err && <p className="mt-2 text-sm text-rust">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={props.onClose}>Cancel</button>
          <button type="button" className="btn-primary disabled:opacity-50"
            disabled={!canSave} onClick={save}>
            {busy ? 'Adding…' : 'Add (publishes now)'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → exit 0.

- [ ] **Step 3: Commit**
```bash
git add src/components/parent/AddManualQuestionForm.tsx
git commit -m "feat(banks) Phase-2: AddManualQuestionForm (creates published + links)"
```

---

## Task 6: Bank detail + new-custom-bank pages + routes

**Files:**
- Create: `src/pages/parent/NewCustomBank.tsx`, `src/pages/parent/BankDetail.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: New custom bank (name-first)**

Create `src/pages/parent/NewCustomBank.tsx`:
```tsx
// src/pages/parent/NewCustomBank.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createCustomBank } from '../../lib/banks/mutations'
import type { Subject } from '../../lib/types'

const SUBJECTS: Subject[] = ['math', 'reading', 'language']

export default function NewCustomBank() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [subject, setSubject] = useState<Subject>('math')
  const [grade, setGrade] = useState(3)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    setBusy(true); setErr(null)
    try {
      const id = await createCustomBank({ name: name.trim(), subject, grade })
      navigate(`/parent/banks/${id}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create the bank.')
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg p-4">
      <h1 className="font-display text-3xl">New question bank</h1>
      <p className="mt-1 text-sm text-smoke">
        Name it first (e.g. “Fractions + Coins”), then add your own questions
        and/or published AI questions on the next screen.
      </p>
      <input value={name} onChange={(e) => setName(e.target.value)}
        placeholder="Bank name" maxLength={120}
        className="mt-4 w-full rounded border border-cloud p-2 text-sm" />
      <div className="mt-3 flex gap-2">
        {SUBJECTS.map((s) => (
          <button key={s} type="button" onClick={() => setSubject(s)}
            className={subject === s ? 'btn-primary text-sm' : 'btn-secondary text-sm'}>
            {s}
          </button>
        ))}
      </div>
      <label className="mt-3 block text-sm">Grade
        <input type="number" min={0} max={12} value={grade}
          onChange={(e) => setGrade(Number(e.target.value))}
          className="ml-2 w-16 rounded border border-cloud p-1 text-sm" /></label>
      {err && <p className="mt-2 text-sm text-rust">{err}</p>}
      <div className="mt-4 flex gap-2">
        <button type="button" className="btn-primary disabled:opacity-50"
          disabled={busy || name.trim().length < 1} onClick={save}>
          {busy ? 'Creating…' : 'Create bank'}
        </button>
        <button type="button" className="btn-ghost" onClick={() => navigate('/parent')}>
          Cancel
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Bank detail**

Create `src/pages/parent/BankDetail.tsx`:
```tsx
// src/pages/parent/BankDetail.tsx
import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { listBankItems, listAddablePublishedCustomQuestions } from '../../lib/banks/queries'
import { setBankItems } from '../../lib/banks/mutations'
import { AddManualQuestionForm } from '../../components/parent/AddManualQuestionForm'
import { AssignBankDialog } from '../../components/parent/AssignBankDialog'
import type { BankItemRow, PublishableCustomQuestion } from '../../lib/banks/types'
import type { Subject } from '../../lib/types'

export default function BankDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [bank, setBank] = useState<{ name: string; subject: Subject; grade: number; lane: string } | null>(null)
  const [items, setItems] = useState<BankItemRow[]>([])
  const [addable, setAddable] = useState<PublishableCustomQuestion[]>([])
  const [showManual, setShowManual] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const reload = useCallback(() => {
    if (!id) return
    supabase.from('map_question_banks').select('name,subject,grade,lane').eq('id', id).single()
      .then(({ data }) => { if (data) setBank(data as typeof bank) })
    listBankItems(id).then(setItems).catch((e) => setErr(String(e)))
    listAddablePublishedCustomQuestions(id).then(setAddable).catch((e) => setErr(String(e)))
  }, [id])
  useEffect(reload, [reload])

  if (!id) return null
  const readyCount = items.filter((i) => i.is_ready).length
  const itemIds = items.map((i) => i.custom_question_id)

  const addExisting = async (qid: string) => {
    try { await setBankItems(id, [...itemIds, qid]); reload() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not add.') }
  }
  const remove = async (qid: string) => {
    try { await setBankItems(id, itemIds.filter((x) => x !== qid)); reload() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not remove.') }
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      <button type="button" className="btn-ghost text-sm" onClick={() => navigate('/parent')}>
        ← Back
      </button>
      <h1 className="mt-2 font-display text-3xl">{bank?.name ?? 'Bank'}</h1>
      <p className="mt-1 text-sm text-smoke">
        {bank?.subject} · Grade {bank?.grade} · {readyCount} ready
        {readyCount < 5 && ` · need ${5 - readyCount} more to assign`}
      </p>
      {err && <p className="mt-2 text-sm text-rust">{err}</p>}

      <div className="mt-4 flex gap-2">
        <button type="button" className="btn-primary text-sm" onClick={() => setShowManual(true)}>
          + Add manual question
        </button>
        <button type="button" className="btn-secondary text-sm disabled:opacity-50"
          disabled={readyCount < 5} onClick={() => setShowAssign(true)}>
          Assign bank
        </button>
      </div>

      <h3 className="mt-6 font-display text-lg">Questions ({items.length})</h3>
      <div className="mt-2 space-y-1">
        {items.length === 0 && <p className="text-sm text-smoke">No questions yet.</p>}
        {items.map((it) => (
          <div key={it.item_id} className="flex items-center justify-between rounded border border-cloud p-2 text-sm">
            <span className="truncate">
              {it.stem ?? '(no stem)'}{' '}
              <span className={`rounded px-1 text-xs ${it.is_ready ? 'bg-cloud' : 'bg-sun/30'}`}>
                {it.is_ready ? 'ready' : it.question_status}
              </span>
            </span>
            <button type="button" className="btn-ghost text-xs" onClick={() => remove(it.custom_question_id)}>
              Remove
            </button>
          </div>
        ))}
      </div>

      <h3 className="mt-6 font-display text-lg">Add from published custom questions</h3>
      <p className="text-xs text-smoke">
        AI-generated questions appear here once you publish them in the Custom bank review screen.
      </p>
      <div className="mt-2 space-y-1">
        {addable.length === 0 && <p className="text-sm text-smoke">Nothing available to add.</p>}
        {addable.map((q) => (
          <div key={q.id} className="flex items-center justify-between rounded border border-cloud p-2 text-sm">
            <span className="truncate">{q.stem ?? '(no stem)'} <span className="text-xs text-smoke">{q.source}</span></span>
            <button type="button" className="btn-secondary text-xs" onClick={() => addExisting(q.id)}>
              Add
            </button>
          </div>
        ))}
      </div>

      {showManual && bank && (
        <AddManualQuestionForm
          bankId={id} subject={bank.subject} grade={bank.grade}
          currentItemIds={itemIds}
          onAdded={() => { setShowManual(false); reload() }}
          onClose={() => setShowManual(false)}
        />
      )}
      {showAssign && bank && (
        <AssignBankDialog
          bankId={id} bankName={bank.name}
          onClose={() => setShowAssign(false)}
          onAssigned={() => { setShowAssign(false); reload() }}
        />
      )}
    </div>
  )
}
```
> Glyph note: `←` U+2190, `·` U+00B7, `…` U+2026, `“ ”` U+201C/U+201D. `bg-sun/30` token is used in `CustomBank.tsx`; confirm it exists (recon showed `sun` token in the prior cycle) — if not, use `bg-cloud`.

- [ ] **Step 3: Routes** — in `src/App.tsx`, add imports next to `SaveVettedBank`:
```tsx
import NewCustomBank from './pages/parent/NewCustomBank'
import BankDetail from './pages/parent/BankDetail'
```
and two routes mirroring the exact `/parent/banks/new` wrapper block (RequireAuth→RequireActiveStudent→RequireParentPin):
```tsx
<Route path="/parent/banks/new-custom" element={<RequireAuth><RequireActiveStudent><RequireParentPin><NewCustomBank /></RequireParentPin></RequireActiveStudent></RequireAuth>} />
<Route path="/parent/banks/:id" element={<RequireAuth><RequireActiveStudent><RequireParentPin><BankDetail /></RequireParentPin></RequireActiveStudent></RequireAuth>} />
```
> Copy the verbatim multi-line `<Route>` shape already in `App.tsx` for `/parent/banks/new`; only path + element change.

- [ ] **Step 4: Typecheck + build** — `npm run typecheck && npm run build` → both exit 0.

- [ ] **Step 5: Commit**
```bash
git add src/pages/parent/NewCustomBank.tsx src/pages/parent/BankDetail.tsx src/App.tsx
git commit -m "feat(banks) Phase-2 UI: NewCustomBank + BankDetail + routes"
```

---

## Task 7: Wire custom banks into Tests & Banks + kid panel

**Files:**
- Modify: `src/pages/parent/TestsAndBanks.tsx`, `src/components/AssignedBanksPanel.tsx`

- [ ] **Step 1: Add "+ New question bank" and link custom rows to detail**

In `src/pages/parent/TestsAndBanks.tsx`: add a second header button next to "+ New vetted test", and make custom-lane bank rows open their detail page. Import `Link` is already present. Add beside the existing `+ New vetted test` Link:
```tsx
<Link to="/parent/banks/new-custom" className="btn-secondary text-sm">+ New question bank</Link>
```
And in the bank row, when `b.lane === 'custom'`, render an "Open" link to `/parent/banks/${b.id}` in addition to "Assign" (Assign on a custom bank still works once ≥5 ready; the dialog surfaces the RPC's ≥5 error otherwise):
```tsx
{b.lane === 'custom' && (
  <Link to={`/parent/banks/${b.id}`} className="btn-ghost text-sm">Open</Link>
)}
```
Place the `Open` link immediately before the existing `Assign` button in the row's action area. Change nothing else.

- [ ] **Step 2: Let the kid panel show custom banks**

In `src/components/AssignedBanksPanel.tsx`, the Phase-1 filter is `r.student_id === sid && r.status === 'assigned' && r.lane === 'vetted'`. Remove the `&& r.lane === 'vetted'` clause so custom assignments also appear (the composer now handles both lanes):
```tsx
setRows(all.filter((r) =>
  r.student_id === sid && r.status === 'assigned'))
```
Change nothing else in the file.

- [ ] **Step 3: Typecheck + build** — `npm run typecheck && npm run build` → both exit 0.

- [ ] **Step 4: Commit**
```bash
git add src/pages/parent/TestsAndBanks.tsx src/components/AssignedBanksPanel.tsx
git commit -m "feat(banks) Phase-2: wire custom banks into Tests&Banks + kid panel"
```

---

## Task 8: Phase-2 data guard

**Files:**
- Create: `scripts/test-banks-phase2-data.mjs`

- [ ] **Step 1: Write the guard** — extends the Phase-1 harness pattern (service-role admin + two signed-in families). Asserts the custom-lane contract end to end.

```javascript
// scripts/test-banks-phase2-data.mjs
// Phase-2 data guard: custom bank create -> set items (manual published +
// AI-style draft) -> >=5 ready gate -> assign freezes version-id snapshot ->
// snapshot stable after bank edits -> compose session from snapshot ->
// cross-family RLS.
// Run: node --env-file=.env.local scripts/test-banks-phase2-data.mjs
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

const tag = `bank2_${Date.now()}`
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
    .insert({ display_name: `${tag}_kid_${n}`, family_id: fam.id, grade: 3, school_grade: 3 })
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

// Minimal published custom math question for family A's client.
async function makePublishedQ(client, i) {
  const { data: qid, error } = await client.rpc('map_create_custom_question', {
    p_source: 'parent_manual', p_created_via: 'ui', p_subject: 'math', p_grade: 3,
    p_stem: `Guard Q${i}: 2+${i}?`, p_standard_code: null, p_difficulty: null,
    p_ai_metadata: null,
    p_choices: [
      { label: 'A', text: String(2 + i), is_correct: true, ordinal: 0, explanation_correct: 'yes', explanation_wrong: null, misconception_tag: null },
      { label: 'B', text: String(2 + i + 1), is_correct: false, ordinal: 1, explanation_correct: null, explanation_wrong: 'off by one', misconception_tag: null },
      { label: 'C', text: String(2 + i + 2), is_correct: false, ordinal: 2, explanation_correct: null, explanation_wrong: 'off by two', misconception_tag: null },
      { label: 'D', text: String(2 + i + 3), is_correct: false, ordinal: 3, explanation_correct: null, explanation_wrong: 'off by three', misconception_tag: null },
    ],
    p_passage_version_id: null, p_question_focus: null, p_stem_svg: null, p_stem_svg_alt_text: null,
  })
  if (error) throw error
  const { error: pErr } = await client.rpc('map_publish_custom_question', { p_question_id: qid })
  if (pErr) throw pErr
  return qid
}

try {
  const A = await makeFamily('A')
  const B = await makeFamily('B')

  const { data: bankId, error: cbErr } = await A.client.rpc('map_create_bank', {
    p_name: 'Fractions + Coins', p_subject: 'math', p_grade: 3, p_lane: 'custom',
    p_standard_codes: [], p_planned_length: null, p_difficulty: null,
  })
  assert(!cbErr && bankId, 'map_create_bank (custom) returns an id')

  const qids = []
  for (let i = 1; i <= 6; i++) qids.push(await makePublishedQ(A.client, i))
  assert(qids.length === 6, 'created 6 published custom questions')

  // Set 4 items -> assign must fail (<5 ready).
  const { error: s4 } = await A.client.rpc('map_set_bank_items', {
    p_bank_id: bankId, p_custom_question_ids: qids.slice(0, 4),
  })
  assert(!s4, 'map_set_bank_items accepts 4 items')
  const { error: aFail } = await A.client.rpc('map_assign_bank', {
    p_bank_id: bankId, p_student_ids: [A.studentId], p_due_by: null, p_parent_note: null,
  })
  assert(!!aFail, 'assign blocked with <5 ready items')

  // Set all 6 -> assign succeeds and snapshots version ids.
  const { error: s6 } = await A.client.rpc('map_set_bank_items', {
    p_bank_id: bankId, p_custom_question_ids: qids,
  })
  assert(!s6, 'map_set_bank_items accepts 6 items')
  const { data: aids, error: aErr } = await A.client.rpc('map_assign_bank', {
    p_bank_id: bankId, p_student_ids: [A.studentId], p_due_by: null, p_parent_note: 'do these',
  })
  assert(!aErr && aids?.length === 1, 'assign succeeds with >=5 ready')
  const assignmentId = aids[0]

  const { data: asg } = await admin.from('map_bank_assignments')
    .select('snapshot_question_ids').eq('id', assignmentId).single()
  assert(Array.isArray(asg.snapshot_question_ids) && asg.snapshot_question_ids.length === 6,
    'assignment froze a 6-id snapshot')
  // Snapshot holds VERSION ids, resolvable via map_custom_questions_resolved.
  const { data: resolved } = await admin.from('map_custom_questions_resolved')
    .select('version_id').in('version_id', asg.snapshot_question_ids)
  assert((resolved ?? []).length === 6, 'snapshot ids are resolvable custom version ids')

  // Editing the bank after assign does NOT change the frozen snapshot.
  await A.client.rpc('map_set_bank_items', { p_bank_id: bankId, p_custom_question_ids: qids.slice(0, 5) })
  const { data: asg2 } = await admin.from('map_bank_assignments')
    .select('snapshot_question_ids').eq('id', assignmentId).single()
  assert(asg2.snapshot_question_ids.length === 6, 'snapshot stable after bank edits (frozen)')

  // Cross-family: B cannot see/set/assign A's custom bank.
  const { data: bItems } = await B.client.from('map_v_bank_items').select('bank_id').eq('bank_id', bankId)
  assert((bItems ?? []).length === 0, 'family B cannot see A bank items (RLS)')
  const { error: bSet } = await B.client.rpc('map_set_bank_items', {
    p_bank_id: bankId, p_custom_question_ids: [],
  })
  assert(!!bSet, 'family B cannot set items on A bank')

  // Compose a session from the snapshot (mirror startAssignedBank custom path).
  const { data: sess, error: seErr } = await admin.from('map_test_sessions').insert({
    student_id: A.studentId, subject: 'math', grade: 3, status: 'in_progress',
    question_ids: asg.snapshot_question_ids, current_index: 0, correct_count: 0,
    kind: 'custom', is_adaptive: false, planned_length: 6,
    custom_config: { source: 'mine', standard_ids: [], requested_count: 6, actual_count: 6, shortfall_reason: null },
  }).select('id').single()
  assert(!seErr && sess?.id, 'custom session composed from snapshot version ids')
  const { error: linkErr } = await A.client.rpc('map_start_bank_assignment', {
    p_assignment_id: assignmentId, p_session_id: sess.id,
  })
  assert(!linkErr, 'map_start_bank_assignment links the custom session')

  console.log('\nPhase-2 bank data checks complete.')
} finally {
  await cleanup()
}
```

- [ ] **Step 2: Run** — `node --env-file=.env.local scripts/test-banks-phase2-data.mjs ; echo "exit=$?"` → all `PASS:`, ends `Phase-2 bank data checks complete.`, `exit=0`. On a real assertion failure (not infra), STOP and report the exact error + failing assert; do not weaken assertions. If `map_create_custom_question`'s `p_choices` JSON keys differ from this script's, fix the keys to match the RPC (verified from `migrations/20260504_map_custom_questions_and_passages.sql:495`) — this is the same contract Task 2 depends on.

- [ ] **Step 3: Commit**
```bash
git add scripts/test-banks-phase2-data.mjs
git commit -m "test(banks) Phase-2 data guard: custom create/set-items/>=5/snapshot/RLS"
```

---

## Task 9: Full verification + manual QA

**Files:** none (verification only)

- [ ] **Step 1:** `npm run typecheck && npm run build ; echo "exit=$?"` → both 0.
- [ ] **Step 2:** Re-run BOTH guards (Phase 1 must still pass — no regression):
  `node --env-file=.env.local scripts/test-banks-phase1-data.mjs` → all PASS;
  `node --env-file=.env.local scripts/test-banks-phase2-data.mjs` → all PASS.
- [ ] **Step 3: Manual QA** (dev server, parent w/ kid, PIN unlocked). Report each PASS/CONCERN:
  1. `/parent` → **+ New question bank** → name "Fractions + Coins", subject/grade → lands on bank detail.
  2. **+ Add manual question** → fill stem + 4 choices, mark correct, Add → appears as **ready** immediately (no review queue); readiness count rises.
  3. With < 5 ready, **Assign bank** is disabled; at ≥ 5 it enables; assigning shows under Assignments.
  4. (AI path) Generate AI questions via the existing Connect-AI/Custom-bank flow, publish one in the existing Custom bank review screen → it appears under **Add from published custom questions** → Add → becomes a ready item.
  5. Kid home shows the assigned custom bank → **Start** → takes exactly the snapshot questions (custom stems/choices render, SVG if any) → finishing flips the assignment to **completed** with a score.
  6. **Results screen** for that custom session: score correct; the per-standard / "tricky ones" sections render the custom questions (not blank) — this is the Task-4 fix.
  7. Vetted lane (Phase 1) still works unchanged; revoke still works.
- [ ] **Step 4:** Final commit if QA fixes were needed; else skip. Then this plan is complete — proceed to **finishing-a-development-branch**.

---

## Self-Review

**1. Spec coverage (Phase 2 = spec §8 second bullet + §4.2/§4.3/§5/§6/§7 custom detail):**
- Runner spike → resolved at planning time (runner already serves custom sessions; documented, with the one real gap = Results). ✓
- `map_create_bank` custom branch, `map_set_bank_items`, `map_assign_bank` ≥5-ready + frozen version-id snapshot → Task 1. ✓
- Manual ready immediately (created published, no queue) → Task 2 `createManualBankQuestion` (create→publish→link), Task 5 form. ✓
- AI draft → existing review screen → publish → added → Task 2 `listAddablePublishedCustomQuestions`, Task 6 BankDetail "Add from published". Existing CustomBank review reused unchanged. ✓
- Frozen-snapshot composer + self-heal → Task 3. ✓
- Results renders custom → Task 4 (the one runner-side gap). ✓
- Name-first authoring + readiness UI + assign gate → Task 6 BankDetail / NewCustomBank. ✓
- Wire into legacy /parent + kid panel → Task 7. ✓
- Cross-family isolation show-stopper, ≥5 gate, snapshot stability, self-heal → Task 8 data guard. ✓
- No schema changes (spec §9) → Task 1 is RPC/view only; confirmed by the planning-time spike. ✓

**2. Placeholder scan:** No TBD/TODO. Every code step has complete code. Task 4's "exact local edits depend on Results.tsx variable names" is preceded by a mandatory read (Step 1) and the concrete replacement block is given; the residual is null-tolerance wiring whose shape is established by that read — not a placeholder but a bounded, explicitly-scoped edit. The two "confirm the RPC's p_choices keys" notes (Tasks 2, 8) point at one verified migration line and ask for verbatim key matching — concrete, not deferred design.

**3. Type consistency:** `createCustomBank/setBankItems/createManualBankQuestion` (Task 2) consumed identically in Tasks 5–7. `BankItemRow`/`PublishableCustomQuestion` (Task 2 types) match `map_v_bank_items`/the query select (Task 1/2) and the BankDetail reads (Task 6). `startAssignedBank` keeps its Phase-1 signature `(BankAssignmentOverviewRow, studentId) → Promise<string>` (Task 3) — consumers (`AssignedBanksPanel`) unchanged except the lane filter (Task 7). Snapshot stores **version ids** consistently: frozen by `map_assign_bank` (Task 1), consumed by `startCustom` (Task 3) and asserted in Task 8. `map_create_custom_question` param/`p_choices` shape is the same contract in Task 2 and Task 8.
