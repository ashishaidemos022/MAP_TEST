import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useActiveStudent } from '../../lib/activeStudent'
import { subjectMeta } from '../../lib/subjects'
import { supabase } from '../../lib/supabase'
import type { CustomTestConfig, Session } from '../../lib/types'

interface CustomSessionRow extends Session {
  custom_config: CustomTestConfig | null
}

export default function CustomTestList() {
  const { activeStudent } = useActiveStudent()
  const [rows, setRows] = useState<CustomSessionRow[] | null>(null)
  const [gradeRange, setGradeRange] = useState<Record<string, [number, number]>>({})

  useEffect(() => {
    if (!activeStudent) return
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from('map_test_sessions')
        .select('*')
        .eq('student_id', activeStudent.id)
        .eq('kind', 'custom')
        .order('started_at', { ascending: false })
        .limit(50)
      if (error || cancelled) {
        if (!cancelled) setRows([])
        return
      }
      const list = (data ?? []) as CustomSessionRow[]
      setRows(list)

      // Fetch grade range for each session via the standard_ids in its config.
      const allStandardIds = Array.from(
        new Set(list.flatMap((r) => r.custom_config?.standard_ids ?? [])),
      )
      if (allStandardIds.length === 0) return
      const { data: stds } = await supabase
        .from('map_standards')
        .select('id, grade')
        .in('id', allStandardIds)
      const gradeById = new Map(
        (stds ?? []).map((s) => [s.id as string, s.grade as number]),
      )
      const ranges: Record<string, [number, number]> = {}
      for (const r of list) {
        const ids = r.custom_config?.standard_ids ?? []
        if (ids.length === 0) continue
        const grades = ids.map((id) => gradeById.get(id)).filter((g): g is number => g != null)
        if (grades.length === 0) continue
        ranges[r.id] = [Math.min(...grades), Math.max(...grades)]
      }
      if (!cancelled) setGradeRange(ranges)
    })()
    return () => {
      cancelled = true
    }
  }, [activeStudent])

  return (
    <section className="card mb-6 p-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Custom tests</h2>
          <p className="text-xs text-ink/60">
            Tests you built by picking specific topics. Great for review or stretch practice.
          </p>
        </div>
        <Link to="/parent/custom-test" className="btn-primary text-sm">
          + New custom test
        </Link>
      </header>

      {rows === null ? (
        <p className="mt-4 text-sm text-ink/60">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 rounded-xl bg-cream/60 px-3 py-4 text-sm text-ink/70 ring-1 ring-cloud">
          No custom tests yet. Build one to drill specific topics across grades.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-cloud/70">
          {rows.map((r) => {
            const total = r.planned_length
            const pct = total > 0 ? Math.round((r.correct_count / total) * 100) : 0
            const range = gradeRange[r.id]
            const cfg = r.custom_config
            const topics = cfg?.standard_ids?.length ?? 0
            const meta = subjectMeta(r.subject)
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-cream text-xl">
                  {meta.emoji}
                </span>
                <div className="flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    <span className="capitalize">{r.subject}</span>
                    <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-ink/60 ring-1 ring-cloud">
                      🎯 custom
                    </span>
                    {r.status === 'in_progress' && (
                      <span className="rounded-full bg-sun/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-ink/60">
                        in progress
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-ink/60">
                    {topics} topic{topics === 1 ? '' : 's'}
                    {range && (
                      <>
                        {' · '}grade{range[0] === range[1] ? '' : 's'} {range[0]}
                        {range[0] === range[1] ? '' : `–${range[1]}`}
                      </>
                    )}
                    {r.started_at && (
                      <>
                        {' · '}
                        {new Date(r.started_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </>
                    )}
                  </p>
                </div>
                {r.status === 'completed' ? (
                  <span className="pill text-xs">
                    {r.correct_count}/{total} · {pct}%
                  </span>
                ) : (
                  <span className="pill text-xs">
                    {r.current_index}/{total}
                  </span>
                )}
                <Link
                  to={
                    r.status === 'completed'
                      ? `/test/${r.id}/results`
                      : `/test/${r.id}`
                  }
                  className="btn-ghost text-xs"
                >
                  {r.status === 'completed' ? 'View →' : 'Resume →'}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
