// src/pages/parent/ParentRoot.tsx
// parent_v2 resolver. flag off/null/no-family -> untouched legacy <Parent/>.
// flag on -> new ParentShell with child routes. Single source of the flag check.
import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import { useActiveStudent } from '../../lib/activeStudent'
import { getParentV2 } from '../../lib/parent/queries'
import ParentShell from '../../components/parent/ParentShell'
import Parent from './Parent'
import Classroom from './Classroom'
import KidDetail from './KidDetail'

function DashboardRedirect() {
  const [params] = useSearchParams()
  const kid = params.get('kid')
  return <Navigate to={kid ? `/parent/kids/${kid}` : '/parent'} replace />
}

export default function ParentRoot() {
  const { familyId, loading: studentLoading } = useActiveStudent()
  const [v2, setV2] = useState<boolean | null>(null)
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    if (studentLoading) return
    let cancelled = false
    if (!familyId) {
      setV2(false)
      setResolved(true)
      return
    }
    void getParentV2(familyId)
      .then((flag) => {
        if (!cancelled) {
          setV2(flag)
          setResolved(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setV2(false)
          setResolved(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [familyId, studentLoading])

  if (studentLoading || !resolved) {
    return <p className="mt-12 text-center font-display text-2xl">Loading…</p>
  }

  if (!v2) {
    return <Parent />
  }

  return (
    <Routes>
      <Route element={<ParentShell />}>
        <Route index element={<Classroom />} />
        <Route path="kids/:id" element={<KidDetail />} />
        <Route path="dashboard" element={<DashboardRedirect />} />
        <Route path="*" element={<Navigate to="/parent" replace />} />
      </Route>
    </Routes>
  )
}
