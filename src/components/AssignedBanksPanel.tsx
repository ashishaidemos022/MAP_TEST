// src/components/AssignedBanksPanel.tsx
// Additive kid-home affordance. Renders nothing unless the active kid has a
// bank assignment in 'assigned' (Start) or 'in_progress' (Resume) state.
// Mount-guarded.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useActiveStudent } from '../lib/activeStudent'
import { getBankAssignmentOverview } from '../lib/banks/queries'
import { startAssignedBank } from '../lib/banks/startAssignedBank'
import { errorMessage } from '../lib/errorMessage'
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
          r.student_id === sid &&
          (r.status === 'assigned' ||
            (r.status === 'in_progress' && r.session_id != null))))
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
      setErr(errorMessage(e, 'Could not start.'))
      setBusy(null)
    }
  }

  const resume = (r: BankAssignmentOverviewRow) => {
    if (!r.session_id) return
    navigate(`/test/${r.session_id}`)
  }

  return (
    <section className="mb-8">
      <p className="mb-3 flex items-center gap-2 font-display text-xl font-bold text-ink">
        <span aria-hidden="true" className="text-2xl">⭐</span>
        <span>Just for you!</span>
      </p>
      {err && <p className="mb-2 text-sm text-berry">{err}</p>}
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.assignment_id} className="relative animate-slideUp">
            {/* Gentle pulsing halo — sits behind the card and softly glows */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-1 rounded-2xl bg-sun blur-md animate-attentionHalo"
            />
            {/* The card itself stays steady so text is always crisp */}
            <div className="relative flex items-center gap-3 rounded-2xl border-2 border-sun bg-gradient-to-br from-paper to-sun/15 p-4 shadow-card">
              <div aria-hidden="true" className="text-3xl leading-none">📌</div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-lg font-bold text-ink">
                  {r.bank_name}
                </div>
                {(r.parent_note || r.due_by) && (
                  <div className="mt-0.5 text-xs text-smoke">
                    {r.parent_note && <span>“{r.parent_note}”</span>}
                    {r.parent_note && r.due_by && <span> · </span>}
                    {r.due_by && <span>due {new Date(r.due_by).toLocaleDateString()}</span>}
                  </div>
                )}
              </div>
              {r.status === 'in_progress' ? (
                <button
                  type="button"
                  className="btn-primary animate-attentionWiggle px-5 py-2 text-base font-bold"
                  onClick={() => resume(r)}
                >
                  Resume →
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary animate-attentionWiggle px-5 py-2 text-base font-bold disabled:opacity-50"
                  disabled={busy === r.assignment_id}
                  onClick={() => start(r)}
                >
                  {busy === r.assignment_id ? 'Starting…' : 'Start →'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
