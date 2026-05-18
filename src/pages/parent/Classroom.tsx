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
