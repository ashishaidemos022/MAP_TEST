import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useActiveStudent } from '../lib/activeStudent'
import { gradeContext } from '../lib/rit'
import { supabase } from '../lib/supabase'
import type { Session, Subject } from '../lib/types'

export default function History() {
  const { activeStudent } = useActiveStudent()
  const [sessions, setSessions] = useState<Session[]>([])

  useEffect(() => {
    if (!activeStudent) return
    void (async () => {
      const { data } = await supabase
        .from('map_test_sessions')
        .select('*')
        .eq('student_id', activeStudent.id)
        .eq('status', 'completed')
        .in('kind', ['test', 'custom'])
        .order('completed_at', { ascending: false })
      setSessions((data ?? []) as Session[])
    })()
  }, [activeStudent])

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-4xl">Your test history</h1>
      <p className="mt-1 text-sm text-ink/60">Every test you’ve finished, plus how your RIT changed over time.</p>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <GrowthChart sessions={sessions} subject="math" color="#3B82F6" />
        <GrowthChart sessions={sessions} subject="reading" color="#16A34A" />
        <GrowthChart sessions={sessions} subject="language" color="#F59E0B" />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-display text-2xl">All tests</h2>
        {sessions.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="font-display text-xl">No tests yet.</p>
            <p className="mt-1 text-sm text-ink/60">Start one from the home screen.</p>
            <Link to="/" className="btn-primary mt-5">
              Back home
            </Link>
          </div>
        ) : (
          <div className="card divide-y divide-cloud/70">
            {sessions.map((s) => {
              const total = s.question_ids.length
              const pct = total > 0 ? Math.round((s.correct_count / total) * 100) : 0
              return (
                <Link
                  key={s.id}
                  to={`/test/${s.id}/results`}
                  className="flex flex-wrap items-center justify-between gap-4 p-4 transition hover:bg-cream/40"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="grid h-10 w-10 place-items-center rounded-2xl bg-cream text-xl"
                      aria-hidden
                    >
                      {s.subject === 'math' ? '➕' : s.subject === 'language' ? '✏️' : '📖'}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-display text-lg capitalize">{s.subject}</p>
                        {s.kind === 'custom' && (
                          <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-ink/60 ring-1 ring-cloud">
                            🎯 Custom
                          </span>
                        )}
                        <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-ink/60 ring-1 ring-cloud">
                          Grade {s.grade}
                        </span>
                      </div>
                      <p className="text-xs text-ink/60">
                        {s.completed_at && new Date(s.completed_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="pill">
                      {s.correct_count}/{total} • {pct}%
                    </span>
                    {s.estimated_rit != null && (
                      <span className="pill">RIT {s.estimated_rit}</span>
                    )}
                    <span className="text-ink/40">→</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function GrowthChart({
  sessions,
  subject,
  color,
}: {
  sessions: Session[]
  subject: Subject
  color: string
}) {
  const points = useMemo(() => {
    return sessions
      .filter((s) => s.subject === subject && s.estimated_rit != null && s.completed_at)
      .sort((a, b) =>
        new Date(a.completed_at!).getTime() - new Date(b.completed_at!).getTime(),
      )
      .map((s) => ({
        rit: s.estimated_rit as number,
        date: new Date(s.completed_at as string),
      }))
  }, [sessions, subject])

  if (points.length === 0) {
    return (
      <div className="card p-5">
        <h3 className="font-display text-xl capitalize">{subject}</h3>
        <p className="mt-2 text-sm text-ink/60">No completed tests yet.</p>
      </div>
    )
  }

  const minR = Math.min(155, ...points.map((p) => p.rit)) - 3
  const maxR = Math.max(220, ...points.map((p) => p.rit)) + 3
  const width = 320
  const height = 140
  const padX = 18
  const padY = 14
  const usableW = width - padX * 2
  const usableH = height - padY * 2
  const xOf = (i: number) =>
    points.length === 1 ? width / 2 : padX + (i / (points.length - 1)) * usableW
  const yOf = (rit: number) =>
    padY + usableH - ((rit - minR) / (maxR - minR)) * usableH
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(p.rit).toFixed(1)}`)
    .join(' ')
  const last = points[points.length - 1]

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-xl capitalize">{subject}</h3>
        <span className="font-mono text-sm text-ink/60">
          Latest RIT {last.rit} • {gradeContext(last.rit)}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full">
        <line x1={padX} x2={width - padX} y1={height - padY} y2={height - padY} stroke="#E2E8F0" />
        <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={xOf(i)} cy={yOf(p.rit)} r="4" fill={color} />
        ))}
      </svg>
      <p className="mt-2 text-xs text-ink/60">{points.length} test{points.length === 1 ? '' : 's'}</p>
    </div>
  )
}
