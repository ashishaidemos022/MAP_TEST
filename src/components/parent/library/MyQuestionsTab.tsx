// src/components/parent/library/MyQuestionsTab.tsx
// Family's parent_manual + parent_ai_assisted content (view maps both to
// source_tab='my_questions'). Archive via soft-delete RPC wrappers. New
// question/passage link to the existing create editors. No Edit action —
// the editors are create-only; a revise editor is out of 2b scope (spec §9).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getLibraryContent } from '../../../lib/parent/queries'
import { archiveCustomPassage, archiveCustomQuestion } from '../../../lib/parent/mutations'
import type { LibraryContentRow } from '../../../lib/parent/types'
import { LibraryItemCard } from './LibraryItemCard'
import { useLibrarySelection } from './useLibrarySelection'

export function MyQuestionsTab() {
  const sel = useLibrarySelection()
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<LibraryContentRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = () => {
    setRows(null)
    setError(null)
    void getLibraryContent('my_questions', status ? { status } : undefined)
      .then(setRows)
      .catch((e) => setError(e?.message ?? 'Failed to load your questions.'))
  }
  useEffect(load, [status])

  if (error) return <div className="card p-6 text-sm text-ink/60">{error}</div>
  if (!rows) return <p className="mt-8 text-center font-display text-xl">Loading…</p>

  const onArchive = async (row: LibraryContentRow) => {
    setBusy(row.content_id)
    try {
      if (row.content_type === 'passage') await archiveCustomPassage(row.content_id)
      else await archiveCustomQuestion(row.content_id)
      load()
    } catch (e) {
      setError((e as Error)?.message ?? 'Archive failed.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link to="/parent/custom-bank/new-question" className="btn-secondary text-sm">
          + New question
        </Link>
        <Link to="/parent/custom-bank/new-passage" className="btn-secondary text-sm">
          + New passage
        </Link>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-full bg-cream px-3 py-1.5 text-sm ring-1 ring-cloud"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <p className="card p-6 text-center text-sm text-ink/60">
          No questions or passages here yet. Use “+ New question” to author one.
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
                  disabled={busy === r.content_id}
                  onClick={() => onArchive(r)}
                  className="btn-ghost text-xs"
                >
                  {busy === r.content_id ? '…' : 'Archive'}
                </button>
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
