// src/components/parent/AssignBankDialog.tsx
import { useState } from 'react'
import { useActiveStudent } from '../../lib/activeStudent'
import { assignBank } from '../../lib/banks/mutations'

export function AssignBankDialog(props: {
  bankId: string
  bankName: string
  onClose: () => void
  onAssigned: () => void
}) {
  const { students } = useActiveStudent()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [due, setDue] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [doneCount, setDoneCount] = useState<number | null>(null)

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const submit = async () => {
    setBusy(true); setErr(null)
    try {
      const ids = await assignBank({
        bankId: props.bankId,
        studentIds: [...picked],
        dueBy: due ? new Date(due).toISOString() : null,
        parentNote: note.trim() || null,
      })
      setBusy(false)
      setDoneCount(ids.length)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not assign.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 className="font-display text-xl">Assign “{props.bankName}”</h2>
        {doneCount !== null ? (
          <div className="mt-4">
            <p className="rounded-lg bg-leaf/15 p-3 text-sm font-semibold text-ink">
              ✓ Assigned “{props.bankName}” to {doneCount} kid{doneCount === 1 ? '' : 's'}.
            </p>
            <p className="mt-2 text-xs text-smoke">
              It now shows under Assignments, and on the kid’s home as “Assigned to you”.
            </p>
            <div className="mt-4 flex justify-end">
              <button type="button" className="btn-primary" onClick={props.onAssigned}>
                Done
              </button>
            </div>
          </div>
        ) : (
        <>
        <p className="mt-2 text-xs font-semibold uppercase text-smoke">Kids</p>
        <div className="mt-1 space-y-1">
          {students.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
              {s.display_name}
            </label>
          ))}
        </div>
        <label className="mt-3 block text-sm">Due (optional)
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
            className="ml-2 rounded border border-cloud p-1 text-sm" /></label>
        <label className="mt-2 block text-sm">Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded border border-cloud p-1 text-sm" /></label>
        {err && <p className="mt-2 text-sm text-rust">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={props.onClose}>Cancel</button>
          <button type="button" className="btn-primary disabled:opacity-50"
            disabled={busy || picked.size === 0} onClick={submit}>
            {busy ? 'Assigning…' : 'Assign'}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  )
}
