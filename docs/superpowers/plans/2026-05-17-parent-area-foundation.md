# Parent Area Redesign — Foundation Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the parent-area data layer — `map_test_definitions` + `map_test_assignments`, RLS, three views, four RPCs, a faithful backfill of the 5 legacy `kind='custom'` sessions, the `parent_v2` flag column, and the `src/lib/parent` read/write wrappers — proven safe by a passing cross-family isolation script. No UI.

**Architecture:** One idempotent migration applied via the Supabase MCP `apply_migration` tool against project `klhzfwxpztaojekwgzcg`. RPCs/RLS mirror the proven `map_custom_questions` family-scoping pattern (`SECURITY DEFINER SET search_path='' `, `auth.uid()`, `public.map_current_family_id()`, `GRANT … TO authenticated`). Family context comes from a Supabase Auth JWT, so the verification scripts mint ephemeral auth users with the service-role key and sign in with the anon key to exercise RLS realistically. TDD: verification scripts are written first and must fail (relations absent), then pass after the migration applies.

**Tech Stack:** Postgres (Supabase project `klhzfwxpztaojekwgzcg`), `@supabase/supabase-js`, Node `.mjs` scripts run via `node --env-file=.env.local`, TypeScript lib (`src/lib/parent`), Vite/React Router app (no UI touched in this slice).

**Reference spec:** `docs/superpowers/specs/2026-05-17-parent-area-foundation-design.md`. Branch: `feat/parent-area-redesign` (already checked out).

---

## File Structure

- Create `scripts/_parent-redesign-helpers.mjs` — shared test harness: mint/teardown two ephemeral families (auth user + `map_families` + 2 `map_students` each + one `kind='custom'` session in family A for backfill assertions), and a `signInClient(email,password)` helper.
- Create `scripts/test-parent-redesign-foundation.mjs` — §9.1/9.2/9.3/9.9 checks.
- Create `scripts/test-parent-redesign-isolation.mjs` — the §9.6 cross-family gate (show-stopper).
- Create `migrations/20260517_map_parent_area_redesign.sql` — the full migration (applied via MCP, file kept for repo history per `CLAUDE.md` §6).
- Create `src/lib/parent/types.ts` — TS types for the three views + the status enum.
- Create `src/lib/parent/queries.ts` — typed view selects + `getParentV2`.
- Create `src/lib/parent/mutations.ts` — thin RPC wrappers.

No existing files are modified in this slice.

---

### Task 1: Shared verification harness

**Files:**
- Create: `scripts/_parent-redesign-helpers.mjs`

- [ ] **Step 1: Write the harness module**

```js
// scripts/_parent-redesign-helpers.mjs
// Shared setup/teardown for the parent-area foundation verification scripts.
// Mints two ephemeral families, each owned by a real Supabase Auth user, so
// map_current_family_id() (which keys off auth.uid()) resolves correctly.
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

export const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tag = `pr-test-${Date.now()}`;

async function makeFamily(label) {
  const email = `${tag}-${label}@example.invalid`;
  const password = `Pw-${tag}-${label}!`;
  const { data: u, error: ue } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (ue) throw ue;
  const userId = u.user.id;
  const { data: fam, error: fe } = await admin
    .from('map_families')
    .insert({ owner_user_id: userId, family_name: `${tag}-${label}` })
    .select('id')
    .single();
  if (fe) throw fe;
  const familyId = fam.id;
  const { data: kids, error: ke } = await admin
    .from('map_students')
    .insert([
      { family_id: familyId, display_name: `${label}-kid1`, grade: 2, school_grade: 2 },
      { family_id: familyId, display_name: `${label}-kid2`, grade: 4, school_grade: 4 },
    ])
    .select('id, grade');
  if (ke) throw ke;
  return { email, password, userId, familyId, kids };
}

export async function setup() {
  const A = await makeFamily('A');
  const B = await makeFamily('B');
  // One legacy custom session in family A's kid1 for backfill assertions.
  const { data: sess, error: se } = await admin
    .from('map_test_sessions')
    .insert({
      student_id: A.kids[0].id,
      subject: 'math',
      status: 'completed',
      kind: 'custom',
      question_ids: [],
      current_index: 0,
      correct_count: 3,
      estimated_rit: 185,
      grade: 2,
      planned_length: 5,
      started_at: new Date(Date.now() - 86400000).toISOString(),
      completed_at: new Date(Date.now() - 86000000).toISOString(),
      custom_config: { standard_ids: [], requested_count: 5, actual_count: 3, shortfall_reason: null },
    })
    .select('id')
    .single();
  if (se) throw se;
  return { A, B, customSessionId: sess.id };
}

export async function signInClient(email, password) {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

export async function teardown(ctx) {
  const famIds = [ctx.A.familyId, ctx.B.familyId];
  const kidIds = [...ctx.A.kids, ...ctx.B.kids].map((k) => k.id);
  await admin.from('map_test_assignments').delete().in('family_id', famIds);
  await admin.from('map_test_definitions').delete().in('family_id', famIds);
  await admin.from('map_test_sessions').delete().in('student_id', kidIds);
  await admin.from('map_students').delete().in('family_id', famIds);
  await admin.from('map_families').delete().in('id', famIds);
  await admin.auth.admin.deleteUser(ctx.A.userId).catch(() => {});
  await admin.auth.admin.deleteUser(ctx.B.userId).catch(() => {});
}

export function assert(cond, label) {
  if (!cond) { console.error('FAIL:', label); process.exitCode = 1; return false; }
  console.log('PASS:', label);
  return true;
}
```

- [ ] **Step 2: Self-check the harness (setup + teardown round-trips)**

Run: `node --env-file=.env.local -e "import('./scripts/_parent-redesign-helpers.mjs').then(async m=>{const c=await m.setup();console.log('setup ok',c.A.familyId!==c.B.familyId);await m.teardown(c);console.log('teardown ok');})"`
Expected: prints `setup ok true` then `teardown ok`, exit 0. (The `map_test_assignments`/`map_test_definitions` deletes in teardown will error harmlessly until the migration exists — wrap is not needed because they only run after a successful setup; if this step errors on those relations, that is expected pre-migration and Step 2 is satisfied once `setup ok true` prints. Re-verify teardown fully in Task 6.)

- [ ] **Step 3: Commit**

```bash
git add scripts/_parent-redesign-helpers.mjs
git commit -m "test(parent) foundation verification harness (ephemeral families)"
```

---

### Task 2: Foundation verification script (failing first)

**Files:**
- Create: `scripts/test-parent-redesign-foundation.mjs`

- [ ] **Step 1: Write the script**

```js
// scripts/test-parent-redesign-foundation.mjs
// Spec §9.1 (constraints present), §9.2 (RPC round-trip), §9.3 (view shapes),
// §9.9 (backfill: legacy custom session -> definition+assignment pair).
// Run: node --env-file=.env.local scripts/test-parent-redesign-foundation.mjs
import { admin, setup, signInClient, teardown, assert } from './_parent-redesign-helpers.mjs';

const ctx = await setup();
try {
  const ca = await signInClient(ctx.A.email, ctx.A.password);

  // §9.2 create definition
  const { data: defId, error: ce } = await ca.rpc('map_create_test_definition', {
    p_name: 'Plan test def',
    p_subject: 'math',
    p_grade: 2,
    p_planned_length: 10,
    p_source_mix: 'vetted_only',
    p_custom_pct: null,
    p_difficulty_mix: null,
    p_standard_codes: [],
    p_custom_question_ids: [],
    p_custom_passage_ids: [],
    p_is_template: true,
  });
  assert(!ce && typeof defId === 'string', '§9.2 map_create_test_definition returns uuid');

  // §9.2 assign to both of A's kids
  const { data: aIds, error: ae } = await ca.rpc('map_assign_test_definition', {
    p_definition_id: defId,
    p_student_ids: ctx.A.kids.map((k) => k.id),
    p_due_by: null,
    p_parent_note: 'after dinner',
  });
  assert(!ae && Array.isArray(aIds) && aIds.length === 2, '§9.2 assign creates 2 assignments');

  // §9.2 revoke one (status=assigned) succeeds
  const { error: re } = await ca.rpc('map_revoke_assignment', { p_assignment_id: aIds[0] });
  assert(!re, '§9.2 revoke of assigned assignment succeeds');

  // §9.2 revoke of an in_progress assignment fails
  const { error: fue } = await admin.from('map_test_assignments')
    .update({ status: 'in_progress', session_id: ctx.customSessionId, started_at: new Date().toISOString() })
    .eq('id', aIds[1]);
  assert(!fue, '§9.2 admin force-to-in_progress update succeeded (precondition)');
  const { error: re2 } = await ca.rpc('map_revoke_assignment', { p_assignment_id: aIds[1] });
  assert(!!re2, '§9.2 revoke of in_progress assignment is rejected');

  // §9.3 views return shape, family-scoped
  const { data: roster, error: rre } = await ca.from('map_v_classroom_roster').select('*');
  assert(!rre && roster.length === 2 && roster.every((r) => r.family_id === ctx.A.familyId),
    '§9.3 map_v_classroom_roster: 2 rows, all family A');
  assert(roster[0].standards_mastered !== undefined && roster[0].pending_assignments !== undefined,
    '§9.3 roster has expected columns');

  const { data: ov, error: oe } = await ca.from('map_v_assignment_overview').select('*');
  assert(!oe && ov.every((r) => r.family_id === ctx.A.familyId),
    '§9.3 map_v_assignment_overview family-scoped');

  const { data: lib, error: le } = await ca.from('map_v_library_content').select('*').limit(5);
  assert(!le && Array.isArray(lib) && lib.length > 0
    && lib.every((r) => ['vetted', 'my_questions', 'ai_studio'].includes(r.source_tab)),
    '§9.3 map_v_library_content returns rows with valid source_tab');

  // §9.9 backfill invariant. The migration's backfill is a one-time step that
  // ran at apply time; it cannot cover the harness's ephemeral custom session
  // (created after apply). So assert the real invariant: every pre-existing
  // kind='custom' session is backfilled — the only custom session WITHOUT a
  // linked assignment is this harness's own ephemeral one — and a sampled
  // backfilled definition is faithful (vetted_only, system-owned, named).
  const { data: customSessions, error: cse } = await admin
    .from('map_test_sessions').select('id').eq('kind', 'custom');
  const { data: backfilledAssigns, error: bae } = await admin
    .from('map_test_assignments').select('session_id').not('session_id', 'is', null);
  const linked = new Set((backfilledAssigns ?? []).map((r) => r.session_id));
  const orphaned = (customSessions ?? [])
    .map((r) => r.id)
    .filter((id) => id !== ctx.customSessionId && !linked.has(id));
  assert(!cse && !bae && orphaned.length === 0,
    '§9.9 every pre-existing kind=custom session is backfilled (only the harness ephemeral one is unlinked)');

  const { data: sampleDef, error: sde } = await admin
    .from('map_test_definitions')
    .select('name, source_mix, owner_user_id')
    .like('name', 'Backfilled · %')
    .is('owner_user_id', null)
    .limit(1)
    .maybeSingle();
  assert(!sde && sampleDef
    && sampleDef.source_mix === 'vetted_only'
    && sampleDef.owner_user_id === null
    && sampleDef.name.startsWith('Backfilled · '),
    '§9.9 a backfilled definition is faithful (vetted_only, system-owned, named)');

  console.log('\nFoundation checks complete.');
} finally {
  await teardown(ctx);
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --env-file=.env.local scripts/test-parent-redesign-foundation.mjs`
Expected: FAIL — first `assert` fails because `map_create_test_definition` does not exist yet (RPC error). Script exits non-zero. (Teardown still runs via `finally`.)

- [ ] **Step 3: Commit**

```bash
git add scripts/test-parent-redesign-foundation.mjs
git commit -m "test(parent) foundation checks (failing pre-migration)"
```

---

### Task 3: Cross-family isolation script (the §9.6 gate, failing first)

**Files:**
- Create: `scripts/test-parent-redesign-isolation.mjs`

- [ ] **Step 1: Write the script**

```js
// scripts/test-parent-redesign-isolation.mjs
// Spec §9.6 — CRITICAL cross-family isolation gate. Do not ship if this fails.
// Hardened: B owns its own definition+assignment so every B-side check is
// non-vacuous (proves isolation AND B's positive read access), counts are
// family-pinned not global, and every error is captured (no swallowed-error
// false-greens).
// Run: node --env-file=.env.local scripts/test-parent-redesign-isolation.mjs
import { admin, setup, signInClient, teardown, assert } from './_parent-redesign-helpers.mjs';

const ctx = await setup();
try {
  const ca = await signInClient(ctx.A.email, ctx.A.password);
  const cb = await signInClient(ctx.B.email, ctx.B.password);

  // A creates + assigns to A's kids (2 rows).
  const { data: defId, error: ce } = await ca.rpc('map_create_test_definition', {
    p_name: 'Iso def A', p_subject: 'math', p_grade: 2, p_planned_length: 10,
    p_source_mix: 'vetted_only', p_custom_pct: null, p_difficulty_mix: null,
    p_standard_codes: [], p_custom_question_ids: [], p_custom_passage_ids: [], p_is_template: false,
  });
  assert(!ce && typeof defId === 'string', 'A creates definition → uuid returned');
  const { data: aIds, error: ae } = await ca.rpc('map_assign_test_definition', {
    p_definition_id: defId, p_student_ids: ctx.A.kids.map((k) => k.id), p_due_by: null, p_parent_note: null,
  });
  assert(!ae && Array.isArray(aIds) && aIds.length === 2, 'A assigns to A kids → 2 rows');

  // B creates + assigns its OWN definition so the B-side checks below are not
  // vacuously true on an empty result set.
  const { data: defB, error: ceB } = await cb.rpc('map_create_test_definition', {
    p_name: 'Iso def B', p_subject: 'math', p_grade: 2, p_planned_length: 10,
    p_source_mix: 'vetted_only', p_custom_pct: null, p_difficulty_mix: null,
    p_standard_codes: [], p_custom_question_ids: [], p_custom_passage_ids: [], p_is_template: false,
  });
  assert(!ceB && typeof defB === 'string', 'B creates its own definition → uuid');
  const { data: bIds, error: aeB } = await cb.rpc('map_assign_test_definition', {
    p_definition_id: defB, p_student_ids: [ctx.B.kids[0].id], p_due_by: null, p_parent_note: null,
  });
  assert(!aeB && Array.isArray(bIds) && bIds.length === 1, 'B assigns to its own kid → 1 row');

  // A assigning with a family-B student_id → rejected.
  const { error: xe } = await ca.rpc('map_assign_test_definition', {
    p_definition_id: defId, p_student_ids: [ctx.B.kids[0].id], p_due_by: null, p_parent_note: null,
  });
  assert(!!xe && /not your kid/i.test(xe.message ?? JSON.stringify(xe)),
    'A assigning B-kid raises "not your kid"');

  // Family-pinned (not global) check: the B-kid has ONLY B's own assignment;
  // A's rejected cross-family attempt added nothing.
  const { data: bKidRows, error: bke } = await admin
    .from('map_test_assignments')
    .select('id, definition_id')
    .eq('student_id', ctx.B.kids[0].id);
  assert(!bke && bKidRows.length === 1 && bKidRows[0].definition_id === defB,
    'no cross-family rows for B-kid; only B\'s own assignment present');

  // B SELECT over map_test_assignments: sees exactly its own row, never A's (RLS).
  const { data: bRows, error: be } = await cb.from('map_test_assignments').select('id, family_id');
  assert(!be && bRows.length === 1 && bRows.every((r) => r.family_id === ctx.B.familyId),
    'B sees exactly its own assignment, none of A (RLS)');

  // B cannot revoke an A-owned assignment.
  const { error: rbe } = await cb.rpc('map_revoke_assignment', { p_assignment_id: aIds[1] });
  const stillThere = await admin.from('map_test_assignments')
    .select('status').eq('id', aIds[1]).single();
  assert(!!rbe && stillThere.data.status === 'assigned',
    'B cannot revoke A assignment; row unmutated');

  // B's assignment-overview view exists, shows B's definition, never A's.
  const { data: bOv, error: bove } = await cb.from('map_v_assignment_overview').select('definition_id');
  assert(!bove, 'B can query map_v_assignment_overview (view exists)');
  assert((bOv ?? []).some((r) => r.definition_id === defB)
    && (bOv ?? []).every((r) => r.definition_id !== defId),
    'B sees its own definition in the view, never A\'s');

  console.log('\nAll isolation checks passed.');
} finally {
  await teardown(ctx);
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --env-file=.env.local scripts/test-parent-redesign-isolation.mjs`
Expected: FAIL — `map_create_test_definition` does not exist yet; script exits non-zero. Teardown runs via `finally`.

- [ ] **Step 3: Commit**

```bash
git add scripts/test-parent-redesign-isolation.mjs
git commit -m "test(parent) cross-family isolation gate (failing pre-migration)"
```

---

### Task 4: Write the migration

**Files:**
- Create: `migrations/20260517_map_parent_area_redesign.sql`

- [ ] **Step 1: Write the complete migration file**

```sql
-- Migration: map_parent_area_redesign
-- Phase 5 foundation slice. Apply via Supabase MCP `apply_migration`
-- (migration name: map_parent_area_redesign). Idempotent, single transaction.
-- Reconciled to live schema of project klhzfwxpztaojekwgzcg (see spec
-- docs/superpowers/specs/2026-05-17-parent-area-foundation-design.md §3).

-- 0. Pre-flight: fail loudly if a dependency column we rely on has moved.
DO $pf$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='map_custom_question_versions'
                   AND column_name='standard_code') THEN
    RAISE EXCEPTION 'pre-flight: map_custom_question_versions.standard_code missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='map_misconception_signals'
                   AND column_name='occurrence_count') THEN
    RAISE EXCEPTION 'pre-flight: map_misconception_signals.occurrence_count missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='map_test_sessions'
                   AND column_name='custom_config') THEN
    RAISE EXCEPTION 'pre-flight: map_test_sessions.custom_config missing';
  END IF;
END $pf$;

-- 1. Assignment status enum.
DO $en$ BEGIN
  CREATE TYPE public.map_assignment_status AS ENUM
    ('assigned','in_progress','completed','expired','revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $en$;

-- 2. Test definitions (the reusable recipe; no student_id by design).
CREATE TABLE IF NOT EXISTS public.map_test_definitions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           uuid NOT NULL REFERENCES public.map_families(id) ON DELETE CASCADE,
  owner_user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name                text NOT NULL,
  subject             public.map_subject NOT NULL,
  grade               int NOT NULL,
  planned_length      int NOT NULL DEFAULT 25,
  source_mix          text NOT NULL DEFAULT 'vetted_only',
  custom_pct          int,
  difficulty_mix      jsonb,
  standard_codes      text[] DEFAULT '{}',
  custom_question_ids uuid[] DEFAULT '{}',
  custom_passage_ids  uuid[] DEFAULT '{}',
  is_template         boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  soft_deleted_at     timestamptz,
  CONSTRAINT map_td_name_len CHECK (char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT map_td_grade_check CHECK (grade BETWEEN 0 AND 12),
  CONSTRAINT map_td_planned_length_check CHECK (planned_length BETWEEN 5 AND 50),
  CONSTRAINT map_td_source_mix_check CHECK (source_mix IN ('vetted_only','custom_only','mixed')),
  CONSTRAINT map_td_custom_pct_check
    CHECK ((source_mix <> 'mixed' AND custom_pct IS NULL) OR
           (source_mix = 'mixed' AND custom_pct BETWEEN 0 AND 100))
);
CREATE INDEX IF NOT EXISTS map_td_family_idx
  ON public.map_test_definitions (family_id) WHERE soft_deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS map_td_family_template_idx
  ON public.map_test_definitions (family_id, is_template)
  WHERE soft_deleted_at IS NULL AND is_template = true;

-- 3. Assignments (definition × kid).
CREATE TABLE IF NOT EXISTS public.map_test_assignments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           uuid NOT NULL REFERENCES public.map_families(id) ON DELETE CASCADE,
  definition_id       uuid NOT NULL REFERENCES public.map_test_definitions(id) ON DELETE RESTRICT,
  student_id          uuid NOT NULL REFERENCES public.map_students(id) ON DELETE CASCADE,
  assigned_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at         timestamptz NOT NULL DEFAULT now(),
  due_by              timestamptz,
  session_id          uuid REFERENCES public.map_test_sessions(id) ON DELETE SET NULL,
  status              public.map_assignment_status NOT NULL DEFAULT 'assigned',
  started_at          timestamptz,
  completed_at        timestamptz,
  parent_note         text,
  CONSTRAINT map_ta_note_len CHECK (parent_note IS NULL OR char_length(parent_note) BETWEEN 1 AND 500),
  CONSTRAINT map_ta_session_status_coherent CHECK (
    (status = 'assigned'    AND session_id IS NULL AND started_at IS NULL AND completed_at IS NULL) OR
    (status = 'in_progress' AND session_id IS NOT NULL AND started_at IS NOT NULL AND completed_at IS NULL) OR
    (status = 'completed'   AND session_id IS NOT NULL AND started_at IS NOT NULL AND completed_at IS NOT NULL) OR
    (status = 'expired'     AND session_id IS NULL) OR
    (status = 'revoked'     AND session_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS map_ta_family_idx ON public.map_test_assignments (family_id);
CREATE INDEX IF NOT EXISTS map_ta_student_status_idx
  ON public.map_test_assignments (student_id, status) WHERE status IN ('assigned','in_progress');
CREATE INDEX IF NOT EXISTS map_ta_definition_idx ON public.map_test_assignments (definition_id);
CREATE INDEX IF NOT EXISTS map_ta_completed_idx
  ON public.map_test_assignments (family_id, completed_at DESC) WHERE status = 'completed';

-- 4. RLS — family-scoped, mirrors public.map_custom_questions policies.
ALTER TABLE public.map_test_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_test_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS map_td_select ON public.map_test_definitions;
DROP POLICY IF EXISTS map_td_insert ON public.map_test_definitions;
DROP POLICY IF EXISTS map_td_update ON public.map_test_definitions;
CREATE POLICY map_td_select ON public.map_test_definitions FOR SELECT
  USING (family_id = public.map_current_family_id() AND soft_deleted_at IS NULL);
CREATE POLICY map_td_insert ON public.map_test_definitions FOR INSERT
  WITH CHECK (family_id = public.map_current_family_id());
CREATE POLICY map_td_update ON public.map_test_definitions FOR UPDATE
  USING (family_id = public.map_current_family_id())
  WITH CHECK (family_id = public.map_current_family_id());

DROP POLICY IF EXISTS map_ta_select ON public.map_test_assignments;
DROP POLICY IF EXISTS map_ta_insert ON public.map_test_assignments;
DROP POLICY IF EXISTS map_ta_update ON public.map_test_assignments;
CREATE POLICY map_ta_select ON public.map_test_assignments FOR SELECT
  USING (family_id = public.map_current_family_id());
CREATE POLICY map_ta_insert ON public.map_test_assignments FOR INSERT
  WITH CHECK (family_id = public.map_current_family_id());
CREATE POLICY map_ta_update ON public.map_test_assignments FOR UPDATE
  USING (family_id = public.map_current_family_id())
  WITH CHECK (family_id = public.map_current_family_id());

-- 5. parent_v2 flag (gates nothing yet; UI cycle consumes it).
ALTER TABLE public.map_families
  ADD COLUMN IF NOT EXISTS parent_v2 boolean NOT NULL DEFAULT false;

-- 6. Views.
CREATE OR REPLACE VIEW public.map_v_classroom_roster WITH (security_invoker = true) AS
SELECT
  s.id AS student_id,
  s.family_id,
  s.display_name,
  s.grade,
  b.current_band,
  (SELECT count(*) FROM public.map_attempts a
     WHERE a.student_id = s.id AND a.answered_at >= now() - interval '7 days')
    AS questions_this_week,
  (SELECT count(DISTINCT date_trunc('day', a.answered_at)) FROM public.map_attempts a
     WHERE a.student_id = s.id AND a.answered_at >= now() - interval '7 days')
    AS active_days_this_week,
  (SELECT count(*) FROM public.map_v_mastery_by_standard m
     WHERE m.student_id = s.id AND m.status = 'mastered') AS standards_mastered,
  (SELECT count(*) FROM public.map_v_mastery_by_standard m
     WHERE m.student_id = s.id AND m.status = 'developing') AS standards_developing,
  (SELECT count(*) FROM public.map_v_mastery_by_standard m
     WHERE m.student_id = s.id AND m.status = 'growth') AS standards_growth,
  (SELECT count(*) FROM public.map_misconception_signals ms
     WHERE ms.student_id = s.id AND ms.active = true AND ms.occurrence_count >= 3)
    AS active_misconceptions,
  (SELECT count(*) FROM public.map_test_assignments ta
     WHERE ta.student_id = s.id AND ta.status IN ('assigned','in_progress'))
    AS pending_assignments,
  (SELECT row_to_json(x) FROM (
     SELECT ts.id, ts.subject, ts.completed_at,
            ts.correct_count,
            array_length(ts.question_ids, 1) AS questions_attempted,
            round(100.0 * ts.correct_count
                  / nullif(array_length(ts.question_ids, 1), 0)) AS score
     FROM public.map_test_sessions ts
     WHERE ts.student_id = s.id AND ts.completed_at IS NOT NULL
     ORDER BY ts.completed_at DESC LIMIT 1
   ) x) AS last_session
FROM public.map_students s
LEFT JOIN public.map_v_student_current_band b ON b.student_id = s.id;

CREATE OR REPLACE VIEW public.map_v_assignment_overview WITH (security_invoker = true) AS
SELECT
  ta.id AS assignment_id,
  ta.family_id,
  ta.status,
  ta.assigned_at,
  ta.due_by,
  ta.started_at,
  ta.completed_at,
  ta.session_id,
  ta.parent_note,
  s.id AS student_id,
  s.display_name AS student_name,
  s.grade AS student_grade,
  td.id AS definition_id,
  td.name AS definition_name,
  td.subject,
  td.grade AS definition_grade,
  td.planned_length,
  td.source_mix,
  td.is_template,
  ts.correct_count AS questions_correct,
  array_length(ts.question_ids, 1) AS questions_attempted,
  round(100.0 * ts.correct_count
        / nullif(array_length(ts.question_ids, 1), 0)) AS score,
  ts.estimated_rit
FROM public.map_test_assignments ta
JOIN public.map_students s ON s.id = ta.student_id
JOIN public.map_test_definitions td ON td.id = ta.definition_id
LEFT JOIN public.map_test_sessions ts ON ts.id = ta.session_id
WHERE td.soft_deleted_at IS NULL;

CREATE OR REPLACE VIEW public.map_v_library_content WITH (security_invoker = true) AS
SELECT
  q.id AS content_id,
  'question'::text AS content_type,
  'vetted'::text AS source_tab,
  NULL::text AS source_detail,
  q.subject::text, q.grade::int, q.rit_band::text,
  st.teks_code, st.teks_title,
  NULL::text AS status,
  NULL::uuid AS family_id,
  q.created_at
FROM public.map_questions q
JOIN public.map_standards st ON st.id = q.standard_id
WHERE q.is_active = true
UNION ALL
SELECT
  cq.id, 'question',
  CASE WHEN cq.source = 'parent_ai_generated' THEN 'ai_studio' ELSE 'my_questions' END,
  cq.source, qv.subject, qv.grade, NULL,
  qv.standard_code, NULL, cq.status, cq.family_id, cq.created_at
FROM public.map_custom_questions cq
JOIN public.map_custom_question_versions qv ON qv.id = cq.current_version_id
WHERE cq.soft_deleted_at IS NULL
UNION ALL
SELECT
  cp.id, 'passage',
  CASE WHEN cp.source = 'parent_ai_generated' THEN 'ai_studio' ELSE 'my_questions' END,
  cp.source, pv.subject, pv.grade, NULL,
  NULL, NULL, cp.status, cp.family_id, cp.created_at
FROM public.map_custom_passages cp
JOIN public.map_custom_passage_versions pv ON pv.id = cp.current_version_id
WHERE cp.soft_deleted_at IS NULL;

-- 7. RPCs (mirror map_custom_questions auth pattern).
CREATE OR REPLACE FUNCTION public.map_create_test_definition(
  p_name text, p_subject public.map_subject, p_grade int, p_planned_length int,
  p_source_mix text, p_custom_pct int, p_difficulty_mix jsonb,
  p_standard_codes text[], p_custom_question_ids uuid[],
  p_custom_passage_ids uuid[], p_is_template boolean
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_family uuid; v_id uuid;
BEGIN
  v_family := public.map_current_family_id();
  IF v_family IS NULL THEN RAISE EXCEPTION 'no family for current user'; END IF;
  INSERT INTO public.map_test_definitions
    (family_id, owner_user_id, name, subject, grade, planned_length,
     source_mix, custom_pct, difficulty_mix, standard_codes,
     custom_question_ids, custom_passage_ids, is_template)
  VALUES
    (v_family, auth.uid(), p_name, p_subject, p_grade, p_planned_length,
     p_source_mix, p_custom_pct, p_difficulty_mix, coalesce(p_standard_codes,'{}'),
     coalesce(p_custom_question_ids,'{}'), coalesce(p_custom_passage_ids,'{}'),
     coalesce(p_is_template,false))
  RETURNING id INTO v_id;
  RETURN v_id;
END $fn$;
GRANT EXECUTE ON FUNCTION public.map_create_test_definition(
  text,public.map_subject,int,int,text,int,jsonb,text[],uuid[],uuid[],boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.map_assign_test_definition(
  p_definition_id uuid, p_student_ids uuid[],
  p_due_by timestamptz, p_parent_note text
) RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_family uuid; v_ids uuid[] := '{}'; v_sid uuid; v_new uuid;
BEGIN
  v_family := public.map_current_family_id();
  IF v_family IS NULL THEN RAISE EXCEPTION 'no family for current user'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.map_test_definitions
                 WHERE id = p_definition_id AND family_id = v_family
                   AND soft_deleted_at IS NULL) THEN
    RAISE EXCEPTION 'definition not found in this family';
  END IF;
  FOREACH v_sid IN ARRAY coalesce(p_student_ids,'{}') LOOP
    IF NOT EXISTS (SELECT 1 FROM public.map_students
                   WHERE id = v_sid AND family_id = v_family) THEN
      RAISE EXCEPTION 'not your kid';
    END IF;
  END LOOP;
  FOREACH v_sid IN ARRAY coalesce(p_student_ids,'{}') LOOP
    INSERT INTO public.map_test_assignments
      (family_id, definition_id, student_id, assigned_by_user_id,
       due_by, parent_note, status)
    VALUES (v_family, p_definition_id, v_sid, auth.uid(),
            p_due_by, p_parent_note, 'assigned')
    RETURNING id INTO v_new;
    v_ids := array_append(v_ids, v_new);
  END LOOP;
  RETURN v_ids;
END $fn$;
GRANT EXECUTE ON FUNCTION public.map_assign_test_definition(
  uuid,uuid[],timestamptz,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.map_revoke_assignment(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_family uuid;
BEGIN
  v_family := public.map_current_family_id();
  UPDATE public.map_test_assignments
     SET status = 'revoked'
   WHERE id = p_assignment_id
     AND family_id = v_family
     AND status = 'assigned';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found, not yours, or not revocable';
  END IF;
END $fn$;
GRANT EXECUTE ON FUNCTION public.map_revoke_assignment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.map_start_assignment(
  p_assignment_id uuid, p_session_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_family uuid;
BEGIN
  v_family := public.map_current_family_id();
  UPDATE public.map_test_assignments
     SET status = 'in_progress', session_id = p_session_id, started_at = now()
   WHERE id = p_assignment_id
     AND family_id = v_family
     AND status = 'assigned';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found, not yours, or not startable';
  END IF;
END $fn$;
GRANT EXECUTE ON FUNCTION public.map_start_assignment(uuid,uuid) TO authenticated;

-- 8. Faithful backfill of legacy kind='custom' sessions. Keyed by session id;
-- skips sessions already linked. source_mix='vetted_only' is accurate (the
-- legacy customTest.ts path only drew from map_questions).
WITH legacy AS (
  SELECT ts.id AS session_id, ts.student_id, ts.subject,
         coalesce(ts.grade, st.grade) AS grade,
         coalesce(ts.planned_length, array_length(ts.question_ids,1), 25) AS planned_length,
         st.family_id,
         coalesce(ts.started_at, ts.completed_at, now()) AS started_at,
         ts.completed_at,
         to_char(coalesce(ts.started_at, ts.completed_at, now()), 'Mon DD, YYYY') AS label,
         CASE
           WHEN ts.custom_config ? 'standard_ids' THEN (
             SELECT coalesce(array_agg(s2.teks_code), '{}')
             FROM public.map_standards s2
             WHERE s2.id IN (
               SELECT (jsonb_array_elements_text(ts.custom_config->'standard_ids'))::uuid
             )
           )
           ELSE '{}'::text[]
         END AS standard_codes
  FROM public.map_test_sessions ts
  JOIN public.map_students st ON st.id = ts.student_id
  WHERE ts.kind = 'custom'
    AND NOT EXISTS (
      SELECT 1 FROM public.map_test_assignments ta WHERE ta.session_id = ts.id
    )
), made_def AS (
  INSERT INTO public.map_test_definitions
    (family_id, owner_user_id, name, subject, grade, planned_length,
     source_mix, custom_pct, standard_codes, is_template, created_at, updated_at)
  SELECT family_id, NULL, 'Backfilled · ' || label, subject, grade, planned_length,
         'vetted_only', NULL, standard_codes, false, started_at, started_at
  FROM legacy
  RETURNING id AS definition_id, created_at
)
INSERT INTO public.map_test_assignments
  (family_id, definition_id, student_id, assigned_by_user_id, assigned_at,
   session_id, status, started_at, completed_at)
SELECT l.family_id, d.definition_id, l.student_id, NULL, l.started_at,
       l.session_id,
       CASE WHEN l.completed_at IS NOT NULL THEN 'completed'::public.map_assignment_status
            ELSE 'in_progress'::public.map_assignment_status END,
       l.started_at,
       l.completed_at
FROM legacy l
JOIN made_def d ON d.created_at = l.started_at;

-- Post-apply validation (run by scripts/test-parent-redesign-foundation.mjs):
--   SELECT count(*) FROM map_test_sessions WHERE kind='custom';
--   SELECT count(*) FROM map_test_assignments ta
--     JOIN map_test_definitions td ON td.id=ta.definition_id
--     WHERE td.owner_user_id IS NULL AND td.name LIKE 'Backfilled · %';
--   -> counts must match.
```

> **Backfill join note for the implementer:** the `made_def`↔`legacy` join uses `created_at = started_at` (the definition's `created_at` was set from `legacy.started_at`). This is safe because `started_at` was already coalesced to a non-null timestamp and each legacy session produces exactly one definition with that exact timestamp. If two legacy sessions share an identical `started_at`, fall back to the per-row CTE form in Step 1b below.

- [ ] **Step 1b (only if Step 6 validation count mismatches): swap the backfill for a per-session loop**

Replace the §8 `WITH legacy … JOIN made_def` block with:

```sql
DO $bf$
DECLARE r record; v_def uuid;
BEGIN
  FOR r IN
    SELECT ts.id AS session_id, ts.student_id, ts.subject,
           coalesce(ts.grade, st.grade) AS grade,
           coalesce(ts.planned_length, array_length(ts.question_ids,1), 25) AS planned_length,
           st.family_id,
           coalesce(ts.started_at, ts.completed_at, now()) AS started_at,
           ts.completed_at,
           to_char(coalesce(ts.started_at, ts.completed_at, now()), 'Mon DD, YYYY') AS label,
           CASE WHEN ts.custom_config ? 'standard_ids' THEN (
             SELECT coalesce(array_agg(s2.teks_code),'{}') FROM public.map_standards s2
             WHERE s2.id IN (SELECT (jsonb_array_elements_text(ts.custom_config->'standard_ids'))::uuid))
             ELSE '{}'::text[] END AS standard_codes
    FROM public.map_test_sessions ts
    JOIN public.map_students st ON st.id = ts.student_id
    WHERE ts.kind='custom'
      AND NOT EXISTS (SELECT 1 FROM public.map_test_assignments ta WHERE ta.session_id = ts.id)
  LOOP
    INSERT INTO public.map_test_definitions
      (family_id, owner_user_id, name, subject, grade, planned_length,
       source_mix, custom_pct, standard_codes, is_template, created_at, updated_at)
    VALUES (r.family_id, NULL, 'Backfilled · '||r.label, r.subject, r.grade,
            r.planned_length, 'vetted_only', NULL, r.standard_codes, false,
            r.started_at, r.started_at)
    RETURNING id INTO v_def;
    INSERT INTO public.map_test_assignments
      (family_id, definition_id, student_id, assigned_by_user_id, assigned_at,
       session_id, status, started_at, completed_at)
    VALUES (r.family_id, v_def, r.student_id, NULL, r.started_at, r.session_id,
            CASE WHEN r.completed_at IS NOT NULL THEN 'completed'::public.map_assignment_status
                 ELSE 'in_progress'::public.map_assignment_status END,
            r.started_at, r.completed_at);
  END LOOP;
END $bf$;
```

- [ ] **Step 2: Commit the migration file (apply happens in Task 5)**

```bash
git add migrations/20260517_map_parent_area_redesign.sql
git commit -m "feat(parent) map_parent_area_redesign migration: definitions, assignments, RLS, views, RPCs, backfill"
```

---

### Task 5: Apply migration and turn the verification scripts green

**Files:**
- No new files. Applies `migrations/20260517_map_parent_area_redesign.sql`.

- [ ] **Step 1: Apply the migration via Supabase MCP**

Use the `mcp__plugin_supabase_supabase__apply_migration` tool with `project_id: "klhzfwxpztaojekwgzcg"`, `name: "map_parent_area_redesign"`, and `query` = the full contents of `migrations/20260517_map_parent_area_redesign.sql`.
Expected: success, no error. If the pre-flight `RAISE EXCEPTION` fires, stop and reconcile the named column before retrying.

- [ ] **Step 2: Run the foundation script — expect PASS**

Run: `node --env-file=.env.local scripts/test-parent-redesign-foundation.mjs`
Expected: every line prints `PASS:`, ends with `Foundation checks complete.`, exit 0. If `§9.9 every pre-existing kind=custom session is backfilled` fails (orphaned rows found), apply Task 4 Step 1b's per-session loop (re-apply migration) and re-run.

- [ ] **Step 3: Run the isolation gate — expect PASS (show-stopper)**

Run: `node --env-file=.env.local scripts/test-parent-redesign-isolation.mjs`
Expected: every line `PASS:`, ends with `All isolation checks passed.`, exit 0.
**If any check fails, stop. Do not proceed to the lib layer or declare the slice done.**

- [ ] **Step 4: Idempotency — re-apply the migration**

Re-run the `apply_migration` call from Step 1 unchanged.
Expected: success, no error (guarded enum/policies, `IF NOT EXISTS`, backfill `NOT EXISTS` guard prevents duplicate definitions/assignments).

- [ ] **Step 5: Re-run both scripts after re-apply — expect PASS**

Run: `node --env-file=.env.local scripts/test-parent-redesign-foundation.mjs && node --env-file=.env.local scripts/test-parent-redesign-isolation.mjs`
Expected: both exit 0. (Idempotent re-apply did not create duplicate backfill rows.)

- [ ] **Step 6: Commit the verification record**

```bash
git commit --allow-empty -m "test(parent) foundation + isolation gates green after map_parent_area_redesign apply"
```

---

### Task 6: `src/lib/parent/types.ts`

**Files:**
- Create: `src/lib/parent/types.ts`

- [ ] **Step 1: Write the types**

```ts
// src/lib/parent/types.ts
// TS shapes for the parent-area views + the assignment status enum.
// Mirrors the migration's view columns 1:1.

export type AssignmentStatus =
  | 'assigned' | 'in_progress' | 'completed' | 'expired' | 'revoked';

export interface ClassroomRosterRow {
  student_id: string;
  family_id: string;
  display_name: string;
  grade: number;
  current_band: string | null;
  questions_this_week: number;
  active_days_this_week: number;
  standards_mastered: number;
  standards_developing: number;
  standards_growth: number;
  active_misconceptions: number;
  pending_assignments: number;
  last_session: {
    id: string;
    subject: string;
    completed_at: string;
    correct_count: number;
    questions_attempted: number | null;
    score: number | null;
  } | null;
}

export interface AssignmentOverviewRow {
  assignment_id: string;
  family_id: string;
  status: AssignmentStatus;
  assigned_at: string;
  due_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  session_id: string | null;
  parent_note: string | null;
  student_id: string;
  student_name: string;
  student_grade: number;
  definition_id: string;
  definition_name: string;
  subject: string;
  definition_grade: number;
  planned_length: number;
  source_mix: 'vetted_only' | 'custom_only' | 'mixed';
  is_template: boolean;
  questions_correct: number | null;
  questions_attempted: number | null;
  score: number | null;
  estimated_rit: number | null;
}

export interface LibraryContentRow {
  content_id: string;
  content_type: 'question' | 'passage';
  source_tab: 'vetted' | 'my_questions' | 'ai_studio';
  source_detail: string | null;
  subject: string;
  grade: number | null;
  rit_band: string | null;
  teks_code: string | null;
  teks_title: string | null;
  status: string | null;
  family_id: string | null;
  created_at: string;
}

export interface CreateDefinitionInput {
  name: string;
  subject: string;
  grade: number;
  planned_length: number;
  source_mix: 'vetted_only' | 'custom_only' | 'mixed';
  custom_pct: number | null;
  difficulty_mix: Record<string, number> | null;
  standard_codes: string[];
  custom_question_ids: string[];
  custom_passage_ids: string[];
  is_template: boolean;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/parent/types.ts
git commit -m "feat(parent) lib types for parent-area views + assignment enum"
```

---

### Task 7: `src/lib/parent/queries.ts`

**Files:**
- Create: `src/lib/parent/queries.ts`

- [ ] **Step 1: Write the query helpers**

```ts
// src/lib/parent/queries.ts
// Typed reads against the parent-area views. RLS scopes rows to the
// signed-in parent's family; callers do not pass family_id.
import { supabase } from '../supabase';
import type {
  ClassroomRosterRow, AssignmentOverviewRow, LibraryContentRow,
} from './types';

export async function getClassroomRoster(): Promise<ClassroomRosterRow[]> {
  const { data, error } = await supabase
    .from('map_v_classroom_roster')
    .select('*')
    .order('display_name');
  if (error) throw error;
  return (data ?? []) as ClassroomRosterRow[];
}

export async function getAssignmentOverview(
  status?: string[],
): Promise<AssignmentOverviewRow[]> {
  let q = supabase.from('map_v_assignment_overview').select('*');
  if (status && status.length > 0) q = q.in('status', status);
  const { data, error } = await q.order('assigned_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AssignmentOverviewRow[];
}

export async function getLibraryContent(
  sourceTab: 'vetted' | 'my_questions' | 'ai_studio',
): Promise<LibraryContentRow[]> {
  const { data, error } = await supabase
    .from('map_v_library_content')
    .select('*')
    .eq('source_tab', sourceTab)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as LibraryContentRow[];
}

export async function getParentV2(familyId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('map_families')
    .select('parent_v2')
    .eq('id', familyId)
    .single();
  if (error) throw error;
  return Boolean(data?.parent_v2);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Smoke test the query layer against the live DB**

Run: `node --env-file=.env.local -e "import('./scripts/_parent-redesign-helpers.mjs').then(async m=>{const ctx=await m.setup();try{const c=await m.signInClient(ctx.A.email,ctx.A.password);const {data,error}=await c.from('map_v_classroom_roster').select('*');console.log('roster rows:',(data||[]).length,'err:',error?.message||'none');}finally{await m.teardown(ctx);}})"`
Expected: prints `roster rows: 2 err: none`, exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/parent/queries.ts
git commit -m "feat(parent) lib query helpers for classroom/assignments/library views"
```

---

### Task 8: `src/lib/parent/mutations.ts`

**Files:**
- Create: `src/lib/parent/mutations.ts`

- [ ] **Step 1: Write the mutation wrappers**

```ts
// src/lib/parent/mutations.ts
// Thin wrappers over the four parent-area RPCs. No business logic — argument
// shaping only. Family scoping is enforced server-side via map_current_family_id().
import { supabase } from '../supabase';
import type { CreateDefinitionInput } from './types';

export async function createTestDefinition(
  input: CreateDefinitionInput,
): Promise<string> {
  const { data, error } = await supabase.rpc('map_create_test_definition', {
    p_name: input.name,
    p_subject: input.subject,
    p_grade: input.grade,
    p_planned_length: input.planned_length,
    p_source_mix: input.source_mix,
    p_custom_pct: input.custom_pct,
    p_difficulty_mix: input.difficulty_mix,
    p_standard_codes: input.standard_codes,
    p_custom_question_ids: input.custom_question_ids,
    p_custom_passage_ids: input.custom_passage_ids,
    p_is_template: input.is_template,
  });
  if (error) throw error;
  return data as string;
}

export async function assignTestDefinition(
  definitionId: string,
  studentIds: string[],
  dueBy: string | null,
  parentNote: string | null,
): Promise<string[]> {
  const { data, error } = await supabase.rpc('map_assign_test_definition', {
    p_definition_id: definitionId,
    p_student_ids: studentIds,
    p_due_by: dueBy,
    p_parent_note: parentNote,
  });
  if (error) throw error;
  return (data ?? []) as string[];
}

export async function revokeAssignment(assignmentId: string): Promise<void> {
  const { error } = await supabase.rpc('map_revoke_assignment', {
    p_assignment_id: assignmentId,
  });
  if (error) throw error;
}

export async function startAssignment(
  assignmentId: string,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase.rpc('map_start_assignment', {
    p_assignment_id: assignmentId,
    p_session_id: sessionId,
  });
  if (error) throw error;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Smoke test the mutation layer (create → assign → revoke)**

Run: `node --env-file=.env.local -e "import('./scripts/_parent-redesign-helpers.mjs').then(async m=>{const ctx=await m.setup();try{const c=await m.signInClient(ctx.A.email,ctx.A.password);const {data:def}=await c.rpc('map_create_test_definition',{p_name:'smoke',p_subject:'math',p_grade:2,p_planned_length:10,p_source_mix:'vetted_only',p_custom_pct:null,p_difficulty_mix:null,p_standard_codes:[],p_custom_question_ids:[],p_custom_passage_ids:[],p_is_template:false});const {data:ids}=await c.rpc('map_assign_test_definition',{p_definition_id:def,p_student_ids:[ctx.A.kids[0].id],p_due_by:null,p_parent_note:null});const {error:re}=await c.rpc('map_revoke_assignment',{p_assignment_id:ids[0]});console.log('def?',!!def,'ids:',ids.length,'revoke err:',re?.message||'none');}finally{await m.teardown(ctx);}})"`
Expected: prints `def? true ids: 1 revoke err: none`, exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/parent/mutations.ts
git commit -m "feat(parent) lib mutation wrappers for the four assignment RPCs"
```

---

### Task 9: Final slice verification

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both succeed (no UI was added, so the build is unaffected; this confirms the new lib files compile into the bundle cleanly).

- [ ] **Step 2: Re-run both gate scripts back-to-back**

Run: `node --env-file=.env.local scripts/test-parent-redesign-foundation.mjs && node --env-file=.env.local scripts/test-parent-redesign-isolation.mjs`
Expected: both exit 0. This is the slice's definition of done.

- [ ] **Step 3: Final commit**

```bash
git commit --allow-empty -m "chore(parent) foundation slice complete: schema+RPCs+backfill+lib, isolation gate green"
```

---

## Self-Review

**Spec coverage:**
- §2 stack adaptation → Task 4 (migration via MCP), Tasks 6–8 (`src/lib/parent`). ✓
- §3 schema reconciliation (no `score`/`soft_deleted_at`/`current_band_override`/`family_id` on sessions; `kind='custom'`) → Task 4 views/backfill use `correct_count`+`question_ids`, drop absent filters, key off `kind='custom'`. ✓
- §4 migration contents (pre-flight, enum, tables, RLS, views, RPCs, flag, backfill) → Task 4 Step 1, all sections present. ✓
- §5 views → Task 4 §6; column derivations match. ✓
- §6 RPCs (4, sibling auth pattern) → Task 4 §7; signatures match the spec. ✓
- §7 faithful backfill (vetted_only, standard_codes from custom_config, keyed by session id, idempotent) → Task 4 §8 + Step 1b fallback. ✓
- §8 lib layer → Tasks 6–8. ✓
- §9 verification gate (§9.1/9.2/9.3/9.6/9.9) → Tasks 2,3,5. §9.6 is the explicit show-stopper in Task 5 Step 3. ✓
- §10 out-of-scope items → none implemented (no UI, no route switch, no kid-home panel). ✓
- §11 risks → auth context mitigated by signing in real users in the harness; pre-flight block guards the version-table column assumption. ✓

**Placeholder scan:** No "TBD/TODO/handle edge cases" — every code step is complete SQL/JS/TS. The Step 1b alternative is fully written, not a stub.

**Type consistency:** RPC param names (`p_name`, `p_subject`, …) identical across Task 4 (definition), Task 8 (`mutations.ts`), and the Task 2/3 test scripts. View column names in Task 4 match `types.ts` (Task 6) and the `queries.ts` selects (Task 7): `current_band`, `pending_assignments`, `last_session`, `questions_correct`, `source_tab`. `map_assignment_status` values consistent everywhere (`assigned|in_progress|completed|expired|revoked`).

No gaps found.
