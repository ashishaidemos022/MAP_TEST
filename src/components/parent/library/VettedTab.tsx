// src/components/parent/library/VettedTab.tsx
// Vetted platform bank (family_id IS NULL via the security_invoker view).
// Read-only. Server-side filters + offset pagination. "Add to test" deep-links
// to the legacy builder (no pre-fill — 2c owns pre-fill).
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getLibraryContent } from '../../../lib/parent/queries'
import type { LibraryContentRow, LibraryFilters } from '../../../lib/parent/types'
import { LibraryItemCard } from './LibraryItemCard'
import { useLibrarySelection } from './useLibrarySelection'

const PAGE = 100

export function VettedTab() {
  const navigate = useNavigate()
  const sel = useLibrarySelection()
  const [subject, setSubject] = useState('')
  const [grade, setGrade] = useState('')
  const [rows, setRows] = useState<LibraryContentRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [atEnd, setAtEnd] = useState(false)

  useEffect(() => {
    let cancelled = false
    setRows(null)
    setError(null)
    setAtEnd(false)
    const filters: LibraryFilters = { limit: PAGE, offset }
    if (subject) filters.subject = subject
    if (grade) filters.grade = Number(grade)
    void getLibraryContent('vetted', filters)
      .then((r) => {
        if (cancelled) return
        setRows(r)
        setAtEnd(r.length < PAGE)
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Failed to load vetted content.')
      })
    return () => {
      cancelled = true
    }
  }, [subject, grade, offset])

  if (error) {
    return <div className="card p-6 text-sm text-ink/60">{error}</div>
  }
  if (!rows) {
    return <p className="mt-8 text-center font-display text-xl">Loading…</p>
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={subject}
          onChange={(e) => {
            setOffset(0)
            setSubject(e.target.value)
          }}
          className="rounded-full bg-cream px-3 py-1.5 text-sm ring-1 ring-cloud"
        >
          <option value="">All subjects</option>
          <option value="math">Math</option>
          <option value="reading">Reading</option>
          <option value="language">Language</option>
        </select>
        <input
          type="number"
          placeholder="Grade"
          value={grade}
          onChange={(e) => {
            setOffset(0)
            setGrade(e.target.value)
          }}
          className="w-24 rounded-full bg-cream px-3 py-1.5 text-sm ring-1 ring-cloud"
        />
        {sel.count > 0 && (
          <button
            type="button"
            onClick={() => navigate('/parent/custom-test')}
            className="btn-secondary text-sm"
          >
            Add {sel.count} to test
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="card p-6 text-center text-sm text-ink/60">
          No vetted content matches these filters.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <LibraryItemCard
              key={r.content_id}
              row={r}
              selected={sel.selected.has(r.content_id)}
              onToggleSelect={sel.toggle}
              actions={
                <button
                  type="button"
                  onClick={() => navigate('/parent/custom-test')}
                  className="btn-ghost text-xs"
                >
                  Add to test
                </button>
              }
            />
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-between">
        <button
          type="button"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - PAGE))}
          className="btn-ghost text-sm disabled:opacity-40"
        >
          ‹ Newer
        </button>
        <button
          type="button"
          disabled={atEnd}
          onClick={() => setOffset(offset + PAGE)}
          className="btn-ghost text-sm disabled:opacity-40"
        >
          Older ›
        </button>
      </div>
    </div>
  )
}
