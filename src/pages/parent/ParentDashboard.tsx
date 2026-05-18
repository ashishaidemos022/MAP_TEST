// src/pages/parent/ParentDashboard.tsx
// Legacy flag-off dashboard. Recomposed from the extracted components via the
// shared hook so render output is byte-identical to the pre-2a version: same
// grid, same single "Loading…"/error guards, same blocks in the same order.
import { useActiveStudent } from '../../lib/activeStudent'
import { GrowthAreas } from '../../components/parent/GrowthAreas'
import { KidWeekSessions } from '../../components/parent/KidWeekSessions'
import { MasteryHeatmap } from '../../components/parent/MasteryHeatmap'
import { useKidDashboardData } from '../../components/parent/useKidDashboardData'

export default function ParentDashboard() {
  const { activeStudent } = useActiveStudent()
  const { standards, mastery, signals, recent, weekStats, loading, error } =
    useKidDashboardData(activeStudent?.id)

  if (loading) {
    return <p className="mt-12 text-center font-display text-2xl">Loading…</p>
  }

  if (error) {
    return (
      <div className="card p-8 text-center">
        <p className="font-display text-2xl">Couldn't load the dashboard.</p>
        <p className="mt-2 text-sm text-ink/60">{error}</p>
      </div>
    )
  }

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <section className="md:col-span-2 space-y-6">
        <MasteryHeatmap standards={standards} mastery={mastery} />
        <GrowthAreas signals={signals} />
      </section>
      <aside className="space-y-6">
        <KidWeekSessions recent={recent} weekStats={weekStats} />
      </aside>
    </div>
  )
}
