// src/pages/parent/KidDetail.tsx
// Kid-scoped detail. Kid context is ALWAYS the URL :id (never activeStudent).
// Tabs via ?tab= so any URL is copyable/deep-linkable.
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getAssignmentOverview, getClassroomRoster } from '../../lib/parent/queries'
import { revokeAssignment } from '../../lib/parent/mutations'
import type { AssignmentOverviewRow, ClassroomRosterRow } from '../../lib/parent/types'
import { GrowthAreas } from '../../components/parent/GrowthAreas'
import { KidWeekSessions } from '../../components/parent/KidWeekSessions'
import { MasteryHeatmap } from '../../components/parent/MasteryHeatmap'
import { useKidDashboardData } from '../../components/parent/useKidDashboardData'

const TABS = ['mastery', 'sessions', 'growth', 'assignments'] as const
type Tab = (typeof TABS)[number]

export default function KidDetail() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const rawTab = params.get('tab')
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? '')
    ? (rawTab as Tab)
    : 'mastery'

  const [roster, setRoster] = useState<ClassroomRosterRow[] | null>(null)
  useEffect(() => {
    let c = false
    void getClassroomRoster().then((r) => !c && setRoster(r))
    return () => {
      c = true
    }
  }, [])

  const kid = useMemo(
    () => roster?.find((r) => r.student_id === id) ?? null,
    [roster, id],
  )
  const dash = useKidDashboardData(kid ? id : undefined)

  if (roster && !kid) {
    return (
      <div className="card p-8 text-center">
        <p className="font-display text-2xl">Not found in your classroom.</p>
        <Link to="/parent" className="btn-secondary mt-4 inline-block text-sm">
          Back to classroom
        </Link>
      </div>
    )
  }
  if (!roster || !kid) {
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
        <div className="mt-1 flex items-center justify-between gap-3">
          <h1 className="font-display text-3xl">
            {kid.display_name}{' '}
            <span className="text-base text-ink/50">Grade {kid.grade}</span>
          </h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate('/parent/custom-test')}
              className="btn-secondary text-sm"
            >
              Assign a test
            </button>
            <button
              type="button"
              onClick={() => navigate('/boost')}
              className="btn-ghost text-sm"
            >
              Boost session
            </button>
          </div>
        </div>
        <nav className="mt-4 flex gap-1 text-sm">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1.5 font-semibold capitalize transition ${
                tab === t ? 'bg-white text-ink shadow ring-1 ring-cloud' : 'text-ink/60'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      {dash.error && (
        <div className="card p-6 text-center text-sm text-ink/60">{dash.error}</div>
      )}
      {dash.loading && tab !== 'assignments' && (
        <p className="mt-8 text-center font-display text-xl">Loading…</p>
      )}

      {!dash.loading && tab === 'mastery' && (
        <MasteryHeatmap standards={dash.standards} mastery={dash.mastery} />
      )}
      {!dash.loading && tab === 'sessions' && (
        <KidWeekSessions recent={dash.recent} weekStats={dash.weekStats} />
      )}
      {!dash.loading && tab === 'growth' && <GrowthAreas signals={dash.signals} />}
      {tab === 'assignments' && <AssignmentsTab studentId={id} />}
    </div>
  )
}

function AssignmentsTab({ studentId }: { studentId: string }) {
  const [rows, setRows] = useState<AssignmentOverviewRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = () => {
    void getAssignmentOverview()
      .then((all) => setRows(all.filter((r) => r.student_id === studentId)))
      .catch((e) => setError(e?.message ?? 'Failed to load assignments.'))
  }
  useEffect(load, [studentId])

  if (error) return <div className="card p-6 text-sm text-ink/60">{error}</div>
  if (!rows) return <p className="mt-8 text-center font-display text-xl">Loading…</p>

  const active = rows.filter((r) => r.status === 'assigned' || r.status === 'in_progress')
  const completed = rows
    .filter((r) => r.status === 'completed')
    .slice(0, 10)

  const onRevoke = async (assignmentId: string) => {
    setBusy(assignmentId)
    try {
      await revokeAssignment(assignmentId)
      load()
    } catch (e) {
      setError((e as Error)?.message ?? 'Revoke failed.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h2 className="font-display text-xl">Active</h2>
        {active.length === 0 ? (
          <p className="mt-2 text-sm text-ink/60">No active assignments.</p>
        ) : (
          <ul className="mt-3 divide-y divide-cloud/70">
            {active.map((r) => (
              <li key={r.assignment_id} className="flex items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-semibold">{r.definition_name}</p>
                  <p className="text-xs text-ink/60">
                    <span className="capitalize">{r.subject}</span> · {r.status}
                    {r.due_by
                      ? ` · due ${new Date(r.due_by).toLocaleDateString()}`
                      : ''}
                  </p>
                  {r.parent_note && (
                    <p className="mt-1 text-xs text-ink/50">"{r.parent_note}"</p>
                  )}
                </div>
                {r.status === 'assigned' && (
                  <button
                    type="button"
                    disabled={busy === r.assignment_id}
                    onClick={() => onRevoke(r.assignment_id)}
                    className="btn-ghost text-xs"
                  >
                    {busy === r.assignment_id ? '…' : 'Revoke'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <h2 className="font-display text-xl">Recent completed</h2>
        {completed.length === 0 ? (
          <p className="mt-2 text-sm text-ink/60">No completed assignments yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-cloud/70">
            {completed.map((r) => (
              <li key={r.assignment_id} className="flex items-center justify-between gap-2 py-2">
                <p className="font-semibold">{r.definition_name}</p>
                <p className="text-xs text-ink/60">
                  {r.completed_at
                    ? new Date(r.completed_at).toLocaleDateString()
                    : ''}
                  {r.score != null ? ` · ${r.score}%` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
