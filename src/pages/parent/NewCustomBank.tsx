// src/pages/parent/NewCustomBank.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createCustomBank } from '../../lib/banks/mutations'
import { errorMessage } from '../../lib/errorMessage'
import type { Subject } from '../../lib/types'

const SUBJECTS: Subject[] = ['math', 'reading', 'language']

export default function NewCustomBank() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [subject, setSubject] = useState<Subject>('math')
  const [grade, setGrade] = useState(3)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    setBusy(true); setErr(null)
    try {
      const id = await createCustomBank({ name: name.trim(), subject, grade })
      navigate(`/parent/banks/${id}`)
    } catch (e) {
      setErr(errorMessage(e, 'Could not create the bank.'))
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg p-4">
      <h1 className="font-display text-3xl">New question bank</h1>
      <p className="mt-1 text-sm text-smoke">
        Name it first (e.g. “Fractions + Coins”), then add your own questions
        and/or published AI questions on the next screen.
      </p>
      <input value={name} onChange={(e) => setName(e.target.value)}
        placeholder="Bank name" maxLength={120}
        className="mt-4 w-full rounded border border-cloud p-2 text-sm" />
      <div className="mt-3 flex gap-2">
        {SUBJECTS.map((s) => (
          <button key={s} type="button" onClick={() => setSubject(s)}
            className={subject === s ? 'btn-primary text-sm' : 'btn-secondary text-sm'}>
            {s}
          </button>
        ))}
      </div>
      <label className="mt-3 block text-sm">Grade
        <input type="number" min={0} max={12} value={grade}
          onChange={(e) => setGrade(Number(e.target.value))}
          className="ml-2 w-16 rounded border border-cloud p-1 text-sm" /></label>
      {err && <p className="mt-2 text-sm text-rust">{err}</p>}
      <div className="mt-4 flex gap-2">
        <button type="button" className="btn-primary disabled:opacity-50"
          disabled={busy || name.trim().length < 1} onClick={save}>
          {busy ? 'Creating…' : 'Create bank'}
        </button>
        <button type="button" className="btn-ghost" onClick={() => navigate('/parent')}>
          Cancel
        </button>
      </div>
    </div>
  )
}
