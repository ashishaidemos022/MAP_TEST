// src/pages/parent/Classroom.tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getClassroomRoster } from '../../lib/parent/queries'
import type { ClassroomRosterRow } from '../../lib/parent/types'
import { CrossKidStrip } from '../../components/parent/classroom/CrossKidStrip'
import { KidRosterCard } from '../../components/parent/classroom/KidRosterCard'
import { ClassroomQuickActions } from '../../components/parent/classroom/ClassroomQuickActions'

export default function Classroom() {
  const [rows, setRows] = useState<ClassroomRosterRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void getClassroomRoster()
      .then((r) => {
        if (!cancelled) setRows(r)
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Failed to load classroom.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div className="card p-8 text-center">
        <p className="font-display text-2xl">Couldn’t load your classroom.</p>
        <p className="mt-2 text-sm text-ink/60">{error}</p>
      </div>
    )
  }
  if (!rows) {
    return <p className="mt-12 text-center font-display text-2xl">Loading…</p>
  }

  return (
    <div>
      <header className="mb-6">
        <p className="font-display text-lg uppercase tracking-widest text-smoke">Parent view</p>
        <h1 className="font-display text-4xl">Your classroom</h1>
      </header>

      {rows.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-display text-2xl">No kids yet.</p>
          <Link to="/onboarding" className="btn-secondary mt-4 inline-block text-sm">
            + Add your first kid
          </Link>
        </div>
      ) : (
        <>
          <CrossKidStrip rows={rows} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <KidRosterCard key={r.student_id} row={r} />
            ))}
            <Link
              to="/onboarding"
              className="card flex min-h-[180px] items-center justify-center p-5 text-center text-ink/50 ring-1 ring-dashed ring-cloud hover:text-ink"
            >
              + Add a kid
            </Link>
          </div>
          <ClassroomQuickActions />
        </>
      )}
    </div>
  )
}
