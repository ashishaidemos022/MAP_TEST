import { useEffect, useMemo, useState } from 'react'
import { useActiveStudent } from '../../lib/activeStudent'
import {
  TEST_LENGTH_OPTIONS,
  fetchStudentGrades,
  recommendedTestLengthForGrade,
  supabase,
} from '../../lib/supabase'
import type { Subject } from '../../lib/types'

const SUPPORTED_GRADES = [1, 2, 3, 4] as const

// CLAUDE.md §9.8: don't expose a grade to a kid until the bank is past these
// per-subject thresholds. We surface readiness per grade so the parent can see
// exactly what they'd be activating.
const READINESS_TARGETS: Record<Subject, number> = {
  math: 200,
  reading: 150,
  language: 100,
}

const SUBJECTS: { key: Subject; label: string; emoji: string }[] = [
  { key: 'math', label: 'Math', emoji: '➕' },
  { key: 'reading', label: 'Reading', emoji: '📖' },
  { key: 'language', label: 'Language', emoji: '✏️' },
]

interface SubjectCounts {
  math: number
  reading: number
  language: number
}

type CountsByGrade = Record<number, SubjectCounts>

interface InProgressRow {
  id: string
  current_index: number
}

type GradeStatus = 'current' | 'ready' | 'limited' | 'empty'

function getGradeStatus(
  grade: number,
  practiceGrade: number | null,
  counts: SubjectCounts,
): GradeStatus {
  if (grade === practiceGrade) return 'current'
  const total = counts.math + counts.reading + counts.language
  if (total === 0) return 'empty'
  const allReady = (Object.keys(READINESS_TARGETS) as Subject[]).every(
    (s) => counts[s] >= READINESS_TARGETS[s],
  )
  return allReady ? 'ready' : 'limited'
}

// Pitch is framed against the SCHOOL grade — what grade the kid is in — not
// against the current practice grade. That way the parent always sees how
// each option compares to "where my kid actually is."
function getDirectionalPitch(grade: number, schoolGrade: number | null): string {
  if (schoolGrade == null) return ''
  if (grade === schoolGrade) return 'On grade level'
  if (grade < schoolGrade) return 'Below grade — review'
  return 'Above grade — stretch'
}

function subjectPct(have: number, target: number): number {
  if (target === 0) return 100
  return Math.min(100, Math.round((have / target) * 100))
}

function subjectStatusLabel(have: number, target: number): string {
  if (have >= target) return 'Ready'
  if (have === 0) return 'Empty'
  if ((have / target) * 100 >= 50) return 'Almost'
  return 'Limited'
}

function subjectFillClass(have: number, target: number): string {
  if (have >= target) return 'bg-leaf'
  if ((have / target) * 100 >= 50) return 'bg-sun'
  if (have > 0) return 'bg-sun/40'
  return 'bg-cloud'
}

export default function ParentSettings() {
  const { activeStudent } = useActiveStudent()
  const [practiceGrade, setPracticeGrade] = useState<number | null>(null)
  const [schoolGrade, setSchoolGrade] = useState<number | null>(null)
  const [testLength, setTestLength] = useState<number | null>(null)
  const [counts, setCounts] = useState<CountsByGrade>({})
  const [inProgress, setInProgress] = useState<InProgressRow[]>([])
  const [pendingGrade, setPendingGrade] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingSchool, setSavingSchool] = useState(false)
  const [savingLength, setSavingLength] = useState(false)
  const [cleaningStubs, setCleaningStubs] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const reload = async () => {
    if (!activeStudent) return
    const studentId = activeStudent.id
    setError(null)
    try {
      // One head-only count query per (grade, subject) cell. Running them in
      // parallel is much cheaper — and more accurate — than fetching every
      // question row, which the Supabase client paginates at 1000 by default
      // and was silently truncating Grade 3 and Grade 4 totals.
      const cells: Array<[number, Subject]> = SUPPORTED_GRADES.flatMap((g) =>
        SUBJECTS.map(({ key }) => [g, key] as [number, Subject]),
      )
      const [grades, lengthRes, ipRes, ...countRes] = await Promise.all([
        fetchStudentGrades(studentId),
        supabase
          .from('map_students')
          .select('default_test_length')
          .eq('id', studentId)
          .single(),
        supabase
          .from('map_test_sessions')
          .select('id, current_index')
          .eq('student_id', studentId)
          .eq('status', 'in_progress'),
        ...cells.map(([g, s]) =>
          supabase
            .from('map_questions')
            .select('id', { count: 'exact', head: true })
            .eq('is_active', true)
            .eq('grade', g)
            .eq('subject', s),
        ),
      ])
      if (ipRes.error) throw ipRes.error
      if (lengthRes.error) throw lengthRes.error
      const firstCellErr = countRes.find((r) => r.error)
      if (firstCellErr?.error) throw firstCellErr.error
      setPracticeGrade(grades.practiceGrade)
      setSchoolGrade(grades.schoolGrade)
      setTestLength((lengthRes.data?.default_test_length as number | undefined) ?? null)
      const tally: CountsByGrade = {}
      for (const g of SUPPORTED_GRADES) {
        tally[g] = { math: 0, reading: 0, language: 0 }
      }
      cells.forEach(([g, s], i) => {
        tally[g][s] = countRes[i].count ?? 0
      })
      setCounts(tally)
      setInProgress((ipRes.data ?? []) as InProgressRow[])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load grade settings.')
    }
  }

  // Stub sessions = created but never answered (current_index === 0). They
  // happen when a test was started and abandoned before answering Q1, and they
  // pile up because Home's "pick up where you left off" hides them. They
  // should NOT block a grade switch — they're effectively dead.
  const stubSessions = inProgress.filter((s) => s.current_index === 0)
  const liveInProgress = inProgress.filter((s) => s.current_index > 0)

  const cleanupStubs = async () => {
    if (stubSessions.length === 0) return
    setCleaningStubs(true)
    setError(null)
    // Both map_attempts.session_id and map_pick_diagnostics.session_id are
    // ON DELETE CASCADE, so deleting the session row is enough — the cascade
    // wipes any orphan attempts/diagnostics. Trying to pre-delete the
    // diagnostic rows from the client fails with 401 because anon doesn't
    // hold DELETE on map_pick_diagnostics (only INSERT/SELECT).
    const ids = stubSessions.map((s) => s.id)
    const { error: sErr } = await supabase
      .from('map_test_sessions')
      .delete()
      .in('id', ids)
    setCleaningStubs(false)
    if (sErr) {
      setError(sErr.message)
      return
    }
    await reload()
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStudent?.id])

  const lockedByInProgress = liveInProgress.length > 0

  const confirmAndSave = async (g: number) => {
    if (!activeStudent) return
    if (g === practiceGrade) {
      setPendingGrade(null)
      return
    }
    setSaving(true)
    setError(null)
    const { error: updErr } = await supabase
      .from('map_students')
      .update({ grade: g })
      .eq('id', activeStudent.id)
    setSaving(false)
    if (updErr) {
      setError(updErr.message)
      return
    }
    setPendingGrade(null)
    await reload()
  }

  // Editing the school grade does NOT touch the practice grade — they're
  // independent so a parent can change one without resetting the other. If the
  // parent wants them aligned, they can click the matching practice card.
  const saveSchoolGrade = async (g: number) => {
    if (!activeStudent || g === schoolGrade) return
    setSavingSchool(true)
    setError(null)
    const { error: updErr } = await supabase
      .from('map_students')
      .update({ school_grade: g })
      .eq('id', activeStudent.id)
    setSavingSchool(false)
    if (updErr) {
      setError(updErr.message)
      return
    }
    await reload()
  }

  // Test length is captured per-session at creation time, so changing this
  // value does not affect any in-progress test (its planned_length is locked).
  // It only changes the next test the kid starts.
  const saveTestLength = async (n: number) => {
    if (!activeStudent || n === testLength) return
    setSavingLength(true)
    setError(null)
    const { error: updErr } = await supabase
      .from('map_students')
      .update({ default_test_length: n })
      .eq('id', activeStudent.id)
    setSavingLength(false)
    if (updErr) {
      setError(updErr.message)
      return
    }
    setTestLength(n)
  }

  const summary = useMemo(() => {
    if (practiceGrade == null || schoolGrade == null) return 'Loading…'
    if (practiceGrade === schoolGrade) {
      return `In Grade ${schoolGrade}, practicing on grade level.`
    }
    if (practiceGrade > schoolGrade) {
      return `In Grade ${schoolGrade}, practicing above grade level (Grade ${practiceGrade}).`
    }
    return `In Grade ${schoolGrade}, practicing below grade level (Grade ${practiceGrade}) for review.`
  }, [practiceGrade, schoolGrade])

  return (
    <div className="card mb-6 p-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Grade level</h2>
          <p className="text-xs text-ink/60">{summary}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="btn-ghost text-sm"
          aria-expanded={open}
        >
          {open ? 'Close' : 'Change grade'}
        </button>
      </header>

      {open && (
        <div className="mt-4 space-y-4">
          {error && (
            <p className="rounded-xl bg-berry/10 px-3 py-2 text-sm text-berry ring-1 ring-berry/30">
              {error}
            </p>
          )}

          {lockedByInProgress && (
            <p className="rounded-xl bg-sun/15 px-3 py-2 text-sm text-ink/80 ring-1 ring-sun/40">
              There {liveInProgress.length === 1 ? 'is' : 'are'} {liveInProgress.length} test
              {liveInProgress.length === 1 ? '' : 's'} in progress with answered questions. Finish
              or delete {liveInProgress.length === 1 ? 'it' : 'them'} from the home page before
              changing the grade — switching mid-test would mix banks across the same session.
            </p>
          )}

          {stubSessions.length > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-cream px-3 py-2 text-sm text-ink/70 ring-1 ring-cloud">
              <span>
                {stubSessions.length} unstarted test
                {stubSessions.length === 1 ? '' : 's'} from previous visit
                {stubSessions.length === 1 ? '' : 's'} (created but never answered). These are
                hidden on the home page and don&apos;t block a grade switch.
              </span>
              <button
                type="button"
                onClick={() => void cleanupStubs()}
                disabled={cleaningStubs}
                className="btn-secondary text-xs disabled:opacity-50"
              >
                {cleaningStubs ? 'Cleaning…' : 'Clean up'}
              </button>
            </div>
          )}

          <div className="rounded-2xl bg-cream/60 p-4 ring-1 ring-cloud">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-smoke">
                  School grade
                </p>
                <p className="mt-0.5 text-sm text-ink/70">
                  The grade {activeStudent?.display_name ?? 'your child'} is in at school.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="school-grade-select" className="sr-only">
                  School grade
                </label>
                <select
                  id="school-grade-select"
                  value={schoolGrade ?? ''}
                  disabled={savingSchool || schoolGrade == null}
                  onChange={(e) => void saveSchoolGrade(Number(e.target.value))}
                  className="rounded-xl border border-cloud bg-paper px-3 py-2 text-sm font-semibold text-ink focus:border-sky focus:outline-none disabled:opacity-50"
                >
                  {SUPPORTED_GRADES.map((g) => (
                    <option key={g} value={g}>
                      Grade {g}
                    </option>
                  ))}
                </select>
                {savingSchool && <span className="text-xs text-ink/50">Saving…</span>}
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-cream/60 p-4 ring-1 ring-cloud">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-smoke">
                  Test length
                </p>
                <p className="mt-0.5 text-sm text-ink/70">
                  Questions per test. Affects new tests only — in-progress tests keep their
                  original length.
                </p>
              </div>
              {schoolGrade != null && (
                <p className="text-xs text-ink/50">
                  Recommended for Grade {schoolGrade}:{' '}
                  <span className="font-semibold">
                    {recommendedTestLengthForGrade(schoolGrade)}
                  </span>
                </p>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {TEST_LENGTH_OPTIONS.map((n) => {
                const active = testLength === n
                const recommended =
                  schoolGrade != null && recommendedTestLengthForGrade(schoolGrade) === n
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => void saveTestLength(n)}
                    disabled={savingLength || testLength == null}
                    aria-pressed={active}
                    className={`relative rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      active
                        ? 'bg-sky text-white shadow-card'
                        : 'bg-paper text-ink/70 ring-1 ring-cloud hover:ring-sky/40'
                    }`}
                  >
                    {n}
                    {recommended && !active && (
                      <span
                        aria-hidden
                        className="absolute -right-1 -top-1 rounded-full bg-leaf px-1.5 text-[9px] font-bold text-white"
                      >
                        ★
                      </span>
                    )}
                  </button>
                )
              })}
              {savingLength && <span className="self-center text-xs text-ink/50">Saving…</span>}
            </div>
          </div>

          {practiceGrade != null && schoolGrade != null && practiceGrade !== schoolGrade && (
            <div
              className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 ring-1 ${
                practiceGrade > schoolGrade
                  ? 'bg-sky/10 ring-sky/40'
                  : 'bg-sun/15 ring-sun/40'
              }`}
            >
              <div className="text-sm text-ink/80">
                <p className="font-semibold">
                  {practiceGrade > schoolGrade
                    ? `Practicing above grade level (Grade ${practiceGrade})`
                    : `Practicing below grade level (Grade ${practiceGrade}) for review`}
                </p>
                <p className="mt-0.5 text-xs text-ink/60">
                  School grade is Grade {schoolGrade}. Tests draw from Grade {practiceGrade} until
                  you change the practice grade below.
                </p>
              </div>
              <button
                type="button"
                disabled={lockedByInProgress || saving}
                onClick={() => setPendingGrade(schoolGrade)}
                className="btn-secondary text-xs disabled:opacity-50"
              >
                Reset to Grade {schoolGrade}
              </button>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-smoke">
              Practice grade
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {SUPPORTED_GRADES.map((g) => {
                const subjectCounts = counts[g] ?? { math: 0, reading: 0, language: 0 }
                const status = getGradeStatus(g, practiceGrade, subjectCounts)
                const pitch = getDirectionalPitch(g, schoolGrade)
                return (
                  <GradeCard
                    key={g}
                    grade={g}
                    counts={subjectCounts}
                    status={status}
                    pitch={pitch}
                    disabled={lockedByInProgress || saving}
                    onSwitch={() => setPendingGrade(g)}
                  />
                )
              })}
            </div>
          </div>

          <p className="text-xs text-ink/50">
            School grade is who your child is. Practice grade is what their next test draws from.
            Drop the practice grade for review or step it up for a stretch — progress is kept either
            way.
          </p>
        </div>
      )}

      {pendingGrade != null && (
        <ConfirmDialog
          grade={pendingGrade}
          counts={counts[pendingGrade] ?? { math: 0, reading: 0, language: 0 }}
          saving={saving}
          onCancel={() => setPendingGrade(null)}
          onConfirm={() => void confirmAndSave(pendingGrade)}
        />
      )}
    </div>
  )
}

function GradeCard({
  grade,
  counts,
  status,
  pitch,
  disabled,
  onSwitch,
}: {
  grade: number
  counts: SubjectCounts
  status: GradeStatus
  pitch: string
  disabled: boolean
  onSwitch: () => void
}) {
  const isCurrent = status === 'current'

  // Subtle background + border tint by status. The current grade gets the
  // strongest visual hit; ready/limited use soft tints so a parent can scan
  // the four cards and read the room without staring at numbers.
  const cardTint =
    status === 'current'
      ? 'border-sky/50 bg-sky/5'
      : status === 'ready'
        ? 'border-leaf/30 bg-leaf/5'
        : status === 'limited'
          ? 'border-sun/40 bg-sun/5'
          : 'border-cloud bg-paper'

  const pillByStatus: Record<GradeStatus, { label: string; classes: string }> = {
    current: { label: 'Now', classes: 'bg-sky/20 text-sky' },
    ready: { label: 'Ready', classes: 'bg-leaf/20 text-leaf' },
    limited: { label: 'Limited', classes: 'bg-sun/30 text-ink/70' },
    empty: { label: 'Coming soon', classes: 'bg-cloud text-ink/50' },
  }
  const pill = pillByStatus[status]

  return (
    <div className={`relative rounded-2xl border p-4 transition ${cardTint}`}>
      {isCurrent && (
        <div
          aria-hidden
          className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-sky/60"
        />
      )}

      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-2xl">Grade {grade}</p>
          {pitch && <p className="mt-0.5 text-xs text-ink/55">{pitch}</p>}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${pill.classes}`}
        >
          {pill.label}
        </span>
      </div>

      <ul className="mt-4 space-y-2.5">
        {SUBJECTS.map(({ key, label, emoji }) => {
          const have = counts[key]
          const target = READINESS_TARGETS[key]
          const pct = subjectPct(have, target)
          const fillClass = subjectFillClass(have, target)
          const subLabel = subjectStatusLabel(have, target)
          return (
            <li key={key} className="flex items-center gap-3 text-xs">
              <span
                className="flex w-20 shrink-0 items-center gap-1.5 text-ink/70"
                title={`${have} of ${target} target questions`}
              >
                <span aria-hidden>{emoji}</span>
                <span>{label}</span>
              </span>
              <span
                className="relative h-2 flex-1 overflow-hidden rounded-full bg-cloud/50"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${label} bank: ${have} of ${target} target questions`}
              >
                <span
                  className={`absolute inset-y-0 left-0 transition-all ${fillClass}`}
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="w-14 shrink-0 text-right text-[11px] font-medium text-ink/50">
                {subLabel}
              </span>
            </li>
          )
        })}
      </ul>

      {!isCurrent && (
        <button
          type="button"
          disabled={disabled}
          onClick={onSwitch}
          className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-sky transition hover:text-sky/80 hover:underline disabled:cursor-not-allowed disabled:text-ink/30 disabled:no-underline"
        >
          Switch to Grade {grade}
          <span aria-hidden>→</span>
        </button>
      )}
    </div>
  )
}

function ConfirmDialog({
  grade,
  counts,
  saving,
  onCancel,
  onConfirm,
}: {
  grade: number
  counts: SubjectCounts
  saving: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const ready = isReadyForGrade(grade, counts)
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="card w-full max-w-md p-5">
        <h3 className="font-display text-2xl">Switch to Grade {grade}?</h3>
        <p className="mt-2 text-sm text-ink/70">
          New tests will draw only from the Grade {grade} question bank.
        </p>
        {!ready && (
          <p className="mt-3 rounded-xl bg-sun/15 px-3 py-2 text-sm text-ink/80 ring-1 ring-sun/40">
            Heads up: this bank is still being seeded ({counts.math} math, {counts.reading} reading,{' '}
            {counts.language} language items). Tests will run with whatever is available, which may
            mean very short tests or repeated questions.
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-ghost text-sm" disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn-primary text-sm disabled:opacity-50"
            disabled={saving}
          >
            {saving ? 'Switching…' : `Yes, switch to Grade ${grade}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function isReadyForGrade(_grade: number, counts: SubjectCounts): boolean {
  return (
    counts.math >= READINESS_TARGETS.math &&
    counts.reading >= READINESS_TARGETS.reading &&
    counts.language >= READINESS_TARGETS.language
  )
}
