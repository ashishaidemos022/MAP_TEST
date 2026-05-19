// src/components/parent/KidAssignmentsList.tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { getBankAssignmentOverview } from '../../lib/banks/queries'
import { dismissBankAssignment } from '../../lib/banks/mutations'
import type { BankAssignmentOverviewRow } from '../../lib/banks/types'

export function KidAssignmentsList({ studentId }: { studentId: string }) {
  const mounted = useRef(true)
  const [rows, setRows] = useState<BankAssignmentOverviewRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback(() => {
    getBankAssignmentOverview()
      .then((all) => {
        if (!mounted.current) return
        setRows(all.filter((r) => r.student_id === studentId))
      })
      .catch((e) => {
        if (!mounted.current) return
        setError(e instanceof Error ? e.message : 'Failed to load assignments.')
      })
  }, [studentId])

  useEffect(() => {
    load()
  }, [load])

  const dismiss = async (id: string) => {
    try {
      await dismissBankAssignment(id)
      if (mounted.current) load()
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : 'Could not dismiss.')
      }
    }
  }

  if (error) return <p className="card p-5 text-sm text-rust">{error}</p>
  if (!rows) return <p className="mt-6 text-center font-display text-xl">Loading…</p>
  if (rows.length === 0)
    return (
      <p className="card p-6 text-sm text-ink/60">
        No assigned banks for this kid yet. Assign one from Tests &amp; Banks.
      </p>
    )

  return (
    <div className="card divide-y divide-cloud/70">
      {rows.map((r) => (
        <div
          key={r.assignment_id}
          className="flex items-center justify-between gap-2 p-4 text-sm"
        >
          <span>
            <b>{r.bank_name}</b>{' '}
            <span className="rounded bg-cloud px-1 text-xs">{r.lane}</span>{' '}
            <span className="rounded bg-cloud px-1 text-xs">{r.status}</span>
            {r.status === 'completed' && r.questions_total != null && (
              <span className="text-ink/60">
                {' '}
                · {r.questions_correct ?? 0}/{r.questions_total}
              </span>
            )}
            {r.due_by && (
              <span className="text-ink/60">
                {' '}
                · due {new Date(r.due_by).toLocaleDateString()}
              </span>
            )}
          </span>
          {(r.status === 'completed' || r.status === 'revoked') && (
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => dismiss(r.assignment_id)}
            >
              Dismiss
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
