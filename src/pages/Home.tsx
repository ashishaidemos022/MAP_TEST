import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useActiveStudent } from '../lib/activeStudent'
import { AssignedTestsPanel } from '../components/AssignedTestsPanel'
import { fetchStudentGrades, supabase } from '../lib/supabase'
import type { Session } from '../lib/types'

interface Stats {
  totalSessions: number
  mathSessions: number
  readingSessions: number
  languageSessions: number
  lastSession: Session | null
}

type SubjectKey = 'math' | 'reading' | 'language'
type SubjectAvailability = Record<SubjectKey, boolean>

export default function Home() {
  const { activeStudent } = useActiveStudent()
  const [stats, setStats] = useState<Stats | null>(null)
  const [inProgress, setInProgress] = useState<Session[]>([])
  const [hasBoostSignals, setHasBoostSignals] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [grade, setGrade] = useState<number | null>(null)
  const [schoolGrade, setSchoolGrade] = useState<number | null>(null)
  const [available, setAvailable] = useState<SubjectAvailability>({
    math: true,
    reading: true,
    language: true,
  })

  const refresh = async () => {
    if (!activeStudent) return
    const studentId = activeStudent.id
    const gradesPromise = fetchStudentGrades(studentId)
    const [completedRes, ipRes, boostRes] = await Promise.all([
      supabase
        .from('map_test_sessions')
        .select('*')
        .eq('student_id', studentId)
        .eq('status', 'completed')
        .eq('kind', 'test')
        .order('completed_at', { ascending: false }),
      supabase
        .from('map_test_sessions')
        .select('*')
        .eq('student_id', studentId)
        .eq('status', 'in_progress')
        .gt('current_index', 0)
        .order('started_at', { ascending: false }),
      supabase
        .from('map_misconception_signals')
        .select('id, misconception_tag')
        .eq('student_id', studentId)
        .eq('active', true)
        .gte('occurrence_count', 3)
        .neq('misconception_tag', '_misc_other')
        .limit(1),
    ])
    const sessions = (completedRes.data ?? []) as Session[]
    setStats({
      totalSessions: sessions.length,
      mathSessions: sessions.filter((s) => s.subject === 'math').length,
      readingSessions: sessions.filter((s) => s.subject === 'reading').length,
      languageSessions: sessions.filter((s) => s.subject === 'language').length,
      lastSession: sessions[0] ?? null,
    })
    setInProgress((ipRes.data ?? []) as Session[])
    setHasBoostSignals((boostRes.data ?? []).length > 0)
    let resolvedGrade: number | null = null
    try {
      const grades = await gradesPromise
      resolvedGrade = grades.practiceGrade
      setGrade(grades.practiceGrade)
      setSchoolGrade(grades.schoolGrade)
    } catch {
      setGrade(null)
      setSchoolGrade(null)
    }
    if (resolvedGrade != null) {
      // Disable a subject card if the bank for this grade has zero active
      // questions. Avoids the picker error on Home → "Start a test" before
      // any content has been authored for that (grade, subject) cell.
      const presence = await Promise.all(
        (['math', 'reading', 'language'] as const).map(async (sub) => {
          const { count } = await supabase
            .from('map_questions')
            .select('id', { count: 'exact', head: true })
            .eq('grade', resolvedGrade)
            .eq('subject', sub)
            .eq('is_active', true)
            .limit(1)
          return [sub, (count ?? 0) > 0] as const
        }),
      )
      setAvailable({
        math: presence.find(([s]) => s === 'math')?.[1] ?? false,
        reading: presence.find(([s]) => s === 'reading')?.[1] ?? false,
        language: presence.find(([s]) => s === 'language')?.[1] ?? false,
      })
    } else {
      setAvailable({ math: true, reading: true, language: true })
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStudent?.id])

  const handleDelete = async (sessionId: string) => {
    if (!window.confirm('Delete this in-progress test? Your answers so far will be removed.')) {
      return
    }
    setDeletingId(sessionId)
    const { error: aErr } = await supabase
      .from('map_attempts')
      .delete()
      .eq('session_id', sessionId)
    if (aErr) {
      window.alert(`Could not delete answers: ${aErr.message}`)
      setDeletingId(null)
      return
    }
    const { error: sErr } = await supabase
      .from('map_test_sessions')
      .delete()
      .eq('id', sessionId)
    if (sErr) {
      window.alert(`Could not delete test: ${sErr.message}`)
      setDeletingId(null)
      return
    }
    setDeletingId(null)
    await refresh()
  }

  return (
    <div className="mx-auto max-w-5xl">
      <section className="mb-8 mt-4 animate-slideUp">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display text-lg uppercase tracking-widest text-smoke">
            Hello, {activeStudent?.display_name ?? 'friend'}!
          </p>
          {schoolGrade != null && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-cream px-2.5 py-0.5 text-xs font-semibold uppercase tracking-widest text-ink/70 ring-1 ring-cloud"
              title="The grade you're in at school."
            >
              Grade {schoolGrade}
            </span>
          )}
          {grade != null && schoolGrade != null && grade !== schoolGrade && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-widest ring-1 ${
                grade > schoolGrade
                  ? 'bg-sky/15 text-sky ring-sky/30'
                  : 'bg-sun/25 text-ink/70 ring-sun/40'
              }`}
              title={`A grown-up has set your tests to draw from Grade ${grade} (${grade > schoolGrade ? 'stretch' : 'review'}). Change in the parent area.`}
            >
              Practicing Grade {grade}{' '}
              <span aria-hidden>{grade > schoolGrade ? '⚡' : '↺'}</span>
            </span>
          )}
        </div>
        <h1 className="font-display text-5xl leading-tight md:text-6xl">
          Pick a subject. <span className="text-sky">Earn stars.</span>
        </h1>
        <p className="mt-3 max-w-xl text-base text-ink/70">
          Each test is 25 questions. Take your time — there’s no timer. Tap the speaker on a
          question if you’d like it read out loud.
        </p>
      </section>

      <AssignedTestsPanel />

      {inProgress.length > 0 && (
        <section className="mb-8 animate-slideUp">
          <p className="mb-2 font-display text-lg uppercase tracking-widest text-smoke">
            Pick up where you left off
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {inProgress.map((s) => {
              // planned_length is the canonical denominator. question_ids may
              // grow during an adaptive test, so using its length here would
              // show a misleading "5 of 5 (100%)" mid-test.
              const total = s.planned_length
              const answered = s.current_index
              const pct = total > 0 ? Math.round((answered / total) * 100) : 0
              const isDeleting = deletingId === s.id
              return (
                <div
                  key={s.id}
                  className="card group relative flex items-center justify-between gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-cardHover"
                >
                  <Link to={`/test/${s.id}`} className="flex flex-1 items-center gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sun/20 text-2xl">
                      {s.subject === 'math' ? '➕' : s.subject === 'language' ? '✏️' : '📖'}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-display text-xl capitalize">{s.subject} test</p>
                        <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-ink/60 ring-1 ring-cloud">
                          Grade {s.grade}
                        </span>
                      </div>
                      <p className="text-sm text-ink/60">
                        Question {answered + 1} of {total} • started{' '}
                        {new Date(s.started_at).toLocaleDateString()}
                      </p>
                      <div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-cream">
                        <div className="h-full bg-sun" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/test/${s.id}`}
                      className="pill group-hover:bg-sun/30"
                    >
                      Continue →
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleDelete(s.id)}
                      disabled={isDeleting}
                      aria-label="Delete this test"
                      title="Delete this test"
                      className="grid h-9 w-9 place-items-center rounded-full bg-white text-ink/50 ring-1 ring-cloud transition hover:bg-berry hover:text-white hover:ring-berry disabled:opacity-50"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M3 6h18" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section className="grid gap-5 md:grid-cols-3">
        <SubjectCard
          subject="math"
          title="Math"
          emoji="➕"
          tagline="Numbers, place value, shapes, and money."
          accent="bg-sky/15"
          disabled={!available.math}
          disabledNote="Coming soon for this grade"
        />
        <SubjectCard
          subject="reading"
          title="Reading"
          emoji="📖"
          tagline="Stories, poems, and true-life articles."
          accent="bg-leaf/15"
          disabled={!available.reading}
          disabledNote="Coming soon for this grade"
        />
        <SubjectCard
          subject="language"
          title="Language"
          emoji="✏️"
          tagline="Grammar, punctuation, and writing rules."
          accent="bg-sun/20"
          disabled={!available.language}
          disabledNote="Coming soon for this grade"
        />
      </section>

      {hasBoostSignals && (
        <section className="mt-6 animate-slideUp">
          <Link
            to="/boost"
            className="card group relative flex items-center justify-between gap-4 overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-cardHover"
          >
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-sun/30 blur-2xl" />
            <div className="relative flex items-center gap-4">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-sun/30 text-3xl shadow-card">
                ⚡
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-smoke">
                  Power-up
                </p>
                <p className="font-display text-2xl">Boost practice is ready</p>
                <p className="mt-1 text-sm text-ink/70">
                  A few quick rounds to make a skill stronger.
                </p>
              </div>
            </div>
            <span className="pill relative bg-sun/30">Try a boost →</span>
          </Link>
        </section>
      )}

      <section className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Tests finished" value={stats?.totalSessions ?? 0} />
        <StatTile label="Math tests" value={stats?.mathSessions ?? 0} />
        <StatTile label="Reading tests" value={stats?.readingSessions ?? 0} />
        <StatTile label="Language tests" value={stats?.languageSessions ?? 0} />
      </section>

      {stats?.lastSession && (
        <section className="mt-8 animate-slideUp">
          <Link
            to={`/test/${stats.lastSession.id}/results`}
            className="card flex items-center justify-between gap-4 p-5 transition hover:shadow-cardHover"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-smoke">
                Last test
              </p>
              <p className="font-display text-xl capitalize">
                {stats.lastSession.subject} — {stats.lastSession.correct_count} of{' '}
                {stats.lastSession.question_ids.length} correct
              </p>
              <p className="text-sm text-ink/60">
                {stats.lastSession.completed_at &&
                  new Date(stats.lastSession.completed_at).toLocaleString()}
              </p>
            </div>
            <span className="pill">View results →</span>
          </Link>
        </section>
      )}

      <section className="mt-8 text-center text-sm text-ink/50">
        <Link to="/history" className="underline-offset-4 hover:underline">
          See all past tests →
        </Link>
      </section>
    </div>
  )
}

function SubjectCard({
  subject,
  title,
  emoji,
  tagline,
  accent,
  disabled,
  disabledNote,
}: {
  subject: 'math' | 'reading' | 'language'
  title: string
  emoji: string
  tagline: string
  accent: string
  disabled?: boolean
  disabledNote?: string
}) {
  if (disabled) {
    return (
      <div
        aria-disabled="true"
        className="card relative cursor-not-allowed overflow-hidden p-6 opacity-60"
      >
        <div className={`absolute -right-8 -top-8 h-32 w-32 rounded-full ${accent} blur-xl`} />
        <div className="relative flex items-start gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-cream text-4xl shadow-card">
            {emoji}
          </span>
          <div className="flex-1">
            <h3 className="font-display text-3xl">{title}</h3>
            <p className="mt-1 text-sm text-ink/70">{tagline}</p>
            <p className="mt-4 inline-flex items-center gap-1 font-display text-ink/50">
              {disabledNote ?? 'Coming soon'}
            </p>
          </div>
        </div>
      </div>
    )
  }
  return (
    <Link
      to={`/test/new?subject=${subject}`}
      className="card group relative overflow-hidden p-6 transition hover:-translate-y-0.5 hover:shadow-cardHover"
    >
      <div className={`absolute -right-8 -top-8 h-32 w-32 rounded-full ${accent} blur-xl`} />
      <div className="relative flex items-start gap-4">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-cream text-4xl shadow-card">
          {emoji}
        </span>
        <div className="flex-1">
          <h3 className="font-display text-3xl">{title}</h3>
          <p className="mt-1 text-sm text-ink/70">{tagline}</p>
          <p className="mt-4 inline-flex items-center gap-1 font-display text-sun">
            Start a new test
            <span className="transition group-hover:translate-x-1">→</span>
          </p>
        </div>
      </div>
    </Link>
  )
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-smoke">{label}</p>
      <p className="mt-1 font-display text-4xl">{value}</p>
    </div>
  )
}
