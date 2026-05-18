# Parent Shell Restructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy flat `/parent` page with a tabbed shell (Classroom · Tests & Banks · AI Studio) + a Kid-Detail drill-down, on `main`, no feature flag.

**Architecture:** A nested-route layout. `ParentArea` (new, no flag) mounts `<Routes>` with a `ParentShell` layout (3-tab nav + `<Outlet/>`). Four recon-verified dependency-free files are ported verbatim from `feat/parent-area-2d`; the structural parts (ParentArea, ParentShell, Classroom, KidDetail, AiStudio) are built fresh against `main`; the shipped Question-Banks pages and the legacy CustomBank/ConnectAi/ParentSettings are reused. No DB changes.

**Tech Stack:** React + Vite + TS + React Router v6, Tailwind. Verification = `npm run typecheck && npm run build` + manual QA (repo convention; no React test runner). **No migration, no data-guard** (zero DB surface added).

**Spec:** `docs/superpowers/specs/2026-05-19-parent-shell-restructure-design.md`.

**Branch:** `feat/parent-shell` (already created off `main`; spec committed there as `ff4ee46`). Do NOT merge or modify the shelved `feat/parent-area-*` branches — files are *copied out* via `git show`.

---

## Documented spec refinements (intent preserved, decided here)

1. **Authoring routes keep their current paths** `/parent/custom-bank/new-question` and `/parent/custom-bank/new-passage` (spec §4 said "ai-studio/new-question … re-pathed"). Reused `CustomBank.tsx` links to those exact paths internally; re-pathing would force edits to a "reuse unchanged" component. Keeping the paths still satisfies the spec's intent ("authoring hangs off the review queue") — the path string is cosmetic. `CustomBank` stays byte-unchanged.
2. **Old paths preserved via redirects.** `/parent/custom-bank` → `/parent/ai-studio?tab=review`, `/parent/connect-ai` → `/parent/ai-studio?tab=connect`, so any existing `<Link>`s keep working. `/parent/custom-test` stays a real route (kid Results deep link).
3. **`ParentSettings`** gets an optional `studentId?: string` + `displayName?: string` prop (falls back to `useActiveStudent()` so nothing else breaks). This is the only change to a reused component (spec §6).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/components/parent/useKidDashboardData.ts` | per-kid dashboard fetch hook | **Port verbatim** from feat/parent-area-2d |
| `src/components/parent/MasteryHeatmap.tsx` | mastery heatmap (presentational) | **Port verbatim** |
| `src/components/parent/GrowthAreas.tsx` | weakness signals (presentational) | **Port verbatim** |
| `src/components/parent/KidWeekSessions.tsx` | week + recent sessions (presentational) | **Port verbatim** |
| `src/pages/parent/ParentSettings.tsx` | grade/length settings | **Modify** — add `studentId?`/`displayName?` props |
| `src/components/parent/ParentShell.tsx` | 3-tab nav layout + Outlet | **Create** |
| `src/pages/parent/Classroom.tsx` | light kid-launcher landing | **Create** |
| `src/components/parent/KidAssignmentsList.tsx` | per-kid bank assignments list | **Create** |
| `src/pages/parent/KidDetail.tsx` | per-kid 5 sub-tabs | **Create** |
| `src/pages/parent/AiStudio.tsx` | Review-queue/Connect-AI sub-tabs | **Create** |
| `src/pages/parent/ParentArea.tsx` | nested `<Routes>` (replaces ParentRoot, no flag) | **Create** |
| `src/App.tsx` | collapse 9 flat `/parent*` routes → one `/parent/*` block | **Modify** |
| `src/pages/parent/Parent.tsx` | legacy page | **Delete** |
| `src/pages/parent/CustomTestList.tsx` | legacy custom-sessions list | **Delete** |

---

## Task 1: Port the 4 dependency-free files verbatim

**Files:** Create `src/components/parent/useKidDashboardData.ts`, `MasteryHeatmap.tsx`, `GrowthAreas.tsx`, `KidWeekSessions.tsx`

- [ ] **Step 1: Copy each file out of the shelved branch verbatim**

Run exactly:
```bash
cd /Users/ashish/MAP_TEST
git show feat/parent-area-2d:src/components/parent/useKidDashboardData.ts > src/components/parent/useKidDashboardData.ts
git show feat/parent-area-2d:src/components/parent/MasteryHeatmap.tsx > src/components/parent/MasteryHeatmap.tsx
git show feat/parent-area-2d:src/components/parent/GrowthAreas.tsx > src/components/parent/GrowthAreas.tsx
git show feat/parent-area-2d:src/components/parent/KidWeekSessions.tsx > src/components/parent/KidWeekSessions.tsx
```
These are recon-verified dependency-free. Their imports are: `react`; `../../lib/supabase` (`supabase`, `fetchStudentGrade`); `../../lib/types` (`MisconceptionSignal`, `MisconceptionTag`, `Session`, `Standard`, `Subject`); `../../lib/rit` (`gradeContext`); and the sibling `./useKidDashboardData`. All exist on `main`.

- [ ] **Step 2: Verify imports resolve on main**

Run: `npm run typecheck`
Expected: exit 0. If a type (`MisconceptionSignal`/`MisconceptionTag`) or `gradeContext` does NOT resolve on `main`, STOP and report the exact missing symbol — do not stub it. (Recon expects all present: `ParentDashboard.tsx` on main uses the same signals/tags shapes, `Results.tsx` uses `gradeContext`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/parent/useKidDashboardData.ts src/components/parent/MasteryHeatmap.tsx src/components/parent/GrowthAreas.tsx src/components/parent/KidWeekSessions.tsx
git commit -m "feat(parent-shell) port dependency-free dashboard pieces from shelved branch"
```

---

## Task 2: Adapt `ParentSettings` to accept a `studentId` prop

**Files:** Modify `src/pages/parent/ParentSettings.tsx`

`ParentSettings` currently does `const { activeStudent } = useActiveStudent()` then `const studentId = activeStudent.id` and uses `activeStudent.id` in 4 places (reload + 3 `.eq('id', activeStudent.id)` updates) and `activeStudent?.display_name` for a heading. The shell drops `RequireActiveStudent`, so it must work from a prop.

- [ ] **Step 1: Read the file**

Read `src/pages/parent/ParentSettings.tsx` fully. Identify: the component signature (`export default function ParentSettings()`), the `const { activeStudent } = useActiveStudent()` line, every `activeStudent.id` / `activeStudent?.id` usage, and the `activeStudent?.display_name ?? 'your child'` usage.

- [ ] **Step 2: Add optional props and derive id/name from them with fallback**

Change the signature and the id/name derivation. Replace:
```tsx
export default function ParentSettings() {
  const { activeStudent } = useActiveStudent()
```
with:
```tsx
export default function ParentSettings({
  studentId: studentIdProp,
  displayName: displayNameProp,
}: { studentId?: string; displayName?: string } = {}) {
  const { activeStudent } = useActiveStudent()
  const resolvedStudentId = studentIdProp ?? activeStudent?.id ?? null
  const resolvedDisplayName = displayNameProp ?? activeStudent?.display_name ?? 'your child'
```
Then, in the body: replace every `activeStudent.id` and `activeStudent?.id` with `resolvedStudentId`, and guard the early load: if `resolvedStudentId` is null, render nothing/`null` (it will always be supplied a prop from Kid Detail, and falls back to active student elsewhere). Replace `activeStudent?.display_name ?? 'your child'` with `resolvedDisplayName`. Where the code previously did `const studentId = activeStudent.id`, change to `const studentId = resolvedStudentId` and add an early `if (!studentId) return null` before the effect uses it (preserves the old guarantee that it only ran with a student).

> Do not change any query or UI logic — only the source of the id/name. The component must remain behaviorally identical when rendered with no props inside `RequireActiveStudent` (back-compat), and use the prop when Kid Detail passes one.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/pages/parent/ParentSettings.tsx
git commit -m "feat(parent-shell) ParentSettings: optional studentId/displayName props (fallback to active student)"
```

---

## Task 3: `ParentShell` — 3-tab nav layout

**Files:** Create `src/components/parent/ParentShell.tsx`

- [ ] **Step 1: Create the shell**

```tsx
// src/components/parent/ParentShell.tsx
// 3-tab parent nav + Outlet. Nav idiom mirrors the shelved ParentShell
// (rounded-pill NavLinks) but with the agreed Classroom/Tests&Banks/AI Studio tabs.
import { Link, NavLink, Outlet } from 'react-router-dom'

const navItems: { to: string; label: string; end?: boolean }[] = [
  { to: '/parent', label: 'Classroom', end: true },
  { to: '/parent/tests', label: 'Tests & Banks' },
  { to: '/parent/ai-studio', label: 'AI Studio' },
]

export default function ParentShell() {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 mt-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <span className="font-display text-2xl">Parent</span>
          <nav className="flex items-center gap-1 text-sm">
            {navItems.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `rounded-full px-3 py-1.5 font-semibold transition ${
                    isActive
                      ? 'bg-white text-ink shadow ring-1 ring-cloud'
                      : 'text-ink/60 hover:text-ink'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <Link to="/" className="btn-ghost text-sm">
          Back to app
        </Link>
      </header>
      <Outlet />
    </div>
  )
}
```
> Glyph note: `&` rendered via the literal `&` in the JSX text `Tests & Banks` is fine (JSX text, not an entity-required context). `·`/`…` not used here.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0 (unused-for-now is fine; it's imported next task).

- [ ] **Step 3: Commit**

```bash
git add src/components/parent/ParentShell.tsx
git commit -m "feat(parent-shell) ParentShell 3-tab nav layout"
```

---

## Task 4: `Classroom` — light launcher

**Files:** Create `src/pages/parent/Classroom.tsx`

- [ ] **Step 1: Create the page**

Uses `useActiveStudent()` for the family's `students` (already loaded app-wide; `Student` = `{ id, display_name, grade, school_grade, avatar_emoji }`), and one query for each kid's most-recent completed session.

```tsx
// src/pages/parent/Classroom.tsx
// Light launcher: one card per kid (name · grade · last session · Open).
// No cross-kid aggregate view — the rich picture lives in Kid Detail.
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useActiveStudent } from '../../lib/activeStudent'
import { supabase } from '../../lib/supabase'

type LastSession = {
  subject: string
  kind: string
  completed_at: string | null
  correct_count: number
  planned_length: number
}

export default function Classroom() {
  const { students } = useActiveStudent()
  const navigate = useNavigate()
  const [lastByKid, setLastByKid] = useState<Record<string, LastSession | null>>({})

  useEffect(() => {
    let cancelled = false
    if (students.length === 0) return
    void (async () => {
      const entries = await Promise.all(
        students.map(async (s) => {
          const { data } = await supabase
            .from('map_test_sessions')
            .select('subject, kind, completed_at, correct_count, planned_length')
            .eq('student_id', s.id)
            .eq('status', 'completed')
            .order('completed_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          return [s.id, (data as LastSession | null) ?? null] as const
        }),
      )
      if (cancelled) return
      setLastByKid(Object.fromEntries(entries))
    })()
    return () => {
      cancelled = true
    }
  }, [students])

  return (
    <div>
      <header className="mb-6">
        <p className="font-display text-lg uppercase tracking-widest text-smoke">
          Parent view
        </p>
        <h1 className="font-display text-4xl">Your classroom</h1>
      </header>

      {students.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-display text-2xl">No kids yet.</p>
          <Link to="/onboarding" className="btn-secondary mt-4 inline-block text-sm">
            + Add your first kid
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {students.map((s) => {
            const last = lastByKid[s.id]
            const acc =
              last && last.planned_length > 0
                ? Math.round((last.correct_count / last.planned_length) * 100)
                : null
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => navigate(`/parent/kids/${s.id}`)}
                className="card p-5 text-left transition hover:ring-1 hover:ring-cloud"
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{s.avatar_emoji}</span>
                  <div>
                    <p className="font-display text-2xl leading-tight">{s.display_name}</p>
                    <p className="text-xs text-ink/60">Grade {s.grade}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-ink/70">
                  {last
                    ? `Last: ${last.subject}${last.kind === 'custom' ? ' 🎯' : last.kind === 'boost' ? ' ⚡' : ''} · ${
                        last.completed_at
                          ? new Date(last.completed_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })
                          : ''
                      }${acc != null ? ` · ${acc}%` : ''}`
                    : 'No completed sessions yet'}
                </p>
                <span className="mt-4 inline-block text-sm font-semibold text-ink/70">
                  Open ▸
                </span>
              </button>
            )
          })}
          <Link
            to="/onboarding"
            className="card flex min-h-[160px] items-center justify-center p-5 text-center text-ink/50 ring-1 ring-dashed ring-cloud hover:text-ink"
          >
            + Add a kid
          </Link>
        </div>
      )}
    </div>
  )
}
```
> Glyph note: `·` is U+00B7, `▸` is U+25B8 — use the literal glyphs (no ASCII `>` / `*`).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/pages/parent/Classroom.tsx
git commit -m "feat(parent-shell) Classroom light launcher"
```

---

## Task 5: `KidAssignmentsList` — per-kid bank assignments

**Files:** Create `src/components/parent/KidAssignmentsList.tsx`

- [ ] **Step 1: Create the component**

Reuses the shipped `getBankAssignmentOverview()` (returns `BankAssignmentOverviewRow[]` with `student_id, bank_name, lane, status, due_by, questions_correct, questions_total`), filtered to the kid.

```tsx
// src/components/parent/KidAssignmentsList.tsx
import { useEffect, useRef, useState } from 'react'
import { getBankAssignmentOverview } from '../../lib/banks/queries'
import type { BankAssignmentOverviewRow } from '../../lib/banks/types'

export function KidAssignmentsList({ studentId }: { studentId: string }) {
  const mounted = useRef(true)
  const [rows, setRows] = useState<BankAssignmentOverviewRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    getBankAssignmentOverview()
      .then((all) => {
        if (!mounted.current) return
        setRows(all.filter((r) => r.student_id === studentId))
      })
      .catch((e) => {
        if (!mounted.current) return
        setError(e instanceof Error ? e.message : 'Failed to load assignments.')
      })
  }, [studentId])

  if (error) return <p className="card p-5 text-sm text-rust">{error}</p>
  if (!rows) return <p className="mt-6 text-center font-display text-xl">Loading…</p>
  if (rows.length === 0)
    return (
      <p className="card p-6 text-sm text-ink/60">
        No assigned banks for this kid yet. Assign one from Tests &amp; Banks.
      </p>
    )

  return (
    <div className="card divide-y divide-cloud/70">
      {rows.map((r) => (
        <div
          key={r.assignment_id}
          className="flex items-center justify-between gap-2 p-4 text-sm"
        >
          <span>
            <b>{r.bank_name}</b>{' '}
            <span className="rounded bg-cloud px-1 text-xs">{r.lane}</span>{' '}
            <span className="rounded bg-cloud px-1 text-xs">{r.status}</span>
            {r.status === 'completed' && r.questions_total != null && (
              <span className="text-ink/60">
                {' '}
                · {r.questions_correct ?? 0}/{r.questions_total}
              </span>
            )}
            {r.due_by && (
              <span className="text-ink/60">
                {' '}
                · due {new Date(r.due_by).toLocaleDateString()}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}
```
> Glyph note: `…` U+2026, `·` U+00B7, `&amp;` in JSX text. No ASCII `...`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/parent/KidAssignmentsList.tsx
git commit -m "feat(parent-shell) KidAssignmentsList (per-kid bank assignments)"
```

---

## Task 6: `KidDetail` — 5 sub-tabs

**Files:** Create `src/pages/parent/KidDetail.tsx`

- [ ] **Step 1: Create the page**

Keyed by URL `:id` (not the app active-student). Resolves the kid's name from `useActiveStudent().students`. Sub-tabs via `?tab=`.

```tsx
// src/pages/parent/KidDetail.tsx
import { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useActiveStudent } from '../../lib/activeStudent'
import { useKidDashboardData } from '../../components/parent/useKidDashboardData'
import { MasteryHeatmap } from '../../components/parent/MasteryHeatmap'
import { KidWeekSessions } from '../../components/parent/KidWeekSessions'
import { GrowthAreas } from '../../components/parent/GrowthAreas'
import { KidAssignmentsList } from '../../components/parent/KidAssignmentsList'
import ParentSettings from './ParentSettings'

const TABS = ['mastery', 'sessions', 'growth', 'assignments', 'settings'] as const
type Tab = (typeof TABS)[number]

export default function KidDetail() {
  const { id = '' } = useParams()
  const { students } = useActiveStudent()
  const [params, setParams] = useSearchParams()
  const rawTab = params.get('tab')
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? '')
    ? (rawTab as Tab)
    : 'mastery'

  const kid = useMemo(
    () => students.find((s) => s.id === id) ?? null,
    [students, id],
  )
  const dash = useKidDashboardData(kid ? id : undefined)

  if (students.length > 0 && !kid) {
    return (
      <div className="card p-8 text-center">
        <p className="font-display text-2xl">Not found in your classroom.</p>
        <Link to="/parent" className="btn-secondary mt-4 inline-block text-sm">
          Back to classroom
        </Link>
      </div>
    )
  }
  if (!kid) {
    return <p className="mt-12 text-center font-display text-2xl">Loading…</p>
  }

  const setTab = (t: Tab) => setParams({ tab: t }, { replace: false })

  return (
    <div>
      <header className="mb-5">
        <p className="text-xs text-ink/50">
          <Link to="/parent" className="hover:underline">
            Classroom
          </Link>{' '}
          · {kid.display_name}
        </p>
        <h1 className="mt-1 font-display text-3xl">
          {kid.display_name}{' '}
          <span className="text-base text-ink/50">Grade {kid.grade}</span>
        </h1>
        <nav className="mt-4 flex flex-wrap gap-1 text-sm">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1.5 font-semibold capitalize transition ${
                tab === t
                  ? 'bg-white text-ink shadow ring-1 ring-cloud'
                  : 'text-ink/60 hover:text-ink'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      {dash.error && tab !== 'assignments' && tab !== 'settings' && (
        <div className="card p-6 text-center text-sm text-ink/60">{dash.error}</div>
      )}
      {dash.loading && (tab === 'mastery' || tab === 'sessions' || tab === 'growth') && (
        <p className="mt-8 text-center font-display text-xl">Loading…</p>
      )}

      {!dash.loading && tab === 'mastery' && (
        <MasteryHeatmap standards={dash.standards} mastery={dash.mastery} />
      )}
      {!dash.loading && tab === 'sessions' && (
        <KidWeekSessions recent={dash.recent} weekStats={dash.weekStats} />
      )}
      {!dash.loading && tab === 'growth' && <GrowthAreas signals={dash.signals} />}
      {tab === 'assignments' && <KidAssignmentsList studentId={id} />}
      {tab === 'settings' && (
        <ParentSettings studentId={id} displayName={kid.display_name} />
      )}
    </div>
  )
}
```
> Glyph note: `·` U+00B7, `…` U+2026 — literal glyphs.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/pages/parent/KidDetail.tsx
git commit -m "feat(parent-shell) KidDetail with 5 sub-tabs (mastery/sessions/growth/assignments/settings)"
```

---

## Task 7: `AiStudio` — Review-queue / Connect-AI sub-tabs

**Files:** Create `src/pages/parent/AiStudio.tsx`

- [ ] **Step 1: Create the page**

Sub-tab switch via `?tab=review|connect` (default `review`), rendering the reused `CustomBank` / `ConnectAi` unchanged inside the shell.

```tsx
// src/pages/parent/AiStudio.tsx
import { useSearchParams } from 'react-router-dom'
import CustomBank from './CustomBank'
import ConnectAi from './ConnectAi'

const SUBTABS = ['review', 'connect'] as const
type SubTab = (typeof SUBTABS)[number]
const LABEL: Record<SubTab, string> = {
  review: 'Review queue',
  connect: 'Connect AI',
}

export default function AiStudio() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: SubTab = (SUBTABS as readonly string[]).includes(raw ?? '')
    ? (raw as SubTab)
    : 'review'

  return (
    <div>
      <header className="mb-5">
        <h1 className="font-display text-3xl">AI Studio</h1>
        <nav className="mt-3 flex gap-1 text-sm">
          {SUBTABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setParams({ tab: t }, { replace: false })}
              className={`rounded-full px-3 py-1.5 font-semibold transition ${
                tab === t
                  ? 'bg-white text-ink shadow ring-1 ring-cloud'
                  : 'text-ink/60 hover:text-ink'
              }`}
            >
              {LABEL[t]}
            </button>
          ))}
        </nav>
      </header>
      {tab === 'review' ? <CustomBank /> : <ConnectAi />}
    </div>
  )
}
```
> `CustomBank` and `ConnectAi` are reused unchanged; they manage their own state and internal links (e.g. to `/parent/custom-bank/new-question`), which Task 8 keeps valid.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/pages/parent/AiStudio.tsx
git commit -m "feat(parent-shell) AiStudio with Review-queue / Connect-AI sub-tabs"
```

---

## Task 8: `ParentArea` nested routes + `App.tsx` rewire + deletions

**Files:** Create `src/pages/parent/ParentArea.tsx`; Modify `src/App.tsx`; Delete `src/pages/parent/Parent.tsx`, `src/pages/parent/CustomTestList.tsx`

- [ ] **Step 1: Create `ParentArea` (nested Routes, no flag)**

```tsx
// src/pages/parent/ParentArea.tsx
// Replaces the shelved ParentRoot — NO parent_v2 flag, NO legacy branch.
// One nested Routes tree under the ParentShell layout.
import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireActiveStudent } from '../../lib/activeStudent'
import ParentShell from '../../components/parent/ParentShell'
import Classroom from './Classroom'
import KidDetail from './KidDetail'
import TestsAndBanks from './TestsAndBanks'
import SaveVettedBank from './SaveVettedBank'
import NewCustomBank from './NewCustomBank'
import BankDetail from './BankDetail'
import AiStudio from './AiStudio'
import CustomBank from './CustomBank'
import NewCustomQuestion from './NewCustomQuestion'
import NewCustomPassage from './NewCustomPassage'
import ConnectAi from './ConnectAi'
import CustomTestBuilder from './CustomTestBuilder'

export default function ParentArea() {
  return (
    <Routes>
      <Route element={<ParentShell />}>
        <Route index element={<Classroom />} />
        <Route path="kids/:id" element={<KidDetail />} />
        <Route path="tests" element={<TestsAndBanks />} />
        <Route path="ai-studio" element={<AiStudio />} />
        {/* Old paths preserved as redirects so existing links never dead-end */}
        <Route path="custom-bank" element={<Navigate to="/parent/ai-studio?tab=review" replace />} />
        <Route path="connect-ai" element={<Navigate to="/parent/ai-studio?tab=connect" replace />} />
      </Route>
      {/* Full-screen sub-pages (no shell chrome); compose pages keep the
          active-student guard that protects their existing behavior. */}
      <Route
        path="banks/new"
        element={
          <RequireActiveStudent>
            <SaveVettedBank />
          </RequireActiveStudent>
        }
      />
      <Route
        path="banks/new-custom"
        element={
          <RequireActiveStudent>
            <NewCustomBank />
          </RequireActiveStudent>
        }
      />
      <Route path="banks/:id" element={<BankDetail />} />
      <Route
        path="custom-test"
        element={
          <RequireActiveStudent>
            <CustomTestBuilder />
          </RequireActiveStudent>
        }
      />
      <Route path="custom-bank/new-question" element={<NewCustomQuestion />} />
      <Route path="custom-bank/new-passage" element={<NewCustomPassage />} />
      <Route path="*" element={<Navigate to="/parent" replace />} />
    </Routes>
  )
}
```
> `banks/:id` (BankDetail) and the authoring pages don't require an active student (family-RLS / `:id`-scoped); `banks/new*` and `custom-test` keep `RequireActiveStudent` to preserve their current behavior. Connect-AI/custom-bank old paths redirect into the shell tab.

- [ ] **Step 2: Rewire `src/App.tsx`**

In `src/App.tsx`: (a) remove these parent imports — `Parent`, `CustomBank`, `CustomTestBuilder`, `NewCustomPassage`, `NewCustomQuestion`, `SaveVettedBank`, `NewCustomBank`, `BankDetail`, `ConnectAi` (all now imported by `ParentArea`), and `RequireActiveStudent` *if it is no longer used elsewhere in App.tsx* (check; keep it if other non-parent routes use it). Add: `import ParentArea from './pages/parent/ParentArea'`. (b) Delete ALL nine flat `<Route path="/parent...">` blocks (the `/parent`, `/parent/custom-test`, `/parent/banks/new`, `/parent/banks/new-custom`, `/parent/banks/:id`, `/parent/custom-bank`, `/parent/custom-bank/new-question`, `/parent/custom-bank/new-passage`, `/parent/connect-ai` routes quoted in recon §6). (c) Replace them with a single block:
```tsx
          <Route
            path="/parent/*"
            element={
              <RequireAuth>
                <RequireParentPin>
                  <ParentArea />
                </RequireParentPin>
              </RequireAuth>
            }
          />
```
Keep `RequireAuth` (`./lib/auth`) and `RequireParentPin` (`./lib/parentPin`) imports. The shell deliberately drops the top-level `RequireActiveStudent` (Classroom/KidDetail must work without an app active-student); the sub-routes that need it re-add it inside `ParentArea` (Step 1).

- [ ] **Step 3: Delete the legacy files**

```bash
git rm src/pages/parent/Parent.tsx src/pages/parent/CustomTestList.tsx
```
If `npm run typecheck` then reports any other file still importing `./Parent` or `./CustomTestList`, STOP and report it (recon shows only `Parent.tsx` imported `CustomTestList`; nothing else should reference either).

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both exit 0. Pre-existing chunk-size warnings are not failures.

- [ ] **Step 5: Commit**

```bash
git add src/pages/parent/ParentArea.tsx src/App.tsx
git commit -m "feat(parent-shell) ParentArea nested routes; collapse /parent/* in App; delete legacy Parent + CustomTestList"
```

---

## Task 9: Full verification + manual QA

**Files:** none (verification only)

- [ ] **Step 1: Typecheck + build**

Run: `npm run typecheck && npm run build ; echo "exit=$?"`
Expected: both exit 0.

- [ ] **Step 2: No-regression sanity (no DB/engine change, but prove it)**

Run:
```bash
node --env-file=.env.local scripts/test-banks-phase1-data.mjs 2>&1 | tail -1
node --env-file=.env.local scripts/test-banks-phase2-data.mjs 2>&1 | tail -1
```
Expected: each ends `Phase-1 bank data checks complete.` / `Phase-2 bank data checks complete.` (unchanged data layer).

- [ ] **Step 3: Manual-QA checklist** (dev server, parent w/ ≥1 kid, PIN unlocked). Report each PASS/CONCERN with evidence:
  1. `/parent` renders `ParentShell` with tabs **Classroom · Tests & Banks · AI Studio**; the legacy stacked page is gone (no `Parent.tsx`).
  2. Classroom lists each kid (emoji, name, grade, last-session line) + "Add a kid"; clicking a card → `/parent/kids/:id`.
  3. Kid Detail: **Mastery** heatmap renders for a kid with attempts and shows the empty grid for a new kid; **Sessions** shows week + recent; **Growth** shows signals; **Assignments** lists only that kid's bank assignments; **Settings** edits *that kid's* school/practice grade + test length and persists (re-open confirms). `?tab=` deep-links each sub-tab. Unknown `/parent/kids/<bad-id>` → "Not found in your classroom".
  4. **Tests & Banks** tab = full shipped behavior: create a vetted test, create a custom bank, add a manual question, assign (success confirmation names the kid), revoke; bank sub-pages (`/parent/banks/new`, `/new-custom`, `/:id`) work and return.
  5. **AI Studio**: Review-queue sub-tab = the CustomBank queue (publish a draft works; "+ new question/passage" reachable at `/parent/custom-bank/new-question`); Connect-AI sub-tab loads tokens/agents. `/parent/custom-bank` and `/parent/connect-ai` redirect into the right AI Studio sub-tab.
  6. Kid Results → "🎯 Build a similar test" → `/parent/custom-test?subject=…&standard_ids=…` still loads CustomTestBuilder.
  7. Cross-family spot check: the parent only ever sees their own kids (RLS unchanged).

- [ ] **Step 4: Final commit if QA fixes were needed; else skip.** Then proceed to **finishing-a-development-branch**.

---

## Self-Review

**1. Spec coverage (`2026-05-19-parent-shell-restructure-design.md`):**
- §2 nav (Classroom·Tests&Banks·AI Studio; KidDetail drill-down) → Tasks 3, 8 (ParentShell nav + ParentArea routes). ✓
- §2 Classroom light launcher (no new view) → Task 4. ✓
- §2 ParentSettings → Kid Detail Settings sub-tab; CustomTestList retired → Tasks 2, 6, 8 (delete). ✓
- §2 Kid Detail 5 sub-tabs; Assignments ← `map_v_bank_assignment_overview` filtered → Tasks 5, 6. ✓
- §2 AI Studio sub-tabs (default review) → Task 7. ✓
- §2 replace `/parent` outright, no flag, delete `Parent.tsx` → Task 8. ✓
- Approach 3 (port 4 verbatim / rebuild structural / reuse shipped) → Task 1 (port), Tasks 3–8 (rebuild/reuse). ✓
- §6 ParentSettings prop adaptation = only reused-component change → Task 2. ✓
- §6 edges (unknown :id, empty kid, deep links, auth wrappers) → Task 6 (not-found + loading), Task 8 (custom-test retained, redirects, RequireActiveStudent placement). ✓
- §7 testing: typecheck+build + no-regression + manual QA; no migration/data-guard → Task 9. ✓
- §8 risks: ported-import scrub (Task 1 Step 2 STOPs on missing symbol), ParentSettings shape (Task 2), route blast radius (Task 8 enumerates every old path; redirects + retained custom-test). ✓
- §9 out-of-scope respected: no roster view, no flag, no engine/DB change, reused pages unrestyled. ✓

**2. Placeholder scan:** No TBD/TODO. Every code step has complete code. Task 2's edit is described against the exact lines recon quoted (`const { activeStudent } = useActiveStudent()`, the 4 `activeStudent.id` sites, the `display_name` site) — bounded and concrete, not "handle it". Task 8 Step 2's "remove import if no longer used elsewhere" is a concrete conditional with a check, not vagueness.

**3. Type consistency:** Ported `useKidDashboardData` exports `MasteryRow`/`SignalWithTag`/`WeekStats`/`KidDashboardData`; `MasteryHeatmap` consumes `{standards: Standard[], mastery: MasteryRow[]}`, `KidWeekSessions` `{recent: Session[], weekStats: WeekStats|null}`, `GrowthAreas` `{signals: SignalWithTag[]}` — KidDetail (Task 6) passes exactly these from `dash`. `KidAssignmentsList` prop `{studentId:string}` matches KidDetail's `<KidAssignmentsList studentId={id} />`. `ParentSettings` new props `{studentId?:string; displayName?:string}` match KidDetail's `<ParentSettings studentId={id} displayName={kid.display_name} />`. `getBankAssignmentOverview()→BankAssignmentOverviewRow[]` (fields `student_id,bank_name,lane,status,due_by,questions_correct,questions_total`) used exactly in Task 5. `useActiveStudent()` returns `{students: Student[]}` with `Student={id,display_name,grade,school_grade,avatar_emoji}` — used in Classroom (Task 4) and KidDetail (Task 6). `RequireAuth`/`RequireParentPin`/`RequireActiveStudent` are `{children}` wrappers — used as such in Task 8. Route paths are consistent: nav `/parent`,`/parent/tests`,`/parent/ai-studio` (Task 3) ↔ ParentArea `index`,`tests`,`ai-studio` (Task 8); KidDetail link `/parent/kids/:id` ↔ ParentArea `kids/:id`. No mismatches.

**Documented deviation (intent preserved):** authoring routes kept at `/parent/custom-bank/new-*` (not re-pathed to `/parent/ai-studio/...`) so reused `CustomBank` stays unedited — recorded at the top of this plan and consistent with spec §4's intent ("authoring hangs off the review queue").
