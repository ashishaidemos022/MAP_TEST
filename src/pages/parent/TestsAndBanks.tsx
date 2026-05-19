// src/pages/parent/TestsAndBanks.tsx
import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { listBanks, getBankAssignmentOverview } from '../../lib/banks/queries'
import { revokeBankAssignment, deleteBank } from '../../lib/banks/mutations'
import { AssignBankDialog } from '../../components/parent/AssignBankDialog'
import type { BankRow, BankAssignmentOverviewRow } from '../../lib/banks/types'

export default function TestsAndBanks() {
  const [banks, setBanks] = useState<BankRow[]>([])
  const [rows, setRows] = useState<BankAssignmentOverviewRow[]>([])
  const [assignFor, setAssignFor] = useState<BankRow | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const reload = useCallback(() => {
    listBanks().then(setBanks).catch((e) => setErr(String(e)))
    getBankAssignmentOverview().then(setRows).catch((e) => setErr(String(e)))
  }, [])
  useEffect(reload, [reload])

  const revoke = async (id: string) => {
    try { await revokeBankAssignment(id); reload() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not revoke.') }
  }

  const del = async (b: BankRow) => {
    if (!window.confirm(`Delete “${b.name}”? This can’t be undone.`)) return
    try { await deleteBank(b.id); reload() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not delete.') }
  }

  return (
    <section className="my-8">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl">Tests &amp; Banks</h2>
        <div className="flex gap-2">
          <Link to="/parent/banks/new" className="btn-primary text-sm">+ New vetted test</Link>
          <Link to="/parent/banks/new-custom" className="btn-secondary text-sm">+ New question bank</Link>
        </div>
      </div>
      {err && <p className="mt-2 text-sm text-rust">{err}</p>}

      <div className="mt-3 space-y-2">
        {banks.length === 0 && (
          <p className="text-sm text-smoke">No saved tests yet.</p>
        )}
        {banks.map((b) => (
          <div key={b.id} className="flex items-center justify-between rounded border border-cloud p-3">
            <div className="text-sm">
              <span className="font-semibold">{b.name}</span>{' '}
              <span className="rounded bg-cloud px-1 text-xs">{b.lane}</span>{' '}
              <span className="text-smoke">
                {b.subject} · G{b.grade}
                {b.lane === 'vetted' && ` · ${b.standard_codes.length} std · ${b.planned_length} Q · ${b.difficulty}`}
              </span>
            </div>
            <div className="flex gap-2">
              {b.lane === 'custom' && (
                <Link to={`/parent/banks/${b.id}`} className="btn-ghost text-sm">Open</Link>
              )}
              <button type="button" className="btn-secondary text-sm" onClick={() => setAssignFor(b)}>
                Assign
              </button>
              <button type="button" className="btn-ghost text-sm" onClick={() => del(b)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <h3 className="mt-6 font-display text-lg">Assignments</h3>
      <div className="mt-2 space-y-1">
        {rows.length === 0 && <p className="text-sm text-smoke">Nothing assigned yet.</p>}
        {rows.map((r) => (
          <div key={r.assignment_id} className="flex items-center justify-between rounded border border-cloud p-2 text-sm">
            <span>
              <b>{r.bank_name}</b> → {r.student_name} ·{' '}
              <span className="rounded bg-cloud px-1 text-xs">{r.status}</span>
              {r.status === 'completed' && r.questions_total != null &&
                ` · ${r.questions_correct ?? 0}/${r.questions_total}`}
              {r.due_by && ` · due ${new Date(r.due_by).toLocaleDateString()}`}
            </span>
            {r.status === 'assigned' && (
              <button type="button" className="btn-ghost text-xs" onClick={() => revoke(r.assignment_id)}>
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>

      {assignFor && (
        <AssignBankDialog
          bankId={assignFor.id}
          bankName={assignFor.name}
          onClose={() => setAssignFor(null)}
          onAssigned={() => { setAssignFor(null); reload() }}
        />
      )}
    </section>
  )
}
