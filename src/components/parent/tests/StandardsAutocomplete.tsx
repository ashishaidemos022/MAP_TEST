// src/components/parent/tests/StandardsAutocomplete.tsx
// Comma/Enter-entered TEKS code chips. Empty = "any standard". (Brief's
// "autocomplete" is simplified to validated chip-entry for 2c — no standards
// catalog endpoint exists; documented in spec §11.)
import { useState } from 'react'

export function StandardsAutocomplete({
  codes,
  onChange,
}: {
  codes: string[]
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim().toUpperCase()
    if (v && !codes.includes(v)) onChange([...codes, v])
    setDraft('')
  }
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {codes.map((c) => (
          <span
            key={c}
            className="rounded-full bg-cream px-2 py-0.5 text-xs ring-1 ring-cloud"
          >
            {c}{' '}
            <button
              type="button"
              onClick={() => onChange(codes.filter((x) => x !== c))}
              className="text-ink/40 hover:text-ink"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add()
          }
        }}
        onBlur={add}
        placeholder="TEKS code, Enter to add (empty = any)"
        className="mt-1 w-full rounded-full bg-cream px-3 py-1.5 text-sm ring-1 ring-cloud"
      />
    </div>
  )
}
