// src/components/parent/classroom/KidRosterCard.tsx
import { Link, useNavigate } from 'react-router-dom'
import type { ClassroomRosterRow } from '../../../lib/parent/types'

export function KidRosterCard({ row }: { row: ClassroomRosterRow }) {
  const navigate = useNavigate()
  const noPractice = (row.questions_this_week ?? 0) === 0 && (row.active_days_this_week ?? 0) === 0
  const needsAttention = (row.active_misconceptions ?? 0) > 0 || noPractice
  const unseen = 0 // unseen-standard count is not in the roster view; segment shows 0 in 2a
  const distTotal =
    row.standards_mastered + row.standards_developing + row.standards_growth + unseen || 1
  const seg = (n: number) => `${(n / distTotal) * 100}%`
  return (
    <div className="card relative flex flex-col gap-3 p-5">
      {needsAttention && (
        <span className="absolute right-4 top-4 rounded-full bg-sun/20 px-2 py-0.5 text-[11px] font-semibold text-ink/70 ring-1 ring-sun/40">
          Needs attention
        </span>
      )}
      <div>
        <p className="font-display text-2xl">{row.display_name}</p>
        <p className="text-xs text-ink/60">
          Grade {row.grade}
          {row.current_band ? ` · band ${row.current_band}` : ''}
        </p>
      </div>
      <div>
        {noPractice ? (
          <p className="text-sm text-ink/40">No practice this week</p>
        ) : (
          <p className="text-sm text-ink/70">
            {row.questions_this_week} questions · {row.active_days_this_week} days
          </p>
        )}
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-cloud">
        <span className="bg-leaf/50" style={{ width: seg(row.standards_mastered) }} />
        <span className="bg-sky/50" style={{ width: seg(row.standards_developing) }} />
        <span className="bg-sun/50" style={{ width: seg(row.standards_growth) }} />
      </div>
      <p className="text-[11px] text-ink/50">
        {row.standards_mastered} mastered · {row.standards_developing} developing ·{' '}
        {row.standards_growth} growth
      </p>
      {row.last_session && (
        <p className="text-[11px] text-ink/40">
          Last: {row.last_session.subject}
          {row.last_session.score != null ? ` · ${row.last_session.score}%` : ''}
          {row.last_session.completed_at
            ? ` · ${new Date(row.last_session.completed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
            : ''}
        </p>
      )}
      <div className="mt-1 flex items-center gap-2">
        <Link
          to={`/parent/kids/${row.student_id}`}
          className="btn-secondary flex-1 text-center text-sm"
        >
          Open dashboard
        </Link>
        <button
          type="button"
          title="Assign a test"
          onClick={() => navigate('/parent/custom-test')}
          className="btn-ghost px-3 text-sm"
        >
          +
        </button>
      </div>
    </div>
  )
}
