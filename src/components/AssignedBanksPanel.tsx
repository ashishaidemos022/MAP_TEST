// src/components/AssignedBanksPanel.tsx
// Additive kid-home affordance. Renders nothing unless the active kid has a
// vetted bank assignment in 'assigned' state. Mount-guarded.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useActiveStudent } from '../lib/activeStudent'
import { getBankAssignmentOverview } from '../lib/banks/queries'
import { startAssignedBank } from '../lib/banks/startAssignedBank'
import type { BankAssignmentOverviewRow } from '../lib/banks/types'

export function AssignedBanksPanel() {
  const { activeStudent } = useActiveStudent()
  const navigate = useNavigate()
  const mounted = useRef(true)
  const [rows, setRows] = useState<BankAssignmentOverviewRow[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    const sid = activeStudent?.id
    if (!sid) { setRows([]); return }
    getBankAssignmentOverview()
      .then((all) => {
        if (!mounted.current) return
        setRows(all.filter((r) =>
          r.student_id === sid && r.status === 'assigned'))
      })
      .catch(() => { if (mounted.current) setRows([]) })
  }, [activeStudent?.id])

  if (!activeStudent || rows.length === 0) return null

  const start = async (r: BankAssignmentOverviewRow) => {
    setBusy(r.assignment_id); setErr(null)
    try {
      const sessionId = await startAssignedBank(r, activeStudent.id)
      if (!mounted.current) return
      navigate(`/test/${sessionId}`)
    } catch (e) {
      if (!mounted.current) return
      setErr(e instanceof Error ? e.message : 'Could not start.')
      setBusy(null)
    }
  }

  return (
    <section className="mb-6">
      <p className="mb-2 font-display text-lg uppercase tracking-widest text-smoke">
        Assigned to you
      </p>
      {err && <p className="mb-2 text-sm text-rust">{err}</p>}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.assignment_id}
            className="flex items-center justify-between rounded-lg border border-cloud p-3">
            <div className="text-sm">
              <span className="font-semibold">{r.bank_name}</span>
              {r.parent_note && <span className="text-smoke"> — “{r.parent_note}”</span>}
              {r.due_by && <span className="text-smoke"> · due {new Date(r.due_by).toLocaleDateString()}</span>}
            </div>
            <button type="button" className="btn-primary text-sm disabled:opacity-50"
              disabled={busy === r.assignment_id} onClick={() => start(r)}>
              {busy === r.assignment_id ? 'Starting…' : 'Start'}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
