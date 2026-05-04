// /parent/custom-bank/new-question — manual question authoring (Brief §7.3).
//
// Calls the SECURITY DEFINER RPC map_create_custom_question, which uses
// auth.uid() to scope the new row to the current parent's family. source is
// always 'parent_manual'; created_via is 'ui'. Lands in status='draft'; the
// parent publishes from /parent/custom-bank.
//
// SVG fields (stem_svg, choice_svg) are intentionally NOT in this UI per
// brief §13 — manual UI never authors SVG. Only the AI loop does that.

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

type Subject = 'math' | 'reading' | 'language'
type Label = 'A' | 'B' | 'C' | 'D' | 'E'
const LABELS: Label[] = ['A', 'B', 'C', 'D', 'E']

interface ChoiceForm {
  label: Label
  text: string
  is_correct: boolean
  explanation_correct: string
  explanation_wrong: string
  misconception_tag: string
}

interface PassageOption {
  passage_id: string
  current_version_id: string | null
  subject: 'reading' | 'language'
  title: string | null
  grade: number | null
}

const emptyChoice = (label: Label): ChoiceForm => ({
  label, text: '', is_correct: false, explanation_correct: '', explanation_wrong: '', misconception_tag: '',
})

export default function NewCustomQuestion() {
  const navigate = useNavigate()
  const [subject, setSubject] = useState<Subject>('math')
  const [grade, setGrade] = useState(2)
  const [stem, setStem] = useState('')
  const [standardCode, setStandardCode] = useState('')
  const [difficulty, setDifficulty] = useState<number | ''>('')
  const [questionFocus, setQuestionFocus] = useState('')
  const [choices, setChoices] = useState<ChoiceForm[]>([emptyChoice('A'), emptyChoice('B'), emptyChoice('C')])
  const [passageVersionId, setPassageVersionId] = useState<string | null>(null)
  const [passageOptions, setPassageOptions] = useState<PassageOption[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load published passages for the optional attachment dropdown.
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('map_custom_passages')
        .select('id, current_version_id, status, map_custom_passage_versions!current_version_id(subject, title, grade)')
        .eq('status', 'published')
        .is('soft_deleted_at', null)
        .limit(100)
      const opts: PassageOption[] = (data ?? []).map((row) => {
        const r = row as unknown as { id: string; current_version_id: string | null; map_custom_passage_versions?: { subject: 'reading' | 'language'; title: string | null; grade: number | null } | null }
        const v = r.map_custom_passage_versions
        return {
          passage_id: r.id,
          current_version_id: r.current_version_id,
          subject: v?.subject ?? 'reading',
          title: v?.title ?? null,
          grade: v?.grade ?? null,
        }
      })
      setPassageOptions(opts)
    })()
  }, [])

  const filteredPassages = useMemo(() => {
    if (subject === 'math') return []
    return passageOptions.filter((p) => p.subject === subject)
  }, [passageOptions, subject])

  // Math can never reference a passage; reset on subject change.
  useEffect(() => {
    if (subject === 'math') setPassageVersionId(null)
  }, [subject])

  function setChoiceField(idx: number, field: keyof ChoiceForm, value: string | boolean) {
    setChoices((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)))
  }
  function setCorrectChoice(idx: number) {
    setChoices((prev) => prev.map((c, i) => ({ ...c, is_correct: i === idx })))
  }
  function addChoice() {
    if (choices.length >= 5) return
    const nextLabel = LABELS[choices.length]
    setChoices((prev) => [...prev, emptyChoice(nextLabel)])
  }
  function removeChoice(idx: number) {
    if (choices.length <= 3) return
    setChoices((prev) => prev.filter((_, i) => i !== idx).map((c, i) => ({ ...c, label: LABELS[i] })))
  }

  function validate(): string | null {
    if (stem.trim().length < 5) return 'Stem must be at least 5 characters.'
    if (stem.length > 2000) return 'Stem too long (max 2000 chars).'
    if (choices.length < 3 || choices.length > 5) return 'Need 3–5 choices.'
    const correctCount = choices.filter((c) => c.is_correct).length
    if (correctCount !== 1) return 'Mark exactly 1 correct choice.'
    for (const c of choices) {
      if (c.text.trim().length === 0) return `Choice ${c.label} text is empty.`
      if (c.is_correct && c.explanation_correct.trim().length === 0) {
        return `The correct choice (${c.label}) needs an "explanation_correct".`
      }
    }
    if (subject === 'math' && passageVersionId) return 'Math questions cannot attach to a passage.'
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const err = validate()
    if (err) { setError(err); return }
    setSubmitting(true); setError(null)

    const choicesPayload = choices.map((c) => ({
      label: c.label,
      text: c.text.trim(),
      is_correct: c.is_correct,
      explanation_correct: c.is_correct ? c.explanation_correct.trim() : null,
      explanation_wrong: !c.is_correct && c.explanation_wrong.trim() ? c.explanation_wrong.trim() : null,
      misconception_tag: c.misconception_tag.trim() || null,
    }))

    const { data, error: rpcErr } = await supabase.rpc('map_create_custom_question', {
      p_source: 'parent_manual',
      p_created_via: 'ui',
      p_subject: subject,
      p_grade: grade,
      p_stem: stem.trim(),
      p_standard_code: standardCode.trim() || null,
      p_difficulty: difficulty === '' ? null : Number(difficulty),
      p_ai_metadata: null,
      p_choices: choicesPayload,
      p_passage_version_id: passageVersionId,
      p_question_focus: questionFocus.trim() || null,
      p_stem_svg: null,
      p_stem_svg_alt_text: null,
    })
    setSubmitting(false)
    if (rpcErr) {
      setError(rpcErr.message)
      return
    }
    void data
    navigate('/parent/custom-bank')
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 mt-2 flex items-center justify-between">
        <div>
          <p className="font-display text-lg uppercase tracking-widest text-smoke">Parent view</p>
          <h1 className="font-display text-4xl">New question</h1>
          <p className="mt-1 text-sm text-ink/60">
            Lands as a <strong>draft</strong> — review and publish from the custom bank.
          </p>
        </div>
        <Link to="/parent/custom-bank" className="btn-ghost text-sm">Cancel</Link>
      </header>

      {error && (
        <p className="mb-4 rounded-xl bg-berry/10 px-3 py-2 text-sm text-berry ring-1 ring-berry/30 whitespace-pre-line">{error}</p>
      )}

      <form onSubmit={handleSubmit} className="card space-y-5 p-5">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-xs font-semibold uppercase tracking-widest text-smoke">Subject</span>
            <select
              className="rounded-xl border border-cloud bg-paper px-3 py-2 text-sm font-semibold text-ink focus:border-sky focus:outline-none"
              value={subject}
              onChange={(e) => setSubject(e.target.value as Subject)}
            >
              <option value="math">Math</option>
              <option value="reading">Reading</option>
              <option value="language">Language</option>
            </select>
          </label>
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-xs font-semibold uppercase tracking-widest text-smoke">Grade</span>
            <select
              className="rounded-xl border border-cloud bg-paper px-3 py-2 text-sm font-semibold text-ink focus:border-sky focus:outline-none"
              value={grade}
              onChange={(e) => setGrade(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((g) => (
                <option key={g} value={g}>Grade {g}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col text-sm">
          <span className="mb-1 text-xs font-semibold uppercase tracking-widest text-smoke">Stem</span>
          <textarea
            className="rounded-xl border border-cloud bg-paper px-3 py-2 text-sm focus:border-sky focus:outline-none"
            rows={3}
            value={stem}
            onChange={(e) => setStem(e.target.value)}
            placeholder="The question text the kid sees. 5–2000 chars."
            required
          />
          <span className="mt-1 text-xs text-ink/50">{stem.length} / 2000</span>
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-xs font-semibold uppercase tracking-widest text-smoke">TEKS code (optional)</span>
            <input
              className="rounded-xl border border-cloud bg-paper px-3 py-2 text-sm focus:border-sky focus:outline-none"
              value={standardCode}
              onChange={(e) => setStandardCode(e.target.value)}
              placeholder="e.g. 2.3A"
            />
          </label>
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-xs font-semibold uppercase tracking-widest text-smoke">Difficulty (1–5)</span>
            <input
              type="number"
              min={1}
              max={5}
              className="rounded-xl border border-cloud bg-paper px-3 py-2 text-sm focus:border-sky focus:outline-none"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </label>
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-xs font-semibold uppercase tracking-widest text-smoke">Focus (optional)</span>
            <input
              className="rounded-xl border border-cloud bg-paper px-3 py-2 text-sm focus:border-sky focus:outline-none"
              value={questionFocus}
              onChange={(e) => setQuestionFocus(e.target.value)}
              placeholder='"the underlined word"'
            />
          </label>
        </div>

        {subject !== 'math' && (
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-xs font-semibold uppercase tracking-widest text-smoke">
              Attach to a passage (optional, {subject})
            </span>
            {filteredPassages.length === 0 ? (
              <p className="rounded-xl bg-cream px-3 py-2 text-xs text-ink/60">
                No published {subject} passages yet. Create one from the custom bank, or leave this blank.
              </p>
            ) : (
              <select
                className="rounded-xl border border-cloud bg-paper px-3 py-2 text-sm font-semibold text-ink focus:border-sky focus:outline-none"
                value={passageVersionId ?? ''}
                onChange={(e) => setPassageVersionId(e.target.value || null)}
              >
                <option value="">— no passage —</option>
                {filteredPassages.map((p) => (
                  <option key={p.passage_id} value={p.current_version_id ?? ''}>
                    {p.title ?? '(untitled)'} · grade {p.grade ?? '?'}
                  </option>
                ))}
              </select>
            )}
          </label>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-smoke">Choices ({choices.length}/5)</span>
            {choices.length < 5 && (
              <button type="button" className="btn-ghost text-xs" onClick={addChoice}>
                + Add choice
              </button>
            )}
          </div>
          <div className="space-y-3">
            {choices.map((c, i) => (
              <div key={c.label} className={`rounded-2xl border p-3 ${c.is_correct ? 'border-leaf/50 bg-leaf/5' : 'border-cloud bg-paper'}`}>
                <div className="flex items-start gap-3">
                  <span className="font-display text-2xl font-bold w-6 text-center">{c.label}</span>
                  <div className="flex-1 space-y-2">
                    <input
                      className="w-full rounded-xl border border-cloud bg-paper px-3 py-2 text-sm focus:border-sky focus:outline-none"
                      value={c.text}
                      onChange={(e) => setChoiceField(i, 'text', e.target.value)}
                      placeholder="Choice text"
                      maxLength={500}
                      required
                    />
                    {c.is_correct ? (
                      <textarea
                        className="w-full rounded-xl border border-cloud bg-paper px-3 py-2 text-sm focus:border-sky focus:outline-none"
                        rows={2}
                        value={c.explanation_correct}
                        onChange={(e) => setChoiceField(i, 'explanation_correct', e.target.value)}
                        placeholder='Explanation shown when this (correct) choice is picked'
                        maxLength={1500}
                      />
                    ) : (
                      <>
                        <textarea
                          className="w-full rounded-xl border border-cloud bg-paper px-3 py-2 text-sm focus:border-sky focus:outline-none"
                          rows={2}
                          value={c.explanation_wrong}
                          onChange={(e) => setChoiceField(i, 'explanation_wrong', e.target.value)}
                          placeholder='Misconception text — what might have led the kid to pick this (optional)'
                          maxLength={1500}
                        />
                        <input
                          className="w-full rounded-xl border border-cloud bg-paper px-3 py-2 text-xs font-mono focus:border-sky focus:outline-none"
                          value={c.misconception_tag}
                          onChange={(e) => setChoiceField(i, 'misconception_tag', e.target.value)}
                          placeholder='misconception_tag (snake_case, optional)'
                          maxLength={80}
                        />
                      </>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="radio"
                        name="correct-choice"
                        checked={c.is_correct}
                        onChange={() => setCorrectChoice(i)}
                      />
                      correct
                    </label>
                    {choices.length > 3 && (
                      <button type="button" className="text-xs text-berry/70 underline" onClick={() => removeChoice(i)}>
                        remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link to="/parent/custom-bank" className="btn-ghost text-sm">Cancel</Link>
          <button type="submit" className="btn-primary text-sm disabled:opacity-50" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save as draft'}
          </button>
        </div>
      </form>
    </div>
  )
}
