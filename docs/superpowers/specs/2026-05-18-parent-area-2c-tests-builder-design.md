# Parent Area Redesign — Sub-cycle 2c: Tests + 4-step Builder

**Date:** 2026-05-18
**Status:** Approved design, pre-plan
**Source brief:** Parent Area Redesign — Classroom + Library + Tests + AI Studio (Phase 5) — V1, §5.4 + §6
**Depends on:** Cycle 1 (`map_test_definitions`/`map_test_assignments`, the RPCs `map_create_test_definition`/`map_assign_test_definition`/`map_revoke_assignment`, `map_v_assignment_overview`, lib wrappers + `getAssignmentOverview`/`getLibraryContent`), 2a (`ParentRoot` resolver, `ParentShell`, `?tab=` pattern, the interim CTAs), 2b (`getLibraryContent` filters, Library `Add to test` CTAs). Branch `feat/parent-area-2c`, stacked on `feat/parent-area-2b` (PR #5 → #4 → #3). All 2c UI ships behind `parent_v2`; build-ahead safe.

## 1. Scope

2c is the **Tests surface + the 4-step builder**, as one spec (cohesive — lib, 3 tabs, builder, definition-detail all interlock around the one definition/assignment model). Delivers: `/parent/tests` (3 `?tab=` tabs: Active / Completed / Templates), `/parent/tests/builder` (the 4-step page), `/parent/tests/definitions/:id` (definition detail), three new additive lib queries, the shared `KidPicker`, and rewiring the ~6 interim "Assign/Add to test" CTAs (2a + 2b) to the real builder with URL pre-fill. It also absorbs two items deferred from 2a: the **source-mix badge** and **optimistic revoke** on the Active surface.

**2c explicitly does NOT:** build an edit/duplicate-definition flow, build a soft-delete-definition path (no Cycle-1 RPC), build the kid-home "Assigned tests" panel or wire `map_start_assignment` (explicitly 2d), flip `parent_v2`, change kid-side code, or modify the Cycle-1 schema/views. Legacy `/parent/custom-test` stays as the flag-off path.

## 2. Stack adaptation

Vite + React Router v6 SPA (same as 2a/2b). Brief's Next.js IA → routes inside `ParentRoot`'s flag-on `<Routes>`; tabs via `?tab=` (`useSearchParams`, default `active`, unknown→`active`) — the exact shipped 2a `KidDetail` / 2b `Library` mechanic. The builder is **one scrollable page with four sections (a vertical stepper), NOT a wizard with hidden steps or nested routes** (brief §6 verbatim intent). Existing Tailwind tokens; no design-system change; no React test runner (repo convention: Node DB script + `npm run typecheck && npm run build` + manual QA). Glyph-fidelity rule carries forward (U+2019/U+201C/U+201D/U+2026; the recurring 2a defect class — plan + verification hexdump-check new copy).

## 3. Architecture

`/parent/tests` 3-tab page (mirrors `KidDetail`/`Library`); `/parent/tests/builder` standalone 4-section page; `/parent/tests/definitions/:id` detail. Read tabs consume the assignment-grain `getAssignmentOverview`; Templates + definition-detail need **definition-grain** data (a zero-assignment template is invisible to `map_v_assignment_overview`, which inner-joins assignments) → new lib queries against `map_test_definitions` (RLS `map_td_select` already scopes family + `soft_deleted_at IS NULL`; `authenticated` may select the table directly). The builder's two writes are already wrapped (`createTestDefinition`, `assignTestDefinition`). Each tab/page is a focused component; the builder's submit logic branches on the `?from=` pre-fill.

## 4. Lib changes (additive to Cycle-1 `src/lib/parent/`; zero behavior change for existing callers — the proven stacked-branch pattern)

**4.1 `src/lib/parent/types.ts` — add `TestDefinitionRow`** mirroring `map_test_definitions` columns the UI needs:
```ts
export interface TestDefinitionRow {
  id: string;
  family_id: string;
  name: string;
  subject: string;
  grade: number;
  planned_length: number;
  source_mix: 'vetted_only' | 'custom_only' | 'mixed';
  custom_pct: number | null;
  standard_codes: string[];
  is_template: boolean;
  created_at: string;
  updated_at: string;
}
```

**4.2 `src/lib/parent/queries.ts` — three new functions:**
- `listTestDefinitions(opts?: { templatesOnly?: boolean }): Promise<TestDefinitionRow[]>` — `supabase.from('map_test_definitions').select('*')` (RLS-scoped) `.order('updated_at', { ascending: false })`; when `opts?.templatesOnly` → `.eq('is_template', true)`. The Cycle-1 `map_td_select` policy already enforces `family_id = map_current_family_id() AND soft_deleted_at IS NULL`, so no client family filter.
- `getTestDefinition(id: string): Promise<TestDefinitionRow | null>` — `.eq('id', id).maybeSingle()` (RLS-scoped; cross-family returns null). For the builder `?from=` load + the definition-detail page (works even with zero assignments).
- `getCandidateCount(args: { subject: string; grade: number; standardCodes: string[]; sourceMix: 'vetted_only' | 'custom_only' | 'mixed' }): Promise<number>` — `supabase.from('map_v_library_content').select('*', { count: 'exact', head: true })` with: `source_tab` constrained by `sourceMix` (`vetted_only`→`.eq('source_tab','vetted')`; `custom_only`→`.in('source_tab',['my_questions','ai_studio'])` `.eq('status','published')`; `mixed`→no source_tab constraint, `status` null-or-published for custom — implement as: no `source_tab` filter, and for non-vetted rows only count `status='published'` via `.or('source_tab.eq.vetted,status.eq.published')`), `.eq('subject',subject)`, `.eq('grade',grade)`, and `.in('teks_code', standardCodes)` only when `standardCodes.length > 0`. Returns the PostgREST `count`. Powers the builder live preview.

Definition-detail per-kid rows reuse `getAssignmentOverview()` filtered client-side by `definition_id`.

Does the lib surface look right? (presented for approval as part of the whole design)

## 5. Routing

Inside `ParentRoot`'s flag-on `<Routes>` (siblings of `library`):
```
tests                    → <Tests/>            (?tab= active|completed|templates, default active)
tests/builder            → <TestBuilder/>
tests/definitions/:id    → <DefinitionDetail/>
```
`ParentShell` `navItems`: Tests entry `to: '/parent/custom-test'` → `to: '/parent/tests'`. Classroom/Library/History entries unchanged. Legacy `/parent/custom-test`, `/parent/custom-bank*`, `/parent/connect-ai`, settings routes in `src/App.tsx` untouched (flag-off path; no longer nav-referenced). No redirect for the new `/parent/tests*` routes.

## 6. Tests tabs (`/parent/tests`)

`src/pages/parent/Tests.tsx` (tab router, mirrors `Library.tsx`/`KidDetail.tsx`) + `src/components/parent/tests/{ActiveTab,CompletedTab,TemplatesTab}.tsx`.

- **Active** — `getAssignmentOverview(['assigned','in_progress'])`, grouped by kid (header per `student_name`+grade). Row: `definition_name`, subject, **source-mix badge** (`source_mix` → `Vetted`/`My questions`/`Mixed` pill — the deferred-from-2a item), `assigned_at` relative, `due_by` relative (if set), `parent_note`, status pill, `View definition` → `/parent/tests/definitions/:definition_id`, `Revoke` button only when `status==='assigned'` → `revokeAssignment(assignment_id)` with **optimistic removal** then refetch (the other deferred-from-2a item; on error, restore + show message). A definition assigned to N kids appears once per kid (assignment-grain rows).
- **Completed** — `getAssignmentOverview(['completed'])`, grouped by week (Mon-anchored). Row: kid name+grade, `definition_name`, `completed_at`, `score`/`estimated_rit`, source-mix badge. Row click → `/parent/tests/definitions/:definition_id` (definition + this kid's result). Full kid-facing results-screen reuse is best-effort: if the existing `/test/:id/results` is trivially reachable by `session_id` it links there; otherwise the definition-detail per-kid card is the completion view (documented, not silent).
- **Templates** — `listTestDefinitions({ templatesOnly: true })`. Card per definition: `name`, summary line (`subject` · `grade` · `planned_length` · `source_mix` · `standard_codes.length` standards), completed-count = client aggregate over `getAssignmentOverview()` filtered to that `definition_id` with `status==='completed'` (and total). Actions: `Assign to kids` → `/parent/tests/builder?from=<id>`. `Edit definition`, `Duplicate`, `Archive` → **deferred** (see §8), not rendered.

## 7. Definition detail (`/parent/tests/definitions/:id`)

`src/pages/parent/DefinitionDetail.tsx`. `getTestDefinition(id)` (works with zero assignments) + `getAssignmentOverview()` filtered to `definition_id===id`. Header: name, subject/grade/length/source-mix, `is_template` pill. Per-kid list: each assignment's `student_name`+grade, status pill, completion (`score`/`estimated_rit`/`completed_at`) when completed. `Assign to kids` → `/parent/tests/builder?from=<id>`. Unknown/foreign `:id` (RLS → null) → "not found in your tests" + link back to `/parent/tests` (mirrors 2a `KidDetail` not-found).

## 8. The 4-step builder (`/parent/tests/builder`)

`src/pages/parent/TestBuilder.tsx` + `src/components/parent/tests/{KidPicker,CandidatePreview,SourceMixSlider,StandardsAutocomplete}.tsx`. `KidPicker` is shared, prop `mode: 'single' | 'multi'`. One page, four scrollable sections (revisitable; not a wizard, no hidden steps, no nested routes).

- **Step 1 Content** — subject (radio), grade (number; default = avg of selected kids or pre-fill), source-mix (radio `vetted_only`/`custom_only`/`mixed`; `mixed` reveals a `<SourceMixSlider>` custom-% default 30), standards (`<StandardsAutocomplete multi>`; empty = any), length (slider 5–50 default 25), difficulty-mix (optional collapsible easy/medium/hard %). Live `<CandidatePreview>` → debounced `getCandidateCount({subject,grade,standardCodes,sourceMix})` showing `~N candidates`; warn `Tight question pool` when `N < length × 1.5`.
- **Step 2 Kids** — `<KidPicker mode='multi'>` over `getClassroomRoster()`; selected chips; per-kid warning chip when `|kid.grade − step1.grade| ≥ 2` ("Grade X test, <kid> is in Grade Y — sure?") — **warns, never blocks** (brief §6). `Select all`. `Assign` disabled when zero selected.
- **Step 3 Schedule (optional)** — `due_by` date (blank = no deadline), `parent_note` text (≤500 chars — the `map_ta_note_len` CHECK).
- **Step 4 Review & assign** — summary card; `Save as template` toggle (default off). **Submit logic (the decided rule):**
  - **From-template** (`?from=<defId>` present): `getTestDefinition(defId)` pre-seeds Step 1 **read-only/disabled** (the definition is reused, not re-authored); `Assign now` calls **only** `assignTestDefinition(defId, studentIds, dueBy, parentNote)` — NO new definition row (brief §3.1 "definitions reusable across N assignments"; prevents template bloat; keeps per-template completed-count coherent).
  - **Fresh** (no `?from=`): `Assign now` → `createTestDefinition(input)` then `assignTestDefinition(newId, studentIds, dueBy, parentNote)`.
  - `Save as draft` (template, no kids): `createTestDefinition({ ...input, is_template:true })`, no assign → redirect `/parent/tests?tab=templates`.
  - `Assign now` success → toast "Assigned to N kids" → redirect `/parent/tests?tab=active`.
- **Pre-fill — URL query params only (the decided contract; copyable, the 2a/2b hard rule):** `?from=<defId>` (template/definition reuse → assign-only), `?kid=<student_id>` (Step 2 pre-select), `?subject=&grade=&standards=a,b` (Step 1 seed; Growth "Build a boost test" passes the misconception's `related_teks`). **There is no `?content=` parameter.** Library "Add to test" (per-item and bulk) derives `?subject=` (only when the selection has exactly one distinct subject) and `?standards=<distinct teks_code csv>` from the selected vetted rows and navigates to `/parent/tests/builder` with those params; TestBuilder seeds Step 1 from `?subject=`/`?standards=` (raw per-question composition remains out of scope/deferred to the composer).

## 9. Rewire the 6 interim CTAs (centralized edits; all currently `navigate('/parent/custom-test')`)

- `src/components/parent/classroom/KidRosterCard.tsx` per-kid `+` → `/parent/tests/builder?kid=<row.student_id>`
- `src/components/parent/classroom/ClassroomQuickActions.tsx` "Build test for multiple kids" → `/parent/tests/builder`; "Open content library" already → `/parent/custom-bank` (2b owns Library nav; leave unless it should be `/parent/library` — update to `/parent/library` for consistency since 2b shipped it)
- `src/pages/parent/KidDetail.tsx` header "Assign a test" → `/parent/tests/builder?kid=<:id>`; Growth "Build a boost test for this" (if present) → `/parent/tests/builder?kid=<:id>&subject=<subject>&standards=<related_teks csv>`
- `src/components/parent/library/VettedTab.tsx` per-item "Add to test" → derives `?subject=` (single distinct subject) and `?standards=<distinct teks_codes csv>` from that one row via `seedQuery([r])` and navigates to `/parent/tests/builder`; bulk "Add N to test" → same derivation over all selected rows via `seedQuery(selRows)`; there is no `?content=` parameter
Legacy `/parent/custom-test` remains reachable by URL (flag-off path) but is no longer referenced by any new-shell CTA.

## 10. Verification

`scripts/test-parent-2c-data.mjs` (reuses Cycle-1 `_parent-redesign-helpers.mjs`). Signed-in family A asserts:
1. `createTestDefinition({is_template:true,...})` → `listTestDefinitions({templatesOnly:true})` returns it; a **zero-assignment template** IS returned by `listTestDefinitions` but does NOT appear in `getAssignmentOverview()` (the gap that motivated the new query).
2. `getTestDefinition(id)` returns the row; family B's signed-in client `getTestDefinition(<A's id>)` → null (RLS isolation); `listTestDefinitions` for B excludes A's.
3. From-template assign: create a template, capture `count(map_test_definitions)` for the family, run the from-template path = `assignTestDefinition(templateId,[kid],…)` only, assert family `map_test_definitions` count unchanged AND a new `map_test_assignments` row exists referencing `templateId`. Fresh path: `createTestDefinition` then `assignTestDefinition` → definition count +1.
4. `getCandidateCount({subject:'math',grade:3,standardCodes:[],sourceMix:'vetted_only'})` returns a number ≥ 0 and `> ` the same call with a non-existent `standardCodes:['ZZ.9Z']` (filter actually narrows server-side).
5. Cross-family: all three new queries return only the caller-family's data.

Plus `npm run typecheck && npm run build` (both 0) and a manual-QA checklist: flag-off `/parent` legacy untouched; flag-on `/parent/tests` 3 tabs; Active source-mix badge + optimistic revoke (assigned only); Templates lists a 0-assignment template; builder 4 sections; from-template Step 1 read-only + assign-only (no new definition); grade-gap warns not blocks; CandidatePreview live count + tight-pool warning; all 6 CTAs land in the builder pre-filled; copyable `?tab=`/`?from=`/`?kid=` URLs; `/parent/tests/definitions/:id` shows def + per-kid; foreign id → not-found. Exit: data script green, typecheck+build green, checklist passes.

## 11. Deferrals (documented, not silent — the §9 discipline from 2b)

- **Edit-definition / Duplicate** — no Cycle-1 revise/clone-definition RPC; re-authoring an existing definition is out of 2c lean scope (parallel to the Library Edit deferral). Templates cards expose only `Assign to kids`.
- **Archive-definition** — Cycle 1 has `map_soft_delete_custom_*` (questions/passages) but **no `map_soft_delete_test_definition`**; soft-deleting a definition would need a new RPC (schema/RPC change = out of 2c's no-schema scope). Deferred; documented. (Non-template one-offs are auto-archived server-side per brief §3.1's 90-day rule — not a 2c UI concern.)
- **Kid-home "Assigned tests" panel + `map_start_assignment` wiring** — explicitly 2d.
- **Full kid results-screen reuse on a Completed row** — best-effort link if `session_id`→`/test/:id/results` is trivially reachable; else the definition-detail per-kid card is the completion view.
- **Raw per-question composition** — Library "Add to test" derives `?subject=`/`?standards=` from the selection's distinct subjects/TEKS codes and navigates to the builder; there is no `?content=` parameter. True per-question hand-picked test composition (beyond the standard-based sampler the RPC uses) is composer scope, not 2c.

## 12. Risks / open assumptions

- Editing Cycle-1 `queries.ts`/`types.ts` again on the stacked branch — additive only, zero existing-caller impact (proven across 2a/2b).
- The `getCandidateCount` `mixed` source filter (`.or('source_tab.eq.vetted,status.eq.published')`) — the plan's first step re-confirms `map_v_library_content` exposes `source_tab`/`status`/`subject`/`grade`/`teks_code` (it does per `LibraryContentRow`) before wiring; the data script empirically validates the count narrows.
- From-template submit branching is the riskiest builder logic — §10.3 asserts "no new definition row when `?from=`" both directions.
- Long pre-fill URLs — capped `?content=` (≤25) with derive-to-standards fallback.
- Glyph fidelity — U+2019/U+201C/U+201D/U+2026 rule into the plan + hexdump verification on new user-facing copy (recurring class; held in 2b).
- `getAssignmentOverview` has no `definition_id` server filter param — Templates completed-count and definition-detail filter client-side over the family's assignments (acceptable at family scale; a server param is a future optimization, not 2c).
