// src/components/parent/library/AiStudioTab.tsx
// AI-generated content ONLY (view source_tab='ai_studio' = source
// 'parent_ai_generated'). The single amber-isolated surface. Never calls any
// other source_tab; no other tab calls 'ai_studio'. Bulk publish/archive run
// per item; the publish RPC enforces §4.7 invariants server-side and raises —
// failures are surfaced inline by id, the batch continues for the rest.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getLibraryContent } from '../../../lib/parent/queries'
import {
  archiveCustomPassage,
  archiveCustomQuestion,
  publishCustomPassage,
  publishCustomQuestion,
} from '../../../lib/parent/mutations'
import type { LibraryContentRow } from '../../../lib/parent/types'
import { LibraryItemCard } from './LibraryItemCard'
import { useLibrarySelection } from './useLibrarySelection'

export function AiStudioTab() {
  const navigate = useNavigate()
  const sel = useLibrarySelection()
  const [status, setStatus] = useState('draft')
  const [rows, setRows] = useState<LibraryContentRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [failures, setFailures] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const load = () => {
    setRows(null)
    setError(null)
    setFailures([])
    void getLibraryContent('ai_studio', status ? { status } : undefined)
      .then((r) => {
        if (mountedRef.current) setRows(r)
      })
      .catch((e) => {
        if (mountedRef.current) setError(e?.message ?? 'Failed to load AI Studio.')
      })
  }
  useEffect(load, [status])

  const runBulk = async (action: 'publish' | 'archive') => {
    if (!rows) return
    setBulkBusy(true)
    setFailures([])
    const targets = rows.filter((r) => sel.selected.has(r.content_id))
    const failed: string[] = []
    for (const r of targets) {
      try {
        if (action === 'publish') {
          if (r.content_type === 'passage') await publishCustomPassage(r.content_id)
          else await publishCustomQuestion(r.content_id)
        } else if (r.content_type === 'passage') {
          await archiveCustomPassage(r.content_id)
        } else {
          await archiveCustomQuestion(r.content_id)
        }
      } catch (e) {
        failed.push(`${r.teks_code ?? r.content_type} (${r.content_id.slice(0, 8)}): ${(e as Error)?.message ?? 'failed'}`)
      }
    }
    if (!mountedRef.current) return
    setFailures(failed)
    sel.clear()
    setBulkBusy(false)
    load()
  }

  return (
    <div>
      <div className="mb-4 rounded-2xl bg-sun/10 p-4 text-sm text-ink/80 ring-1 ring-sun/40">
        AI-generated content lands here in draft. Review before publishing. The
        kid never sees draft content.
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/parent/connect-ai')}
          className="btn-secondary text-sm"
        >
          Ask AI to generate
        </button>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-full bg-cream px-3 py-1.5 text-sm ring-1 ring-cloud"
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
          <option value="">All</option>
        </select>
        {sel.count > 0 && (
          <>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => runBulk('publish')}
              className="btn-secondary text-sm"
            >
              {bulkBusy ? '…' : `Publish selected (${sel.count})`}
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => runBulk('archive')}
              className="btn-ghost text-sm"
            >
              {bulkBusy ? '…' : `Archive selected (${sel.count})`}
            </button>
          </>
        )}
      </div>

      {failures.length > 0 && (
        <div className="mb-4 rounded-2xl bg-red/10 p-4 text-xs text-ink/80 ring-1 ring-red/40">
          <p className="font-semibold">Some items could not be processed:</p>
          <ul className="mt-1 list-disc pl-5">
            {failures.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {error && <div className="card p-6 text-sm text-ink/60">{error}</div>}
      {!error && !rows && (
        <p className="mt-8 text-center font-display text-xl">Loading…</p>
      )}
      {!error && rows && rows.length === 0 && (
        <p className="card p-6 text-center text-sm text-ink/60">
          No AI-generated content with this status.
        </p>
      )}
      {!error && rows && rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((r) => (
            <LibraryItemCard
              key={r.content_id}
              row={r}
              selected={sel.selected.has(r.content_id)}
              onToggleSelect={sel.toggle}
              badge={
                <span className="rounded-full bg-sun/20 px-2 py-0.5 text-[11px] font-semibold text-ink/70 ring-1 ring-sun/40">
                  Generated by AI
                </span>
              }
              actions={
                <AiItemActions
                  row={r}
                  onDone={load}
                  onItemError={(m) =>
                    setFailures((prev) => [
                      ...prev,
                      `${r.teks_code ?? r.content_type} (${r.content_id.slice(0, 8)}): ${m}`,
                    ])
                  }
                />
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AiItemActions({
  row,
  onDone,
  onItemError,
}: {
  row: LibraryContentRow
  onDone: () => void
  onItemError: (m: string) => void
}) {
  const [busy, setBusy] = useState<'publish' | 'archive' | null>(null)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  const run = async (action: 'publish' | 'archive') => {
    setBusy(action)
    try {
      if (action === 'publish') {
        if (row.content_type === 'passage') await publishCustomPassage(row.content_id)
        else await publishCustomQuestion(row.content_id)
      } else if (row.content_type === 'passage') {
        await archiveCustomPassage(row.content_id)
      } else {
        await archiveCustomQuestion(row.content_id)
      }
      if (mountedRef.current) onDone()
    } catch (e) {
      if (mountedRef.current) onItemError((e as Error)?.message ?? `${action} failed.`)
    } finally {
      if (mountedRef.current) setBusy(null)
    }
  }
  return (
    <>
      {row.status === 'draft' && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run('publish')}
          className="btn-secondary text-xs"
        >
          {busy === 'publish' ? '…' : 'Publish'}
        </button>
      )}
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => run('archive')}
        className="btn-ghost text-xs"
      >
        {busy === 'archive' ? '…' : 'Archive'}
      </button>
    </>
  )
}
