// src/components/parent/MasteryHeatmap.tsx
// Presentational. Markup copied verbatim from the legacy ParentDashboard
// "Topic Mastery Heatmap" card — no redesign. Owns only the subject-toggle UI state.
import { useMemo, useState } from 'react'
import type { Standard, Subject } from '../../lib/types'
import type { MasteryRow } from './useKidDashboardData'

export function MasteryHeatmap({
  standards,
  mastery,
}: {
  standards: Standard[]
  mastery: MasteryRow[]
}) {
  const [subject, setSubject] = useState<Subject>('math')

  const masteryByStandard = useMemo(() => {
    const m = new Map<string, MasteryRow>()
    for (const row of mastery) m.set(row.standard_id, row)
    return m
  }, [mastery])

  const subjectStandards = useMemo(
    () => standards.filter((s) => s.subject === subject),
    [standards, subject],
  )

  const subjectStats = useMemo(() => {
    const counts = { mastered: 0, developing: 0, growth: 0, untouched: 0 }
    for (const s of subjectStandards) {
      const m = masteryByStandard.get(s.id)
      if (!m) counts.untouched++
      else if (m.status === 'mastered') counts.mastered++
      else if (m.status === 'developing') counts.developing++
      else if (m.status === 'growth') counts.growth++
    }
    return counts
  }, [subjectStandards, masteryByStandard])

  return (
    <div className="card p-5">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl">Topic Mastery Heatmap</h2>
          <p className="text-xs text-ink/60">
            Each tile is one topic. Color = current mastery for the chosen subject.
          </p>
        </div>
        <SubjectToggle value={subject} onChange={setSubject} />
      </header>
      <Legend counts={subjectStats} />
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {subjectStandards.map((s) => {
          const row = masteryByStandard.get(s.id)
          const tone = row ? statusTone(row.status) : 'bg-cloud'
          const label = row ? row.status : 'untouched'
          return (
            <div
              key={s.id}
              className={`rounded-2xl ${tone} p-3 text-ink/90 ring-1 ring-ink/5`}
              title={`${s.teks_code} — ${s.teks_title} (${label}${row?.mastery_score != null ? `, ${(row.mastery_score * 100).toFixed(0)}%` : ''})`}
            >
              <p className="font-mono text-xs font-bold">{s.teks_code}</p>
              <p className="mt-1 text-xs leading-snug">{s.teks_title}</p>
              {row?.mastery_score != null && (
                <p className="mt-2 font-mono text-[11px] text-ink/70">
                  {(row.mastery_score * 100).toFixed(0)}% over {row.attempts} question
                  {row.attempts === 1 ? '' : 's'} attempted
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SubjectToggle({
  value,
  onChange,
}: {
  value: Subject
  onChange: (s: Subject) => void
}) {
  return (
    <div className="inline-flex rounded-full bg-cream p-1 text-xs font-semibold ring-1 ring-cloud">
      {(['math', 'reading', 'language'] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={`rounded-full px-3 py-1 transition ${
            value === s ? 'bg-white text-ink shadow' : 'text-ink/60'
          }`}
        >
          {s[0].toUpperCase() + s.slice(1)}
        </button>
      ))}
    </div>
  )
}

function Legend({
  counts,
}: {
  counts: { mastered: number; developing: number; growth: number; untouched: number }
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <Swatch tone="bg-leaf/30" label={`Mastered (${counts.mastered})`} />
      <Swatch tone="bg-sky/30" label={`Developing (${counts.developing})`} />
      <Swatch tone="bg-sun/40" label={`Weak / growth area (${counts.growth})`} />
      <Swatch tone="bg-cloud" label={`Not yet attempted (${counts.untouched})`} />
    </div>
  )
}

function Swatch({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded ${tone} ring-1 ring-ink/10`} />
      <span className="text-ink/70">{label}</span>
    </span>
  )
}

function statusTone(status: 'mastered' | 'developing' | 'growth'): string {
  if (status === 'mastered') return 'bg-leaf/30'
  if (status === 'developing') return 'bg-sky/30'
  return 'bg-sun/40'
}
