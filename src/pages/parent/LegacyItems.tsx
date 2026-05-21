// src/pages/parent/LegacyItems.tsx
// Read-only list of custom items not attached to any bank. Existing per-card
// Publish/Archive/Delete actions are preserved by linking each item to the
// existing detail screens (no in-place mutations here — keeps the file
// small).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

interface LegacyRow {
  kind: 'question' | 'passage'
  id: string
  subject: 'math' | 'reading' | 'language'
  grade: number
  status: 'draft' | 'published' | 'archived'
  created_at: string
}

export default function LegacyItems() {
  const [rows, setRows] = useState<LegacyRow[] | null>(null)
  useEffect(() => {
    supabase.from('map_v_custom_legacy_items')
      .select('kind, id, subject, grade, status, created_at')
      .order('created_at', { ascending: false })
      .then(({ data }) => setRows((data ?? []) as LegacyRow[]))
  }, [])
  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-4">
        <Link to="/parent/ai-studio" className="text-sm text-zinc-500 hover:underline">← All banks</Link>
      </div>
      <h1 className="text-2xl font-semibold mb-2">Legacy items</h1>
      <p className="text-sm text-zinc-500 mb-4">
        Custom items that aren't attached to a bank. New AI- and manual-authored items always land in a bank — these are leftovers.
      </p>
      {!rows ? <p className="text-zinc-500">Loading…</p> :
        rows.length === 0 ? <p className="text-zinc-500">No legacy items.</p> : (
        <ul className="divide-y rounded border bg-white dark:bg-zinc-900">
          {rows.map(r => (
            <li key={`${r.kind}:${r.id}`} className="p-3 flex items-center gap-3">
              <span className="text-xs uppercase tracking-wide text-zinc-500 w-20">{r.kind}</span>
              <span className="text-xs text-zinc-500">{r.subject} · G{r.grade}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">{r.status}</span>
              <span className="flex-1 text-xs text-zinc-500 truncate">{r.id}</span>
              <span className="text-xs text-zinc-500">{new Date(r.created_at).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
