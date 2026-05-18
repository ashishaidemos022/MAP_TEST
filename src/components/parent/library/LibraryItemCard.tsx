// src/components/parent/library/LibraryItemCard.tsx
// One LibraryContentRow rendered as a card. Selection checkbox + a tab-supplied
// actions slot. Presentational only — the tab decides which actions exist.
import type { ReactNode } from 'react'
import type { LibraryContentRow } from '../../../lib/parent/types'

export function LibraryItemCard({
  row,
  selected,
  onToggleSelect,
  badge,
  actions,
}: {
  row: LibraryContentRow
  selected: boolean
  onToggleSelect: (id: string) => void
  badge?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="card flex items-start gap-3 p-4">
      <input
        type="checkbox"
        className="mt-1"
        checked={selected}
        onChange={() => onToggleSelect(row.content_id)}
        aria-label="Select item"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-cloud">
            {row.content_type}
          </span>
          <span className="text-xs capitalize text-ink/60">{row.subject}</span>
          {row.grade != null && (
            <span className="text-xs text-ink/50">Grade {row.grade}</span>
          )}
          {row.status && (
            <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-semibold capitalize text-ink/70 ring-1 ring-cloud">
              {row.status}
            </span>
          )}
          {badge}
        </div>
        {row.teks_code && (
          <p className="mt-1 font-mono text-[11px] text-ink/60">
            {row.teks_code}
            {row.teks_title ? ` — ${row.teks_title}` : ''}
          </p>
        )}
        {row.rit_band && (
          <p className="mt-1 text-[11px] text-ink/40">RIT {row.rit_band}</p>
        )}
        <p className="mt-1 text-[11px] text-ink/40">
          {new Date(row.created_at).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      </div>
      {actions && <div className="flex shrink-0 flex-col items-end gap-1">{actions}</div>}
    </div>
  )
}
