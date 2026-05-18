# Parent Shell Restructure — Design Spec

**Date:** 2026-05-19
**Status:** Approved design, pre-plan
**Topic:** Replace the legacy flat `/parent` page with a tabbed shell (Classroom · Tests & Banks · AI Studio) that reuses recon-verified pieces of the shelved Cycle-1–2d redesign, on `main`, no feature flag.
**Builds on:** `main` (Question Banks Phase 1 + 2 shipped). Shelved `feat/parent-area-*` branches are a *source to port from*, never merged.
**Branch:** `feat/parent-shell` (off `main`).

---

## 1. Problem

The legacy `/parent` is a single monolithic page stacking ParentSettings + CustomTestList + TestsAndBanks + ParentDashboard. The earlier full Cycle-1–2d redesign was rejected and shelved, but its **dashboard pieces are sound and recon-verified revivable**. The user wants a focused tabbed shell that keeps the good parts (Classroom landing, per-kid mastery/sessions/growth) and centers it on the now-shipped Question Banks, without resurrecting the rejected complexity or the `parent_v2` flag.

## 2. Decisions (locked in brainstorming)

| # | Decision |
|---|---|
| Navigation | Tabs: **Classroom · Tests & Banks · AI Studio**. Kid Detail is a **drill-down** at `/parent/kids/:id` (not a tab) — the shelved Classroom→KidDetail model. |
| Classroom | **Light launcher**: per-kid card = name · grade · most-recent session · "Open". No cross-kid aggregate view (no new DB surface). The rich picture lives one click away in Kid Detail. |
| Legacy surfaces | `ParentSettings` → a per-kid **Settings** sub-tab inside Kid Detail. `CustomTestList` **retired** (completed sessions still show under Kid Detail → Sessions; Question Banks is the supported compose/assign path). |
| Kid Detail sub-tabs | **Mastery · Sessions · Growth · Assignments · Settings.** Assignments reads the shipped `map_v_bank_assignment_overview` filtered to the URL `:id` (the only assignment model on `main`). |
| AI Studio | One tab, **sub-tabs: Review queue · Connect AI** (default Review queue). Review queue = the legacy `CustomBank` publish queue; manual authoring (`new-question`/`new-passage`) hangs off it. |
| Landing | **Replace legacy `/parent` outright** on `main`. No `parent_v2` flag, no `ParentRoot` branching, `Parent.tsx` deleted. Rollback = git revert. |
| Architecture | **Approach 3 (hybrid):** port verbatim only the recon-verified dependency-free files; rebuild the structural parts fresh against `main`; reuse the shipped Question-Banks pages unchanged. |
| Decomposition | Single cohesive feature → **one spec, one plan**. |

## 3. Stack & reuse context

Vite + React Router v6 SPA, Supabase + RLS. Repo convention: **no React test runner** — verification is `npm run typecheck && npm run build` + a manual-QA checklist. This feature adds **zero DB surface** (no migration, no data-guard — Classroom/Kid Detail read tables and views that already exist on `main`).

**On `main` (reused unchanged):** `TestsAndBanks.tsx`, `SaveVettedBank.tsx`, `NewCustomBank.tsx`, `BankDetail.tsx`, `AssignBankDialog.tsx`, the `src/lib/banks/*` lib; `CustomBank.tsx`, `NewCustomQuestion.tsx`, `NewCustomPassage.tsx`; `ConnectAi.tsx`; `ParentSettings.tsx` (reused with a bounded `studentId`-prop adaptation — see §6, the only reused-component change); `CustomTestBuilder.tsx`; views `map_v_mastery_by_standard`, `map_v_bank_assignment_overview`; tables `map_students`, `map_test_sessions`, `map_attempts`, `map_misconception_signals`(+tags), `map_standards`.

**Ported verbatim from `feat/parent-area-2d`** (recon §B verdict: dependency-free / reads main only): `src/components/parent/useKidDashboardData.ts`, `src/components/parent/MasteryHeatmap.tsx`, `src/components/parent/GrowthAreas.tsx`, `src/components/parent/KidWeekSessions.tsx`.

**NOT ported** (recon: Cycle-1-coupled): `ParentRoot.tsx` (flag — not needed), shelved `Classroom.tsx` (depends on absent `map_v_classroom_roster` — rebuilt as launcher), shelved `KidDetail.tsx`'s assignments path (depends on absent `map_v_assignment_overview` — rebuilt against `map_v_bank_assignment_overview`), `src/lib/parent/*` (Cycle-1 queries/types — not used).

## 4. Architecture — route & component map

`/parent/*` becomes a nested-route layout. New `ParentArea` (replaces ParentRoot, **no flag**) mounts `<Routes>` with a `ParentShell` layout (3-tab nav + `<Outlet/>`):

```
/parent/*  → ParentArea (NEW)  — <Routes> with layout ParentShell (NEW)
  index                → Classroom (NEW, light launcher)
  kids/:id             → KidDetail (REBUILT — 5 sub-tabs via ?tab=)
  tests                → TestsAndBanks (REUSE, shipped, unchanged)
  banks/new            → SaveVettedBank (REUSE)
  banks/new-custom     → NewCustomBank (REUSE)
  banks/:id            → BankDetail (REUSE)
  ai-studio            → AiStudio (NEW — sub-tabs Review queue | Connect AI)
  ai-studio/new-question → NewCustomQuestion (REUSE, re-pathed)
  ai-studio/new-passage  → NewCustomPassage (REUSE, re-pathed)
  custom-test          → CustomTestBuilder (REUSE, routed but NOT in nav)
```

- `ParentShell` nav: **Classroom** (`/parent`), **Tests & Banks** (`/parent/tests`), **AI Studio** (`/parent/ai-studio`) + a "Back to app" link. Active-tab pill styling (mirrors the shelved shell idiom).
- `KidDetail` sub-tabs (URL `?tab=`): **mastery** → `MasteryHeatmap` (ported) via `useKidDashboardData(:id)` (ported); **sessions** → `KidWeekSessions` (ported); **growth** → `GrowthAreas` (ported); **assignments** → a NEW small list from `getBankAssignmentOverview()` (shipped lib) filtered `student_id === :id`; **settings** → `<ParentSettings studentId={:id} />` (reused). Header shows breadcrumb "Classroom · {name}" and a back link.
- `Classroom`: query the family's `map_students` + each kid's most-recent completed `map_test_sessions`; render launcher cards (name · grade · last session summary · Open → `/parent/kids/:id`) + "+ Add a kid" → `/onboarding`.
- `AiStudio`: sub-tab switch (URL `?tab=review|connect`, default `review`) rendering `<CustomBank/>` or `<ConnectAi/>` inside the shell.
- **Deleted:** `Parent.tsx`, `CustomTestList.tsx`.

## 5. Data flow

All reads already exist on `main` and are RLS family-scoped. No new tables/views/RPCs.

- **Classroom:** `map_students` (id, display_name, grade) + per-kid latest completed `map_test_sessions` (subject, completed_at, correct_count, planned_length).
- **Kid Detail (`:id` from URL, independent of the app's active-student):** `useKidDashboardData(:id)` reads `map_standards`, `map_v_mastery_by_standard`, `map_misconception_signals`(+`map_misconception_tags`), `map_test_sessions`, `map_attempts`. Assignments → `getBankAssignmentOverview()` (→ `map_v_bank_assignment_overview`) filtered client-side to `:id`. Settings → `ParentSettings` (reads/writes `map_students` grade/length, counts `map_questions`).
- **Tests & Banks / AI Studio:** identical queries to today (unchanged components).

## 6. Error handling & edges

- `/parent/kids/:id` with an id not in the family → RLS yields nothing → "Not found in your classroom · back to Classroom".
- Brand-new kid (no data) → ported components render their existing empty states; Mastery shows the untouched grade grid.
- Deep links preserved: kid Results "build a similar test" → `/parent/custom-test?…` still resolves (route retained, just unlisted in nav). `/parent/custom-bank` and `/parent/connect-ai` are reachable at the same paths (now nested) **and** linked from AI Studio sub-tabs; any old `<Link to="/parent/custom-bank">`/`connect-ai` keep working.
- Auth wrappers: shell route = `RequireAuth + RequireParentPin`. **Not** `RequireActiveStudent` at the shell (Classroom needs no active kid; Kid Detail keys off `:id`). Retain `RequireActiveStudent` only on the nested sub-routes that require it today (`custom-test` CustomTestBuilder, the bank compose/assign pages if they rely on it). `ConnectAi` keeps its current no-active-student wrapping.
- `ParentSettings` is parameterized by `studentId`: if it currently reads the active student internally, adapt it to accept a `studentId` prop (small, scoped) so Kid Detail can pass `:id`. This is the only change to a reused component.
- Cross-family isolation unchanged — all reads already RLS-scoped; manual QA spot-checks a parent sees only their own kids.

## 7. Testing — honest scope

- **No DB migration, no data-guard.** This feature adds zero DB surface; a data-guard would be theatre.
- Gate: `npm run typecheck && npm run build` → exit 0.
- Manual-QA checklist: (1) `/parent` renders ParentShell + 3 tabs; legacy stacked page gone. (2) Classroom lists the family's kids; clicking a card → `/parent/kids/:id`. (3) Kid Detail: Mastery heatmap / Sessions / Growth render for a kid with data and degrade gracefully for a new kid; **Settings** sub-tab edits *that kid's* school/practice grade + test length and persists; **Assignments** shows only that kid's bank assignments. (4) Tests & Banks tab = shipped behavior (create vetted/custom bank, assign, success confirmation); bank sub-pages reachable and return to the tab. (5) AI Studio: **Review queue** publishes a draft; **Connect AI** loads tokens/agents; `new-question`/`new-passage` authoring reachable. (6) Deep link `/parent/custom-test?subject=…` (kid Results "build a similar test") still works. (7) Cross-family spot-check.
- No-regression sanity: existing adaptive simulator and the Question-Banks data guards still green (no engine/DB change) — run once.

## 8. Risks & open assumptions

- **Ported-file imports.** Recon classified the 4 files as dependency-free, but the plan's port step must confirm each import resolves on `main` (expected: `../../lib/supabase`, `fetchStudentGrade`, `../../lib/types`); any stray `src/lib/parent/*` Cycle-1 import is removed/replaced at port time, not assumed away.
- **`ParentSettings` shape.** Whether it already accepts a `studentId` prop or reads active-student internally is confirmed in the plan's first task; the adaptation is bounded (prop threading) and is the only reused-component change.
- **Route restructuring blast radius.** Collapsing the flat `/parent*` routes into one nested block touches `App.tsx`; the plan enumerates every old path and asserts each still resolves (no dead internal links). `CustomTestBuilder` is deliberately retained-but-unlisted to preserve the kid Results deep link.
- **No flag = immediate for everyone.** Acceptable per the explicit decision (single-family dev; the legacy page is strictly superseded). Rollback is a git revert of the feature commits.
- **Shelved branches stay shelved.** Files are *copied* from `feat/parent-area-2d` via `git show`; those branches are never merged or modified.

## 9. Out of scope (documented)

- Cross-kid aggregate metrics / `map_v_classroom_roster` (the launcher decision deliberately avoids this; can be a later enhancement).
- Reviving Library/Tests-definitions/TestBuilder from the shelved redesign (superseded by shipped Question Banks).
- Any `parent_v2` flag or `ParentRoot` dual-path.
- Changes to the adaptive engine, Question-Banks data model, or kid-side flows.
- Restyling/visual redesign of the reused pages (TestsAndBanks, CustomBank, ConnectAi, ParentSettings) — they render as-is inside the shell.
