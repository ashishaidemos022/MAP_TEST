# Parent Area Redesign — Sub-cycle 2d: Kid-home Assigned panel + map_start_assignment wiring + flag-flip rollout

**Date:** 2026-05-18
**Status:** Approved design, pre-plan
**Source brief:** Parent Area Redesign — Classroom + Library + Tests + AI Studio (Phase 5) — V1, §6 + §7
**Depends on:** Cycle 1 (`map_start_assignment` RPC + `startAssignment` wrapper, `map_v_assignment_overview`, `getAssignmentOverview`, `parent_v2` column, `getParentV2`), 2c (`getTestDefinition`), the existing kid-side composers (`createCustomTest`/`createSession`). Branch `feat/parent-area-2d`, stacked on `feat/parent-area-2c` (PR #6 → #5 → #4 → #3). This is the final sub-cycle and the **only one that touches kid-side code and actually flips the redesign on**.

## 1. Scope

2d, as one cohesive spec (the final decomposition leaf): (a) a flag-gated **"Assigned tests" panel** added to the kid home (`src/pages/Home.tsx`), additive only; (b) a **`startAssignedTest` orchestration helper** that composes a session from an assignment's definition recipe and links it via `map_start_assignment`; (c) a **`flip-parent-v2.mjs` rollout script** + flipping the dev/test family on (the activation step — everything built across 2a–2c goes live for that family).

**2d explicitly does NOT:** redesign the kid home or test runner (the panel is a small addition above the existing CTAs; everything else in `Home.tsx` is untouched), change the Cycle-1 schema/RPCs, build a parent-side flip UI, handle `source_mix` custom/mixed in the composed kid session, or handle `expired`/due-passed assignments (all documented deferrals — §5). No change to `/test/:id` runner, `/test/new`, `sessionBuilder.ts`, or `customTest.ts` (consumed, not modified).

## 2. Stack adaptation

Vite + React Router v6 SPA. Kid mode = the active student within the family's Supabase auth session (the kid is not a separate auth principal — `useActiveStudent()` resolves `familyId` via `map_current_family_id()`; `getAssignmentOverview`/`getParentV2` are family-RLS-scoped and work identically in kid mode, proven across 2a–2c). No React test runner (repo convention: Node DB script + `npm run typecheck && npm run build` + manual QA). Glyph-fidelity rule carries forward (U+2019/U+201C/U+201D/U+2026; hexdump-checked in the plan).

## 3. Architecture

A single orchestration helper isolates the load-bearing compose+link logic (testable via the Node-script convention); the kid-home panel is a thin additive consumer; the flag-flip is an out-of-band service-role script. Nothing in the kid runner/composer is modified — `createCustomTest`/`createSession`/`startAssignment`/`getTestDefinition`/`getAssignmentOverview`/`getParentV2` are all reused as-is.

## 4. Components

### 4.1 `src/lib/parent/startAssignedTest.ts`

```ts
export async function startAssignedTest(
  assignment: AssignmentOverviewRow,
  studentId: string,
): Promise<string>   // returns sessionId
```

Logic:
1. `def = await getTestDefinition(assignment.definition_id)` (2c lib). If `def == null` → throw (RLS/not-found; caller surfaces it, assignment untouched).
2. Resolve standard codes → ids:
   `supabase.from('map_standards').select('id').in('teks_code', def.standard_codes).eq('subject', def.subject).eq('grade', def.grade)` → `standardIds = rows.map(r => r.id)`. (The exact lookup pattern already used in `CustomTestBuilder.tsx`.) Skip the query entirely when `def.standard_codes.length === 0`.
3. Compose the session (vetted bank — the decided fidelity):
   - `standardIds.length > 0` → `const { sessionId } = await createCustomTest({ studentId, subject: def.subject, standardIds, requestedCount: def.planned_length })`. (`createCustomTest` validates subject, pulls vetted `map_questions` by standard_id, inserts `map_test_sessions` `status:'in_progress'`/`kind:'custom'`, returns `{ sessionId }`. `planned_length` is constrained 5–50 by the Cycle-1 `map_td_planned_length_check`, within `createCustomTest`'s [CUSTOM_MIN_COUNT, CUSTOM_MAX_COUNT] = [5,50] range.)
   - `standardIds.length === 0` ("any standard for the subject/grade" definition) → `sessionId = await createSession(def.subject, studentId)` (existing adaptive composer; `kind:'test'`). Documented fallback.
4. `await startAssignment(assignment.assignment_id, sessionId)` (Cycle-1 wrapper → `map_start_assignment`, flips `assigned`→`in_progress`, sets `session_id`).
5. `return sessionId`.

**Error policy (explicit):**
- Composition failure (step 3 throws — `NoQuestionsError`, `CrossSubjectError`, etc.): propagate; **do not** call `startAssignment`. Assignment stays `assigned` (kid can retry; parent still sees it). The caller (panel) shows the message.
- `startAssignment` failure (step 4 throws *after* a session exists): the session is a valid, playable practice session. Log non-fatally and still `return sessionId` so the caller navigates into it. The assignment remains `assigned` and reappears on next panel load (self-healing). This is a **bounded, documented residual** — no data loss, kid practice only; an idempotency/relink refinement is out of 2d's no-schema scope.

### 4.2 `src/components/AssignedTestsPanel.tsx` (rendered in `src/pages/Home.tsx`)

- **Additive placement only:** rendered above the existing practice CTAs in `Home.tsx`. No other part of `Home.tsx` changes (brief §6: "a small addition to the existing kid home page, NOT a redesign").
- **Gating:** on mount, `getParentV2(useActiveStudent().familyId)` AND `getAssignmentOverview(['assigned'])` filtered client-side to `student_id === activeStudent.id`. Render the panel **only** when `parent_v2 === true` AND there is ≥1 such row. When the flag is off, or no assigned tests, the component renders `null` — the kid sees today's `/home` byte-for-byte unchanged.
- **Each row:** definition name, subject, `due_by` rendered as a soft "Due Fri, May 22" signal (never gates, never disables — brief §3.2), parent note if present. Tap → busy state → `startAssignedTest(row, activeStudent.id)` → `navigate('/test/' + sessionId)`. On error, show a kid-friendly inline message; the test stays in the panel.
- Mount-guarded (`mountedRef`, the established convention — every post-await `setState`/`navigate` guarded). Glyph-correct copy.
- `status='expired'` rows are **not shown** (documented deferral — §5).

### 4.3 `scripts/flip-parent-v2.mjs`

Service-role Node script (repo convention): `node --env-file=.env.local scripts/flip-parent-v2.mjs <familyId> <true|false>`. Validates args, reads current `map_families.parent_v2`, `update`s it, prints `<familyId>: <before> → <after>`. Reversible (`false` = instant rollback). 2d **runs it once to flip the dev/test family to `true`** — the activation step that makes the 2a–2c parent surfaces + this kid panel live for that family. No parent-facing flip UI (out of scope; the script is the rollout mechanism for the brief's dev→beta→all sequence).

## 5. Deferrals (documented, not silent — the §9/§11 discipline)

- **Expired / due-passed assignments** (brief §3.2 "you can still try it"): not shown in the panel; `map_start_assignment` only accepts `status='assigned'` and relaxing it is a Cycle-1 RPC/schema change outside 2d's no-schema scope. `due_by` remains a soft on-card signal. Deferred with rationale.
- **`source_mix` custom/mixed in the kid session:** the composed session is vetted-bank only (the decided fidelity); blending family custom content per `custom_pct` is deferred (net-new composition logic, not in the legacy composer).
- **start-after-session residual:** if `startAssignment` fails post-compose, the assignment self-heals (stays `assigned`); a relink/idempotency refinement is deferred (no-schema scope).
- **No parent-side flip UI:** the script is the mechanism (consistent with the earlier specs' "no UI for flipping").
- **Cycle-1 carry-overs** already documented in 2c (non-idempotent `createTestDefinition`; Edit/Duplicate/Archive-definition) — unchanged, still deferred.

## 6. Verification

`scripts/test-parent-2d-data.mjs` (reuses the Cycle-1 `_parent-redesign-helpers.mjs` harness). Signed-in family A:
1. Create a definition with non-empty `standard_codes` (use TEKS codes that exist in the vetted bank for some seeded grade/subject) + `map_assign_test_definition` to kid A1 (`status='assigned'`). Run the orchestration core (resolve codes→ids; `createCustomTest`; `startAssignment`). Assert: a `map_test_sessions` row exists for A1 with non-empty `question_ids` and `kind='custom'`; the assignment row is now `status='in_progress'` with `session_id` = that session.
2. Empty-`standard_codes` definition assigned to A2 → orchestration takes the `createSession` adaptive fallback → a `map_test_sessions` row (`kind='test'`) exists; `startAssignment` flips it to `in_progress`+linked.
3. `getTestDefinition` of a foreign family's definition (family B client) → null (RLS) — the helper would throw, never composing — re-asserts the boundary the helper trusts.
4. The data script asserts the **flip behavior** directly (not by shelling out): `update map_families set parent_v2=true where id=<A.familyId>` then `getParentV2(A.familyId)` returns true; set it back to `false` then `getParentV2` returns false (reversible). The `flip-parent-v2.mjs` script *itself* is exercised in the manual-QA checklist (run it against the dev family), not the data script.
5. Cross-family: family B's `getAssignmentOverview(['assigned'])` never returns A's assignment (RLS — already proven; re-asserted at the boundary the panel consumes).

Plus `npm run typecheck && npm run build` (both 0) and a manual-QA checklist: flag-off kid `/home` byte-unchanged (panel renders null); flip dev family on → kid with an assigned test sees the panel above the CTAs; tap → assignment `in_progress` + lands in `/test/:id` runner; finishing the session removes it from the panel and it shows under parent Tests→Completed; expired assignment not shown; `due_by` shown as soft text, never blocks; flipping the family back to `false` restores the old kid home and legacy parent path. Exit: data script green, typecheck+build green, checklist passes.

## 7. Risks / open assumptions

- **Kid-mode family/auth:** relies on `useActiveStudent().familyId` + family-RLS for `getParentV2`/`getAssignmentOverview` in kid mode — proven across 2a–2c (kid = active student within the family's auth, not a separate principal). The plan's first step re-confirms `Home.tsx` has `useActiveStudent` and a clean additive insertion point.
- **Vetted-bank composition match:** assignments built in 2a–2c default to `vetted_only` and the composer pulls vetted `map_questions` by standard_id; a definition whose standards have no vetted questions at the kid's grade → `createCustomTest` throws `NoQuestionsError` → surfaced to the kid, assignment stays assigned (acceptable; the parent built an empty-pool test — same failure mode as the legacy custom-test flow).
- **Compose-then-start ordering residual:** documented in §4.1; bounded (valid practice session; assignment self-heals).
- **Flipping the dev family makes 2a–2c live for it:** intended — this is the activation cycle; the script's `false` path is the instant, tested rollback.
- **Glyph fidelity:** the recurring class; rule + hexdump verification carry into the plan and the panel's copy.
- **`standard_codes`→id resolution with grade:** `map_standards` rows are grade-scoped; the resolution filters `eq('subject')` AND `eq('grade', def.grade)` so a code that exists at multiple grades resolves to the definition's grade only (matches how the parent built it). If a definition's code/grade pair has no `map_standards` row, `standardIds` is empty → adaptive fallback (subject-level) rather than an error — acceptable, documented.
