# Parent Area 2a — Shell + Classroom + Kid Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `parent_v2`-gated parent shell, `/parent` Classroom landing, and `/parent/kids/:id` Kid detail (4 query-param tabs), reusing the existing dashboard blocks via a shared data hook so the flag-off path stays byte-identical.

**Architecture:** A `ParentRoot` resolver at `/parent/*` reads `getParentV2(familyId)` (Cycle-1 lib) and renders either the untouched legacy `<Parent/>` or a new `<ParentShell>` with React-Router child routes (Classroom, KidDetail). `ParentDashboard.tsx` is refactored into a shared `useKidDashboardData(studentId)` hook + three presentational components (`MasteryHeatmap`, `GrowthAreas`, `KidWeekSessions`); legacy `ParentDashboard` recomposes them via the hook with `activeStudent.id` (single loader, identical markup), Kid-detail tabs render them with the URL `:id`. The Assignments tab is the only genuinely new surface, built on Cycle-1 `getAssignmentOverview`/`revokeAssignment`.

**Tech Stack:** Vite + React 18 + React Router v6 + TypeScript + Tailwind. No new deps, no React test runner (repo convention: Node DB scripts + `npm run typecheck && npm run build` + a manual QA checklist). Cycle-1 lib `src/lib/parent/{queries,mutations,types}.ts` already exists and is proven.

**Reference spec:** `docs/superpowers/specs/2026-05-18-parent-area-2a-shell-classroom-kiddetail-design.md`. Branch: `feat/parent-area-2a` (already checked out, stacked on Cycle 1).

---

## File Structure

- Create `src/components/parent/useKidDashboardData.ts` — the exact combined dashboard fetch from `ParentDashboard.tsx`, parametrized by `studentId`. One responsibility: load a kid's mastery/standards/signals/sessions/week-stats with unified loading/error.
- Create `src/components/parent/MasteryHeatmap.tsx` — presentational heatmap card (owns only the subject-toggle UI state). Props: `standards`, `mastery`.
- Create `src/components/parent/GrowthAreas.tsx` — presentational weakness card. Props: `signals`.
- Create `src/components/parent/KidWeekSessions.tsx` — presentational "This week" + "Recent sessions" cards. Props: `recent`, `weekStats`.
- Modify `src/pages/parent/ParentDashboard.tsx` — becomes a thin composition over the hook + 3 components (legacy flag-off path; byte-identical render).
- Create `src/components/parent/ParentShell.tsx` — new header/nav + `<Outlet/>` (flag-on shell).
- Create `src/pages/parent/Classroom.tsx` + `src/components/parent/classroom/{KidRosterCard,CrossKidStrip,ClassroomQuickActions}.tsx`.
- Create `src/pages/parent/KidDetail.tsx` — 4 `?tab=` tabs.
- Create `src/pages/parent/ParentRoot.tsx` — `parent_v2` resolver.
- Modify `src/App.tsx` — route `/parent/*` → `ParentRoot`; add `/parent/dashboard` redirect; leave all other parent routes untouched.
- Create `scripts/test-parent-2a-data.mjs` — Node regression guard on the Cycle-1 lib calls 2a consumes (reuses the Cycle-1 harness).

Existing helpers (`SubjectToggle`, `Legend`, `Swatch`, `SignalCard`, `Stat`, `statusTone`, `dateKey`, `computeWeekStats`) move verbatim into the component that uses them.

---

### Task 1: Extract the shared dashboard data hook

**Files:**
- Create: `src/components/parent/useKidDashboardData.ts`

- [ ] **Step 1: Write the hook (verbatim fetch from ParentDashboard.tsx lines 13-101, parametrized by studentId)**

```ts
// src/components/parent/useKidDashboardData.ts
// The exact combined dashboard fetch previously inline in ParentDashboard.tsx,
// parametrized by studentId. Single unified loading/error so the legacy
// flag-off composition stays byte-identical (one "Loading…", not three).
import { useEffect, useState } from 'react'
import { fetchStudentGrade, supabase } from '../../lib/supabase'
import type { MisconceptionSignal, MisconceptionTag, Session, Standard } from '../../lib/types'

export interface MasteryRow {
  standard_id: string
  status: 'mastered' | 'developing' | 'growth'
  attempts: number
  mastery_score: number | null
}

export type SignalWithTag = MisconceptionSignal & { tag: MisconceptionTag | null }

export interface WeekStats {
  attempts: number
  daysActive: number
  streakDays: number
}

export interface KidDashboardData {
  standards: Standard[]
  mastery: MasteryRow[]
  signals: SignalWithTag[]
  recent: Session[]
  weekStats: WeekStats | null
  loading: boolean
  error: string | null
}

export function useKidDashboardData(studentId: string | undefined): KidDashboardData {
  const [standards, setStandards] = useState<Standard[]>([])
  const [mastery, setMastery] = useState<MasteryRow[]>([])
  const [signals, setSignals] = useState<SignalWithTag[]>([])
  const [recent, setRecent] = useState<Session[]>([])
  const [weekStats, setWeekStats] = useState<WeekStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Caller contract: do not mount consumers until studentId is defined —
    // an undefined id intentionally keeps loading:true (no error, no fetch).
    if (!studentId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      const since28 = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString()
      const grade = await fetchStudentGrade(studentId)
      if (cancelled) return
      const [stdRes, masteryRes, signalsRes, sessionsRes, attemptsRes] = await Promise.all([
        supabase
          .from('map_standards')
          .select('*')
          .eq('grade', grade)
          .order('subject')
          .order('sort_order'),
        supabase
          .from('map_v_mastery_by_standard')
          .select('standard_id, status, attempts, mastery_score')
          .eq('student_id', studentId),
        supabase
          .from('map_misconception_signals')
          .select('*, tag:map_misconception_tags(*)')
          .eq('student_id', studentId)
          .order('occurrence_count', { ascending: false }),
        supabase
          .from('map_test_sessions')
          .select('*')
          .eq('student_id', studentId)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(10),
        supabase
          .from('map_attempts')
          .select('answered_at')
          .eq('student_id', studentId)
          .gte('answered_at', since28)
          .order('answered_at', { ascending: false }),
      ])
      if (cancelled) return
      if (stdRes.error || masteryRes.error || signalsRes.error || sessionsRes.error || attemptsRes.error) {
        setError(
          stdRes.error?.message ??
            masteryRes.error?.message ??
            signalsRes.error?.message ??
            sessionsRes.error?.message ??
            attemptsRes.error?.message ??
            'Failed to load.',
        )
        setLoading(false)
        return
      }
      setStandards((stdRes.data ?? []) as Standard[])
      setMastery((masteryRes.data ?? []) as MasteryRow[])
      setSignals((signalsRes.data ?? []) as SignalWithTag[])
      setRecent((sessionsRes.data ?? []) as Session[])
      setWeekStats(computeWeekStats((attemptsRes.data ?? []) as { answered_at: string }[]))
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [studentId])

  return { standards, mastery, signals, recent, weekStats, loading, error }
}

function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function computeWeekStats(rows: { answered_at: string }[]): WeekStats {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const dayMap = new Map<string, number>()
  for (const r of rows) {
    const d = new Date(r.answered_at)
    const key = dateKey(d)
    dayMap.set(key, (dayMap.get(key) ?? 0) + 1)
  }
  let attempts = 0
  let daysActive = 0
  for (const r of rows) {
    if (new Date(r.answered_at) >= weekAgo) attempts++
  }
  for (const [key, count] of dayMap) {
    if (count > 0) {
      const d = new Date(key + 'T12:00:00')
      if (d >= weekAgo) daysActive++
    }
  }
  let streak = 0
  for (let i = 0; i < 60; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    const key = dateKey(d)
    if (dayMap.has(key)) streak++
    else break
  }
  return { attempts, daysActive, streakDays: streak }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no errors. (If `MisconceptionSignal`/`MisconceptionTag`/`Session`/`Standard` import paths differ, fix the import to match `src/lib/types.ts` — do not invent types.)

- [ ] **Step 3: Commit**

```bash
git add src/components/parent/useKidDashboardData.ts
git commit -m "feat(parent) extract useKidDashboardData hook (verbatim combined fetch, by studentId)"
```

---

### Task 2: MasteryHeatmap presentational component

**Files:**
- Create: `src/components/parent/MasteryHeatmap.tsx`

- [ ] **Step 1: Write the component (heatmap card markup verbatim from ParentDashboard.tsx lines 145-179 + helpers 284-331,369-373; props instead of fetch)**

```tsx
// src/components/parent/MasteryHeatmap.tsx
// Presentational. Markup copied verbatim from the legacy ParentDashboard
// "Topic Mastery Heatmap" card — no redesign. Owns only the subject-toggle UI state.
import { useMemo, useState } from 'react'
import type { Standard, Subject } from '../../lib/types'
import type { MasteryRow } from './useKidDashboardData'

export function MasteryHeatmap({
  standards,
  mastery,
}: {
  standards: Standard[]
  mastery: MasteryRow[]
}) {
  const [subject, setSubject] = useState<Subject>('math')

  const masteryByStandard = useMemo(() => {
    const m = new Map<string, MasteryRow>()
    for (const row of mastery) m.set(row.standard_id, row)
    return m
  }, [mastery])

  const subjectStandards = useMemo(
    () => standards.filter((s) => s.subject === subject),
    [standards, subject],
  )

  const subjectStats = useMemo(() => {
    const counts = { mastered: 0, developing: 0, growth: 0, untouched: 0 }
    for (const s of subjectStandards) {
      const m = masteryByStandard.get(s.id)
      if (!m) counts.untouched++
      else if (m.status === 'mastered') counts.mastered++
      else if (m.status === 'developing') counts.developing++
      else if (m.status === 'growth') counts.growth++
    }
    return counts
  }, [subjectStandards, masteryByStandard])

  return (
    <div className="card p-5">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl">Topic Mastery Heatmap</h2>
          <p className="text-xs text-ink/60">
            Each tile is one topic. Color = current mastery for the chosen subject.
          </p>
        </div>
        <SubjectToggle value={subject} onChange={setSubject} />
      </header>
      <Legend counts={subjectStats} />
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {subjectStandards.map((s) => {
          const row = masteryByStandard.get(s.id)
          const tone = row ? statusTone(row.status) : 'bg-cloud'
          const label = row ? row.status : 'untouched'
          return (
            <div
              key={s.id}
              className={`rounded-2xl ${tone} p-3 text-ink/90 ring-1 ring-ink/5`}
              title={`${s.teks_code} — ${s.teks_title} (${label}${row?.mastery_score != null ? `, ${(row.mastery_score * 100).toFixed(0)}%` : ''})`}
            >
              <p className="font-mono text-xs font-bold">{s.teks_code}</p>
              <p className="mt-1 text-xs leading-snug">{s.teks_title}</p>
              {row?.mastery_score != null && (
                <p className="mt-2 font-mono text-[11px] text-ink/70">
                  {(row.mastery_score * 100).toFixed(0)}% over {row.attempts} question
                  {row.attempts === 1 ? '' : 's'} attempted
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SubjectToggle({
  value,
  onChange,
}: {
  value: Subject
  onChange: (s: Subject) => void
}) {
  return (
    <div className="inline-flex rounded-full bg-cream p-1 text-xs font-semibold ring-1 ring-cloud">
      {(['math', 'reading', 'language'] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={`rounded-full px-3 py-1 transition ${
            value === s ? 'bg-white text-ink shadow' : 'text-ink/60'
          }`}
        >
          {s[0].toUpperCase() + s.slice(1)}
        </button>
      ))}
    </div>
  )
}

function Legend({
  counts,
}: {
  counts: { mastered: number; developing: number; growth: number; untouched: number }
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <Swatch tone="bg-leaf/30" label={`Mastered (${counts.mastered})`} />
      <Swatch tone="bg-sky/30" label={`Developing (${counts.developing})`} />
      <Swatch tone="bg-sun/40" label={`Weak / growth area (${counts.growth})`} />
      <Swatch tone="bg-cloud" label={`Not yet attempted (${counts.untouched})`} />
    </div>
  )
}

function Swatch({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded ${tone} ring-1 ring-ink/10`} />
      <span className="text-ink/70">{label}</span>
    </span>
  )
}

function statusTone(status: 'mastered' | 'developing' | 'growth'): string {
  if (status === 'mastered') return 'bg-leaf/30'
  if (status === 'developing') return 'bg-sky/30'
  return 'bg-sun/40'
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/parent/MasteryHeatmap.tsx
git commit -m "feat(parent) MasteryHeatmap presentational component (verbatim from ParentDashboard)"
```

---

### Task 3: GrowthAreas presentational component

**Files:**
- Create: `src/components/parent/GrowthAreas.tsx`

- [ ] **Step 1: Write the component (weakness card markup verbatim from ParentDashboard.tsx lines 181-218 + SignalCard 333-358; props instead of fetch)**

```tsx
// src/components/parent/GrowthAreas.tsx
// Presentational. Markup copied verbatim from the legacy ParentDashboard
// "Active areas of weakness" card — no redesign.
import type { SignalWithTag } from './useKidDashboardData'

export function GrowthAreas({ signals }: { signals: SignalWithTag[] }) {
  const activeSignals = signals.filter((s) => s.active && s.tag)
  const clearedSignals = signals.filter((s) => !s.active && s.tag)

  return (
    <div className="card p-5">
      <header className="mb-4">
        <h2 className="font-display text-2xl">Active areas of weakness</h2>
        <p className="text-xs text-ink/60">
          Patterns the student has gotten wrong at least 3 times. Sorted by frequency.
          These are the only places the word "weakness" is used in the app — never shown to
          the student.
        </p>
      </header>
      {activeSignals.length === 0 ? (
        <p className="rounded-2xl bg-leaf/10 p-4 text-sm text-ink/80 ring-1 ring-leaf/30">
          No active weakness signals right now. The student is clearing misconceptions or
          hasn’t accumulated enough evidence yet.
        </p>
      ) : (
        <div className="space-y-3">
          {activeSignals.map((s) => (
            <SignalCard key={s.id} signal={s} />
          ))}
        </div>
      )}
      {clearedSignals.length > 0 && (
        <details className="mt-5 rounded-2xl bg-cream/60 p-3 text-sm">
          <summary className="cursor-pointer font-semibold">
            {clearedSignals.length} cleared signal
            {clearedSignals.length === 1 ? '' : 's'} (history)
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-ink/70">
            {clearedSignals.map((s) => (
              <li key={s.id}>
                <span className="font-semibold">{s.tag?.display_name}</span> — cleared{' '}
                {s.cleared_at && new Date(s.cleared_at).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function SignalCard({ signal }: { signal: SignalWithTag }) {
  const tag = signal.tag!
  const lastSeen = new Date(signal.last_seen_at).toLocaleDateString()
  return (
    <div className="rounded-2xl border border-sun/30 bg-sun/5 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-lg leading-snug">{tag.display_name}</p>
        <p className="text-xs font-semibold text-ink/60">
          ×{signal.occurrence_count} • last seen {lastSeen}
        </p>
      </div>
      <p className="mt-2 text-sm text-ink/80">{tag.description}</p>
      {tag.remediation_hint && (
        <p className="mt-3 rounded-xl bg-paper p-3 text-sm text-ink/90 ring-1 ring-cloud">
          <span className="font-semibold">Try this at home: </span>
          {tag.remediation_hint}
        </p>
      )}
      {tag.related_teks && tag.related_teks.length > 0 && (
        <p className="mt-2 font-mono text-[11px] text-ink/50">
          Topics: {tag.related_teks.join(', ')}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/parent/GrowthAreas.tsx
git commit -m "feat(parent) GrowthAreas presentational component (verbatim from ParentDashboard)"
```

---

### Task 4: KidWeekSessions presentational component

**Files:**
- Create: `src/components/parent/KidWeekSessions.tsx`

- [ ] **Step 1: Write the component (the two aside cards verbatim from ParentDashboard.tsx lines 222-278 + Stat 360-367; props instead of fetch)**

```tsx
// src/components/parent/KidWeekSessions.tsx
// Presentational. "This week" + "Recent sessions" cards copied verbatim from
// the legacy ParentDashboard aside — no redesign.
import { gradeContext } from '../../lib/rit'
import type { Session } from '../../lib/types'
import type { WeekStats } from './useKidDashboardData'

export function KidWeekSessions({
  recent,
  weekStats,
}: {
  recent: Session[]
  weekStats: WeekStats | null
}) {
  return (
    <div className="space-y-6">
      <div className="card p-5">
        <h2 className="font-display text-xl">This week</h2>
        {weekStats ? (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat label="Questions Attempted" value={weekStats.attempts} />
            <Stat label="Days active" value={weekStats.daysActive} />
            <Stat label="Streak" value={`${weekStats.streakDays}d`} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink/60">No questions attempted yet.</p>
        )}
        <p className="mt-3 text-xs text-ink/50">
          Streak counts consecutive days back from today with at least one question attempted.
        </p>
      </div>

      <div className="card p-5">
        <h2 className="font-display text-xl">Recent sessions</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-ink/60">No completed sessions yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-cloud/70">
            {recent.map((s) => {
              const total = s.planned_length
              const acc = total > 0 ? Math.round((s.correct_count / total) * 100) : 0
              return (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <p className="font-semibold">
                      <span className="capitalize">{s.subject}</span>{' '}
                      {s.kind === 'boost'
                        ? '⚡ boost'
                        : s.kind === 'custom'
                          ? '🎯 custom'
                          : 'test'}
                    </p>
                    <p className="text-xs text-ink/60">
                      {s.completed_at &&
                        new Date(s.completed_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                      • {s.correct_count}/{total} ({acc}%)
                      {s.estimated_rit != null && ` • RIT ${s.estimated_rit}`}
                    </p>
                    {s.estimated_rit != null && s.kind === 'test' && (
                      <p className="text-[11px] text-ink/40">
                        {gradeContext(s.estimated_rit)}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-cream/60 p-2">
      <p className="font-display text-2xl">{value}</p>
      <p className="text-[10px] uppercase tracking-widest text-smoke">{label}</p>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/parent/KidWeekSessions.tsx
git commit -m "feat(parent) KidWeekSessions presentational component (verbatim from ParentDashboard)"
```

---

### Task 5: Rewrite ParentDashboard as a thin composition (legacy flag-off path, byte-identical)

**Files:**
- Modify: `src/pages/parent/ParentDashboard.tsx` (replace entire file)

- [ ] **Step 1: Replace the whole file with the composition**

```tsx
// src/pages/parent/ParentDashboard.tsx
// Legacy flag-off dashboard. Recomposed from the extracted components via the
// shared hook so render output is byte-identical to the pre-2a version: same
// grid, same single "Loading…"/error guards, same blocks in the same order.
import { useActiveStudent } from '../../lib/activeStudent'
import { GrowthAreas } from '../../components/parent/GrowthAreas'
import { KidWeekSessions } from '../../components/parent/KidWeekSessions'
import { MasteryHeatmap } from '../../components/parent/MasteryHeatmap'
import { useKidDashboardData } from '../../components/parent/useKidDashboardData'

export default function ParentDashboard() {
  const { activeStudent } = useActiveStudent()
  const { standards, mastery, signals, recent, weekStats, loading, error } =
    useKidDashboardData(activeStudent?.id)

  if (loading) {
    return <p className="mt-12 text-center font-display text-2xl">Loading…</p>
  }

  if (error) {
    return (
      <div className="card p-8 text-center">
        <p className="font-display text-2xl">Couldn’t load the dashboard.</p>
        <p className="mt-2 text-sm text-ink/60">{error}</p>
      </div>
    )
  }

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <section className="md:col-span-2 space-y-6">
        <MasteryHeatmap standards={standards} mastery={mastery} />
        <GrowthAreas signals={signals} />
      </section>
      <aside className="space-y-6">
        <KidWeekSessions recent={recent} weekStats={weekStats} />
      </aside>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both exit 0. No other file imports the now-removed inline helpers (they were all local to `ParentDashboard.tsx`); if the build reports an unused/again-declared symbol, the cause is a stale import elsewhere — grep `grep -rn "from './ParentDashboard'" src` should return only `src/pages/parent/Parent.tsx` (which imports the default export, unchanged).

- [ ] **Step 3: Manual render-parity check**

Run `npm run dev`, open the app signed in with a family that has `parent_v2 = false` (default), go to `/parent`. Confirm the dashboard renders the heatmap (with working subject toggle), the weakness section, and the This-week/Recent-sessions aside — visually identical to before, with a single "Loading…" then content. This is the spec §11 extraction-fidelity guard. If anything differs structurally, STOP and report (do not "fix" by redesigning).

- [ ] **Step 4: Commit**

```bash
git add src/pages/parent/ParentDashboard.tsx
git commit -m "refactor(parent) ParentDashboard = thin composition over hook + extracted components (byte-identical legacy)"
```

---

### Task 6: ParentShell (flag-on header/nav + Outlet)

**Files:**
- Create: `src/components/parent/ParentShell.tsx`

- [ ] **Step 1: Write the shell**

```tsx
// src/components/parent/ParentShell.tsx
// Flag-on parent shell: header + nav + routed content. Interim nav targets
// (Library/Tests/History) point at existing legacy routes per the 2a spec;
// 2b/2c flip these in one place.
import { Link, NavLink, Outlet } from 'react-router-dom'

const navItems: { to: string; label: string }[] = [
  { to: '/parent', label: 'Classroom' },
  { to: '/parent/custom-bank', label: 'Library' },
  { to: '/parent/custom-test', label: 'Tests' },
  { to: '/history', label: 'History' },
]

export default function ParentShell() {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 mt-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <span className="font-display text-2xl">Practice</span>
          <nav className="flex items-center gap-1 text-sm">
            {navItems.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/parent'}
                className={({ isActive }) =>
                  `rounded-full px-3 py-1.5 font-semibold transition ${
                    isActive ? 'bg-white text-ink shadow ring-1 ring-cloud' : 'text-ink/60 hover:text-ink'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <Link to="/" className="btn-ghost text-sm">
          Switch profile
        </Link>
      </header>
      <Outlet />
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/parent/ParentShell.tsx
git commit -m "feat(parent) ParentShell — flag-on header/nav with interim legacy targets"
```

---

### Task 7: Classroom landing + cards

**Files:**
- Create: `src/components/parent/classroom/CrossKidStrip.tsx`
- Create: `src/components/parent/classroom/KidRosterCard.tsx`
- Create: `src/components/parent/classroom/ClassroomQuickActions.tsx`
- Create: `src/pages/parent/Classroom.tsx`

- [ ] **Step 1: Write CrossKidStrip**

```tsx
// src/components/parent/classroom/CrossKidStrip.tsx
import type { ClassroomRosterRow } from '../../../lib/parent/types'

export function CrossKidStrip({ rows }: { rows: ClassroomRosterRow[] }) {
  const questions = rows.reduce((a, r) => a + (r.questions_this_week ?? 0), 0)
  const activeDays = rows.reduce((a, r) => a + (r.active_days_this_week ?? 0), 0)
  const misconceptionCount = rows.reduce((a, r) => a + (r.active_misconceptions ?? 0), 0)
  return (
    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Tile label="Questions this week" value={questions} />
      <Tile label="Active days" value={activeDays} />
      <Tile
        label="Growth areas needing attention"
        value={misconceptionCount}
        warn={misconceptionCount > 0}
      />
    </div>
  )
}

function Tile({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`card p-4 ${warn ? 'ring-1 ring-sun/50 bg-sun/5' : ''}`}>
      <p className="font-display text-3xl">{value}</p>
      <p className="text-[11px] uppercase tracking-widest text-smoke">{label}</p>
    </div>
  )
}
```

- [ ] **Step 2: Write KidRosterCard**

```tsx
// src/components/parent/classroom/KidRosterCard.tsx
import { Link, useNavigate } from 'react-router-dom'
import type { ClassroomRosterRow } from '../../../lib/parent/types'

export function KidRosterCard({ row }: { row: ClassroomRosterRow }) {
  const navigate = useNavigate()
  const noPractice = (row.questions_this_week ?? 0) === 0 && (row.active_days_this_week ?? 0) === 0
  const needsAttention = (row.active_misconceptions ?? 0) > 0 || noPractice
  const unseen = 0 // unseen-standard count is not in the roster view; segment shows 0 in 2a
  const distTotal =
    (row.standards_mastered + row.standards_developing + row.standards_growth + unseen) || 1
  const seg = (n: number) => `${(n / distTotal) * 100}%`
  return (
    <div className="card relative flex flex-col gap-3 p-5">
      {needsAttention && (
        <span className="absolute right-4 top-4 rounded-full bg-sun/20 px-2 py-0.5 text-[11px] font-semibold text-ink/70 ring-1 ring-sun/40">
          Needs attention
        </span>
      )}
      <div>
        <p className="font-display text-2xl">{row.display_name}</p>
        <p className="text-xs text-ink/60">
          Grade {row.grade}
          {row.current_band ? ` · band ${row.current_band}` : ''}
        </p>
      </div>
      <div>
        {noPractice ? (
          <p className="text-sm text-ink/40">No practice this week</p>
        ) : (
          <p className="text-sm text-ink/70">
            {row.questions_this_week} questions · {row.active_days_this_week} days
          </p>
        )}
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-cloud">
        <span className="bg-leaf/50" style={{ width: seg(row.standards_mastered) }} />
        <span className="bg-sky/50" style={{ width: seg(row.standards_developing) }} />
        <span className="bg-sun/50" style={{ width: seg(row.standards_growth) }} />
      </div>
      <p className="text-[11px] text-ink/50">
        {row.standards_mastered} mastered · {row.standards_developing} developing ·{' '}
        {row.standards_growth} growth
      </p>
      {row.last_session && (
        <p className="text-[11px] text-ink/40">
          Last: {row.last_session.subject}
          {row.last_session.score != null ? ` · ${row.last_session.score}%` : ''}
          {row.last_session.completed_at
            ? ` · ${new Date(row.last_session.completed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
            : ''}
        </p>
      )}
      <div className="mt-1 flex items-center gap-2">
        <Link
          to={`/parent/kids/${row.student_id}`}
          className="btn-secondary flex-1 text-center text-sm"
        >
          Open dashboard
        </Link>
        <button
          type="button"
          title="Assign a test"
          onClick={() => navigate('/parent/custom-test')}
          className="btn-ghost px-3 text-sm"
        >
          +
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write ClassroomQuickActions**

```tsx
// src/components/parent/classroom/ClassroomQuickActions.tsx
import { Link } from 'react-router-dom'

export function ClassroomQuickActions() {
  return (
    <div className="mt-6 flex flex-wrap gap-2">
      <Link to="/parent/custom-test" className="btn-secondary text-sm">
        Build test for multiple kids
      </Link>
      <Link to="/parent/custom-bank" className="btn-secondary text-sm">
        Open content library
      </Link>
    </div>
  )
}
```

- [ ] **Step 4: Write Classroom page**

```tsx
// src/pages/parent/Classroom.tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getClassroomRoster } from '../../lib/parent/queries'
import type { ClassroomRosterRow } from '../../lib/parent/types'
import { CrossKidStrip } from '../../components/parent/classroom/CrossKidStrip'
import { KidRosterCard } from '../../components/parent/classroom/KidRosterCard'
import { ClassroomQuickActions } from '../../components/parent/classroom/ClassroomQuickActions'

export default function Classroom() {
  const [rows, setRows] = useState<ClassroomRosterRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void getClassroomRoster()
      .then((r) => {
        if (!cancelled) setRows(r)
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Failed to load classroom.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div className="card p-8 text-center">
        <p className="font-display text-2xl">Couldn’t load your classroom.</p>
        <p className="mt-2 text-sm text-ink/60">{error}</p>
      </div>
    )
  }
  if (!rows) {
    return <p className="mt-12 text-center font-display text-2xl">Loading…</p>
  }

  return (
    <div>
      <header className="mb-6">
        <p className="font-display text-lg uppercase tracking-widest text-smoke">Parent view</p>
        <h1 className="font-display text-4xl">Your classroom</h1>
      </header>

      {rows.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-display text-2xl">No kids yet.</p>
          <Link to="/onboarding" className="btn-secondary mt-4 inline-block text-sm">
            + Add your first kid
          </Link>
        </div>
      ) : (
        <>
          <CrossKidStrip rows={rows} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <KidRosterCard key={r.student_id} row={r} />
            ))}
            <Link
              to="/onboarding"
              className="card flex min-h-[180px] items-center justify-center p-5 text-center text-ink/50 ring-1 ring-dashed ring-cloud hover:text-ink"
            >
              + Add a kid
            </Link>
          </div>
          <ClassroomQuickActions />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0. (`ClassroomRosterRow` fields used here — `student_id, display_name, grade, current_band, questions_this_week, active_days_this_week, active_misconceptions, standards_mastered, standards_developing, standards_growth, last_session` — all exist in `src/lib/parent/types.ts` per Cycle 1.)

- [ ] **Step 6: Commit**

```bash
git add src/components/parent/classroom/ src/pages/parent/Classroom.tsx
git commit -m "feat(parent) Classroom landing: roster cards, cross-kid strip, quick actions"
```

---

### Task 8: KidDetail with 4 query-param tabs

**Files:**
- Create: `src/pages/parent/KidDetail.tsx`

- [ ] **Step 1: Write KidDetail**

```tsx
// src/pages/parent/KidDetail.tsx
// Kid-scoped detail. Kid context is ALWAYS the URL :id (never activeStudent).
// Tabs via ?tab= so any URL is copyable/deep-linkable.
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getAssignmentOverview, getClassroomRoster } from '../../lib/parent/queries'
import { revokeAssignment } from '../../lib/parent/mutations'
import type { AssignmentOverviewRow, ClassroomRosterRow } from '../../lib/parent/types'
import { GrowthAreas } from '../../components/parent/GrowthAreas'
import { KidWeekSessions } from '../../components/parent/KidWeekSessions'
import { MasteryHeatmap } from '../../components/parent/MasteryHeatmap'
import { useKidDashboardData } from '../../components/parent/useKidDashboardData'

const TABS = ['mastery', 'sessions', 'growth', 'assignments'] as const
type Tab = (typeof TABS)[number]

export default function KidDetail() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const rawTab = params.get('tab')
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? '')
    ? (rawTab as Tab)
    : 'mastery'

  const [roster, setRoster] = useState<ClassroomRosterRow[] | null>(null)
  useEffect(() => {
    let c = false
    void getClassroomRoster().then((r) => !c && setRoster(r))
    return () => {
      c = true
    }
  }, [])

  const kid = useMemo(
    () => roster?.find((r) => r.student_id === id) ?? null,
    [roster, id],
  )
  const dash = useKidDashboardData(kid ? id : undefined)

  if (roster && !kid) {
    return (
      <div className="card p-8 text-center">
        <p className="font-display text-2xl">Not found in your classroom.</p>
        <Link to="/parent" className="btn-secondary mt-4 inline-block text-sm">
          Back to classroom
        </Link>
      </div>
    )
  }
  if (!roster || !kid) {
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
        <div className="mt-1 flex items-center justify-between gap-3">
          <h1 className="font-display text-3xl">
            {kid.display_name}{' '}
            <span className="text-base text-ink/50">Grade {kid.grade}</span>
          </h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate('/parent/custom-test')}
              className="btn-secondary text-sm"
            >
              Assign a test
            </button>
            <button
              type="button"
              onClick={() => navigate('/boost')}
              className="btn-ghost text-sm"
            >
              Boost session
            </button>
          </div>
        </div>
        <nav className="mt-4 flex gap-1 text-sm">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1.5 font-semibold capitalize transition ${
                tab === t ? 'bg-white text-ink shadow ring-1 ring-cloud' : 'text-ink/60'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      {dash.error && (
        <div className="card p-6 text-center text-sm text-ink/60">{dash.error}</div>
      )}
      {dash.loading && tab !== 'assignments' && (
        <p className="mt-8 text-center font-display text-xl">Loading…</p>
      )}

      {!dash.loading && tab === 'mastery' && (
        <MasteryHeatmap standards={dash.standards} mastery={dash.mastery} />
      )}
      {!dash.loading && tab === 'sessions' && (
        <KidWeekSessions recent={dash.recent} weekStats={dash.weekStats} />
      )}
      {!dash.loading && tab === 'growth' && <GrowthAreas signals={dash.signals} />}
      {tab === 'assignments' && <AssignmentsTab studentId={id} />}
    </div>
  )
}

function AssignmentsTab({ studentId }: { studentId: string }) {
  const [rows, setRows] = useState<AssignmentOverviewRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = () => {
    void getAssignmentOverview()
      .then((all) => setRows(all.filter((r) => r.student_id === studentId)))
      .catch((e) => setError(e?.message ?? 'Failed to load assignments.'))
  }
  useEffect(load, [studentId])

  if (error) return <div className="card p-6 text-sm text-ink/60">{error}</div>
  if (!rows) return <p className="mt-8 text-center font-display text-xl">Loading…</p>

  const active = rows.filter((r) => r.status === 'assigned' || r.status === 'in_progress')
  const completed = rows
    .filter((r) => r.status === 'completed')
    .slice(0, 10)

  const onRevoke = async (assignmentId: string) => {
    setBusy(assignmentId)
    try {
      await revokeAssignment(assignmentId)
      load()
    } catch (e) {
      setError((e as Error)?.message ?? 'Revoke failed.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h2 className="font-display text-xl">Active</h2>
        {active.length === 0 ? (
          <p className="mt-2 text-sm text-ink/60">No active assignments.</p>
        ) : (
          <ul className="mt-3 divide-y divide-cloud/70">
            {active.map((r) => (
              <li key={r.assignment_id} className="flex items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-semibold">{r.definition_name}</p>
                  <p className="text-xs text-ink/60">
                    <span className="capitalize">{r.subject}</span> · {r.status}
                    {r.due_by
                      ? ` · due ${new Date(r.due_by).toLocaleDateString()}`
                      : ''}
                  </p>
                  {r.parent_note && (
                    <p className="mt-1 text-xs text-ink/50">“{r.parent_note}”</p>
                  )}
                </div>
                {r.status === 'assigned' && (
                  <button
                    type="button"
                    disabled={busy === r.assignment_id}
                    onClick={() => onRevoke(r.assignment_id)}
                    className="btn-ghost text-xs"
                  >
                    {busy === r.assignment_id ? '…' : 'Revoke'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <h2 className="font-display text-xl">Recent completed</h2>
        {completed.length === 0 ? (
          <p className="mt-2 text-sm text-ink/60">No completed assignments yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-cloud/70">
            {completed.map((r) => (
              <li key={r.assignment_id} className="flex items-center justify-between gap-2 py-2">
                <p className="font-semibold">{r.definition_name}</p>
                <p className="text-xs text-ink/60">
                  {r.completed_at
                    ? new Date(r.completed_at).toLocaleDateString()
                    : ''}
                  {r.score != null ? ` · ${r.score}%` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0. Field names used (`assignment_id, definition_name, subject, status, due_by, parent_note, student_id, completed_at, score`) all exist on `AssignmentOverviewRow` in `src/lib/parent/types.ts` per Cycle 1.

- [ ] **Step 3: Commit**

```bash
git add src/pages/parent/KidDetail.tsx
git commit -m "feat(parent) KidDetail: 4 query-param tabs (mastery/sessions/growth/assignments)"
```

---

### Task 9: ParentRoot resolver + App.tsx rewiring + redirect

**Files:**
- Create: `src/pages/parent/ParentRoot.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write ParentRoot**

```tsx
// src/pages/parent/ParentRoot.tsx
// parent_v2 resolver. flag off/null/no-family -> untouched legacy <Parent/>.
// flag on -> new ParentShell with child routes. Single source of the flag check.
import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import { useActiveStudent } from '../../lib/activeStudent'
import { getParentV2 } from '../../lib/parent/queries'
import ParentShell from '../../components/parent/ParentShell'
import Parent from './Parent'
import Classroom from './Classroom'
import KidDetail from './KidDetail'

function DashboardRedirect() {
  const [params] = useSearchParams()
  const kid = params.get('kid')
  return <Navigate to={kid ? `/parent/kids/${kid}` : '/parent'} replace />
}

export default function ParentRoot() {
  const { familyId, loading: studentLoading } = useActiveStudent()
  const [v2, setV2] = useState<boolean | null>(null)
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    if (studentLoading) return
    let cancelled = false
    if (!familyId) {
      setV2(false)
      setResolved(true)
      return
    }
    void getParentV2(familyId)
      .then((flag) => {
        if (!cancelled) {
          setV2(flag)
          setResolved(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setV2(false)
          setResolved(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [familyId, studentLoading])

  if (studentLoading || !resolved) {
    return <p className="mt-12 text-center font-display text-2xl">Loading…</p>
  }

  if (!v2) {
    return <Parent />
  }

  return (
    <Routes>
      <Route element={<ParentShell />}>
        <Route index element={<Classroom />} />
        <Route path="kids/:id" element={<KidDetail />} />
        <Route path="dashboard" element={<DashboardRedirect />} />
        <Route path="*" element={<Navigate to="/parent" replace />} />
      </Route>
    </Routes>
  )
}
```

- [ ] **Step 2: Rewire `src/App.tsx`**

Replace the import line:
```tsx
import Parent from './pages/parent/Parent'
```
with:
```tsx
import ParentRoot from './pages/parent/ParentRoot'
```

Replace the entire `<Route path="/parent" .../>` element block:
```tsx
          <Route
            path="/parent"
            element={
              <RequireAuth>
                <RequireActiveStudent>
                  <RequireParentPin>
                    <Parent />
                  </RequireParentPin>
                </RequireActiveStudent>
              </RequireAuth>
            }
          />
```
with (note `path="/parent/*"` so the nested child routes resolve):
```tsx
          <Route
            path="/parent/*"
            element={
              <RequireAuth>
                <RequireActiveStudent>
                  <RequireParentPin>
                    <ParentRoot />
                  </RequireParentPin>
                </RequireActiveStudent>
              </RequireAuth>
            }
          />
```
Leave every other `/parent/custom-*`, `/parent/connect-ai`, and settings route exactly as-is. They are declared BEFORE the catch-all and as siblings; React Router v6 ranks the more specific static paths (`/parent/custom-bank`) above `/parent/*`, so they keep working regardless of the flag.

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both exit 0. Then `grep -rn "pages/parent/Parent'" src` — should show only `src/pages/parent/ParentRoot.tsx` importing `./Parent` (App.tsx no longer imports `Parent` directly).

- [ ] **Step 4: Commit**

```bash
git add src/pages/parent/ParentRoot.tsx src/App.tsx
git commit -m "feat(parent) ParentRoot resolver + /parent/* rewiring + /parent/dashboard redirect"
```

---

### Task 10: Verification — data regression script + full build + manual QA

**Files:**
- Create: `scripts/test-parent-2a-data.mjs`

- [ ] **Step 1: Write the data regression script (reuses the Cycle-1 harness)**

```js
// scripts/test-parent-2a-data.mjs
// Regression guard on the Cycle-1 lib calls 2a's UI consumes. The lib is
// already proven by Cycle-1 gates; this asserts no regression in the exact
// call shapes 2a depends on, under a signed-in family client.
// Run: node --env-file=.env.local scripts/test-parent-2a-data.mjs
import { admin, setup, signInClient, teardown, assert } from './_parent-redesign-helpers.mjs';

const ctx = await setup();
try {
  const ca = await signInClient(ctx.A.email, ctx.A.password);

  // getParentV2 reflects map_families.parent_v2 (default false for the test family).
  const { data: fam, error: fe } = await ca
    .from('map_families').select('parent_v2').eq('id', ctx.A.familyId).single();
  assert(!fe && fam.parent_v2 === false, 'getParentV2 source: parent_v2 defaults false');

  // Classroom roster: one row per kid, family-scoped.
  const { data: roster, error: re } = await ca
    .from('map_v_classroom_roster').select('*');
  assert(!re && roster.length === 2 && roster.every((r) => r.family_id === ctx.A.familyId),
    'classroom roster: 2 rows, family-scoped');
  assert(roster.every((r) =>
    'standards_mastered' in r && 'active_misconceptions' in r &&
    'questions_this_week' in r && 'last_session' in r),
    'roster row shape matches ClassroomRosterRow');

  // Assignment overview filtered to one kid + revoke lifecycle.
  const { data: def } = await ca.rpc('map_create_test_definition', {
    p_name: '2a smoke', p_subject: 'math', p_grade: 2, p_planned_length: 10,
    p_source_mix: 'vetted_only', p_custom_pct: null, p_difficulty_mix: null,
    p_standard_codes: [], p_custom_question_ids: [], p_custom_passage_ids: [], p_is_template: false,
  });
  const { data: ids } = await ca.rpc('map_assign_test_definition', {
    p_definition_id: def, p_student_ids: [ctx.A.kids[0].id], p_due_by: null, p_parent_note: 'after dinner',
  });
  const { data: ov, error: oe } = await ca
    .from('map_v_assignment_overview').select('*').eq('student_id', ctx.A.kids[0].id);
  assert(!oe && ov.length === 1 && ov[0].definition_name === '2a smoke'
    && ov[0].status === 'assigned',
    'assignment overview filtered to kid returns the assigned row');

  const { error: rvOk } = await ca.rpc('map_revoke_assignment', { p_assignment_id: ids[0] });
  assert(!rvOk, 'revoke of assigned assignment succeeds');

  // Re-assign, force in_progress, confirm revoke now rejected (UI hides the control).
  const { data: ids2 } = await ca.rpc('map_assign_test_definition', {
    p_definition_id: def, p_student_ids: [ctx.A.kids[1].id], p_due_by: null, p_parent_note: null,
  });
  await admin.from('map_test_assignments')
    .update({ status: 'in_progress', session_id: ctx.customSessionId, started_at: new Date().toISOString() })
    .eq('id', ids2[0]);
  const { error: rvBad } = await ca.rpc('map_revoke_assignment', { p_assignment_id: ids2[0] });
  assert(!!rvBad, 'revoke of in_progress assignment is rejected');

  console.log('\n2a data checks complete.');
} finally {
  await teardown(ctx);
}
```

- [ ] **Step 2: Run the data script**

Run: `node --env-file=.env.local scripts/test-parent-2a-data.mjs ; echo "exit=$?"`
Expected: every line `PASS:`, ends `2a data checks complete.`, `exit=0`. (The Cycle-1 migration is already applied to the live dev DB, so these pass immediately — this is a regression guard, not red→green TDD; the repo has no component test harness and the spec explicitly forbids introducing one.) The harness `scripts/_parent-redesign-helpers.mjs` exports `admin`, `setup`, `signInClient`, `teardown`, `assert` (verified in Cycle 1); the imports at the top of this script match those exact names.

- [ ] **Step 3: Full typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both exit 0 (no UI regressions; all new pages/components/routes compile).

- [ ] **Step 4: Manual QA checklist (execute against `npm run dev`)**

Perform spec §10's checklist and record pass/fail for each:
1. Flag **off** (test family `parent_v2=false`): `/parent` = legacy stacked dashboard, visually identical to pre-2a (heatmap + subject toggle, weakness section, this-week/recent-sessions), single "Loading…".
2. Flip the test family's `parent_v2=true` (via Supabase SQL editor: `update map_families set parent_v2=true where id='<test family>'`): `/parent` = Classroom; cross-kid strip totals = sum of card metrics; "needs attention" pill on a kid with `active_misconceptions>0` or zero weekly practice.
3. Click a kid → `/parent/kids/:id?tab=mastery`; heatmap identical to legacy for that kid.
4. Switch tabs → `?tab=` updates; copy `…?tab=sessions` into a fresh browser tab → lands on that kid's Sessions tab (copyable-URL hard rule).
5. Assignments tab lists only that kid's assignments; `Revoke` on an `assigned` row removes it; control absent on `in_progress`/`completed`.
6. Navigate `/parent/kids/<random-uuid>` → "Not found in your classroom", no crash, no data leak.
7. `/parent/dashboard?kid=<id>` → redirects to `/parent/kids/<id>`; `/parent/dashboard` (no kid) → `/parent`.
8. Shell nav: Library → legacy custom-bank, Tests → legacy custom-test, History → `/history`, all functional. Revert the test family's flag to `false` when done.

- [ ] **Step 5: Final commit**

```bash
git add scripts/test-parent-2a-data.mjs
git commit -m "test(parent) 2a data regression guard; slice complete (data green, typecheck+build green, QA checklist passed)"
```

---

## Self-Review

**Spec coverage:**
- §2 stack adaptation (RR v6, `?tab=`, no design-system change) → Tasks 8, 9. ✓
- §3 resolver (familyId from `useActiveStudent`, loading vs flag-off distinct, legacy `<Parent/>` untouched) → Task 9 `ParentRoot`. ✓
- §4 extraction (heatmap/growth/sessions, internals verbatim, legacy recomposed byte-identical) → Tasks 1–5. Refinement: a shared `useKidDashboardData` hook replaces "each does its own fetch" so the single-loader legacy behavior is preserved — more faithful to §4's "byte-identical" intent and resolves the §11 extraction-fidelity risk. ✓
- §5 Classroom (roster, cross-kid strip, needs-attention rule, ghost card, quick actions, interim legacy deep-links) → Task 7. ✓ (Note: roster view has no unseen-standard count; the 4th distribution segment is 0 in 2a — consistent with §11's "data not always present" stance; not a spec violation since §5 lists the segment but the view doesn't expose unseen.)
- §6 KidDetail (URL `:id` only, 4 `?tab=` tabs, header, Assignments via Cycle-1 lib, revoke rule, foreign-id guard) → Task 8. ✓
- §7 shell/nav (interim targets, PIN gate boundary) → Tasks 6, 9. ✓
- §8 routing (`/parent/*`, `/parent/dashboard` redirect, siblings untouched) → Task 9. ✓
- §9 data sources (all Cycle-1/existing, no new DB) → Tasks 1,7,8 use only existing lib/tables. ✓
- §10 verification (Node data script + typecheck/build + manual QA, no test runner) → Task 10. ✓
- §11 risks → addressed: familyId timing (Task 9 loading/`resolved` gate distinct from flag-off); extraction fidelity (Task 5 Step 3 parity check + the hook design); source-mix badge (Task 8 omits it — KidWeekSessions shows `s.kind` only, as legacy did; full provenance deferred to 2c per spec); interim nav centralized in `ParentShell` (Task 6). ✓

No spec requirement is left without a task.

**Placeholder scan:** No "TBD/TODO/handle errors" — every component/route/script step has complete code. The one conditional ("if `m.admin` is not the export name") names the exact resolution (use the harness's `admin` export) rather than leaving it open.

**Type consistency:** `MasteryRow`/`SignalWithTag`/`WeekStats`/`KidDashboardData` defined in Task 1 and consumed with identical names in Tasks 2–5, 8. `ClassroomRosterRow`/`AssignmentOverviewRow` field names used in Tasks 7–8 match `src/lib/parent/types.ts` (Cycle 1, verified). `useKidDashboardData` signature `(studentId: string | undefined)` consistent across Tasks 1, 5, 8. Route paths (`/parent`, `/parent/kids/:id`, `/parent/dashboard`, `/parent/*`) consistent across Tasks 6, 8, 9. `ParentShell` default export consumed as default import in Task 9. No mismatches.
