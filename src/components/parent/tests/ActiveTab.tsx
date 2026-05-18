// src/components/parent/tests/ActiveTab.tsx
// assigned + in_progress, grouped by kid. Source-mix badge + optimistic
// revoke (the two items deferred from 2a).
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAssignmentOverview } from '../../../lib/parent/queries'
import { revokeAssignment } from '../../../lib/parent/mutations'
import type { AssignmentOverviewRow } from '../../../lib/parent/types'

const MIX_LABEL: Record<string, string> = {
  vetted_only: 'Vetted',
  custom_only: 'My questions',
  mixed: 'Mixed',
}

export function ActiveTab() {
  const [rows, setRows] = useState<AssignmentOverviewRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const load = () => {
    void getAssignmentOverview(['assigned', 'in_progress'])
      .then((r) => {
        if (mountedRef.current) setRows(r)
      })
      .catch((e) => {
        if (mountedRef.current) setError(e?.message ?? 'Failed to load.')
      })
  }
  useEffect(load, [])

  if (error) return <div className="card p-6 text-sm text-ink/60">{error}</div>
  if (!rows) return <p className="mt-8 text-center font-display text-xl">Loading…</p>
  if (rows.length === 0)
    return (
      <p className="card p-6 text-center text-sm text-ink/60">
        No active assignments.
      </p>
    )

  const byKid = new Map<string, AssignmentOverviewRow[]>()
  for (const r of rows) {
    const k = `${r.student_name} · Grade ${r.student_grade}`
    if (!byKid.has(k)) byKid.set(k, [])
    byKid.get(k)!.push(r)
  }

  const onRevoke = async (id: string) => {
    const prev = rows
    setRows(rows.filter((r) => r.assignment_id !== id)) // optimistic
    try {
      await revokeAssignment(id)
      load()
    } catch (e) {
      if (mountedRef.current) {
        setRows(prev)
        setError((e as Error)?.message ?? 'Revoke failed.')
      }
    }
  }

  return (
    <div className="space-y-6">
      {[...byKid.entries()].map(([kid, items]) => (
        <section key={kid} className="card p-5">
          <h2 className="font-display text-xl">{kid}</h2>
          <ul className="mt-3 divide-y divide-cloud/70">
            {items.map((r) => (
              <li
                key={r.assignment_id}
                className="flex items-center justify-between gap-2 py-3"
              >
                <div>
                  <p className="font-semibold">{r.definition_name}</p>
                  <p className="text-xs text-ink/60">
                    <span className="capitalize">{r.subject}</span> ·{' '}
                    <span className="rounded-full bg-cream px-2 py-0.5 ring-1 ring-cloud">
                      {MIX_LABEL[r.source_mix] ?? r.source_mix}
                    </span>{' '}
                    · {r.status}
                    {r.due_by
                      ? ` · due ${new Date(r.due_by).toLocaleDateString()}`
                      : ''}
                  </p>
                  {r.parent_note && (
                    <p className="mt-1 text-xs text-ink/50">“{r.parent_note}”</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    to={`/parent/tests/definitions/${r.definition_id}`}
                    className="btn-ghost text-xs"
                  >
                    View definition
                  </Link>
                  {r.status === 'assigned' && (
                    <button
                      type="button"
                      onClick={() => onRevoke(r.assignment_id)}
                      className="btn-ghost text-xs"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
