// src/pages/parent/DefinitionDetail.tsx
// /parent/tests/definitions/:id — the definition (even with 0 assignments)
// + its per-kid assignments. Foreign/unknown id → not-found (RLS → null).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAssignmentOverview, getTestDefinition } from '../../lib/parent/queries'
import type { AssignmentOverviewRow, TestDefinitionRow } from '../../lib/parent/types'

export default function DefinitionDetail() {
  const { id = '' } = useParams()
  const [def, setDef] = useState<TestDefinitionRow | null>(null)
  const [assigns, setAssigns] = useState<AssignmentOverviewRow[]>([])
  const [resolved, setResolved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  useEffect(() => {
    void Promise.all([getTestDefinition(id), getAssignmentOverview()])
      .then(([d, a]) => {
        if (!mountedRef.current) return
        setDef(d)
        setAssigns(a.filter((x) => x.definition_id === id))
        setResolved(true)
      })
      .catch((e) => {
        if (mountedRef.current) {
          setError(e?.message ?? 'Failed to load.')
          setResolved(true)
        }
      })
  }, [id])

  const mine = useMemo(() => assigns, [assigns])

  if (error) return <div className="card p-6 text-sm text-ink/60">{error}</div>
  if (!resolved)
    return <p className="mt-12 text-center font-display text-2xl">Loading…</p>
  if (!def)
    return (
      <div className="card p-8 text-center">
        <p className="font-display text-2xl">Not found in your tests.</p>
        <Link to="/parent/tests" className="btn-secondary mt-4 inline-block text-sm">
          Back to tests
        </Link>
      </div>
    )

  return (
    <div>
      <header className="mb-5">
        <p className="text-xs text-ink/50">
          <Link to="/parent/tests" className="hover:underline">
            Tests
          </Link>{' '}
          · {def.name}
        </p>
        <h1 className="mt-1 font-display text-3xl">
          {def.name}{' '}
          {def.is_template && (
            <span className="rounded-full bg-cream px-2 py-0.5 text-xs ring-1 ring-cloud">
              template
            </span>
          )}
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          <span className="capitalize">{def.subject}</span> · Grade {def.grade} ·{' '}
          {def.planned_length} questions · {def.source_mix.replace('_', ' ')}
        </p>
        <Link
          to={`/parent/tests/builder?from=${def.id}`}
          className="btn-secondary mt-3 inline-block text-sm"
        >
          Assign to kids
        </Link>
      </header>

      <section className="card p-5">
        <h2 className="font-display text-xl">Assignments</h2>
        {mine.length === 0 ? (
          <p className="mt-2 text-sm text-ink/60">
            Not assigned to anyone yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-cloud/70">
            {mine.map((a) => (
              <li
                key={a.assignment_id}
                className="flex items-center justify-between gap-2 py-2"
              >
                <p className="font-semibold">
                  {a.student_name}{' '}
                  <span className="text-xs text-ink/50">
                    Grade {a.student_grade}
                  </span>
                </p>
                <p className="text-xs text-ink/60">
                  {a.status}
                  {a.status === 'completed' && a.score != null
                    ? ` · ${a.score}%`
                    : ''}
                  {a.status === 'completed' && a.estimated_rit != null
                    ? ` · RIT ${a.estimated_rit}`
                    : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
