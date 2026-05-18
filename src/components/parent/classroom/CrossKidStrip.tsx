// src/components/parent/classroom/CrossKidStrip.tsx
import type { ClassroomRosterRow } from '../../../lib/parent/types'

export function CrossKidStrip({ rows }: { rows: ClassroomRosterRow[] }) {
  const questions = rows.reduce((a, r) => a + (r.questions_this_week ?? 0), 0)
  const activeDays = rows.reduce((a, r) => a + (r.active_days_this_week ?? 0), 0)
  const misconceptionCount = rows.reduce((a, r) => a + (r.active_misconceptions ?? 0), 0)
  return (
    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Tile label="Questions this week" value={questions} />
      <Tile label="Active days" value={activeDays} />
      <Tile
        label="Growth areas needing attention"
        value={misconceptionCount}
        warn={misconceptionCount > 0}
      />
    </div>
  )
}

function Tile({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`card p-4 ${warn ? 'ring-1 ring-sun/50 bg-sun/5' : ''}`}>
      <p className="font-display text-3xl">{value}</p>
      <p className="text-[11px] uppercase tracking-widest text-smoke">{label}</p>
    </div>
  )
}
