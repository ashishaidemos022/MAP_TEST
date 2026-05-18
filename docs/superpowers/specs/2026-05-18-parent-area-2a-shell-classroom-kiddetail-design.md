# Parent Area Redesign — Sub-cycle 2a: Shell + Classroom + Kid detail

**Date:** 2026-05-18
**Status:** Approved design, pre-plan
**Source brief:** Parent Area Redesign — Classroom + Library + Tests + AI Studio (Phase 5) — V1
**Depends on:** Cycle 1 foundation (`feat/parent-area-redesign`, PR #3) — `map_test_definitions`/`map_test_assignments`, the three `security_invoker` views, the four RPCs, the `parent_v2` column, and `src/lib/parent/{types,queries,mutations}.ts`. This sub-cycle branches from `feat/parent-area-2a` (stacked on Cycle 1) and can proceed in parallel with #3's review since all 2a UI ships *behind* the `parent_v2` flag.

## 1. Scope

Cycle 2 (the UI surfaces) is decomposed into 2a/2b/2c/2d. **This spec is 2a only:** the `parent_v2` route resolver, the new parent shell, the `/parent` Classroom landing, and `/parent/kids/:id` Kid detail with its four tabs. 2b (Library), 2c (Tests + builder), 2d (kid-home panel + flag-flip rollout) are separate later cycles, each its own spec→plan→implement.

**2a explicitly does NOT:** build the Library 3-tab/AI-Studio surface, the Tests 3-tab surface, the 4-step builder, `KidPicker`, the kid-home "Assigned tests" panel, wire `map_start_assignment` into session creation, flip `parent_v2` on for real families, or append to `CLAUDE.md`. 2a ships the new surfaces behind the flag; turning the flag on for users is 2d.

## 2. Stack adaptation

The brief is written for Next.js App Router. This repo is **Vite + React Router v6 SPA** (`src/App.tsx` flat `<Routes>`, `src/pages/parent/*`, `src/components/`). The brief's `app/parent/**/page.tsx` tree and `?tab=` *and* nested-segment route forms are re-expressed as: a single `/parent/*` resolver route, a shell layout with React-Router child routes, and **query-param tabs** (`/parent/kids/:id?tab=sessions`, `useSearchParams`, default `mastery`) — the decided form. Existing parent styling conventions (Tailwind, the app's `font-display`, `btn-secondary`/`btn-ghost`, `text-smoke` tokens seen in `Parent.tsx`) are followed; no design-system change, no component library introduced.

## 3. Architecture — resolver + shell, legacy path provably untouched

`src/pages/parent/ParentRoot.tsx` mounts at `/parent/*` (replaces the current flat `/parent` element in `src/App.tsx`, still wrapped in `RequireParentPin`). It:

1. Reads `familyId` from the already-mounted `useActiveStudent()` context (`src/lib/activeStudent.tsx` already resolves it via `supabase.rpc('map_current_family_id')`).
2. Calls `getParentV2(familyId)` (Cycle-1 `src/lib/parent/queries.ts`).
3. Branches:
   - `familyId` null / still loading → existing app loading affordance (spinner consistent with `ActiveStudentProvider`'s `loading`).
   - flag `false` / null / no family → render the **existing `<Parent/>`** component unchanged (today's stacked `ParentSettings` + `CustomTestList` + `ParentDashboard`). This path's output must be byte-identical to current `main`.
   - flag `true` → render `<ParentShell>` (new) with React-Router child routes.

Flag resolution lives in exactly this one component. The legacy experience is reached by rendering the untouched `<Parent/>`; the only existing-code change that touches v1 is the §4 extraction, which is explicitly designed to keep v1 output identical.

## 4. Component extraction (the only existing-code surgery)

`src/pages/parent/ParentDashboard.tsx` (414 lines) couples three concerns and is scoped via `useActiveStudent`. The brief requires these split across Kid-detail tabs scoped by URL `:id`, **without redesigning the heatmap**. Approach: extract three components into `src/components/parent/`, copying internals/markup/styles verbatim, parametrizing only the student id:

- `MasteryHeatmap.tsx` — `props: { studentId: string }`. The current heatmap grid + `SubjectToggle` + `Legend` + `Swatch` + `statusTone`, fetching mastery rows for `studentId` (replaces the implicit `activeStudent`). Visual output unchanged.
- `GrowthAreas.tsx` — `props: { studentId: string }`. The current misconception `SignalCard` list, fetched for `studentId`.
- `KidWeekSessions.tsx` — `props: { studentId: string }`. The current week-stats + recent-sessions block (`computeWeekStats`, `dateKey`, `Stat`), fetched for `studentId`; also exposes the completed-sessions list used by the Sessions tab.

`ParentDashboard.tsx` is then rewritten as a thin composition of these three fed `useActiveStudent().activeStudent.id`, so the flag-off path renders the same blocks with the same data and markup as today. Helper functions currently private to `ParentDashboard` move with the component that uses them. No Supabase view/query/schema changes — these components read exactly the tables `ParentDashboard` reads today (`map_v_mastery_by_standard`, `map_misconception_signals`, `map_attempts`, etc.); only the `student_id` filter becomes a prop. The Cycle-1 `map_v_classroom_roster`/`map_v_assignment_overview` views are consumed only by the new Classroom/Assignments surfaces, not by these extracted pieces.

## 5. Classroom (`/parent`, flag on)

- `src/pages/parent/Classroom.tsx` + `src/components/parent/classroom/{KidRosterCard,CrossKidStrip,ClassroomQuickActions}.tsx`.
- Data: Cycle-1 `getClassroomRoster()` (one row per kid, RLS-scoped to the family by the `security_invoker` view).
- Layout per brief §5.1: page title overline `PARENT VIEW` + `Your classroom`; **CrossKidStrip** = three metric tiles summing roster columns (`questions_this_week`, `active_days_this_week`, sum of `active_misconceptions` with warning color when > 0); **KidRosterCard** grid (3-col desktop / responsive) — avatar+name+`Grade N`, level indicator, "needs attention" pill when `active_misconceptions > 0` OR (`questions_this_week = 0` AND `active_days_this_week = 0`), this-week stat block (or muted "No practice this week"), 4-segment mastery distribution bar (`standards_mastered/developing/growth` + unseen) with counts, up-to-3 active-misconception names, last-session footnote from `last_session` json; `Open dashboard` (→ `/parent/kids/:id`) + a per-kid `+` (assign-a-test); `+ Add a kid` ghost card; **ClassroomQuickActions** strip.
- Empty state (zero kids): single `+ Add your first kid` CTA, no strip/quick-actions.
- Interim wiring (2a only): the per-kid `+`, "assign a test", and quick-action deep-links route to the **legacy** `/parent/custom-test`; "open content library" → legacy `/parent/custom-bank`. 2c/2b replace these targets in place.

## 6. Kid detail (`/parent/kids/:id`, flag on)

- `src/pages/parent/KidDetail.tsx`. Reads `:id` from the route param (never `activeStudent` — brief hard rule "kid context always explicit; copy any URL and it works"). Validates `:id` is a kid in the family by checking it appears in `getClassroomRoster()` (RLS already guarantees cross-family rows are invisible; an unknown/foreign id → "not found in your classroom" state with a link back to Classroom).
- Header (constant across tabs): breadcrumb `Classroom · <display_name>` (Classroom → `/parent`), `Grade N`, `Assign a test` button (→ legacy `/parent/custom-test`, interim), `Boost session` (→ existing `/boost` flow for this kid).
- Tabs via `?tab=` (`useSearchParams`; values `mastery`|`sessions`|`growth`|`assignments`; default `mastery`; unknown value falls back to `mastery`):
  - **Mastery** → `<MasteryHeatmap studentId={id} />`.
  - **Sessions** → `<KidWeekSessions studentId={id} />` rendering the completed-sessions list (newest first); each row date/subject/score/RIT. Source-mix badge is shown only when derivable from existing session data; not a blocker if absent in 2a.
  - **Growth** → `<GrowthAreas studentId={id} />` plus a "Build a boost test for this" CTA per misconception (→ legacy `/parent/custom-test`, interim; pre-fill deferred to 2c).
  - **Assignments** (the only genuinely new surface) → Cycle-1 `getAssignmentOverview()` filtered client-side to `student_id === id`: **Active** section (`status` in `assigned`/`in_progress`) — definition name, subject, `due_by` relative, parent note, `Revoke` action (only when `status==='assigned'`, calls Cycle-1 `revokeAssignment`, optimistic refresh); **Recent completed** (last 10, `status==='completed'`) — name, `completed_at`, score. `+ Assign a test` CTA at top (→ legacy builder, interim).

## 7. Shell / nav

`src/components/parent/ParentShell.tsx`: header with the app's existing display font/logo treatment, nav `Classroom · Library · Tests · History`, `Switch profile`, and `<Outlet/>`. Per the decided interim policy: Library → `/parent/custom-bank`, Tests → `/parent/custom-test`, History → the app's existing `/history` route (interim, same legacy-target policy as Library/Tests; a dedicated parent-scoped history view is out of 2a scope). Active-route highlight on the nav. `RequireParentPin` remains at the `/parent/*` route boundary in `src/App.tsx` (PIN gate unchanged).

## 8. Routing changes in `src/App.tsx`

- Replace the flat `/parent` `<Route element={<RequireParentPin><Parent/></RequireParentPin>}>` with `/parent/*` → `<RequireParentPin><ParentRoot/></RequireParentPin>`. `ParentRoot` internally renders either legacy `<Parent/>` or `<ParentShell>` with child `<Routes>`: index → `Classroom`, `kids/:id` → `KidDetail`.
- Add redirect: `/parent/dashboard` with `?kid=<id>` → `Navigate` to `/parent/kids/<id>` (brief §4). If `kid` absent → `/parent`.
- Existing routes `/parent/custom-bank`, `/parent/custom-bank/new-question`, `/parent/custom-bank/new-passage`, `/parent/custom-test`, `/parent/connect-ai`, and the settings route remain declared and functional exactly as today (they are siblings, not children of `ParentRoot`'s shell; reachable regardless of flag).

## 9. Data sources (all already exist)

| Surface | Source | Origin |
|---|---|---|
| `parent_v2` gate | `getParentV2(familyId)` | Cycle-1 `src/lib/parent/queries.ts` |
| Classroom roster | `getClassroomRoster()` | Cycle-1 (view `map_v_classroom_roster`) |
| Kid Assignments tab | `getAssignmentOverview()`, `revokeAssignment()` | Cycle-1 queries/mutations |
| Mastery / Growth / Sessions tabs | same Supabase tables `ParentDashboard` reads today, filtered by `studentId` prop | extracted from existing code |
| familyId, students, profile switch | `useActiveStudent()` | existing `src/lib/activeStudent.tsx` |

No new Supabase objects, no migration in 2a.

## 10. Verification

No React component-test harness exists in this repo (Cycle 1 used Node scripts against the DB; that convention holds — no test runner is introduced, YAGNI).

- **`scripts/test-parent-2a-data.mjs`** (reuses the Cycle-1 `_parent-redesign-helpers.mjs` harness): for an ephemeral family with two kids and seeded assignments, assert the lib calls 2a depends on round-trip correctly under a signed-in family client — `getParentV2` reflects the `map_families.parent_v2` value; `getClassroomRoster` returns one row per kid, family-scoped; `getAssignmentOverview` filtered to a kid returns only that kid's rows; `revokeAssignment` succeeds on an `assigned` row and is rejected on an `in_progress` row. Cross-family isolation is already proven by Cycle-1's §9.6 gate and the `security_invoker` views; 2a does not re-litigate it but the script confirms no regression in the lib layer it consumes.
- **`npm run typecheck && npm run build`** must pass (the build is the closest thing to an integration check in this SPA; confirms all new pages/components compile and route).
- **Manual QA checklist (in the spec, executed before declaring done):**
  1. Flag **off** (`parent_v2=false` for the test family): `/parent` renders the legacy stacked dashboard with output indistinguishable from current `main` (heatmap, settings, custom-test list, misconceptions all present and behaving as before).
  2. Flag **on**: `/parent` renders Classroom; cross-kid strip totals equal the sum of card metrics; "needs attention" pill appears for a kid with `active_misconceptions>0` or zero weekly practice.
  3. Click a kid → `/parent/kids/:id?tab=mastery`; the heatmap renders identically to legacy for that kid.
  4. Switch tabs → URL `?tab=` updates; **copy the `…?tab=sessions` URL into a fresh tab → lands on that kid's Sessions tab** (the brief's copyable-URL hard rule).
  5. Assignments tab lists only that kid's assignments; `Revoke` on an `assigned` row removes it; the control is absent on `in_progress`/`completed`.
  6. Direct-navigate to `/parent/kids/<id-not-in-family>` → graceful "not found in your classroom", no data leak (RLS already guarantees this; UI must not crash).
  7. `/parent/dashboard?kid=<id>` → redirects to `/parent/kids/<id>`.
  8. Nav: Library → legacy custom-bank, Tests → legacy custom-test, both functional.

Exit condition: data script green, typecheck+build green, manual checklist all pass.

## 11. Risks / open assumptions

- **`familyId` timing.** `ParentRoot` depends on `useActiveStudent().familyId`, which resolves asynchronously (RPC). The resolver must treat `loading`/`null` distinctly from `flag=false` so a slow family resolve never briefly flashes the wrong UI. Mitigation: explicit loading state until `ActiveStudentProvider.loading` is false AND `getParentV2` has resolved.
- **Extraction fidelity.** The "don't redesign the heatmap" rule means the extracted `MasteryHeatmap`/`GrowthAreas`/`KidWeekSessions` must be byte-faithful in markup/styles to the current `ParentDashboard` blocks. The flag-off manual QA step (1) and a diff of the rendered legacy path are the guard. If extraction proves to entangle state that can't cleanly take a `studentId` prop, that's an escalation point, not a silent redesign.
- **Source-mix badge on Sessions.** The brief wants a Vetted/My-questions/Mixed badge on session rows. In 2a the data to derive it cleanly is the Cycle-1 assignment/definition join, which Sessions-tab (legacy session list) may not have. 2a shows the badge only when trivially derivable; full source-mix provenance on historical sessions is a 2c concern (it owns definitions/assignments UX). Documented, not a 2a blocker.
- **Interim legacy nav.** Library/Tests pointing at legacy pages means the shell visibly changes again when 2b/2c land. Accepted per the decomposition; the nav targets are centralized in `ParentShell` so 2b/2c flip them in one place.
