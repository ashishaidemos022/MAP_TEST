// src/components/parent/tests/CompletedTab.tsx
// Completed assignments, grouped by ISO week (Mon-anchored).
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAssignmentOverview } from '../../../lib/parent/queries'
import type { AssignmentOverviewRow } from '../../../lib/parent/types'

const MIX_LABEL: Record<string, string> = {
  vetted_only: 'Vetted',
  custom_only: 'My questions',
  mixed: 'Mixed',
}

function weekKey(iso: string): string {
  const d = new Date(iso)
  const day = (d.getDay() + 6) % 7 // Mon=0
  const monday = new Date(d)
  monday.setDate(d.getDate() - day)
  return monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function CompletedTab() {
  const [rows, setRows] = useState<AssignmentOverviewRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  useEffect(() => {
    void getAssignmentOverview(['completed'])
      .then((r) => {
        if (mountedRef.current) setRows(r)
      })
      .catch((e) => {
        if (mountedRef.current) setError(e?.message ?? 'Failed to load.')
      })
  }, [])

  if (error) return <div className="card p-6 text-sm text-ink/60">{error}</div>
  if (!rows) return <p className="mt-8 text-center font-display text-xl">Loading…</p>
  if (rows.length === 0)
    return (
      <p className="card p-6 text-center text-sm text-ink/60">
        No completed assignments yet.
      </p>
    )

  const byWeek = new Map<string, AssignmentOverviewRow[]>()
  for (const r of rows) {
    const k = r.completed_at ? weekKey(r.completed_at) : 'Earlier'
    if (!byWeek.has(k)) byWeek.set(k, [])
    byWeek.get(k)!.push(r)
  }

  return (
    <div className="space-y-6">
      {[...byWeek.entries()].map(([wk, items]) => (
        <section key={wk} className="card p-5">
          <h2 className="font-display text-xl">Week of {wk}</h2>
          <ul className="mt-3 divide-y divide-cloud/70">
            {items.map((r) => (
              <li
                key={r.assignment_id}
                className="flex items-center justify-between gap-2 py-2"
              >
                <div>
                  <p className="font-semibold">
                    {r.student_name}{' '}
                    <span className="text-xs text-ink/50">
                      Grade {r.student_grade}
                    </span>
                  </p>
                  <p className="text-xs text-ink/60">
                    {r.definition_name} ·{' '}
                    <span className="rounded-full bg-cream px-2 py-0.5 ring-1 ring-cloud">
                      {MIX_LABEL[r.source_mix] ?? r.source_mix}
                    </span>
                    {r.score != null ? ` · ${r.score}%` : ''}
                    {r.estimated_rit != null ? ` · RIT ${r.estimated_rit}` : ''}
                  </p>
                </div>
                <Link
                  to={`/parent/tests/definitions/${r.definition_id}`}
                  className="btn-ghost text-xs"
                >
                  Details
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
