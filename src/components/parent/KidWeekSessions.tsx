// src/components/parent/KidWeekSessions.tsx
// Presentational. "This week" + "Recent sessions" cards copied verbatim from
// the legacy ParentDashboard aside — no redesign.
import { gradeContext } from '../../lib/rit'
import type { Session } from '../../lib/types'
import type { WeekStats } from './useKidDashboardData'

export function KidWeekSessions({
  recent,
  weekStats,
}: {
  recent: Session[]
  weekStats: WeekStats | null
}) {
  return (
    <div className="space-y-6">
      <div className="card p-5">
        <h2 className="font-display text-xl">This week</h2>
        {weekStats ? (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat label="Questions Attempted" value={weekStats.attempts} />
            <Stat label="Days active" value={weekStats.daysActive} />
            <Stat label="Streak" value={`${weekStats.streakDays}d`} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink/60">No questions attempted yet.</p>
        )}
        <p className="mt-3 text-xs text-ink/50">
          Streak counts consecutive days back from today with at least one question attempted.
        </p>
      </div>

      <div className="card p-5">
        <h2 className="font-display text-xl">Recent sessions</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-ink/60">No completed sessions yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-cloud/70">
            {recent.map((s) => {
              const total = s.planned_length
              const acc = total > 0 ? Math.round((s.correct_count / total) * 100) : 0
              return (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <p className="font-semibold">
                      <span className="capitalize">{s.subject}</span>{' '}
                      {s.kind === 'boost'
                        ? '⚡ boost'
                        : s.kind === 'custom'
                          ? '🎯 custom'
                          : 'test'}
                    </p>
                    <p className="text-xs text-ink/60">
                      {s.completed_at &&
                        new Date(s.completed_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                      • {s.correct_count}/{total} ({acc}%)
                      {s.estimated_rit != null && ` • RIT ${s.estimated_rit}`}
                    </p>
                    {s.estimated_rit != null && s.kind === 'test' && (
                      <p className="text-[11px] text-ink/40">
                        {gradeContext(s.estimated_rit)}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-cream/60 p-2">
      <p className="font-display text-2xl">{value}</p>
      <p className="text-[10px] uppercase tracking-widest text-smoke">{label}</p>
    </div>
  )
}
