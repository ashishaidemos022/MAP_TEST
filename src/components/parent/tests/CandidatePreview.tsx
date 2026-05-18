// src/components/parent/tests/CandidatePreview.tsx
// Live "~N candidates" for the builder Step 1. Debounced getCandidateCount.
import { useEffect, useRef, useState } from 'react'
import { getCandidateCount } from '../../../lib/parent/queries'

export function CandidatePreview({
  subject,
  grade,
  standardCodes,
  sourceMix,
  plannedLength,
}: {
  subject: string
  grade: number
  standardCodes: string[]
  sourceMix: 'vetted_only' | 'custom_only' | 'mixed'
  plannedLength: number
}) {
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    setCount(null)
    setError(null)
    const t = setTimeout(() => {
      void getCandidateCount({ subject, grade, standardCodes, sourceMix })
        .then((c) => {
          if (mountedRef.current) setCount(c)
        })
        .catch((e) => {
          if (mountedRef.current) setError(e?.message ?? 'Count failed.')
        })
    }, 350)
    return () => clearTimeout(t)
  }, [subject, grade, standardCodes.join(','), sourceMix])

  if (error) return <p className="text-xs text-ink/50">{error}</p>
  if (count == null) return <p className="text-xs text-ink/40">Counting…</p>
  const tight = count < plannedLength * 1.5
  return (
    <p className={`text-xs ${tight ? 'text-ink/80' : 'text-ink/50'}`}>
      ~{count} candidate{count === 1 ? '' : 's'} match these filters
      {tight && (
        <span className="ml-2 rounded-full bg-sun/20 px-2 py-0.5 text-[11px] text-ink/70 ring-1 ring-sun/40">
          Tight question pool — consider widening
        </span>
      )}
    </p>
  )
}
