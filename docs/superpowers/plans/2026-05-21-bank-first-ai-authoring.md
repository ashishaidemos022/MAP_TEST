# Bank-First AI Authoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every custom item (question or passage) lives in a named custom Bank at creation time. MCP write tools take `bank_id` or `bank_name`; the AI Studio default view is a list of Banks; the same rule applies to the manual New-question/New-passage forms.

**Architecture:** One migration adds `custom_passage_id` to `map_question_bank_items` plus three RPCs (`map_create_or_find_custom_bank`, `map_add_items_to_bank`, `map_rename_bank`) and two views (`map_v_custom_bank_overview`, `map_v_custom_legacy_items`). The two MCP write tools gain a `bank_id|bank_name` input, route the items through the new RPCs, and return a `bank` block. The parent UI gets a new `ReviewBanks` page at `/parent/ai-studio`, repurposes `CustomBank.tsx` as the per-Bank review screen, adds a Bank picker to the manual authoring forms, and surfaces orphans via a `?legacy=1` page.

**Tech Stack:** Vite + React Router v6 SPA, Supabase Postgres with RLS via `map_current_family_id()`, `SECURITY DEFINER SET search_path=''` RPCs, MCP server on Vercel Functions (Node runtime, fetch-bridged). No React test runner — Node data-guard scripts under `scripts/` and `npm run typecheck && npm run build`.

**Spec:** `docs/superpowers/specs/2026-05-20-bank-first-ai-authoring-design.md`

**Branch:** Work continues on `spec/bank-first-ai-authoring` (the spec commit is already on it). When the implementation is complete, rename or rebranch to `feat/bank-first-ai-authoring`.

---

## File map

**Created:**
- `migrations/20260521_map_bank_first_authoring.sql` — schema delta, three RPCs, two views.
- `scripts/test-bank-first-data.mjs` — Node data-guard against Supabase: RPC behavior, RLS, cap enforcement, create-or-find suffixing.
- `scripts/test-mcp-bank-first.mjs` — MCP integration test: `bank_name` create vs reuse, `bank_id` resume, mixed-subjects error.
- `src/pages/parent/ReviewBanks.tsx` — the new AI Studio default view.
- `src/pages/parent/LegacyItems.tsx` — the read-only orphan list (lifted-and-trimmed copy of the current CustomBank layout).
- `src/components/parent/BankPicker.tsx` — shared combobox + inline-create dialog used by the two manual forms.

**Modified:**
- `api/_lib/mcp/schemas.ts` — extend `CreateCustomQuestionsInput` and `CreateCustomPassageAndQuestionsInput` with `bank_id`/`bank_name`.
- `api/_lib/mcp/errors.ts` — add four new error codes.
- `api/_lib/mcp/tools/create-custom-questions.ts` — resolve bank before/after item creation; include `bank` in response.
- `api/_lib/mcp/tools/create-custom-passage-and-questions.ts` — same.
- `api/_lib/svg/capability-blurb.ts` — naming-convention paragraph appended to write-tool descriptions.
- `api/_lib/custom/db.ts` — small helpers `resolveCreateOrFindBank`, `resolveBankById`, `addItemsToBank` so the tools stay thin.
- `src/lib/banks/mutations.ts` — `createOrFindCustomBank`, `addItemsToBank`, `renameBank` wrappers; rewire `createManualBankQuestion` to use `addItemsToBank`.
- `src/pages/parent/AiStudio.tsx` — route by `?tab=connect | ?bank=… | ?legacy=1 | (default → ReviewBanks)`.
- `src/pages/parent/CustomBank.tsx` — require a `bank` query param; rename in-file `default export` to a `BankReview` semantic (file name stays for diff hygiene); add header + Publish-all + Assign-to-kid CTA.
- `src/pages/parent/NewCustomQuestion.tsx` — Bank field (required) at top; pre-bind from `?bank=`; route on save through `addItemsToBank`.
- `src/pages/parent/NewCustomPassage.tsx` — same.

**Untouched:** `src/pages/parent/TestsAndBanks.tsx`, vetted-lane RPCs, kid-side composer, the existing `map_set_bank_items` and `map_publish_custom_question` RPCs.

---

## Task ordering

Tasks land in commit order so each commit leaves the tree green (`npm run typecheck && npm run build` passes). Migration is committed first so subsequent code can call the new RPCs against the dev project.

1. Migration + data-guard script.
2. Lib wrappers in `src/lib/banks/mutations.ts`.
3. MCP helpers (`api/_lib/custom/db.ts`) + error codes.
4. MCP schemas + tool description blurb.
5. MCP `create_custom_questions` rewrite.
6. MCP `create_custom_passage_and_questions` rewrite.
7. MCP integration test script.
8. `BankPicker` shared component.
9. Manual `NewCustomQuestion` form — Bank field.
10. Manual `NewCustomPassage` form — Bank field.
11. `ReviewBanks` page.
12. `CustomBank.tsx` repurposed as Bank Review (drill-in).
13. `LegacyItems` page + `AiStudio` routing.
14. Manual QA + PR description.

---

### Task 1: Migration — schema + RPCs + views

**Files:**
- Create: `migrations/20260521_map_bank_first_authoring.sql`

- [ ] **Step 1: Write the migration**

```sql
-- =========================================================================
-- Migration: map_bank_first_authoring  (Bank-First AI Authoring)
-- Project:   klhzfwxpztaojekwgzcg
-- Spec:      docs/superpowers/specs/2026-05-20-bank-first-ai-authoring-design.md
--
-- Adds:
--   * map_question_bank_items.custom_passage_id (XOR with custom_question_id)
--   * RPC map_create_or_find_custom_bank(name, subject, grade)
--   * RPC map_add_items_to_bank(bank_id, question_ids, passage_ids)
--   * RPC map_rename_bank(bank_id, name)
--   * View map_v_custom_bank_overview (security_invoker)
--   * View map_v_custom_legacy_items   (security_invoker)
--
-- Properties: idempotent, single transaction, no enum changes, no data
-- migration. RLS inherits from existing tables.
-- =========================================================================

BEGIN;

-- 1. Extend map_question_bank_items to also hold passages.
ALTER TABLE public.map_question_bank_items
  ADD COLUMN IF NOT EXISTS custom_passage_id uuid
    REFERENCES public.map_custom_passages(id) ON DELETE CASCADE;

ALTER TABLE public.map_question_bank_items
  ALTER COLUMN custom_question_id DROP NOT NULL;

-- One-of constraint (drop-then-add so re-run is safe).
ALTER TABLE public.map_question_bank_items
  DROP CONSTRAINT IF EXISTS map_qbi_xor_kind;
ALTER TABLE public.map_question_bank_items
  ADD CONSTRAINT map_qbi_xor_kind CHECK (
    (custom_question_id IS NOT NULL AND custom_passage_id IS NULL)
    OR
    (custom_question_id IS NULL AND custom_passage_id IS NOT NULL)
  );

-- Passage-uniqueness within a bank.
DROP INDEX IF EXISTS public.map_qbi_passage_unique;
CREATE UNIQUE INDEX map_qbi_passage_unique
  ON public.map_question_bank_items(bank_id, custom_passage_id)
  WHERE custom_passage_id IS NOT NULL;

-- 2. RPC: create-or-find a custom bank by (name, subject, grade).
CREATE OR REPLACE FUNCTION public.map_create_or_find_custom_bank(
  p_name    text,
  p_subject text,
  p_grade   int
) RETURNS TABLE(bank_id uuid, resolved_name text, was_created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family uuid := public.map_current_family_id();
  v_id     uuid;
  v_name   text := p_name;
  v_n      int  := 2;
BEGIN
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'no family for current user';
  END IF;
  IF p_name IS NULL OR char_length(p_name) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'name must be 1..120 chars';
  END IF;
  IF p_subject NOT IN ('math','reading','language') THEN
    RAISE EXCEPTION 'unknown subject: %', p_subject;
  END IF;
  IF p_grade NOT BETWEEN 0 AND 12 THEN
    RAISE EXCEPTION 'grade out of range';
  END IF;

  -- Reuse path: same family, lane=custom, same subject+grade+name, not soft-deleted.
  SELECT id INTO v_id
    FROM public.map_question_banks
   WHERE family_id = v_family
     AND lane = 'custom'
     AND soft_deleted_at IS NULL
     AND name = p_name
     AND subject = p_subject
     AND grade = p_grade
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, p_name, false;
    RETURN;
  END IF;

  -- Suffix path: same family + name but different subject/grade. Find smallest (N).
  WHILE EXISTS (
    SELECT 1 FROM public.map_question_banks
     WHERE family_id = v_family
       AND lane = 'custom'
       AND soft_deleted_at IS NULL
       AND name = v_name
  ) LOOP
    v_name := p_name || ' (' || v_n || ')';
    v_n := v_n + 1;
  END LOOP;

  INSERT INTO public.map_question_banks
    (family_id, owner_user_id, name, subject, grade, lane,
     standard_codes, planned_length, difficulty)
  VALUES
    (v_family, auth.uid(), v_name, p_subject, p_grade, 'custom',
     '{}', NULL, NULL)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_name, true;
END
$$;

-- 3. RPC: append items to a bank (idempotent on the unique indexes).
CREATE OR REPLACE FUNCTION public.map_add_items_to_bank(
  p_bank_id      uuid,
  p_question_ids uuid[],
  p_passage_ids  uuid[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family    uuid := public.map_current_family_id();
  v_lane      text;
  v_subject   text;
  v_grade     int;
  v_existing  int;
  v_to_add_q  int := COALESCE(array_length(p_question_ids, 1), 0);
  v_to_add_p  int := COALESCE(array_length(p_passage_ids,  1), 0);
  v_next_sort int;
BEGIN
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'no family for current user';
  END IF;

  SELECT lane, subject, grade INTO v_lane, v_subject, v_grade
    FROM public.map_question_banks
   WHERE id = p_bank_id
     AND family_id = v_family
     AND soft_deleted_at IS NULL;
  IF v_lane IS NULL THEN
    RAISE EXCEPTION 'bank not found or not yours';
  END IF;
  IF v_lane <> 'custom' THEN
    RAISE EXCEPTION 'only custom banks accept items';
  END IF;

  -- Family ownership + subject/grade match for every id.
  IF v_to_add_q > 0 THEN
    IF (SELECT count(*) FROM public.map_custom_questions
         WHERE id = ANY(p_question_ids)
           AND family_id = v_family
           AND soft_deleted_at IS NULL
           AND subject = v_subject
           AND grade = v_grade) <> v_to_add_q THEN
      RAISE EXCEPTION 'one or more questions are not yours, are deleted, or do not match the bank subject/grade';
    END IF;
  END IF;
  IF v_to_add_p > 0 THEN
    IF (SELECT count(*) FROM public.map_custom_passages
         WHERE id = ANY(p_passage_ids)
           AND family_id = v_family
           AND soft_deleted_at IS NULL
           AND subject = v_subject
           AND grade = v_grade) <> v_to_add_p THEN
      RAISE EXCEPTION 'one or more passages are not yours, are deleted, or do not match the bank subject/grade';
    END IF;
  END IF;

  SELECT count(*) INTO v_existing
    FROM public.map_question_bank_items
   WHERE bank_id = p_bank_id;

  IF v_existing + v_to_add_q + v_to_add_p > 60 THEN
    RAISE EXCEPTION 'a bank can hold at most 60 items (current %, adding %)',
      v_existing, v_to_add_q + v_to_add_p;
  END IF;

  SELECT COALESCE(MAX(sort_order), -1) + 1 INTO v_next_sort
    FROM public.map_question_bank_items
   WHERE bank_id = p_bank_id;

  IF v_to_add_q > 0 THEN
    INSERT INTO public.map_question_bank_items
      (bank_id, custom_question_id, sort_order)
    SELECT p_bank_id, qid, v_next_sort + (ord - 1)
      FROM unnest(p_question_ids) WITH ORDINALITY AS t(qid, ord)
    ON CONFLICT (bank_id, custom_question_id) DO NOTHING;
    v_next_sort := v_next_sort + v_to_add_q;
  END IF;

  IF v_to_add_p > 0 THEN
    INSERT INTO public.map_question_bank_items
      (bank_id, custom_passage_id, sort_order)
    SELECT p_bank_id, pid, v_next_sort + (ord - 1)
      FROM unnest(p_passage_ids) WITH ORDINALITY AS t(pid, ord)
    ON CONFLICT (bank_id, custom_passage_id) DO NOTHING;
  END IF;
END
$$;

-- 4. RPC: rename a bank (family-scoped, collision-checked).
CREATE OR REPLACE FUNCTION public.map_rename_bank(
  p_bank_id uuid,
  p_name    text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family  uuid := public.map_current_family_id();
  v_subject text;
  v_grade   int;
BEGIN
  IF p_name IS NULL OR char_length(p_name) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'name must be 1..120 chars';
  END IF;
  SELECT subject, grade INTO v_subject, v_grade
    FROM public.map_question_banks
   WHERE id = p_bank_id
     AND family_id = v_family
     AND soft_deleted_at IS NULL;
  IF v_subject IS NULL THEN
    RAISE EXCEPTION 'bank not found or not yours';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.map_question_banks
     WHERE family_id = v_family
       AND lane = 'custom'
       AND soft_deleted_at IS NULL
       AND name = p_name
       AND subject = v_subject
       AND grade = v_grade
       AND id <> p_bank_id
  ) THEN
    RAISE EXCEPTION 'another bank already uses that name for this subject and grade';
  END IF;
  UPDATE public.map_question_banks
     SET name = p_name, updated_at = now()
   WHERE id = p_bank_id AND family_id = v_family;
END
$$;

-- 5. View: per-bank overview for the AI Studio list.
DROP VIEW IF EXISTS public.map_v_custom_bank_overview;
CREATE VIEW public.map_v_custom_bank_overview
WITH (security_invoker = true) AS
SELECT
  b.id, b.family_id, b.name, b.subject, b.grade, b.created_at, b.updated_at,
  count(i.id) FILTER (WHERE cq.id IS NOT NULL)         AS question_count,
  count(i.id) FILTER (WHERE cp.id IS NOT NULL)         AS passage_count,
  count(*)    FILTER (WHERE cq.status = 'draft')       AS draft_question_count,
  count(*)    FILTER (WHERE cq.status = 'published')   AS ready_question_count
FROM public.map_question_banks b
LEFT JOIN public.map_question_bank_items i
       ON i.bank_id = b.id
LEFT JOIN public.map_custom_questions cq
       ON cq.id = i.custom_question_id AND cq.soft_deleted_at IS NULL
LEFT JOIN public.map_custom_passages  cp
       ON cp.id = i.custom_passage_id  AND cp.soft_deleted_at IS NULL
WHERE b.lane = 'custom' AND b.soft_deleted_at IS NULL
GROUP BY b.id;

-- 6. View: orphaned custom items (Legacy link source).
DROP VIEW IF EXISTS public.map_v_custom_legacy_items;
CREATE VIEW public.map_v_custom_legacy_items
WITH (security_invoker = true) AS
SELECT 'question'::text AS kind, q.id, q.family_id, q.subject, q.grade,
       q.status, q.created_at
FROM public.map_custom_questions q
WHERE q.soft_deleted_at IS NULL
  AND q.id NOT IN (SELECT custom_question_id
                     FROM public.map_question_bank_items
                    WHERE custom_question_id IS NOT NULL)
UNION ALL
SELECT 'passage'::text AS kind, p.id, p.family_id, p.subject, p.grade,
       p.status, p.created_at
FROM public.map_custom_passages p
WHERE p.soft_deleted_at IS NULL
  AND p.id NOT IN (SELECT custom_passage_id
                     FROM public.map_question_bank_items
                    WHERE custom_passage_id IS NOT NULL);

COMMIT;
```

- [ ] **Step 2: Apply migration to the dev project**

Use the supabase MCP `apply_migration` tool with name `map_bank_first_authoring` and the SQL body from step 1. This is the canonical path on this repo (see CLAUDE.md §6 "Useful queries").

- [ ] **Step 3: Smoke-check the views and one RPC**

```sql
SELECT to_regview('public.map_v_custom_bank_overview') IS NOT NULL AS overview_ok,
       to_regview('public.map_v_custom_legacy_items')  IS NOT NULL AS legacy_ok,
       to_regprocedure('public.map_create_or_find_custom_bank(text,text,integer)') IS NOT NULL AS rpc_create_or_find_ok,
       to_regprocedure('public.map_add_items_to_bank(uuid,uuid[],uuid[])') IS NOT NULL AS rpc_add_items_ok,
       to_regprocedure('public.map_rename_bank(uuid,text)') IS NOT NULL AS rpc_rename_ok;
```

Expected: all five booleans `true`.

- [ ] **Step 4: Commit**

```bash
git add migrations/20260521_map_bank_first_authoring.sql
git commit -m "feat(migration): map_bank_first_authoring — passages-in-banks + create-or-find + add-items + rename + overview views"
```

---

### Task 2: Data-guard script for the migration

**Files:**
- Create: `scripts/test-bank-first-data.mjs`

- [ ] **Step 1: Write the data guard**

```javascript
// scripts/test-bank-first-data.mjs
// Bank-first authoring data guard. Verifies:
//   * map_create_or_find_custom_bank reuse vs suffix paths
//   * map_add_items_to_bank ownership, cap (60), subject/grade match
//   * map_rename_bank collision check
//   * map_v_custom_bank_overview counts
//   * cross-family RLS isolation (family A can't see family B's bank)
// Run: node --env-file=.env.local scripts/test-bank-first-data.mjs
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

const tag = `bankfirst_${Date.now()}`
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

async function makeCustomQuestion(client, subject, grade) {
  const { data, error } = await client.rpc('map_create_custom_question', {
    p_source: 'parent_manual',
    p_created_via: 'ui',
    p_subject: subject,
    p_grade: grade,
    p_stem: `Test stem ${tag} ${Math.random()}`,
    p_standard_code: null,
    p_difficulty: null,
    p_ai_metadata: null,
    p_choices: [
      { label: 'A', text: 'a', is_correct: true,  ordinal: 0, explanation_correct: null, explanation_wrong: null, misconception_tag: null },
      { label: 'B', text: 'b', is_correct: false, ordinal: 1, explanation_correct: null, explanation_wrong: null, misconception_tag: null },
      { label: 'C', text: 'c', is_correct: false, ordinal: 2, explanation_correct: null, explanation_wrong: null, misconception_tag: null },
      { label: 'D', text: 'd', is_correct: false, ordinal: 3, explanation_correct: null, explanation_wrong: null, misconception_tag: null },
    ],
    p_passage_version_id: null,
    p_question_focus: null,
    p_stem_svg: null,
    p_stem_svg_alt_text: null,
  })
  if (error) throw error
  return data
}

async function cleanup() {
  for (const id of made.families) await admin.from('map_families').delete().eq('id', id)
  for (const id of made.users)    await admin.auth.admin.deleteUser(id)
}

try {
  const A = await makeFamily('A')
  const B = await makeFamily('B')

  // 1. Reuse path: same (name, subject, grade) returns the same bank.
  const { data: r1, error: e1 } = await A.client.rpc('map_create_or_find_custom_bank',
    { p_name: 'Fractions on a number line — Math G3', p_subject: 'math', p_grade: 3 })
  if (e1) throw e1
  assert(r1[0].was_created === true, 'A first call created bank')
  const bankId = r1[0].bank_id

  const { data: r2 } = await A.client.rpc('map_create_or_find_custom_bank',
    { p_name: 'Fractions on a number line — Math G3', p_subject: 'math', p_grade: 3 })
  assert(r2[0].bank_id === bankId && r2[0].was_created === false, 'A second call reused bank')

  // 2. Suffix path: same name but different subject → '(2)'.
  const { data: r3 } = await A.client.rpc('map_create_or_find_custom_bank',
    { p_name: 'Fractions on a number line — Math G3', p_subject: 'reading', p_grade: 3 })
  assert(r3[0].resolved_name === 'Fractions on a number line — Math G3 (2)' && r3[0].was_created === true,
    'A same name + different subject → suffix (2)')

  // 3. Cross-family isolation: B cannot see A's bank.
  const { data: bList, error: bErr } = await B.client.from('map_v_custom_bank_overview')
    .select('id').eq('id', bankId)
  if (bErr) throw bErr
  assert((bList ?? []).length === 0, 'B cannot see A bank via overview view')

  // 4. add_items_to_bank: ownership + subject/grade match.
  const qA = await makeCustomQuestion(A.client, 'math', 3)
  const { error: addErr } = await A.client.rpc('map_add_items_to_bank',
    { p_bank_id: bankId, p_question_ids: [qA], p_passage_ids: [] })
  if (addErr) throw addErr
  assert(true, 'A added own math/G3 question to math/G3 bank')

  const qWrongGrade = await makeCustomQuestion(A.client, 'math', 2)
  const { error: gradeErr } = await A.client.rpc('map_add_items_to_bank',
    { p_bank_id: bankId, p_question_ids: [qWrongGrade], p_passage_ids: [] })
  assert(gradeErr !== null, 'add_items rejects mismatched grade')

  const qB = await makeCustomQuestion(B.client, 'math', 3)
  const { error: crossErr } = await A.client.rpc('map_add_items_to_bank',
    { p_bank_id: bankId, p_question_ids: [qB], p_passage_ids: [] })
  assert(crossErr !== null, 'A cannot add B-owned question to A bank')

  // 5. Rename collision: create a sibling bank then try to rename onto it.
  const { data: sib } = await A.client.rpc('map_create_or_find_custom_bank',
    { p_name: 'Sibling — Math G3', p_subject: 'math', p_grade: 3 })
  const { error: renameErr } = await A.client.rpc('map_rename_bank',
    { p_bank_id: sib[0].bank_id, p_name: 'Fractions on a number line — Math G3' })
  assert(renameErr !== null, 'rename refuses collision with sibling bank')
  const { error: renameOk } = await A.client.rpc('map_rename_bank',
    { p_bank_id: sib[0].bank_id, p_name: 'Sibling renamed — Math G3' })
  assert(renameOk === null, 'rename accepts non-colliding name')

  // 6. Overview counts: A's primary bank should have question_count = 1, ready_question_count = 0 (draft).
  const { data: ov } = await A.client.from('map_v_custom_bank_overview')
    .select('question_count, ready_question_count, draft_question_count')
    .eq('id', bankId).single()
  assert(ov.question_count === 1 && ov.draft_question_count === 1 && ov.ready_question_count === 0,
    `overview counts: q=${ov.question_count} draft=${ov.draft_question_count} ready=${ov.ready_question_count}`)

  console.log('\n✅ ALL BANK-FIRST DATA GUARDS PASSED')
} catch (e) {
  console.error(e)
  process.exitCode = 1
} finally {
  await cleanup()
}
```

- [ ] **Step 2: Run the data guard against the dev project**

```bash
node --env-file=.env.local scripts/test-bank-first-data.mjs
```

Expected output: every `PASS:` line, followed by `✅ ALL BANK-FIRST DATA GUARDS PASSED`. If any assertion fails, the script exits non-zero and skips cleanup; fix the migration before continuing.

- [ ] **Step 3: Commit**

```bash
git add scripts/test-bank-first-data.mjs
git commit -m "test(banks): data guard for bank-first authoring RPCs and views"
```

---

### Task 3: Client-side lib wrappers

**Files:**
- Modify: `src/lib/banks/mutations.ts`

- [ ] **Step 1: Add the three new wrappers and rewire `createManualBankQuestion`**

Append below the existing exports (do not remove anything):

```typescript
export async function createOrFindCustomBank(args: {
  name: string
  subject: Subject
  grade: number
}): Promise<{ bankId: string; resolvedName: string; wasCreated: boolean }> {
  const { data, error } = await supabase.rpc('map_create_or_find_custom_bank', {
    p_name: args.name,
    p_subject: args.subject,
    p_grade: args.grade,
  })
  if (error) throw error
  const row = (data ?? [])[0]
  if (!row) throw new Error('create_or_find returned no row')
  return { bankId: row.bank_id, resolvedName: row.resolved_name, wasCreated: row.was_created }
}

export async function addItemsToBank(args: {
  bankId: string
  questionIds: string[]
  passageIds: string[]
}): Promise<void> {
  const { error } = await supabase.rpc('map_add_items_to_bank', {
    p_bank_id: args.bankId,
    p_question_ids: args.questionIds,
    p_passage_ids: args.passageIds,
  })
  if (error) throw error
}

export async function renameBank(args: { bankId: string; name: string }): Promise<void> {
  const { error } = await supabase.rpc('map_rename_bank', {
    p_bank_id: args.bankId,
    p_name: args.name,
  })
  if (error) throw error
}
```

Rewire `createManualBankQuestion`'s last line so two concurrent authors don't clobber each other:

```typescript
// OLD: await setBankItems(args.bankId, [...args.currentItemIds, newId])
// NEW:
await addItemsToBank({ bankId: args.bankId, questionIds: [newId], passageIds: [] })
```

Delete the now-unused `currentItemIds` parameter from the function signature; update the single caller (search the repo to find it and remove the prop).

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors. If the `currentItemIds` removal broke a caller, fix it inline.

- [ ] **Step 3: Commit**

```bash
git add src/lib/banks/mutations.ts src/**/*.tsx
git commit -m "feat(banks): client wrappers for create-or-find, add-items, rename"
```

---

### Task 4: MCP helpers + error codes

**Files:**
- Modify: `api/_lib/custom/db.ts`
- Modify: `api/_lib/mcp/errors.ts`

- [ ] **Step 1: Add error codes**

In `api/_lib/mcp/errors.ts`, extend the `ErrorCode` string union with four new codes (keep alphabetical):

```typescript
// Existing union + add:
| 'bank_capacity_exceeded'
| 'bank_not_custom_lane'
| 'bank_target_mismatch'
| 'mixed_subjects_in_call'
```

- [ ] **Step 2: Add three helpers to `api/_lib/custom/db.ts`**

Append (do not remove anything):

```typescript
import { McpError } from '../mcp/errors.js';

/** Resolve a bank_id, asserting it belongs to the family, is custom-lane,
 *  not soft-deleted, and matches the call's subject + grade. */
export async function resolveBankById(
  ctx: McpContext,
  bankId: string,
  subject: 'math' | 'reading' | 'language',
  grade: number,
): Promise<{ id: string; name: string }> {
  const { data, error } = await ctx.supabase
    .from('map_question_banks')
    .select('id, name, lane, subject, grade, soft_deleted_at')
    .eq('id', bankId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.soft_deleted_at)
    throw new McpError('bank_target_mismatch', `bank ${bankId} not found in your family`);
  if (data.lane !== 'custom')
    throw new McpError('bank_not_custom_lane', `bank ${bankId} is a vetted recipe; AI authoring only targets custom banks`);
  if (data.subject !== subject || data.grade !== grade)
    throw new McpError(
      'bank_target_mismatch',
      `bank ${bankId} is ${data.subject} G${data.grade}; this call is ${subject} G${grade}`,
    );
  return { id: data.id, name: data.name };
}

/** Create-or-find a custom bank by (name, subject, grade) within the family.
 *  Returns the resolved (possibly suffixed) name. */
export async function resolveCreateOrFindBank(
  ctx: McpContext,
  name: string,
  subject: 'math' | 'reading' | 'language',
  grade: number,
): Promise<{ id: string; name: string; wasCreated: boolean }> {
  const { data, error } = await ctx.supabase.rpc('map_create_or_find_custom_bank', {
    p_name: name,
    p_subject: subject,
    p_grade: grade,
  });
  if (error) throw error;
  const row = (data ?? [])[0];
  if (!row) throw new McpError('bank_target_mismatch', 'create-or-find returned no row');
  return { id: row.bank_id, name: row.resolved_name, wasCreated: row.was_created };
}

/** Append items to a custom bank. Maps DB cap errors to bank_capacity_exceeded. */
export async function addItemsToBank(
  ctx: McpContext,
  bankId: string,
  questionIds: string[],
  passageIds: string[],
): Promise<void> {
  const { error } = await ctx.supabase.rpc('map_add_items_to_bank', {
    p_bank_id: bankId,
    p_question_ids: questionIds,
    p_passage_ids: passageIds,
  });
  if (error) {
    if (/at most 60 items/.test(error.message)) {
      throw new McpError('bank_capacity_exceeded', error.message);
    }
    throw error;
  }
}

/** Count items currently in a bank (used to short-circuit cap errors before insert). */
export async function getBankItemCount(ctx: McpContext, bankId: string): Promise<number> {
  const { count, error } = await ctx.supabase
    .from('map_question_bank_items')
    .select('id', { count: 'exact', head: true })
    .eq('bank_id', bankId);
  if (error) throw error;
  return count ?? 0;
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add api/_lib/custom/db.ts api/_lib/mcp/errors.ts
git commit -m "feat(mcp): bank-resolution helpers and four new error codes"
```

---

### Task 5: MCP schemas + tool description blurb

**Files:**
- Modify: `api/_lib/mcp/schemas.ts`
- Modify: `api/_lib/svg/capability-blurb.ts`

- [ ] **Step 1: Extend the two input schemas with `bank_id` / `bank_name`**

In `api/_lib/mcp/schemas.ts`, replace the two existing definitions (lines around 165–180) with:

```typescript
const bankTargetRefine = (b: { bank_id?: string; bank_name?: string }) =>
  (Boolean(b.bank_id) !== Boolean(b.bank_name));
const bankTargetMsg = 'Provide exactly one of bank_id or bank_name';

// 5.5 create_custom_questions
export const CreateCustomQuestionsInput = z.object({
  bank_id:   z.string().uuid().optional(),
  bank_name: z.string().min(1).max(120).optional(),
  questions: z.array(QuestionInputSchema).min(1).max(25),
}).strict().refine(bankTargetRefine, { message: bankTargetMsg });
export type CreateCustomQuestionsInput = z.infer<typeof CreateCustomQuestionsInput>;

// 5.6 create_custom_passage_and_questions
export const CreateCustomPassageAndQuestionsInput = z.object({
  bank_id:   z.string().uuid().optional(),
  bank_name: z.string().min(1).max(120).optional(),
  passage:   PassageInputSchema,
  questions: z.array(
    QuestionInputSchema.omit({ passage_id: true, passage_version_id: true }).extend({
      subject: PassageSubjectEnum,
    }),
  ).min(1).max(8),
}).strict().refine(bankTargetRefine, { message: bankTargetMsg });
export type CreateCustomPassageAndQuestionsInput = z.infer<typeof CreateCustomPassageAndQuestionsInput>;
```

- [ ] **Step 2: Append the naming-convention paragraph to `capability-blurb.ts`**

Add a new export below `SVG_TOOL_HINTS`:

```typescript
export const BANK_NAMING_GUIDANCE = [
  'Every item created by this tool must belong to a custom Bank.',
  'Pass exactly one of bank_id (to reuse a bank from a previous tool result in this conversation) or bank_name (to create-or-find a bank by name in the family).',
  'When creating a new Bank, name it "{Topic} — {Subject} G{Grade}".',
  'Examples: "Fractions on a number line — Math G3", "Main idea — Reading G3", "Commas in compound sentences — Language G3".',
  'Use the topic phrasing the parent used in plain English; capitalize like a title; do not include the kid\'s name (banks are kid-agnostic and assignable to anyone).',
  'If the parent asks to add more to the same set, reuse the bank.id from the previous tool result, not bank_name (this avoids name-typo collisions).',
  'The tool may return a slightly different bank.name than you requested — if a same-name bank already existed in a different subject or grade, the server appends "(2)", "(3)", … and returns the resolved name.',
].join(' ');
```

Then update `composeWriteToolDescription` to fold it in:

```typescript
export function composeWriteToolDescription(
  baseDescription: string,
  toolKey: keyof typeof SVG_TOOL_HINTS,
): string {
  // Only the two creation tools take bank targets; update/publish/others don't.
  const includesBank = toolKey === 'create_custom_questions' || toolKey === 'create_custom_passage_and_questions';
  const parts = [baseDescription, SVG_CAPABILITY_BLURB, SVG_TOOL_HINTS[toolKey]];
  if (includesBank) parts.push(BANK_NAMING_GUIDANCE);
  return parts.join('\n\n');
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add api/_lib/mcp/schemas.ts api/_lib/svg/capability-blurb.ts
git commit -m "feat(mcp): bank_id/bank_name schema fields + naming-convention guidance in tool descriptions"
```

---

### Task 6: Rewrite `create_custom_questions` to attach to a bank

**Files:**
- Modify: `api/_lib/mcp/tools/create-custom-questions.ts`

- [ ] **Step 1: Replace the tool body**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { logToolCall } from '../audit.js';
import { CreateCustomQuestionsInput } from '../schemas.js';
import { McpError } from '../errors.js';
import { composeWriteToolDescription } from '../../svg/capability-blurb.js';
import {
  resolveCurrentPassageVersionInFamily,
  getCustomPassageVersionInFamily,
  enforceWriteQuota,
  refundWriteQuota,
  resolveBankById,
  resolveCreateOrFindBank,
  addItemsToBank,
  getBankItemCount,
} from '../../custom/db.js';
import { createQuestionInFamily } from '../../custom/writes.js';

export const CREATE_CUSTOM_QUESTIONS_DESCRIPTION = composeWriteToolDescription(
  'Create one or more standalone custom questions in a single call. For passage-based questions use create_custom_passage_and_questions instead — that tool creates the passage and its questions atomically. All questions land in status="draft". Maximum 25 per call, 250 per family per day. To attach to an existing passage pass passage_id; the question will link to that passage\'s current version.',
  'create_custom_questions',
);

export function register(server: McpServer, ctx: McpContext): void {
  server.tool(
    'create_custom_questions',
    CREATE_CUSTOM_QUESTIONS_DESCRIPTION,
    CreateCustomQuestionsInput.shape,
    async (rawArgs) => {
      const args = CreateCustomQuestionsInput.parse(rawArgs ?? {});
      try {
        // 1. Single-subject + single-grade rule.
        const subject = args.questions[0].subject;
        const grade = args.questions[0].grade;
        if (args.questions.some(q => q.subject !== subject || q.grade !== grade)) {
          throw new McpError('mixed_subjects_in_call',
            'all questions in one call must share the same subject and grade');
        }

        // 2. Bank resolution.
        let bank: { id: string; name: string; wasCreated: boolean };
        if (args.bank_id) {
          const b = await resolveBankById(ctx, args.bank_id, subject as 'math'|'reading'|'language', grade);
          bank = { id: b.id, name: b.name, wasCreated: false };
        } else {
          const b = await resolveCreateOrFindBank(ctx, args.bank_name!, subject as 'math'|'reading'|'language', grade);
          bank = { id: b.id, name: b.name, wasCreated: b.wasCreated };
        }

        // 3. Capacity pre-check.
        const existing = await getBankItemCount(ctx, bank.id);
        if (existing + args.questions.length > 60) {
          throw new McpError('bank_capacity_exceeded',
            `bank already holds ${existing} items; adding ${args.questions.length} would exceed the 60-item cap`);
        }

        // 4. Reserve quota up front.
        enforceWriteQuota(ctx, 'question_create', args.questions.length);
        const created: Array<{ question_id: string; status: 'draft'; passage_version_id: string | null }> = [];
        const warnings: Array<{ index: number; message: string }> = [];

        try {
          for (let i = 0; i < args.questions.length; i++) {
            const q = args.questions[i];

            let pvId: string | null = q.passage_version_id ?? null;
            if (q.passage_id && !pvId) {
              const pv = await resolveCurrentPassageVersionInFamily(ctx, q.passage_id);
              pvId = pv.id;
            } else if (pvId) {
              await getCustomPassageVersionInFamily(ctx, pvId);
            }

            if (q.subject === 'math' && pvId) {
              throw new McpError('invalid_question_shape',
                `questions[${i}]: math questions cannot reference a passage`);
            }
            if (q.subject === 'reading' && !pvId) {
              warnings.push({ index: i, message: 'reading question has no passage; attach one before publishing' });
            }

            const result = await createQuestionInFamily(
              ctx,
              {
                subject: q.subject,
                grade: q.grade,
                stem: q.stem,
                stem_svg: q.stem_svg ?? null,
                stem_svg_alt_text: q.stem_svg_alt_text ?? null,
                standard_code: q.standard_code ?? null,
                difficulty: q.difficulty ?? null,
                question_focus: q.question_focus ?? null,
                passage_version_id: pvId,
                ai_metadata: q.ai_metadata ?? null,
                choices: q.choices,
              },
              'parent_ai_generated',
              'mcp',
            );
            created.push({ question_id: result.question_id, status: 'draft', passage_version_id: pvId });
          }

          // 5. Attach all new questions to the bank in one call.
          if (created.length > 0) {
            await addItemsToBank(ctx, bank.id, created.map(c => c.question_id), []);
          }
        } catch (err) {
          refundWriteQuota(ctx, 'question_create', args.questions.length - created.length);
          // Roll back item rows that did get created.
          for (const c of created) {
            await ctx.supabase.from('map_custom_questions').delete().eq('id', c.question_id);
          }
          throw err;
        }

        await logToolCall({
          ctx, toolName: 'create_custom_questions', toolArgs: args, status: 'ok', mode: 'write',
        });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              bank: { id: bank.id, name: bank.name, was_created: bank.wasCreated, item_count: existing + created.length },
              created,
              warnings: warnings.length ? warnings : undefined,
            }),
          }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await logToolCall({
          ctx, toolName: 'create_custom_questions', toolArgs: args, status: 'error', errorMessage: msg, mode: 'write',
        });
        throw err;
      }
    },
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add api/_lib/mcp/tools/create-custom-questions.ts
git commit -m "feat(mcp): create_custom_questions attaches to a bank (bank_id or bank_name)"
```

---

### Task 7: Rewrite `create_custom_passage_and_questions` to attach to a bank

**Files:**
- Modify: `api/_lib/mcp/tools/create-custom-passage-and-questions.ts`

- [ ] **Step 1: Replace the tool body**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { logToolCall } from '../audit.js';
import { CreateCustomPassageAndQuestionsInput } from '../schemas.js';
import { McpError } from '../errors.js';
import { composeWriteToolDescription } from '../../svg/capability-blurb.js';
import {
  enforceWriteQuota,
  refundWriteQuota,
  resolveBankById,
  resolveCreateOrFindBank,
  addItemsToBank,
  getBankItemCount,
} from '../../custom/db.js';
import { createPassageInFamily, createQuestionInFamily } from '../../custom/writes.js';

export const CREATE_CUSTOM_PASSAGE_AND_QUESTIONS_DESCRIPTION = composeWriteToolDescription(
  'Create a passage AND its questions in one atomic call. The natural unit for reading and passage-based language: a passage with 3-8 questions about it. Passage and all questions land in status="draft" together. 1 passage and up to 8 questions per call. Counts against both the passage and question daily quotas.',
  'create_custom_passage_and_questions',
);

export function register(server: McpServer, ctx: McpContext): void {
  server.tool(
    'create_custom_passage_and_questions',
    CREATE_CUSTOM_PASSAGE_AND_QUESTIONS_DESCRIPTION,
    CreateCustomPassageAndQuestionsInput.shape,
    async (rawArgs) => {
      const args = CreateCustomPassageAndQuestionsInput.parse(rawArgs ?? {});
      try {
        // 1. Subject/grade come from the passage. All questions must match.
        const subject = args.passage.subject;
        const grade   = args.passage.grade;
        if (args.questions.some(q => q.subject !== subject || q.grade !== grade)) {
          throw new McpError('mixed_subjects_in_call',
            'all questions must share the passage\'s subject and grade');
        }

        // 2. Bank resolution.
        let bank: { id: string; name: string; wasCreated: boolean };
        if (args.bank_id) {
          const b = await resolveBankById(ctx, args.bank_id, subject as 'reading'|'language', grade);
          bank = { id: b.id, name: b.name, wasCreated: false };
        } else {
          const b = await resolveCreateOrFindBank(ctx, args.bank_name!, subject as 'reading'|'language', grade);
          bank = { id: b.id, name: b.name, wasCreated: b.wasCreated };
        }

        // 3. Capacity pre-check (passage + questions = 1 + N rows in the bank).
        const existing = await getBankItemCount(ctx, bank.id);
        const toAdd = 1 + args.questions.length;
        if (existing + toAdd > 60) {
          throw new McpError('bank_capacity_exceeded',
            `bank already holds ${existing} items; adding ${toAdd} would exceed the 60-item cap`);
        }

        // 4. Reserve both quotas.
        enforceWriteQuota(ctx, 'passage_create', 1);
        enforceWriteQuota(ctx, 'question_create', args.questions.length);

        let createdPassage: { passage_id: string; passage_version_id: string } | null = null;
        const createdQuestions: Array<{ question_id: string; status: 'draft' }> = [];

        try {
          createdPassage = await createPassageInFamily(
            ctx,
            {
              subject: args.passage.subject,
              grade: args.passage.grade,
              title: args.passage.title ?? null,
              body: args.passage.body,
              genre: args.passage.genre ?? null,
              estimated_grade_level: args.passage.estimated_grade_level ?? null,
              standard_codes: args.passage.standard_codes ?? [],
              passage_svg: args.passage.passage_svg ?? null,
              passage_svg_alt_text: args.passage.passage_svg_alt_text ?? null,
              ai_metadata: args.passage.ai_metadata ?? null,
            },
            'parent_ai_generated',
            'mcp',
          );

          for (const q of args.questions) {
            const result = await createQuestionInFamily(
              ctx,
              {
                subject: q.subject,
                grade: q.grade,
                stem: q.stem,
                stem_svg: q.stem_svg ?? null,
                stem_svg_alt_text: q.stem_svg_alt_text ?? null,
                standard_code: q.standard_code ?? null,
                difficulty: q.difficulty ?? null,
                question_focus: q.question_focus ?? null,
                passage_version_id: createdPassage.passage_version_id,
                ai_metadata: q.ai_metadata ?? null,
                choices: q.choices,
              },
              'parent_ai_generated',
              'mcp',
            );
            createdQuestions.push({ question_id: result.question_id, status: 'draft' });
          }

          // 5. Attach passage + questions to bank.
          await addItemsToBank(
            ctx,
            bank.id,
            createdQuestions.map(q => q.question_id),
            [createdPassage.passage_id],
          );
        } catch (err) {
          if (createdPassage) {
            await ctx.supabase.from('map_custom_passages').delete().eq('id', createdPassage.passage_id);
          }
          for (const q of createdQuestions) {
            await ctx.supabase.from('map_custom_questions').delete().eq('id', q.question_id);
          }
          refundWriteQuota(ctx, 'passage_create', createdPassage ? 0 : 1);
          refundWriteQuota(ctx, 'question_create', args.questions.length - createdQuestions.length);
          throw err;
        }

        await logToolCall({
          ctx, toolName: 'create_custom_passage_and_questions', toolArgs: args, status: 'ok', mode: 'write',
        });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              bank: { id: bank.id, name: bank.name, was_created: bank.wasCreated, item_count: existing + toAdd },
              passage: { passage_id: createdPassage!.passage_id, passage_version_id: createdPassage!.passage_version_id, status: 'draft' },
              questions: createdQuestions,
            }),
          }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await logToolCall({
          ctx, toolName: 'create_custom_passage_and_questions', toolArgs: args, status: 'error', errorMessage: msg, mode: 'write',
        });
        throw err;
      }
    },
  );
}
```

- [ ] **Step 2: Typecheck + build**

```bash
npm run typecheck && npm run build
```

Expected: both green.

- [ ] **Step 3: Re-run the MCP read-only audit (no new write tools were added)**

```bash
node --env-file=.env.local scripts/audit-mcp-readonly.mjs
```

Expected: existing audit summary; the write tools we modified were already flagged as write tools so the counts shouldn't change.

- [ ] **Step 4: Commit**

```bash
git add api/_lib/mcp/tools/create-custom-passage-and-questions.ts
git commit -m "feat(mcp): create_custom_passage_and_questions attaches passage + questions to a bank"
```

---

### Task 8: MCP integration test script

**Files:**
- Create: `scripts/test-mcp-bank-first.mjs`

- [ ] **Step 1: Write the integration test**

```javascript
// scripts/test-mcp-bank-first.mjs
// MCP integration test for bank-first authoring.
// Verifies:
//   * bank_name creates a new bank, returns bank.id
//   * second call with same bank_id reuses it (item_count grows)
//   * second call with same bank_name reuses the same bank
//   * mixed subjects in one call → mixed_subjects_in_call error
//   * unknown bank_id → bank_target_mismatch
// Run: node --env-file=.env.local scripts/test-mcp-bank-first.mjs
// Required env: MCP_BASE_URL, MCP_TOKEN, optional MCP_BYPASS

const BASE = process.env.MCP_BASE_URL;
const TOKEN = process.env.MCP_TOKEN;
const BYPASS = process.env.MCP_BYPASS;
if (!BASE || !TOKEN) { console.error('Missing env: MCP_BASE_URL, MCP_TOKEN'); process.exit(2); }

let nextId = 0;
async function call(name, args) {
  const id = ++nextId;
  const res = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, json };
}
function payload(r) {
  const t = r.json?.result?.content?.[0]?.text ?? '';
  try { return JSON.parse(t); } catch { return null; }
}
function assert(c, l) { if (!c) { console.error('FAIL:', l); process.exit(1); } console.log('PASS:', l); }

const bankName = `Mcp test ${Date.now()} — Math G3`;

function buildQ(stem) {
  return {
    subject: 'math', grade: 3, stem,
    standard_code: null, difficulty: null, question_focus: null,
    stem_svg: null, stem_svg_alt_text: null, ai_metadata: null,
    choices: [
      { label:'A', text:'a', is_correct:true,  ordinal:0, misconception_tag:null },
      { label:'B', text:'b', is_correct:false, ordinal:1, misconception_tag:null },
      { label:'C', text:'c', is_correct:false, ordinal:2, misconception_tag:null },
      { label:'D', text:'d', is_correct:false, ordinal:3, misconception_tag:null },
    ],
  };
}

// 1. bank_name path: creates the bank.
let r = await call('create_custom_questions', { bank_name: bankName, questions: [buildQ('Q1')] });
assert(r.status === 200, 'first call HTTP 200');
let p = payload(r);
assert(p?.bank?.was_created === true && p.bank?.name === bankName, 'first call created bank');
const bankId = p.bank.id;

// 2. bank_id path: reuses the bank.
r = await call('create_custom_questions', { bank_id: bankId, questions: [buildQ('Q2'), buildQ('Q3')] });
assert(r.status === 200, 'bank_id call HTTP 200');
p = payload(r);
assert(p?.bank?.id === bankId && p.bank.was_created === false, 'bank_id call reused bank');
assert(p.bank.item_count === 3, `item_count = ${p.bank.item_count} (expect 3)`);

// 3. bank_name reuse: same exact name reuses too.
r = await call('create_custom_questions', { bank_name: bankName, questions: [buildQ('Q4')] });
p = payload(r);
assert(p?.bank?.id === bankId && p.bank.was_created === false, 'bank_name reuse hit same bank');
assert(p.bank.item_count === 4, `item_count = ${p.bank.item_count} (expect 4)`);

// 4. Mixed subjects in one call → mixed_subjects_in_call.
const qReading = { ...buildQ('Q-mix'), subject: 'reading' };
r = await call('create_custom_questions', { bank_name: bankName, questions: [buildQ('Q5'), qReading] });
const errText = JSON.stringify(r.json);
assert(/mixed_subjects_in_call|all questions/i.test(errText), `mixed subjects rejected: ${errText.slice(0, 200)}`);

// 5. Unknown bank_id → bank_target_mismatch.
r = await call('create_custom_questions', {
  bank_id: '00000000-0000-0000-0000-000000000000',
  questions: [buildQ('Q6')],
});
const err2 = JSON.stringify(r.json);
assert(/bank_target_mismatch|not found/i.test(err2), `unknown bank_id rejected: ${err2.slice(0, 200)}`);

console.log('\n✅ MCP bank-first integration test passed');
```

- [ ] **Step 2: Run against the deployed preview**

```bash
# After deploying the branch to a preview URL via `vercel deploy` (or against localhost):
MCP_BASE_URL=https://<preview-host> \
  MCP_TOKEN=<a bearer token for a dev family> \
  node --env-file=.env.local scripts/test-mcp-bank-first.mjs
```

Expected: every `PASS:` line, ending with `✅ MCP bank-first integration test passed`.

- [ ] **Step 3: Commit**

```bash
git add scripts/test-mcp-bank-first.mjs
git commit -m "test(mcp): bank-first integration test (create, reuse, mixed-subjects, unknown bank)"
```

---

### Task 9: `BankPicker` shared component

**Files:**
- Create: `src/components/parent/BankPicker.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// src/components/parent/BankPicker.tsx
// Required Bank selector for manual authoring. Lists family custom banks
// filtered by the form's current subject + grade; offers a "Create new bank…"
// inline dialog that captures only the name (subject/grade are inherited).
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { createOrFindCustomBank } from '../../lib/banks/mutations'
import type { Subject } from '../../lib/types'

interface BankRow { id: string; name: string; subject: Subject; grade: number }

export function BankPicker(props: {
  subject: Subject
  grade: number
  value: string | null
  onChange: (bankId: string | null) => void
  /** When the picker is mounted from a bank-scoped URL (?bank=<uuid>), lock to that bank. */
  locked?: boolean
  /** Optional callback when the user clicks "Change bank" while locked. */
  onUnlock?: () => void
}) {
  const { subject, grade, value, onChange, locked, onUnlock } = props
  const [banks, setBanks] = useState<BankRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    supabase.from('map_v_custom_bank_overview')
      .select('id, name, subject, grade')
      .eq('subject', subject)
      .eq('grade', grade)
      .order('updated_at', { ascending: false })
      .then(({ data, error }) => {
        if (!alive) return
        if (error) setError(error.message)
        else setBanks((data ?? []) as BankRow[])
        setLoading(false)
      })
    return () => { alive = false }
  }, [subject, grade])

  const selectedName = useMemo(() => banks.find(b => b.id === value)?.name ?? '', [banks, value])

  async function handleCreate() {
    setError(null)
    setCreating(true)
    try {
      const r = await createOrFindCustomBank({ name: newName.trim(), subject, grade })
      setBanks(prev => [{ id: r.bankId, name: r.resolvedName, subject, grade }, ...prev])
      onChange(r.bankId)
      setShowCreate(false)
      setNewName('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create bank')
    } finally {
      setCreating(false)
    }
  }

  if (locked) {
    return (
      <div className="flex items-center gap-2">
        <div className="px-3 py-2 rounded bg-zinc-100 dark:bg-zinc-800 text-sm">
          Bank: <strong>{selectedName || '…'}</strong>
        </div>
        <button type="button" className="btn-ghost text-xs" onClick={onUnlock}>Change bank</button>
      </div>
    )
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-1">Bank <span className="text-red-500">*</span></label>
      <select
        value={value ?? ''}
        onChange={(e) => {
          if (e.target.value === '__create__') setShowCreate(true)
          else onChange(e.target.value || null)
        }}
        className="w-full border rounded px-2 py-2 bg-white dark:bg-zinc-900"
        disabled={loading}
      >
        <option value="">{loading ? 'Loading…' : `Pick a ${subject} G${grade} bank…`}</option>
        {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        <option value="__create__">+ Create new bank…</option>
      </select>
      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
      {showCreate && (
        <div className="mt-2 p-3 rounded border bg-zinc-50 dark:bg-zinc-900">
          <p className="text-xs text-zinc-500 mb-2">
            New {subject} G{grade} bank. Suggested naming: <code>{'{Topic} — '}{subject[0].toUpperCase() + subject.slice(1)} G{grade}</code>
          </p>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={`e.g. Fractions on a number line — ${subject[0].toUpperCase() + subject.slice(1)} G${grade}`}
            maxLength={120}
            className="w-full border rounded px-2 py-2 bg-white dark:bg-zinc-900"
          />
          <div className="mt-2 flex gap-2 justify-end">
            <button type="button" className="btn-ghost text-sm" onClick={() => setShowCreate(false)}>Cancel</button>
            <button
              type="button" className="btn-primary text-sm"
              disabled={creating || newName.trim().length < 1}
              onClick={handleCreate}
            >
              {creating ? 'Creating…' : 'Create bank'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/parent/BankPicker.tsx
git commit -m "feat(parent): BankPicker component for manual authoring (combobox + inline create)"
```

---

### Task 10: `NewCustomQuestion` — Bank field required

**Files:**
- Modify: `src/pages/parent/NewCustomQuestion.tsx`

- [ ] **Step 1: Add the Bank field and route through `addItemsToBank`**

Read the file first to find the form's current `subject`, `grade`, save handler, and submit-button location. Then:

1. Import `BankPicker` and `addItemsToBank`:
   ```tsx
   import { BankPicker } from '../../components/parent/BankPicker'
   import { addItemsToBank } from '../../lib/banks/mutations'
   ```

2. Read `?bank=` and `?legacy=` from the location query string into `searchBankId` and `lockToBank`. If a `bank` query param is present, fetch that bank's `subject` + `grade` once on mount and lock the form's selectors to those values; otherwise leave the existing subject/grade pickers free.

3. Add `bankId` state initialized from `searchBankId`. Render `BankPicker` directly under the page title, before the subject/grade selectors:
   ```tsx
   <BankPicker
     subject={subject}
     grade={grade}
     value={bankId}
     onChange={setBankId}
     locked={lockToBank}
     onUnlock={() => { setLockToBank(false); setBankId(null) }}
   />
   ```

4. When the form's subject or grade changes and we're not locked, clear `bankId` (the dropdown re-filters; the previously-picked bank may no longer match):
   ```tsx
   useEffect(() => { if (!lockToBank) setBankId(null) }, [subject, grade, lockToBank])
   ```

5. Disable the submit button when `bankId === null`. Add helper text near the button: `Pick a bank above before saving.`

6. After the existing `map_create_custom_question` call succeeds, append:
   ```tsx
   await addItemsToBank({ bankId: bankId!, questionIds: [newQuestionId], passageIds: [] })
   ```
   …and then navigate to `/parent/ai-studio?bank=${bankId}` instead of `/parent/custom-bank`.

7. The four `Link to="/parent/custom-bank"` (Cancel, etc.) become `Link to="/parent/ai-studio"` when not locked, or `Link to={\`/parent/ai-studio?bank=${searchBankId}\`}` when locked.

- [ ] **Step 2: Typecheck + build**

```bash
npm run typecheck && npm run build
```

Expected: both green.

- [ ] **Step 3: Manual smoke**

Run dev server, open `/parent/ai-studio` → click "+ New question" (the link still goes to `/parent/custom-bank/new-question` — that route stays for the page itself; we just changed where Cancel/Submit go). Verify the Bank dropdown lists existing math/G3 banks, that creating a new one inline works, and that saving lands the new question in the bank's review screen.

- [ ] **Step 4: Commit**

```bash
git add src/pages/parent/NewCustomQuestion.tsx
git commit -m "feat(parent): NewCustomQuestion requires a Bank target"
```

---

### Task 11: `NewCustomPassage` — Bank field required

**Files:**
- Modify: `src/pages/parent/NewCustomPassage.tsx`

- [ ] **Step 1: Apply the same pattern as Task 10**

Mirror the changes in Task 10 with one difference: a passage is added to the bank via `addItemsToBank({ bankId, questionIds: [], passageIds: [newPassageId] })`. Passages have no draft/published gate themselves — manual passages are usable as soon as they exist — so the bank's passage_count grows immediately.

Specifically:
1. Import `BankPicker` + `addItemsToBank`.
2. Add `bankId` state, `lockToBank` from `?bank=…`.
3. Mount `BankPicker` directly under the title.
4. Disable submit until `bankId` is set.
5. After the existing passage creation succeeds, call `addItemsToBank({ bankId: bankId!, questionIds: [], passageIds: [newPassageId] })`.
6. Navigate to `/parent/ai-studio?bank=${bankId}` on success.

- [ ] **Step 2: Typecheck + build**

```bash
npm run typecheck && npm run build
```

Expected: both green.

- [ ] **Step 3: Commit**

```bash
git add src/pages/parent/NewCustomPassage.tsx
git commit -m "feat(parent): NewCustomPassage requires a Bank target"
```

---

### Task 12: `ReviewBanks` page (new AI Studio default)

**Files:**
- Create: `src/pages/parent/ReviewBanks.tsx`

- [ ] **Step 1: Implement the list page**

```tsx
// src/pages/parent/ReviewBanks.tsx
// AI Studio default view. Lists custom Banks the family owns. Drilling into a
// bank navigates to /parent/ai-studio?bank=<uuid>, which AiStudio.tsx routes
// to <CustomBank /> (the per-bank review screen). Read-only — assignment goes
// through the bank-detail "Assign to kid" CTA inside CustomBank.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

interface BankOverview {
  id: string
  name: string
  subject: 'math' | 'reading' | 'language'
  grade: number
  question_count: number
  passage_count: number
  draft_question_count: number
  ready_question_count: number
  updated_at: string
}

export default function ReviewBanks() {
  const [banks, setBanks] = useState<BankOverview[] | null>(null)
  const [legacyCount, setLegacyCount] = useState<number>(0)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.from('map_v_custom_bank_overview')
        .select('id, name, subject, grade, question_count, passage_count, draft_question_count, ready_question_count, updated_at')
        .order('updated_at', { ascending: false }),
      supabase.from('map_v_custom_legacy_items')
        .select('id', { count: 'exact', head: true }),
    ]).then(([b, l]) => {
      if (!alive) return
      if (b.error) setErr(b.error.message)
      else setBanks((b.data ?? []) as BankOverview[])
      if (!l.error) setLegacyCount(l.count ?? 0)
    })
    return () => { alive = false }
  }, [])

  return (
    <div className="max-w-4xl mx-auto p-6">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">AI Studio · Review Banks</h1>
          <p className="text-sm text-zinc-500">Banks Claude and your manual authoring have built for this family.</p>
        </div>
        <Link to="/parent/ai-studio?tab=connect" className="btn-ghost text-sm">⚡ Connect AI</Link>
      </header>

      {err && <div className="p-3 mb-4 bg-red-50 text-red-700 rounded">{err}</div>}
      {!banks ? (
        <p className="text-zinc-500">Loading…</p>
      ) : banks.length === 0 ? (
        <p className="text-zinc-500">
          No banks yet. Generate questions with Claude (see <Link to="/parent/ai-studio?tab=connect" className="underline">Connect AI</Link>),
          or click <Link to="/parent/custom-bank/new-question" className="underline">+ New question</Link> to author manually.
        </p>
      ) : (
        <ul className="divide-y rounded border bg-white dark:bg-zinc-900">
          {banks.map(b => {
            const allReady = b.draft_question_count === 0 && b.ready_question_count > 0
            return (
              <li key={b.id} className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{b.name}</div>
                  <div className="text-xs text-zinc-500 mt-1">
                    {b.subject} · G{b.grade} ·
                    {' '}{b.question_count} {b.question_count === 1 ? 'question' : 'questions'}
                    {b.passage_count > 0 && ` · ${b.passage_count} passage${b.passage_count === 1 ? '' : 's'}`}
                    {' · '}{b.draft_question_count} draft · {b.ready_question_count} ready
                  </div>
                </div>
                <Link
                  to={`/parent/ai-studio?bank=${b.id}`}
                  className={allReady ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
                >
                  {allReady ? 'Assign →' : 'Review →'}
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {legacyCount > 0 && (
        <div className="mt-4 text-sm">
          <Link to="/parent/ai-studio?legacy=1" className="text-zinc-500 hover:underline">
            ℓ Legacy items ({legacyCount} not in any bank) →
          </Link>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/parent/ReviewBanks.tsx
git commit -m "feat(parent): ReviewBanks list — AI Studio default view"
```

---

### Task 13: Repurpose `CustomBank.tsx` as Bank Review

**Files:**
- Modify: `src/pages/parent/CustomBank.tsx`

- [ ] **Step 1: Require a `?bank=<uuid>` param and filter to that bank**

Read the file first. Then:

1. Replace the existing `setParams` use with `const [params] = useSearchParams(); const bankId = params.get('bank')`.
2. At the top of the effect that loads questions/passages, short-circuit when `bankId` is null:
   ```tsx
   if (!bankId) { setQuestions([]); setPassages([]); return }
   ```
3. Change the two queries to filter by `bankId`:
   ```tsx
   // Questions belonging to this bank
   const { data: qIds } = await supabase
     .from('map_question_bank_items')
     .select('custom_question_id, custom_passage_id')
     .eq('bank_id', bankId)
   const questionIds = (qIds ?? []).map(r => r.custom_question_id).filter(Boolean) as string[]
   const passageIds  = (qIds ?? []).map(r => r.custom_passage_id ).filter(Boolean) as string[]
   // Then fetch only those rows from map_custom_questions / map_custom_passages.
   ```
4. Add a header block above the existing tab nav that shows the bank's name, `subject · G{grade}`, an "Edit name" pencil that opens an inline rename input (calls `renameBank({ bankId, name })`), and a "Publish all drafts" button that calls `map_publish_custom_question` for every current draft question id in this bank (using the existing per-card publish handler, looped over `bulkBusy`-protected ids).
5. When `ready_question_count >= 5 && draft_question_count === 0` (compute from the queried data), show an additional "Assign to kid →" CTA in the header that opens the existing assignment flow with `bankId` pre-filled. The destination route depends on where the assignment flow lives — point it to the same place `BankDetail.tsx` already routes (search the repo: `grep -n "assign" src/pages/parent/BankDetail.tsx`).
6. The header's existing `[+ New question]` / `[+ New passage]` links must include `?bank=${bankId}`:
   ```tsx
   <Link to={`/parent/custom-bank/new-question?bank=${bankId}`}>…</Link>
   <Link to={`/parent/custom-bank/new-passage?bank=${bankId}`}>…</Link>
   ```
7. Add a back link in the page header: `<Link to="/parent/ai-studio">← All banks</Link>`.

- [ ] **Step 2: Manual smoke**

`npm run dev`; create a bank from the MCP integration test (or directly in the DB); open `/parent/ai-studio?bank=<id>`; verify only that bank's items render, the publish-all button publishes drafts, and the rename pencil persists.

- [ ] **Step 3: Typecheck + build**

```bash
npm run typecheck && npm run build
```

Expected: both green.

- [ ] **Step 4: Commit**

```bash
git add src/pages/parent/CustomBank.tsx
git commit -m "feat(parent): repurpose CustomBank as per-bank Review screen (?bank= scoped)"
```

---

### Task 14: `LegacyItems` page + `AiStudio` routing

**Files:**
- Create: `src/pages/parent/LegacyItems.tsx`
- Modify: `src/pages/parent/AiStudio.tsx`

- [ ] **Step 1: Write `LegacyItems.tsx`**

```tsx
// src/pages/parent/LegacyItems.tsx
// Read-only list of custom items not attached to any bank. Existing per-card
// Publish/Archive/Delete actions are preserved by linking each item to the
// existing detail screens (no in-place mutations here — keeps the file
// small).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

interface LegacyRow {
  kind: 'question' | 'passage'
  id: string
  subject: 'math' | 'reading' | 'language'
  grade: number
  status: 'draft' | 'published' | 'archived'
  created_at: string
}

export default function LegacyItems() {
  const [rows, setRows] = useState<LegacyRow[] | null>(null)
  useEffect(() => {
    supabase.from('map_v_custom_legacy_items')
      .select('kind, id, subject, grade, status, created_at')
      .order('created_at', { ascending: false })
      .then(({ data }) => setRows((data ?? []) as LegacyRow[]))
  }, [])
  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-4">
        <Link to="/parent/ai-studio" className="text-sm text-zinc-500 hover:underline">← All banks</Link>
      </div>
      <h1 className="text-2xl font-semibold mb-2">Legacy items</h1>
      <p className="text-sm text-zinc-500 mb-4">
        Custom items that aren't attached to a bank. New AI- and manual-authored items always land in a bank — these are leftovers.
      </p>
      {!rows ? <p className="text-zinc-500">Loading…</p> :
        rows.length === 0 ? <p className="text-zinc-500">No legacy items.</p> : (
        <ul className="divide-y rounded border bg-white dark:bg-zinc-900">
          {rows.map(r => (
            <li key={`${r.kind}:${r.id}`} className="p-3 flex items-center gap-3">
              <span className="text-xs uppercase tracking-wide text-zinc-500 w-20">{r.kind}</span>
              <span className="text-xs text-zinc-500">{r.subject} · G{r.grade}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">{r.status}</span>
              <span className="flex-1 text-xs text-zinc-500 truncate">{r.id}</span>
              <span className="text-xs text-zinc-500">{new Date(r.created_at).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update `AiStudio.tsx` routing**

Replace the file body with:

```tsx
// src/pages/parent/AiStudio.tsx
// Router for the AI Studio area:
//   ?tab=connect      → ConnectAi
//   ?bank=<uuid>      → CustomBank (per-bank review)
//   ?legacy=1         → LegacyItems
//   (no param)        → ReviewBanks (default)
import { useSearchParams } from 'react-router-dom'
import CustomBank from './CustomBank'
import ConnectAi from './ConnectAi'
import ReviewBanks from './ReviewBanks'
import LegacyItems from './LegacyItems'

export default function AiStudio() {
  const [params] = useSearchParams()
  if (params.get('tab') === 'connect') return <ConnectAi />
  if (params.get('bank')) return <CustomBank />
  if (params.get('legacy') === '1') return <LegacyItems />
  return <ReviewBanks />
}
```

- [ ] **Step 3: Typecheck + build**

```bash
npm run typecheck && npm run build
```

Expected: both green.

- [ ] **Step 4: Commit**

```bash
git add src/pages/parent/LegacyItems.tsx src/pages/parent/AiStudio.tsx
git commit -m "feat(parent): LegacyItems page + AiStudio routing for bank/legacy params"
```

---

### Task 15: Manual QA + PR description

**Files:**
- (No code changes; documentation only.)

- [ ] **Step 1: Run the full test suite**

```bash
npm run typecheck && npm run build
node --env-file=.env.local scripts/test-bank-first-data.mjs
node --env-file=.env.local scripts/audit-mcp-readonly.mjs
# After deploying a preview:
MCP_BASE_URL=https://<preview-host> MCP_TOKEN=<dev token> \
  node --env-file=.env.local scripts/test-mcp-bank-first.mjs
```

Every script should end with its success message.

- [ ] **Step 2: Manual QA checklist (record outcomes in the PR description)**

For each, write PASS/FAIL with the bank.id you saw:

- From MCP, ask Claude to author 5 math questions for "fractions on a number line." Expect a new bank `Fractions on a number line — Math G3` in AI Studio with 5 draft items.
- From the same MCP conversation, ask for 5 more. Expect them in the *same* bank (bank reused), bank now shows 10 items.
- From MCP, author a reading passage with 4 questions for "main idea." Expect the bank to have 1 passage + 4 question items.
- In AI Studio, click Review on the math bank → Publish all drafts → Assign → complete the existing assignment flow against Aarav.
- Verify the kid sees the assigned bank on Kid Home and can take it.
- From the manual New-question form, leave Bank blank → verify the submit button is disabled.
- From the manual New-question form, change Subject mid-authoring → verify Bank field resets and dropdown re-filters.
- Try a collision: create `Test — Math G2`, then run MCP with `bank_name: 'Test — Math G2'`, `subject: 'reading'`, `grade: 2` → verify the new bank is named `Test — Math G2 (2)`.

- [ ] **Step 3: PR**

Open a PR from `spec/bank-first-ai-authoring` (or `feat/bank-first-ai-authoring`) into `main`. Title: `feat: bank-first AI authoring`. Body:

```
Spec: docs/superpowers/specs/2026-05-20-bank-first-ai-authoring-design.md
Plan: docs/superpowers/plans/2026-05-21-bank-first-ai-authoring.md

Every custom item now lives in a named Bank at creation time. MCP write tools
take bank_id or bank_name; manual New-question/New-passage forms require a
Bank target. AI Studio's default view is the list of Banks; the per-Bank review
screen replaces the flat pool. Legacy orphans surface from a "Legacy items"
link.

Migration: 20260521_map_bank_first_authoring.sql
- map_question_bank_items.custom_passage_id (XOR with custom_question_id)
- map_create_or_find_custom_bank, map_add_items_to_bank, map_rename_bank
- map_v_custom_bank_overview, map_v_custom_legacy_items

Tests run:
- npm run typecheck && npm run build              ✅
- scripts/test-bank-first-data.mjs                ✅
- scripts/audit-mcp-readonly.mjs                  ✅ (no change in write tool count)
- scripts/test-mcp-bank-first.mjs                 ✅ (against preview)

Manual QA: <fill in PASS/FAIL list from Step 2>
```

- [ ] **Step 4: Final commit (PR body record only — no code)**

No code commit. After the PR is open, link the spec + plan in the description.

---

## Self-review

**Spec coverage (each §X of the spec maps to at least one task):**

- §2 decisions: bank binding (Tasks 5, 6, 7), naming convention guidance (Task 5), collisions (Task 1 RPC), manual scope (Tasks 10, 11), legacy items (Task 14), Review UI (Tasks 12, 13), passages in banks (Task 1), vetted lane untouched (no task — verified by absence of changes to `TestsAndBanks.tsx`), assignment gate unchanged (no task — `map_assign_bank` not modified).
- §4 data model: `map_question_bank_items.custom_passage_id` (Task 1), `map_create_or_find_custom_bank` (Task 1), `map_add_items_to_bank` (Task 1), `map_rename_bank` (Task 1), `map_v_custom_bank_overview` (Task 1), `map_v_custom_legacy_items` (Task 1), no data migration (Task 1 confirmed via absence).
- §5 MCP tool API: schemas (Task 5), `create_custom_questions` rewrite (Task 6), `create_custom_passage_and_questions` rewrite (Task 7), tool descriptions (Task 5), error codes (Task 4), no quota change (Tasks 6, 7 keep existing quota calls).
- §6 UI: `AiStudio` routing (Task 14), `ReviewBanks` (Task 12), Bank Review screen (Task 13), manual forms (Tasks 10, 11), Tests & Banks untouched (no task), mutations.ts (Task 3).
- §7 non-goals: not implemented (correct; YAGNI).
- §8 phasing: single PR with the commit slices in Task 1-14 (matches §8).
- §9 verification: data guard (Task 2), MCP integration test (Task 8), QA checklist (Task 15).

**Placeholder scan:** no TBD/TODO in tasks; every code block is complete.

**Type consistency:**
- `createOrFindCustomBank` returns `{ bankId, resolvedName, wasCreated }` (Task 3) — `BankPicker` consumes `r.bankId` and `r.resolvedName` (Task 9). ✓
- `addItemsToBank` arg shape `{ bankId, questionIds, passageIds }` consistent in Tasks 3, 9, 10, 11. ✓
- MCP helper `resolveCreateOrFindBank` returns `{ id, name, wasCreated }` (Task 4) — used in Tasks 6, 7 as `bank.id`, `bank.name`, `bank.wasCreated`. ✓
- Tool response payload `bank: { id, name, was_created, item_count }` consistent in Tasks 6, 7, and the MCP test (Task 8) asserts the same shape. ✓
- View columns (`question_count`, `passage_count`, `draft_question_count`, `ready_question_count`, `updated_at`) consistent between Task 1 (definition), Task 12 (ReviewBanks consumer), and Task 9 (BankPicker only selects a subset). ✓
- Error code names consistent: `bank_target_mismatch`, `bank_not_custom_lane`, `bank_capacity_exceeded`, `mixed_subjects_in_call` in Tasks 4, 6, 7, 8. ✓
