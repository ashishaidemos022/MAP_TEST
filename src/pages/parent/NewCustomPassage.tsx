// /parent/custom-bank/new-passage — manual passage authoring (Brief §7.2).
// Calls the SECURITY DEFINER RPC map_create_custom_passage; same scoping
// pattern as NewCustomQuestion. Lands in status='draft'.
//
// SVG fields are intentionally absent per brief §13 (no SVG authoring in UI).

import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { BankPicker } from '../../components/parent/BankPicker'
import { addItemsToBank } from '../../lib/banks/mutations'

type Subject = 'reading' | 'language'
type Genre = 'fiction' | 'nonfiction' | 'poetry' | 'drama' | 'informational' | 'editing_draft'

export default function NewCustomPassage() {
  const navigate = useNavigate()
  const [subject, setSubject] = useState<Subject>('reading')
  const [grade, setGrade] = useState(2)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [genre, setGenre] = useState<Genre | ''>('')
  const [estimatedGradeLevel, setEstimatedGradeLevel] = useState<string>('')
  const [standardCodes, setStandardCodes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [searchParams] = useSearchParams()
  const initialBankFromQuery = searchParams.get('bank')
  const [bankId, setBankId] = useState<string | null>(initialBankFromQuery)
  const [lockToBank, setLockToBank] = useState<boolean>(Boolean(initialBankFromQuery))
  const cancelPath = lockToBank && initialBankFromQuery
    ? `/parent/ai-studio?bank=${initialBankFromQuery}`
    : '/parent/ai-studio'

  // When ?bank= is present, lock the form to that bank's subject + grade.
  useEffect(() => {
    if (!initialBankFromQuery) return
    let alive = true
    supabase
      .from('map_question_banks')
      .select('subject, grade')
      .eq('id', initialBankFromQuery)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return
        // Reject the wider Subject — passages only support reading|language.
        if (data.subject === 'reading' || data.subject === 'language') {
          setSubject(data.subject as Subject)
        }
        setGrade(data.grade as number)
      })
    return () => { alive = false }
  }, [initialBankFromQuery])

  // Clear bank selection when subject/grade change unlocked.
  useEffect(() => { if (!lockToBank) setBankId(null) }, [subject, grade, lockToBank])

  function validate(): string | null {
    if (body.length < 50) return 'Body must be at least 50 characters.'
    if (body.length > 10000) return 'Body too long (max 10,000 chars).'
    if (title.length > 200) return 'Title too long (max 200 chars).'
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const err = validate()
    if (err) { setError(err); return }
    setSubmitting(true); setError(null)

    const codes = standardCodes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const egl = estimatedGradeLevel.trim() === '' ? null : Number(estimatedGradeLevel)
    if (egl !== null && (Number.isNaN(egl) || egl < 0 || egl > 12)) {
      setError('Estimated grade level must be between 0 and 12 (e.g. 4.2).')
      setSubmitting(false)
      return
    }

    const { data, error: rpcErr } = await supabase.rpc('map_create_custom_passage', {
      p_source: 'parent_manual',
      p_created_via: 'ui',
      p_subject: subject,
      p_grade: grade,
      p_title: title.trim() || null,
      p_body: body.trim(),
      p_genre: genre || null,
      p_estimated_grade_level: egl,
      p_standard_codes: codes,
      p_ai_metadata: null,
      p_passage_svg: null,
      p_passage_svg_alt_text: null,
    })
    setSubmitting(false)
    if (rpcErr) {
      setError(rpcErr.message)
      return
    }
    const newPassageId = data as string | null
    if (newPassageId && bankId) {
      await addItemsToBank({ bankId, questionIds: [], passageIds: [newPassageId] })
    }
    navigate(cancelPath)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 mt-2 flex items-center justify-between">
        <div>
          <p className="font-display text-lg uppercase tracking-widest text-smoke">Parent view</p>
          <h1 className="font-display text-4xl">New passage</h1>
          <p className="mt-1 text-sm text-ink/60">
            Lands as a <strong>draft</strong>. After publishing, attach reading or language questions to it.
          </p>
        </div>
        <Link to={cancelPath} className="btn-ghost text-sm">Cancel</Link>
      </header>

      {error && (
        <p className="mb-4 rounded-xl bg-berry/10 px-3 py-2 text-sm text-berry ring-1 ring-berry/30">{error}</p>
      )}

      <div className="mb-4">
        <BankPicker
          subject={subject}
          grade={grade}
          value={bankId}
          onChange={setBankId}
          locked={lockToBank}
          onUnlock={() => { setLockToBank(false); setBankId(null) }}
        />
      </div>

      <form onSubmit={handleSubmit} className="card space-y-5 p-5">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-xs font-semibold uppercase tracking-widest text-smoke">Subject</span>
            <select
              className="rounded-xl border border-cloud bg-paper px-3 py-2 text-sm font-semibold text-ink focus:border-sky focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              value={subject}
              onChange={(e) => setSubject(e.target.value as Subject)}
              disabled={lockToBank}
            >
              <option value="reading">Reading</option>
              <option value="language">Language</option>
            </select>
          </label>
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-xs font-semibold uppercase tracking-widest text-smoke">Grade</span>
            <select
              className="rounded-xl border border-cloud bg-paper px-3 py-2 text-sm font-semibold text-ink focus:border-sky focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              value={grade}
              onChange={(e) => setGrade(Number(e.target.value))}
              disabled={lockToBank}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((g) => (
                <option key={g} value={g}>Grade {g}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col text-sm">
          <span className="mb-1 text-xs font-semibold uppercase tracking-widest text-smoke">Title (optional)</span>
          <input
            className="rounded-xl border border-cloud bg-paper px-3 py-2 text-sm focus:border-sky focus:outline-none"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="A short title for the kid to see"
          />
        </label>

        <label className="flex flex-col text-sm">
          <span className="mb-1 text-xs font-semibold uppercase tracking-widest text-smoke">Body</span>
          <textarea
            className="rounded-xl border border-cloud bg-paper px-3 py-2 text-sm focus:border-sky focus:outline-none font-serif leading-relaxed"
            rows={10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder='The passage text. 50–10,000 chars. For language editing passages, use numbered sentences inline: "(1) The dog ran. (2) It was happy."'
            required
            minLength={50}
            maxLength={10000}
          />
          <span className="mt-1 text-xs text-ink/50">{body.length} / 10000 (min 50)</span>
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-xs font-semibold uppercase tracking-widest text-smoke">Genre</span>
            <select
              className="rounded-xl border border-cloud bg-paper px-3 py-2 text-sm font-semibold text-ink focus:border-sky focus:outline-none"
              value={genre}
              onChange={(e) => setGenre(e.target.value as Genre | '')}
            >
              <option value="">— none —</option>
              <option value="fiction">fiction</option>
              <option value="nonfiction">nonfiction</option>
              <option value="poetry">poetry</option>
              <option value="drama">drama</option>
              <option value="informational">informational</option>
              <option value="editing_draft">editing_draft</option>
            </select>
          </label>
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-xs font-semibold uppercase tracking-widest text-smoke">Lexile-ish (optional)</span>
            <input
              type="number"
              step={0.1}
              min={0}
              max={12}
              className="rounded-xl border border-cloud bg-paper px-3 py-2 text-sm focus:border-sky focus:outline-none"
              value={estimatedGradeLevel}
              onChange={(e) => setEstimatedGradeLevel(e.target.value)}
              placeholder="e.g. 4.2"
            />
          </label>
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-xs font-semibold uppercase tracking-widest text-smoke">TEKS codes</span>
            <input
              className="rounded-xl border border-cloud bg-paper px-3 py-2 text-sm focus:border-sky focus:outline-none"
              value={standardCodes}
              onChange={(e) => setStandardCodes(e.target.value)}
              placeholder="comma-separated, e.g. 4.6F,4.7C"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link to={cancelPath} className="btn-ghost text-sm">Cancel</Link>
          <div className="flex flex-col items-end">
            <button type="submit" className="btn-primary text-sm disabled:opacity-50" disabled={submitting || !bankId}>
              {submitting ? 'Saving…' : 'Save as draft'}
            </button>
            {!bankId && (
              <p className="text-xs text-zinc-500 mt-1">Pick a bank above before saving.</p>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}
