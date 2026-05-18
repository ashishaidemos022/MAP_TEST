// src/components/parent/library/useLibrarySelection.ts
// Multi-select set keyed by content_id, shared by tabs with bulk actions.
import { useCallback, useState } from 'react'

export function useLibrarySelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clear = useCallback(() => setSelected(new Set()), [])

  return { selected, toggle, clear, count: selected.size }
}
