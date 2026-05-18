// src/components/parent/tests/KidPicker.tsx
// Shared kid picker. mode='single' → one selection; mode='multi' → set.
// Fed by getClassroomRoster (RLS-scoped). Mount-guarded per repo convention.
import { useEffect, useRef, useState } from 'react'
import { getClassroomRoster } from '../../../lib/parent/queries'
import type { ClassroomRosterRow } from '../../../lib/parent/types'

export function KidPicker({
  mode,
  selected,
  onChange,
  definitionGrade,
}: {
  mode: 'single' | 'multi'
  selected: Set<string>
  onChange: (next: Set<string>) => void
  definitionGrade?: number
}) {
  const [kids, setKids] = useState<ClassroomRosterRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    void getClassroomRoster()
      .then((r) => {
        if (mountedRef.current) setKids(r)
      })
      .catch((e) => {
        if (mountedRef.current) setError(e?.message ?? 'Failed to load kids.')
      })
  }, [])

  if (error) return <div className="card p-4 text-sm text-ink/60">{error}</div>
  if (!kids) return <p className="text-sm text-ink/50">Loading…</p>

  const toggle = (id: string) => {
    if (mode === 'single') {
      onChange(new Set([id]))
      return
    }
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  return (
    <div className="flex flex-wrap gap-2">
      {mode === 'multi' && kids.length > 1 && (
        <button
          type="button"
          onClick={() => onChange(new Set(kids.map((k) => k.student_id)))}
          className="btn-ghost text-xs"
        >
          Select all
        </button>
      )}
      {kids.map((k) => {
        const on = selected.has(k.student_id)
        const gap =
          definitionGrade != null && Math.abs(k.grade - definitionGrade) >= 2
        return (
          <button
            key={k.student_id}
            type="button"
            onClick={() => toggle(k.student_id)}
            className={`rounded-2xl px-3 py-2 text-sm ring-1 transition ${
              on
                ? 'bg-white text-ink shadow ring-cloud'
                : 'bg-cream text-ink/60 ring-cloud hover:text-ink'
            }`}
          >
            <span className="font-semibold">{k.display_name}</span>{' '}
            <span className="text-xs text-ink/50">Grade {k.grade}</span>
            {on && gap && (
              <span className="ml-1 rounded-full bg-sun/20 px-2 py-0.5 text-[11px] text-ink/70 ring-1 ring-sun/40">
                grade gap — sure?
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
