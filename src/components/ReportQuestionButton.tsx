import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/errorMessage'
import { REPORT_REASON_OPTIONS, type ReportReason } from '../lib/types'

interface ReportQuestionButtonProps {
  /** Vetted question id (map_questions.id). */
  questionId: string
  sessionId?: string | null
  studentId?: string | null
  selectedChoiceId?: string | null
  className?: string
}

/**
 * "Report a problem" affordance for a single vetted question. Self-contained:
 * a low-emphasis button that opens a modal, collects a reason category + optional
 * text, and writes via the map_report_question RPC (which stamps family_id and
 * rejects non-vetted ids). Only render this for vetted questions — callers gate
 * on `!custom`.
 */
export default function ReportQuestionButton({
  questionId,
  sessionId,
  studentId,
  selectedChoiceId,
  className,
}: ReportQuestionButtonProps) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reported, setReported] = useState(false)

  const needsText = reason === 'other'
  const canSubmit = !!reason && (!needsText || text.trim().length > 0) && !submitting

  async function submit() {
    if (!reason || submitting) return
    setSubmitting(true)
    setError(null)
    const { error: rErr } = await supabase.rpc('map_report_question', {
      p_question_id: questionId,
      p_reason: reason,
      p_reason_text: text.trim() || null,
      p_session_id: sessionId ?? null,
      p_student_id: studentId ?? null,
      p_selected_choice_id: selectedChoiceId ?? null,
    })
    setSubmitting(false)
    if (rErr) {
      setError(errorMessage(rErr, 'Could not send your report. Please try again.'))
      return
    }
    setReported(true)
    setOpen(false)
  }

  if (reported) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-leaf/15 px-3 py-1.5 text-xs font-bold text-leaf ${className ?? ''}`}
      >
        ✓ Reported
      </span>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-full border border-sun/60 bg-sun/15 px-3 py-1.5 text-xs font-bold text-ink/80 transition-colors hover:bg-sun/30 ${className ?? ''}`}
        title="Tell us this question has a problem"
      >
        ⚐ Report a problem
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => !submitting && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl ring-1 ring-cloud"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-2xl">What's wrong with this question?</h2>
            <div className="mt-4 grid gap-2">
              {REPORT_REASON_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 ring-1 ${
                    reason === opt.value ? 'bg-sky/10 ring-sky' : 'ring-cloud hover:bg-cream'
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    className="h-4 w-4 accent-sky"
                    checked={reason === opt.value}
                    onChange={() => setReason(opt.value)}
                  />
                  <span className="text-sm font-semibold">{opt.label}</span>
                </label>
              ))}
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={
                needsText
                  ? 'Please tell us what went wrong.'
                  : "Tell us what's wrong — optional, but it helps us fix it."
              }
              className="mt-4 w-full rounded-2xl border border-cloud p-3 text-sm focus:border-sky focus:outline-none"
            />

            {error && <p className="mt-2 text-sm font-semibold text-berry">{error}</p>}

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={submitting}
                className="btn-secondary disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Send report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
