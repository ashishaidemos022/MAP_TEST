// src/pages/parent/KidDetail.tsx
import { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useActiveStudent } from '../../lib/activeStudent'
import { useKidDashboardData } from '../../components/parent/useKidDashboardData'
import { MasteryHeatmap } from '../../components/parent/MasteryHeatmap'
import { KidWeekSessions } from '../../components/parent/KidWeekSessions'
import { GrowthAreas } from '../../components/parent/GrowthAreas'
import { KidAssignmentsList } from '../../components/parent/KidAssignmentsList'
import ParentSettings from './ParentSettings'

const TABS = ['mastery', 'sessions', 'growth', 'assignments', 'settings'] as const
type Tab = (typeof TABS)[number]

export default function KidDetail() {
  const { id = '' } = useParams()
  const { students } = useActiveStudent()
  const [params, setParams] = useSearchParams()
  const rawTab = params.get('tab')
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? '')
    ? (rawTab as Tab)
    : 'mastery'

  const kid = useMemo(
    () => students.find((s) => s.id === id) ?? null,
    [students, id],
  )
  const dash = useKidDashboardData(kid ? id : undefined)

  if (students.length > 0 && !kid) {
    return (
      <div className="card p-8 text-center">
        <p className="font-display text-2xl">Not found in your classroom.</p>
        <Link to="/parent" className="btn-secondary mt-4 inline-block text-sm">
          Back to classroom
        </Link>
      </div>
    )
  }
  if (!kid) {
    return <p className="mt-12 text-center font-display text-2xl">Loading…</p>
  }

  const setTab = (t: Tab) => setParams({ tab: t }, { replace: false })

  return (
    <div>
      <header className="mb-5">
        <p className="text-xs text-ink/50">
          <Link to="/parent" className="hover:underline">
            Classroom
          </Link>{' '}
          · {kid.display_name}
        </p>
        <h1 className="mt-1 font-display text-3xl">
          {kid.display_name}{' '}
          <span className="text-base text-ink/50">Grade {kid.grade}</span>
        </h1>
        <nav className="mt-4 flex flex-wrap gap-1 text-sm">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1.5 font-semibold capitalize transition ${
                tab === t
                  ? 'bg-white text-ink shadow ring-1 ring-cloud'
                  : 'text-ink/60 hover:text-ink'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      {dash.error && tab !== 'assignments' && tab !== 'settings' && (
        <div className="card p-6 text-center text-sm text-ink/60">{dash.error}</div>
      )}
      {dash.loading && (tab === 'mastery' || tab === 'sessions' || tab === 'growth') && (
        <p className="mt-8 text-center font-display text-xl">Loading…</p>
      )}

      {!dash.loading && tab === 'mastery' && (
        <MasteryHeatmap standards={dash.standards} mastery={dash.mastery} />
      )}
      {!dash.loading && tab === 'sessions' && (
        <KidWeekSessions recent={dash.recent} weekStats={dash.weekStats} />
      )}
      {!dash.loading && tab === 'growth' && <GrowthAreas signals={dash.signals} />}
      {tab === 'assignments' && <KidAssignmentsList studentId={id} />}
      {tab === 'settings' && (
        <ParentSettings studentId={id} displayName={kid.display_name} />
      )}
    </div>
  )
}
