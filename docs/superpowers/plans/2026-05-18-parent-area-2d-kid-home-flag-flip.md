# Parent Area 2d — Kid-home Assigned panel + start wiring + flag-flip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the flag-gated kid-home "Assigned tests" panel, the `startAssignedTest` compose+link helper, and the `flip-parent-v2.mjs` rollout script — then flip the dev family on (the activation step).

**Architecture:** A `startAssignedTest` helper isolates the load-bearing orchestration (getTestDefinition → resolve standard_codes→ids → `createCustomTest` vetted-bank, or `createSession` adaptive fallback for empty-codes → `startAssignment` link). A thin flag-gated `AssignedTestsPanel` (additive into `Home.tsx`, nothing else in the kid flow changed) consumes it. A service-role `flip-parent-v2.mjs` is the per-family rollout mechanism.

**Tech Stack:** Vite + React 18 + React Router v6 + TypeScript + Tailwind. No new deps, no React test runner (repo convention: Node DB script + `npm run typecheck && npm run build` + manual QA). Reuses `createCustomTest`/`createSession`/`startAssignment`/`getTestDefinition`/`getAssignmentOverview`/`getParentV2` **unchanged**.

**Reference spec:** `docs/superpowers/specs/2026-05-18-parent-area-2d-kid-home-flag-flip-design.md`. Branch: `feat/parent-area-2d` (checked out, stacked on 2c).

**Glyph-fidelity rule (recurring 2a defect class — non-negotiable):** apostrophes/quotes/ellipsis/dots in user-facing copy MUST be Unicode — `’` U+2019, `“`/`”` U+201C/U+201D, `…` U+2026, `·` U+00B7 — never ASCII `'`/`"`/`...`/`*`. Type the literal glyphs exactly as shown.

**Mount-guard convention (since 2a `f724f1b`, applied throughout 2b/2c — bake in from the start):** components fetching in a `useEffect` use `mountedRef` (`useRef(true)` + mount effect true/false) and guard every post-await `setState`/`navigate`.

---

## File Structure

- Create `src/lib/parent/startAssignedTest.ts` — the compose+link orchestration helper.
- Create `src/components/AssignedTestsPanel.tsx` — flag-gated, assigned-only, additive kid-home panel.
- Modify `src/pages/Home.tsx` — 1 import + 1 `<AssignedTestsPanel />` line at a precise anchor (nothing else).
- Create `scripts/flip-parent-v2.mjs` — service-role per-family `parent_v2` flip (reversible).
- Create `scripts/test-parent-2d-data.mjs` — Node data guard (DB-layer contract the helper depends on).

---

### Task 1: `startAssignedTest` orchestration helper

**Files:** Create `src/lib/parent/startAssignedTest.ts`

- [ ] **Step 1: Write the file**

```ts
// src/lib/parent/startAssignedTest.ts
// Compose a kid session from an assignment's definition recipe, then link the
// assignment via map_start_assignment. Vetted-bank fidelity (subject +
// standards + length); empty standard_codes → adaptive fallback. Error policy
// per spec §4.1: composition failure propagates (assignment untouched);
// startAssignment failure post-compose is non-fatal (session is valid
// practice; assignment self-heals — stays 'assigned').
import { supabase } from '../supabase'
import type { Subject } from '../types'
import { createCustomTest } from '../customTest'
import { createSession } from '../sessionBuilder'
import { getTestDefinition } from './queries'
import { startAssignment } from './mutations'
import type { AssignmentOverviewRow } from './types'

export async function startAssignedTest(
  assignment: AssignmentOverviewRow,
  studentId: string,
): Promise<string> {
  const def = await getTestDefinition(assignment.definition_id)
  if (!def) {
    throw new Error('This assigned test is no longer available.')
  }

  let standardIds: string[] = []
  if (def.standard_codes.length > 0) {
    const { data, error } = await supabase
      .from('map_standards')
      .select('id')
      .in('teks_code', def.standard_codes)
      .eq('subject', def.subject)
      .eq('grade', def.grade)
    if (error) throw error
    standardIds = (data ?? []).map((r) => r.id as string)
  }

  let sessionId: string
  if (standardIds.length > 0) {
    const created = await createCustomTest({
      studentId,
      subject: def.subject as Subject,
      standardIds,
      requestedCount: def.planned_length,
    })
    sessionId = created.sessionId
  } else {
    // Definition with no standard_codes = "any standard for the subject/grade".
    sessionId = await createSession(def.subject as Subject, studentId)
  }

  // Link the assignment. If this fails the session is still valid practice;
  // surface non-fatally and still return sessionId — the assignment stays
  // 'assigned' and reappears on the next panel load (self-healing). Bounded,
  // documented residual (spec §4.1 / §5).
  try {
    await startAssignment(assignment.assignment_id, sessionId)
  } catch (e) {
    console.error(
      '[startAssignedTest] startAssignment failed (session still valid):',
      e,
    )
  }

  return sessionId
}
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → exit 0. Imports: `supabase` (`../supabase`), `Subject` (`../types`), `createCustomTest` (`../customTest` — signature `{studentId,subject,standardIds,requestedCount,difficulty?}`→`{sessionId,actualCount,shortfallReason}`), `createSession` (`../sessionBuilder` — `(subject,studentId)`→`Promise<string>`), `getTestDefinition` (`./queries`, 2c — `(id)`→`TestDefinitionRow|null`), `startAssignment` (`./mutations`, Cycle-1 — `(assignmentId,sessionId)`→`Promise<void>`), `AssignmentOverviewRow` (`./types`). `TestDefinitionRow.subject` is `string`; `createCustomTest`/`createSession` want `Subject` — the `as Subject` casts handle it (the definition was authored with a valid subject). If any import path/sig differs, inspect those files; do NOT invent.

- [ ] **Step 3: Commit**

```bash
git add src/lib/parent/startAssignedTest.ts
git commit -m "feat(parent) startAssignedTest: compose session from definition + link via map_start_assignment"
```

---

### Task 2: `AssignedTestsPanel` component

**Files:** Create `src/components/AssignedTestsPanel.tsx`

- [ ] **Step 1: Write the file**

```tsx
// src/components/AssignedTestsPanel.tsx
// Flag-gated, assigned-only, additive kid-home panel. Renders null when
// parent_v2 is off OR the kid has no assigned tests → kid sees today's home
// unchanged. Tap → startAssignedTest → /test/:id. Mount-guarded.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useActiveStudent } from '../lib/activeStudent'
import { getAssignmentOverview, getParentV2 } from '../lib/parent/queries'
import { startAssignedTest } from '../lib/parent/startAssignedTest'
import type { AssignmentOverviewRow } from '../lib/parent/types'

export function AssignedTestsPanel() {
  const { activeStudent, familyId } = useActiveStudent()
  const navigate = useNavigate()
  const mountedRef = useRef(true)
  const [rows, setRows] = useState<AssignmentOverviewRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!activeStudent || !familyId) return
    const sid = activeStudent.id
    void (async () => {
      try {
        const v2 = await getParentV2(familyId)
        if (!mountedRef.current) return
        if (!v2) {
          setRows([])
          return
        }
        const all = await getAssignmentOverview(['assigned'])
        if (!mountedRef.current) return
        setRows(all.filter((r) => r.student_id === sid))
      } catch {
        if (mountedRef.current) setRows([])
      }
    })()
  }, [activeStudent?.id, familyId])

  if (!rows || rows.length === 0) return null

  const onStart = async (row: AssignmentOverviewRow) => {
    const sid = activeStudent?.id
    if (!sid) return
    setBusy(row.assignment_id)
    setError(null)
    try {
      const sessionId = await startAssignedTest(row, sid)
      if (mountedRef.current) navigate(`/test/${sessionId}`)
    } catch (e) {
      if (mountedRef.current) {
        setError((e as Error)?.message ?? 'Could not start this test.')
        setBusy(null)
      }
    }
  }

  return (
    <section className="mb-8 animate-slideUp">
      <p className="mb-2 font-display text-lg uppercase tracking-widest text-smoke">
        Assigned to you
      </p>
      {error && <p className="mb-2 text-sm text-ink/60">{error}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((r) => (
          <button
            key={r.assignment_id}
            type="button"
            disabled={busy === r.assignment_id}
            onClick={() => onStart(r)}
            className="card group flex items-center justify-between gap-4 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-cardHover disabled:opacity-60"
          >
            <div>
              <p className="font-display text-xl">{r.definition_name}</p>
              <p className="text-sm text-ink/60">
                <span className="capitalize">{r.subject}</span>
                {r.due_by
                  ? ` · due ${new Date(r.due_by).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}`
                  : ''}
              </p>
              {r.parent_note && (
                <p className="mt-1 text-xs text-ink/50">“{r.parent_note}”</p>
              )}
            </div>
            <span className="pill group-hover:bg-sun/30">
              {busy === r.assignment_id ? '…' : 'Start'}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → exit 0. `useActiveStudent()` returns `{ activeStudent, familyId, ... }` (existing, used in Home.tsx). `getParentV2(familyId: string)`/`getAssignmentOverview(status?: string[])` from `../lib/parent/queries`; `startAssignedTest` from Task 1; `AssignmentOverviewRow` from `../lib/parent/types`. Tailwind tokens (`card`, `pill`, `bg-sun/30`, `text-smoke`, `text-ink/*`, `animate-slideUp`, `hover:shadow-cardHover`) are existing app classes (Home.tsx uses the same). GLYPHS: `…` U+2026 (busy), `·` U+00B7 (separator), `“`/`”` U+201C/U+201D (parent_note). Type the literal glyphs.

- [ ] **Step 3: Commit**

```bash
git add src/components/AssignedTestsPanel.tsx
git commit -m "feat(parent) AssignedTestsPanel: flag-gated additive kid-home assigned-tests panel"
```

---

### Task 3: Wire the panel into `Home.tsx` (additive — 2 lines)

**Files:** Modify `src/pages/Home.tsx`

- [ ] **Step 1: Add the import.** After the existing line `import { useActiveStudent } from '../lib/activeStudent'` add:
```tsx
import { AssignedTestsPanel } from '../components/AssignedTestsPanel'
```

- [ ] **Step 2: Insert the panel at the exact anchor.** The current render has the hero `</section>` immediately followed by the "Pick up where you left off" block. The exact existing text is:
```tsx
        </p>
      </section>

      {inProgress.length > 0 && (
        <section className="mb-8 animate-slideUp">
          <p className="mb-2 font-display text-lg uppercase tracking-widest text-smoke">
            Pick up where you left off
          </p>
```
Insert `<AssignedTestsPanel />` between the hero `</section>` and the `{inProgress.length > 0 && (` line so it becomes exactly:
```tsx
        </p>
      </section>

      <AssignedTestsPanel />

      {inProgress.length > 0 && (
        <section className="mb-8 animate-slideUp">
          <p className="mb-2 font-display text-lg uppercase tracking-widest text-smoke">
            Pick up where you left off
          </p>
```
Change NOTHING else in `Home.tsx` (no other markup, no logic, no other sections). This is the only kid-flow change in 2d — additive, above the practice CTAs (brief §6 "small addition, NOT a redesign").

- [ ] **Step 3: Typecheck + build** — `npm run typecheck && npm run build` → both exit 0. `git diff src/pages/Home.tsx` must show exactly 2 added lines (1 import + 1 `<AssignedTestsPanel />` with surrounding blank lines) and zero removed/other-changed lines.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Home.tsx
git commit -m "feat(parent) Home: render AssignedTestsPanel above practice CTAs (additive, flag-gated)"
```

---

### Task 4: `flip-parent-v2.mjs` rollout script

**Files:** Create `scripts/flip-parent-v2.mjs`

- [ ] **Step 1: Write the file**

```js
// scripts/flip-parent-v2.mjs
// Per-family parent_v2 rollout flip (the brief's dev→beta→all mechanism).
// Reversible: pass false to roll a family back instantly.
// Run: node --env-file=.env.local scripts/flip-parent-v2.mjs <familyId> <true|false>
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const [familyId, flagArg] = process.argv.slice(2);
if (!familyId || (flagArg !== 'true' && flagArg !== 'false')) {
  console.error(
    'Usage: node --env-file=.env.local scripts/flip-parent-v2.mjs <familyId> <true|false>',
  );
  process.exit(2);
}
const flag = flagArg === 'true';

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: before, error: be } = await admin
  .from('map_families')
  .select('id, parent_v2')
  .eq('id', familyId)
  .single();
if (be || !before) {
  console.error('Family not found:', familyId, be?.message ?? '');
  process.exit(1);
}

const { error: ue } = await admin
  .from('map_families')
  .update({ parent_v2: flag })
  .eq('id', familyId);
if (ue) {
  console.error('Update failed:', ue.message);
  process.exit(1);
}

const { data: after, error: ae } = await admin
  .from('map_families')
  .select('parent_v2')
  .eq('id', familyId)
  .single();
if (ae) {
  console.error('Re-read failed:', ae.message);
  process.exit(1);
}

console.log(`${familyId}: parent_v2 ${before.parent_v2} → ${after.parent_v2}`);
```

- [ ] **Step 2: Smoke-check arg validation (no DB mutation)** — `node --env-file=.env.local scripts/flip-parent-v2.mjs ; echo "exit=$?"` → prints the Usage line, `exit=2` (missing args path; no family touched). Then `node --env-file=.env.local scripts/flip-parent-v2.mjs 00000000-0000-0000-0000-000000000000 true ; echo "exit=$?"` → "Family not found", `exit=1` (no row updated). These confirm the guards without mutating real data.

- [ ] **Step 3: Commit**

```bash
git add scripts/flip-parent-v2.mjs
git commit -m "feat(parent) flip-parent-v2.mjs: reversible per-family parent_v2 rollout script"
```

---

### Task 5: Verification — data guard + build + flip dev family + manual QA

**Files:** Create `scripts/test-parent-2d-data.mjs`

This guard validates the **DB-layer contract `startAssignedTest` depends on** (standard_codes→id resolution, `map_start_assignment` semantics, `parent_v2` flip, cross-family RLS). The full `createCustomTest` composition is proven, unchanged client code (reused by NewTest/CustomTestBuilder) — it is exercised in the manual-QA step, not re-implemented in Node (consistent with how every prior data guard scoped to the DB layer).

- [ ] **Step 1: Write the script**

```js
// scripts/test-parent-2d-data.mjs
// 2d data guard: the DB-layer contract startAssignedTest depends on —
// standard_codes→id resolution, map_start_assignment flips assigned→
// in_progress+session_id (and rejects non-assigned), parent_v2 flip behavior,
// cross-family RLS. The createCustomTest client composition is unchanged
// proven code, exercised in manual QA, not re-implemented here.
// Run: node --env-file=.env.local scripts/test-parent-2d-data.mjs
import { admin, setup, signInClient, teardown, assert } from './_parent-redesign-helpers.mjs';

const ctx = await setup();
try {
  const ca = await signInClient(ctx.A.email, ctx.A.password);

  // A real vetted standard exists for some grade/subject (Grade 2-5 seeded).
  const { data: std, error: se } = await ca
    .from('map_standards')
    .select('teks_code, subject, grade')
    .limit(1)
    .single();
  assert(!se && std?.teks_code, 'a vetted map_standards row exists');

  // standard_codes→id resolution (the exact query startAssignedTest runs).
  const { data: ids, error: re } = await ca
    .from('map_standards')
    .select('id')
    .in('teks_code', [std.teks_code])
    .eq('subject', std.subject)
    .eq('grade', std.grade);
  assert(!re && (ids ?? []).length >= 1, 'standard_codes→id resolution returns the standard');

  // Create a definition with that code + assign to kid A1 (status='assigned').
  const { data: defId } = await ca.rpc('map_create_test_definition', {
    p_name: '2d def', p_subject: std.subject, p_grade: std.grade, p_planned_length: 10,
    p_source_mix: 'vetted_only', p_custom_pct: null, p_difficulty_mix: null,
    p_standard_codes: [std.teks_code], p_custom_question_ids: [], p_custom_passage_ids: [], p_is_template: false,
  });
  const { data: aIds } = await ca.rpc('map_assign_test_definition', {
    p_definition_id: defId, p_student_ids: [ctx.A.kids[0].id], p_due_by: null, p_parent_note: 'after dinner',
  });
  const assignmentId = aIds[0];

  // getTestDefinition returns the recipe the helper reads (standard_codes).
  const { data: def } = await ca.from('map_test_definitions').select('*').eq('id', defId).single();
  assert(def && Array.isArray(def.standard_codes) && def.standard_codes.includes(std.teks_code),
    'getTestDefinition exposes standard_codes for the helper');

  // map_start_assignment flips assigned→in_progress + links a session.
  // (Use the harness ephemeral custom session as the session_id stand-in —
  // the contract under test is the assignment transition, not composition.)
  const { error: sErr } = await ca.rpc('map_start_assignment', {
    p_assignment_id: assignmentId, p_session_id: ctx.customSessionId,
  });
  assert(!sErr, 'map_start_assignment accepts an assigned assignment');
  const { data: a1 } = await admin.from('map_test_assignments')
    .select('status, session_id').eq('id', assignmentId).single();
  assert(a1.status === 'in_progress' && a1.session_id === ctx.customSessionId,
    'assignment is now in_progress with session_id linked');

  // map_start_assignment rejects a non-assigned (now in_progress) assignment —
  // the guard the helper's error policy relies on.
  const { error: sErr2 } = await ca.rpc('map_start_assignment', {
    p_assignment_id: assignmentId, p_session_id: ctx.customSessionId,
  });
  assert(!!sErr2, 'map_start_assignment rejects a non-assigned assignment');

  // Empty standard_codes definition → the helper would take the adaptive
  // fallback; assert getTestDefinition returns [] so the branch is reachable.
  const { data: defEmptyId } = await ca.rpc('map_create_test_definition', {
    p_name: '2d any-standard', p_subject: std.subject, p_grade: std.grade, p_planned_length: 10,
    p_source_mix: 'vetted_only', p_custom_pct: null, p_difficulty_mix: null,
    p_standard_codes: [], p_custom_question_ids: [], p_custom_passage_ids: [], p_is_template: false,
  });
  const { data: defEmpty } = await ca.from('map_test_definitions').select('standard_codes').eq('id', defEmptyId).single();
  assert(Array.isArray(defEmpty.standard_codes) && defEmpty.standard_codes.length === 0,
    'empty-standard_codes definition → helper takes the adaptive fallback branch');

  // parent_v2 flip behavior (what getParentV2 + the panel gate on).
  await admin.from('map_families').update({ parent_v2: true }).eq('id', ctx.A.familyId);
  const { data: f1 } = await ca.from('map_families').select('parent_v2').eq('id', ctx.A.familyId).single();
  assert(f1.parent_v2 === true, 'flip parent_v2 → true reflected (panel would render)');
  await admin.from('map_families').update({ parent_v2: false }).eq('id', ctx.A.familyId);
  const { data: f2 } = await ca.from('map_families').select('parent_v2').eq('id', ctx.A.familyId).single();
  assert(f2.parent_v2 === false, 'flip parent_v2 → false reflected (panel hidden, reversible)');

  // Cross-family: B never sees A's assigned assignment (the boundary the panel consumes).
  const cb = await signInClient(ctx.B.email, ctx.B.password);
  const { data: bAssigns } = await cb.from('map_v_assignment_overview').select('assignment_id');
  assert(!(bAssigns ?? []).some((x) => x.assignment_id === assignmentId),
    'family B never sees family A assigned assignment (RLS)');

  console.log('\n2d data checks complete.');
} finally {
  await teardown(ctx);
}
```

- [ ] **Step 2: Run the data guard** — `node --env-file=.env.local scripts/test-parent-2d-data.mjs ; echo "exit=$?"` → every `PASS:`, ends `2d data checks complete.`, `exit=0`. Cycle-1 migration is live. If a real column/RPC mismatch (NOT infra), report BLOCKED with the exact error + failing assert; do NOT hand-wave. Harness exports `admin,setup,signInClient,teardown,assert`; `ctx.customSessionId` is the harness's seeded session.

- [ ] **Step 3: Full typecheck + build** — `npm run typecheck && npm run build ; echo "exit=$?"` → both exit 0. Paste the vite summary line. Pre-existing chunk-size warnings are not failures.

- [ ] **Step 4: Manual-QA (static analysis — no browser). Report PASS/CONCERN with file:concept evidence:**
  1. Flag-off kid `/home` byte-unchanged: `git diff $(git merge-base HEAD feat/parent-area-2c)..HEAD -- src/pages/Home.tsx` shows ONLY +import +`<AssignedTestsPanel />` (2 added lines, 0 removed); `AssignedTestsPanel` returns `null` when `getParentV2`→false (so the kid sees today's home exactly).
  2. `startAssignedTest`: getTestDefinition→null throws (assignment untouched); standard_codes resolved with `.eq('subject').eq('grade')`; `standardIds.length>0`→`createCustomTest({...,requestedCount:planned_length})` else `createSession`; `startAssignment` in a try/catch that logs + still returns sessionId (the §4.1 residual policy).
  3. `AssignedTestsPanel`: gated on `getParentV2(familyId)` AND `getAssignmentOverview(['assigned'])` filtered `student_id===activeStudent.id`; renders `null` when no rows/flag-off; mount-guarded (every post-await setState/navigate); tap→startAssignedTest→`/test/:id`; `status='expired'` never shown (only `['assigned']` queried).
  4. `Home.tsx`: exactly the 2 additive lines at the spec'd anchor; no other section/logic changed.
  5. `flip-parent-v2.mjs`: arg-validates (`exit=2` on missing/bad), family-not-found `exit=1`, updates `map_families.parent_v2`, prints before→after, reversible.
  6. Glyph hexdump: `AssignedTestsPanel` busy `'…'` = U+2026 (`e2 80 a6`), ` · due` = U+00B7 (`c2 b7`), `“{r.parent_note}”` = U+201C/U+201D (`e2 80 9c`/`9d`). Zero ASCII `'`/`"`/`...`/`*` in the panel's user copy.
  7. Scope: `git diff --stat <base>..HEAD` = exactly the 5 expected files (2 docs already committed in spec; this slice: startAssignedTest.ts, AssignedTestsPanel.tsx, Home.tsx, flip-parent-v2.mjs, test-parent-2d-data.mjs). NO Cycle-1/2a/2b/2c file changes beyond Home.tsx's 2 lines, NO schema, NO runner/composer change.

- [ ] **Step 5: Flip the dev/test family on (the activation step).** Identify the dev/test family id: `node --env-file=.env.local -e "import('@supabase/supabase-js').then(async({createClient})=>{const a=createClient(process.env.SUPABASE_URL??process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});const {data}=await a.from('map_families').select('id,family_name,parent_v2').order('created_at').limit(20);console.log(JSON.stringify(data,null,2));})"`. The dev/test family is the real (non-`pr-test-*`) family the user develops against (there is exactly one non-ephemeral family in this single-family dev project; if ambiguous, STOP and ask the user which family id to flip — do NOT guess). Then: `node --env-file=.env.local scripts/flip-parent-v2.mjs <devFamilyId> true` → prints `… parent_v2 false → true`. This activates the 2a–2c parent surfaces + the 2d kid panel for that family. (Reversible any time with `… false`.)

- [ ] **Step 6: Final commit**

```bash
git add scripts/test-parent-2d-data.mjs
git commit -m "test(parent) 2d data guard; kid-home/start/flag-flip slice complete + dev family activated (data+build green, QA verified)"
```

---

## Self-Review

**Spec coverage:**
- §4.1 `startAssignedTest` (getTestDefinition→codes→ids→createCustomTest|createSession→startAssignment; error policy) → Task 1. ✓
- §4.2 `AssignedTestsPanel` (flag-gated via getParentV2, assigned-only filtered to active kid, additive, mount-guarded, due_by soft, expired not shown) → Task 2; Home wiring (additive 2 lines, anchor) → Task 3. ✓
- §4.3 `flip-parent-v2.mjs` (service-role, reversible, before→after) → Task 4; dev-family activation → Task 5 Step 5. ✓
- §5 deferrals honored: expired not shown (Task 2 queries `['assigned']` only); source_mix custom/mixed not handled (Task 1 vetted-bank only); start-after-compose residual (Task 1 try/catch logs + returns); no flip UI (Task 4 is the script). ✓
- §6 verification (DB-layer contract: resolution query, map_start_assignment flip + non-assigned reject, empty-codes branch reachable, parent_v2 flip both ways, cross-family RLS) → Task 5; the createCustomTest composition explicitly scoped to manual QA (unchanged proven code) — stated, not a silent gap. ✓
- §7 risks: kid-mode family/auth (Task 2 uses useActiveStudent familyId, same as Home), empty-codes adaptive fallback (Task 1 branch + Task 5 assert), compose-then-start residual (Task 1 documented), flip reversibility (Task 4 false path), glyph fidelity (header + Task 5.6 hexdump), grade-scoped resolution (Task 1 `.eq('grade')`). ✓

No spec requirement without a task.

**Placeholder scan:** No TBD/TODO/"handle errors" — every step has complete code. The deferrals (expired, source_mix, residual) are explicit non-actions with rationale in code comments + spec §5, not placeholders. Task 5 Step 5 names the exact disambiguation rule (one non-ephemeral family; STOP+ask if ambiguous) rather than guessing.

**Type consistency:** `startAssignedTest(assignment: AssignmentOverviewRow, studentId: string): Promise<string>` defined Task 1, consumed identically Task 2 (`startAssignedTest(row, sid)`). `createCustomTest({studentId,subject,standardIds,requestedCount})`→`{sessionId}` and `createSession(subject,studentId)`→`string` and `startAssignment(assignmentId,sessionId)` and `getTestDefinition(id)`→`TestDefinitionRow|null` match the verified Cycle-1/2c/customTest/sessionBuilder signatures. `AssignmentOverviewRow` fields used (`assignment_id, definition_id, definition_name, subject, due_by, parent_note, student_id, status`) match the Cycle-1 type. `useActiveStudent()` `{activeStudent, familyId}` matches existing usage in Home.tsx. `getParentV2(familyId:string)`/`getAssignmentOverview(status?:string[])` match Cycle-1 queries. No mismatches.
