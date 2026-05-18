// src/components/AssignedTestsPanel.tsx
// Flag-gated, assigned-only, additive kid-home panel. Renders null when
// parent_v2 is off OR the kid has no assigned tests → kid sees today's home
// unchanged. Tap → startAssignedTest → /test/:id. Mount-guarded.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useActiveStudent } from '../lib/activeStudent'
import { getAssignmentOverview, getParentV2 } from '../lib/parent/queries'
import { startAssignedTest } from '../lib/parent/startAssignedTest'
import type { AssignmentOverviewRow } from '../lib/parent/types'

export function AssignedTestsPanel() {
  const { activeStudent, familyId } = useActiveStudent()
  const navigate = useNavigate()
  const mountedRef = useRef(true)
  const [rows, setRows] = useState<AssignmentOverviewRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!activeStudent || !familyId) return
    const sid = activeStudent.id
    void (async () => {
      try {
        const v2 = await getParentV2(familyId)
        if (!mountedRef.current) return
        if (!v2) {
          setRows([])
          return
        }
        const all = await getAssignmentOverview(['assigned'])
        if (!mountedRef.current) return
        setRows(all.filter((r) => r.student_id === sid))
      } catch {
        if (mountedRef.current) setRows([])
      }
    })()
  }, [activeStudent?.id, familyId])

  if (!rows || rows.length === 0) return null

  const onStart = async (row: AssignmentOverviewRow) => {
    const sid = activeStudent?.id
    if (!sid) return
    setBusy(row.assignment_id)
    setError(null)
    try {
      const sessionId = await startAssignedTest(row, sid)
      if (mountedRef.current) navigate(`/test/${sessionId}`)
    } catch (e) {
      if (mountedRef.current) {
        setError((e as Error)?.message ?? 'Could not start this test.')
        setBusy(null)
      }
    }
  }

  return (
    <section className="mb-8 animate-slideUp">
      <p className="mb-2 font-display text-lg uppercase tracking-widest text-smoke">
        Assigned to you
      </p>
      {error && <p className="mb-2 text-sm text-ink/60">{error}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((r) => (
          <button
            key={r.assignment_id}
            type="button"
            disabled={busy === r.assignment_id}
            onClick={() => onStart(r)}
            className="card group flex items-center justify-between gap-4 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-cardHover disabled:opacity-60"
          >
            <div>
              <p className="font-display text-xl">{r.definition_name}</p>
              <p className="text-sm text-ink/60">
                <span className="capitalize">{r.subject}</span>
                {r.due_by
                  ? ` · due ${new Date(r.due_by).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}`
                  : ''}
              </p>
              {r.parent_note && (
                <p className="mt-1 text-xs text-ink/50">“{r.parent_note}”</p>
              )}
            </div>
            <span className="pill group-hover:bg-sun/30">
              {busy === r.assignment_id ? '…' : 'Start'}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
