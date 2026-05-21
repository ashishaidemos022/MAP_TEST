// src/pages/parent/BankDetail.tsx
import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { listBankItems, listAddablePublishedCustomQuestions } from '../../lib/banks/queries'
import { setBankItems } from '../../lib/banks/mutations'
import { AddManualQuestionForm } from '../../components/parent/AddManualQuestionForm'
import { AssignBankDialog } from '../../components/parent/AssignBankDialog'
import { errorMessage } from '../../lib/errorMessage'
import type { BankItemRow, PublishableCustomQuestion } from '../../lib/banks/types'
import type { Subject } from '../../lib/types'

type BankMeta = { name: string; subject: Subject; grade: number; lane: string }

export default function BankDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [bank, setBank] = useState<BankMeta | null>(null)
  const [items, setItems] = useState<BankItemRow[]>([])
  const [addable, setAddable] = useState<PublishableCustomQuestion[]>([])
  const [showManual, setShowManual] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const reload = useCallback(() => {
    if (!id) return
    supabase.from('map_question_banks').select('name,subject,grade,lane').eq('id', id).single()
      .then(({ data }) => { if (data) setBank(data as BankMeta) })
    listBankItems(id).then(setItems).catch((e) => setErr(String(e)))
    listAddablePublishedCustomQuestions(id).then(setAddable).catch((e) => setErr(String(e)))
  }, [id])
  useEffect(reload, [reload])

  if (!id) return null
  const readyCount = items.filter((i) => i.is_ready).length
  const itemIds = items.map((i) => i.custom_question_id)

  const addExisting = async (qid: string) => {
    try { await setBankItems(id, [...itemIds, qid]); reload() }
    catch (e) { setErr(errorMessage(e, 'Could not add.')) }
  }
  const remove = async (qid: string) => {
    try { await setBankItems(id, itemIds.filter((x) => x !== qid)); reload() }
    catch (e) { setErr(errorMessage(e, 'Could not remove.')) }
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      <button type="button" className="btn-ghost text-sm" onClick={() => navigate('/parent')}>
        ← Back
      </button>
      <h1 className="mt-2 font-display text-3xl">{bank?.name ?? 'Bank'}</h1>
      <p className="mt-1 text-sm text-smoke">
        {bank?.subject} · Grade {bank?.grade} · {readyCount} ready
        {readyCount < 5 && ` · need ${5 - readyCount} more to assign`}
      </p>
      {err && <p className="mt-2 text-sm text-rust">{err}</p>}

      <div className="mt-4 flex gap-2">
        <button type="button" className="btn-primary text-sm" onClick={() => setShowManual(true)}>
          + Add manual question
        </button>
        <button type="button" className="btn-secondary text-sm disabled:opacity-50"
          disabled={readyCount < 5} onClick={() => setShowAssign(true)}>
          Assign bank
        </button>
      </div>

      <h3 className="mt-6 font-display text-lg">Questions ({items.length})</h3>
      <div className="mt-2 space-y-1">
        {items.length === 0 && <p className="text-sm text-smoke">No questions yet.</p>}
        {items.map((it) => (
          <div key={it.item_id} className="flex items-center justify-between rounded border border-cloud p-2 text-sm">
            <span className="truncate">
              {it.stem ?? '(no stem)'}{' '}
              <span className={`rounded px-1 text-xs ${it.is_ready ? 'bg-cloud' : 'bg-sun/30'}`}>
                {it.is_ready ? 'ready' : it.question_status}
              </span>
            </span>
            <button type="button" className="btn-ghost text-xs" onClick={() => remove(it.custom_question_id)}>
              Remove
            </button>
          </div>
        ))}
      </div>

      <h3 className="mt-6 font-display text-lg">Add from published custom questions</h3>
      <p className="text-xs text-smoke">
        AI-generated questions appear here once you publish them in the Custom bank review screen.
      </p>
      <div className="mt-2 space-y-1">
        {addable.length === 0 && <p className="text-sm text-smoke">Nothing available to add.</p>}
        {addable.map((q) => (
          <div key={q.id} className="flex items-center justify-between rounded border border-cloud p-2 text-sm">
            <span className="truncate">{q.stem ?? '(no stem)'} <span className="text-xs text-smoke">{q.source}</span></span>
            <button type="button" className="btn-secondary text-xs" onClick={() => addExisting(q.id)}>
              Add
            </button>
          </div>
        ))}
      </div>

      {showManual && bank && (
        <AddManualQuestionForm
          bankId={id} subject={bank.subject} grade={bank.grade}
          onAdded={() => { setShowManual(false); reload() }}
          onClose={() => setShowManual(false)}
        />
      )}
      {showAssign && bank && (
        <AssignBankDialog
          bankId={id} bankName={bank.name}
          onClose={() => setShowAssign(false)}
          onAssigned={() => { setShowAssign(false); reload() }}
        />
      )}
    </div>
  )
}
