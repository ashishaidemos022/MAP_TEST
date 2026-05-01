import { useEffect, useMemo, useState } from 'react'
import { useActiveStudent } from '../../lib/activeStudent'
import { gradeContext } from '../../lib/rit'
import { fetchStudentGrade, supabase } from '../../lib/supabase'
import type {
  MisconceptionSignal,
  MisconceptionTag,
  Session,
  Standard,
  Subject,
} from '../../lib/types'

interface MasteryRow {
  standard_id: string
  status: 'mastered' | 'developing' | 'growth'
  attempts: number
  mastery_score: number | null
}

type SignalWithTag = MisconceptionSignal & { tag: MisconceptionTag | null }

interface WeekStats {
  attempts: number
  daysActive: number
  streakDays: number
}

export default function ParentDashboard() {
  const { activeStudent } = useActiveStudent()
  const [standards, setStandards] = useState<Standard[]>([])
  const [mastery, setMastery] = useState<MasteryRow[]>([])
  const [signals, setSignals] = useState<SignalWithTag[]>([])
  const [recent, setRecent] = useState<Session[]>([])
  const [weekStats, setWeekStats] = useState<WeekStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [subject, setSubject] = useState<Subject>('math')

  useEffect(() => {
    if (!activeStudent) return
    const studentId = activeStudent.id
    let cancelled = false
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStudent?.id])

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

  const activeSignals = signals.filter((s) => s.active && s.tag)
  const clearedSignals = signals.filter((s) => !s.active && s.tag)

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
      </section>

      <aside className="space-y-6">
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
      </aside>
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

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-cream/60 p-2">
      <p className="font-display text-2xl">{value}</p>
      <p className="text-[10px] uppercase tracking-widest text-smoke">{label}</p>
    </div>
  )
}

function statusTone(status: 'mastered' | 'developing' | 'growth'): string {
  if (status === 'mastered') return 'bg-leaf/30'
  if (status === 'developing') return 'bg-sky/30'
  return 'bg-sun/40'
}

function dateKey(d: Date): string {
  // YYYY-MM-DD in local time
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function computeWeekStats(rows: { answered_at: string }[]): WeekStats {
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

  // Streak: consecutive days back from today with at least one attempt
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
