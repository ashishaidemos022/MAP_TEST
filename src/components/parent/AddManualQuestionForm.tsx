// src/components/parent/AddManualQuestionForm.tsx
import { useState } from 'react'
import { createManualBankQuestion } from '../../lib/banks/mutations'
import type { Subject } from '../../lib/types'

const LABELS = ['A', 'B', 'C', 'D'] as const

export function AddManualQuestionForm(props: {
  bankId: string
  subject: Subject
  grade: number
  currentItemIds: string[]
  onAdded: () => void
  onClose: () => void
}) {
  const [stem, setStem] = useState('')
  const [standard, setStandard] = useState('')
  const [texts, setTexts] = useState<string[]>(['', '', '', ''])
  const [correct, setCorrect] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const setText = (i: number, v: string) =>
    setTexts((t) => t.map((x, j) => (j === i ? v : x)))

  const canSave =
    stem.trim().length >= 5 &&
    texts.every((t) => t.trim().length >= 1) &&
    !busy

  const save = async () => {
    setBusy(true); setErr(null)
    try {
      await createManualBankQuestion({
        bankId: props.bankId,
        subject: props.subject,
        grade: props.grade,
        stem: stem.trim(),
        standardCode: standard.trim() || null,
        choices: LABELS.map((label, i) => ({
          label,
          text: texts[i].trim(),
          is_correct: i === correct,
          explanation_correct: null,
          explanation_wrong: null,
        })),
        currentItemIds: props.currentItemIds,
      })
      props.onAdded()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add the question.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
        <h2 className="font-display text-xl">Add a question</h2>
        <textarea value={stem} onChange={(e) => setStem(e.target.value)}
          placeholder="Question stem" rows={3}
          className="mt-3 w-full rounded border border-cloud p-2 text-sm" />
        <input value={standard} onChange={(e) => setStandard(e.target.value)}
          placeholder="TEKS code (optional)"
          className="mt-2 w-full rounded border border-cloud p-2 text-sm" />
        <div className="mt-3 space-y-2">
          {LABELS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <input type="radio" name="correct" checked={correct === i}
                onChange={() => setCorrect(i)} title="Mark correct" />
              <span className="font-mono text-sm">{label}</span>
              <input value={texts[i]} onChange={(e) => setText(i, e.target.value)}
                placeholder={`Choice ${label}`}
                className="flex-1 rounded border border-cloud p-1 text-sm" />
            </div>
          ))}
        </div>
        {err && <p className="mt-2 text-sm text-rust">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={props.onClose}>Cancel</button>
          <button type="button" className="btn-primary disabled:opacity-50"
            disabled={!canSave} onClick={save}>
            {busy ? 'Adding…' : 'Add (publishes now)'}
          </button>
        </div>
      </div>
    </div>
  )
}
