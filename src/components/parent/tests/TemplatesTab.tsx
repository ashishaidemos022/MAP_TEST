// src/components/parent/tests/TemplatesTab.tsx
// Definition-grain: listTestDefinitions({templatesOnly}). A zero-assignment
// template is visible here (invisible to the assignment-grain overview).
// Completed-count = client aggregate over getAssignmentOverview by definition.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAssignmentOverview, listTestDefinitions } from '../../../lib/parent/queries'
import type { AssignmentOverviewRow, TestDefinitionRow } from '../../../lib/parent/types'

export function TemplatesTab() {
  const [defs, setDefs] = useState<TestDefinitionRow[] | null>(null)
  const [assigns, setAssigns] = useState<AssignmentOverviewRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  useEffect(() => {
    void Promise.all([
      listTestDefinitions({ templatesOnly: true }),
      getAssignmentOverview(),
    ])
      .then(([d, a]) => {
        if (!mountedRef.current) return
        setDefs(d)
        setAssigns(a)
      })
      .catch((e) => {
        if (mountedRef.current) setError(e?.message ?? 'Failed to load.')
      })
  }, [])

  if (error) return <div className="card p-6 text-sm text-ink/60">{error}</div>
  if (!defs) return <p className="mt-8 text-center font-display text-xl">Loading…</p>
  if (defs.length === 0)
    return (
      <p className="card p-6 text-center text-sm text-ink/60">
        No templates yet. Build a test and toggle “Save as template”.
      </p>
    )

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {defs.map((d) => {
        const forDef = assigns.filter((a) => a.definition_id === d.id)
        const done = forDef.filter((a) => a.status === 'completed').length
        return (
          <div key={d.id} className="card p-5">
            <p className="font-display text-xl">{d.name}</p>
            <p className="mt-1 text-xs text-ink/60">
              <span className="capitalize">{d.subject}</span> · Grade {d.grade} ·{' '}
              {d.planned_length} q · {d.source_mix.replace('_', ' ')} ·{' '}
              {d.standard_codes.length} standard
              {d.standard_codes.length === 1 ? '' : 's'}
            </p>
            <p className="mt-1 text-[11px] text-ink/40">
              {done} of {forDef.length} assignment
              {forDef.length === 1 ? '' : 's'} completed
            </p>
            <div className="mt-3 flex gap-2">
              <Link
                to={`/parent/tests/builder?from=${d.id}`}
                className="btn-secondary text-xs"
              >
                Assign to kids
              </Link>
              <Link
                to={`/parent/tests/definitions/${d.id}`}
                className="btn-ghost text-xs"
              >
                View
              </Link>
            </div>
          </div>
        )
      })}
    </div>
  )
}
