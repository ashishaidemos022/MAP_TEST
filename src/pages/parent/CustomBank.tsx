// /parent/custom-bank — review + publish queue for the family's custom-question bank.
// Shows drafts and published items (passages + questions) with inline publish /
// soft-delete actions. Brief §7.1-§7.3 + §12.14: review-flow surface for content
// the AI authored. No SVG drawing tool, no upload — just review/preview/manage.
//
// Single page, two columns (passages + questions). RLS does the family-scoping.

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import SvgImage from '../../components/SvgImage'
import { supabase } from '../../lib/supabase'

type Status = 'draft' | 'published' | 'archived'

interface PassageRow {
  id: string
  status: Status
  source: string
  current_version_id: string | null
  created_at: string
  // Joined
  subject: 'reading' | 'language' | null
  grade: number | null
  title: string | null
  body: string | null
  passage_svg: string | null
  passage_svg_alt_text: string | null
  genre: string | null
  version_number: number | null
}

interface ChoicePreview {
  id: string
  label: string
  text: string
  is_correct: boolean
  ordinal: number
  choice_svg: string | null
  choice_svg_alt_text: string | null
  explanation_correct: string | null
  explanation_wrong: string | null
}

interface QuestionRow {
  id: string
  status: Status
  source: string
  current_version_id: string | null
  created_at: string
  subject: 'math' | 'reading' | 'language' | null
  grade: number | null
  stem: string | null
  stem_svg: string | null
  stem_svg_alt_text: string | null
  passage_id: string | null
  standard_code: string | null
  difficulty: number | null
  choices: ChoicePreview[]
}

type Tab = 'all' | 'draft' | 'published' | 'archived'

export default function CustomBank() {
  const [passages, setPassages] = useState<PassageRow[] | null>(null)
  const [questions, setQuestions] = useState<QuestionRow[] | null>(null)
  const [tab, setTab] = useState<Tab>('draft')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  async function loadAll() {
    setError(null)
    const [pRes, qRes] = await Promise.all([
      supabase
        .from('map_custom_passages')
        .select(
          'id, status, source, current_version_id, created_at, ' +
            'map_custom_passage_versions!current_version_id(version_number, subject, grade, title, body, passage_svg, passage_svg_alt_text, genre)',
        )
        .is('soft_deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('map_custom_questions')
        .select(
          'id, status, source, current_version_id, created_at, ' +
            'map_custom_question_versions!current_version_id(' +
              'subject, grade, stem, stem_svg, stem_svg_alt_text, passage_version_id, standard_code, difficulty, ' +
              'map_custom_passage_versions(passage_id), ' +
              'choices:map_custom_question_choices(id, label, text, is_correct, ordinal, choice_svg, choice_svg_alt_text, explanation_correct, explanation_wrong))',
        )
        .is('soft_deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200),
    ])
    if (pRes.error) {
      setError(`passages: ${pRes.error.message}`)
      return
    }
    if (qRes.error) {
      setError(`questions: ${qRes.error.message}`)
      return
    }

    const passageRows: PassageRow[] = (pRes.data ?? []).map((row) => {
      const v = (row as unknown as {
        map_custom_passage_versions?: {
          version_number?: number
          subject?: 'reading' | 'language'
          grade?: number
          title?: string | null
          body?: string
          passage_svg?: string | null
          passage_svg_alt_text?: string | null
          genre?: string | null
        }
      }).map_custom_passage_versions
      const r = row as unknown as { id: string; status: Status; source: string; current_version_id: string | null; created_at: string }
      return {
        id: r.id,
        status: r.status,
        source: r.source,
        current_version_id: r.current_version_id,
        created_at: r.created_at,
        subject: v?.subject ?? null,
        grade: v?.grade ?? null,
        title: v?.title ?? null,
        body: v?.body ?? null,
        passage_svg: v?.passage_svg ?? null,
        passage_svg_alt_text: v?.passage_svg_alt_text ?? null,
        genre: v?.genre ?? null,
        version_number: v?.version_number ?? null,
      }
    })

    const questionRows: QuestionRow[] = (qRes.data ?? []).map((row) => {
      const v = (row as unknown as {
        map_custom_question_versions?: {
          subject?: 'math' | 'reading' | 'language'
          grade?: number
          stem?: string
          stem_svg?: string | null
          stem_svg_alt_text?: string | null
          passage_version_id?: string | null
          standard_code?: string | null
          difficulty?: number | null
          map_custom_passage_versions?: { passage_id?: string }
          choices?: ChoicePreview[]
        }
      }).map_custom_question_versions
      const r = row as unknown as { id: string; status: Status; source: string; current_version_id: string | null; created_at: string }
      const choices = (v?.choices ?? []).slice().sort((a, b) => a.ordinal - b.ordinal)
      return {
        id: r.id,
        status: r.status,
        source: r.source,
        current_version_id: r.current_version_id,
        created_at: r.created_at,
        subject: v?.subject ?? null,
        grade: v?.grade ?? null,
        stem: v?.stem ?? null,
        stem_svg: v?.stem_svg ?? null,
        stem_svg_alt_text: v?.stem_svg_alt_text ?? null,
        passage_id: v?.map_custom_passage_versions?.passage_id ?? null,
        standard_code: v?.standard_code ?? null,
        difficulty: v?.difficulty ?? null,
        choices,
      }
    })

    setPassages(passageRows)
    setQuestions(questionRows)
  }

  useEffect(() => { void loadAll() }, [])

  function filterByTab<T extends { status: Status }>(rows: T[] | null): T[] {
    if (!rows) return []
    if (tab === 'all') return rows
    return rows.filter((r) => r.status === tab)
  }

  const visiblePassages = useMemo(() => filterByTab(passages), [passages, tab])
  const visibleQuestions = useMemo(() => filterByTab(questions), [questions, tab])
  // eslint-disable-next-line react-hooks/exhaustive-deps

  function toggleOpen(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function publishPassage(id: string) {
    setBusy(`p-${id}`); setError(null)
    const { error: e } = await supabase.rpc('map_publish_custom_passage', { p_passage_id: id })
    setBusy(null)
    if (e) { setError(e.message); return }
    await loadAll()
  }
  async function publishQuestion(id: string) {
    setBusy(`q-${id}`); setError(null)
    const { error: e } = await supabase.rpc('map_publish_custom_question', { p_question_id: id })
    setBusy(null)
    if (e) { setError(e.message); return }
    await loadAll()
  }
  async function softDeletePassage(id: string) {
    if (!window.confirm('Delete this passage? Existing kid attempts that reference it stay intact, but it can no longer appear in new tests.')) return
    setBusy(`p-${id}`); setError(null)
    const { error: e } = await supabase.from('map_custom_passages').update({ soft_deleted_at: new Date().toISOString() }).eq('id', id)
    setBusy(null)
    if (e) { setError(e.message); return }
    await loadAll()
  }
  async function softDeleteQuestion(id: string) {
    if (!window.confirm('Delete this question? Existing kid attempts on it stay intact, but it can no longer appear in new tests.')) return
    setBusy(`q-${id}`); setError(null)
    const { error: e } = await supabase.from('map_custom_questions').update({ soft_deleted_at: new Date().toISOString() }).eq('id', id)
    setBusy(null)
    if (e) { setError(e.message); return }
    await loadAll()
  }

  const draftCount = (passages?.filter((p) => p.status === 'draft').length ?? 0) +
    (questions?.filter((q) => q.status === 'draft').length ?? 0)

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 mt-2 flex items-center justify-between">
        <div>
          <p className="font-display text-lg uppercase tracking-widest text-smoke">Parent view</p>
          <h1 className="font-display text-4xl">Custom bank</h1>
          <p className="mt-1 text-sm text-ink/60">
            Review and publish the questions + passages your AI authored.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/parent/connect-ai" className="btn-secondary text-sm">Connect AI</Link>
          <Link to="/parent" className="btn-ghost text-sm">Back to parent</Link>
        </div>
      </header>

      <div className="mb-4 rounded-2xl bg-sun/15 px-4 py-3 text-sm ring-1 ring-sun/40">
        <strong>Heads up:</strong> these are unvetted, parent- or AI-authored. They aren&apos;t reviewed by our team. Preview each before publishing.
      </div>

      {error && (
        <p className="mb-4 rounded-xl bg-berry/10 px-3 py-2 text-sm text-berry ring-1 ring-berry/30">{error}</p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['draft', 'published', 'all'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-widest ${
              tab === t ? 'border-ink bg-ink text-paper' : 'border-cloud bg-paper text-ink/70'
            }`}
          >
            {t}
          </button>
        ))}
        {draftCount > 0 && tab !== 'draft' && (
          <span className="ml-auto text-xs text-ink/60">{draftCount} draft{draftCount === 1 ? '' : 's'} waiting</span>
        )}
      </div>

      <section className="card mb-6 p-5">
        <h2 className="font-display text-xl">Passages</h2>
        <p className="text-xs text-ink/60">{visiblePassages.length} of {passages?.length ?? 0}</p>
        <div className="mt-4 space-y-2">
          {visiblePassages.length === 0 && passages !== null && (
            <p className="text-sm text-ink/60">No passages in this tab.</p>
          )}
          {visiblePassages.map((p) => {
            const isOpen = openIds.has(`p-${p.id}`)
            return (
              <div key={p.id} className="rounded-2xl border border-cloud bg-paper">
                <div className="flex items-start gap-3 px-4 py-3">
                  <button type="button" className="flex-1 text-left" onClick={() => toggleOpen(`p-${p.id}`)}>
                    <p className="text-xs font-semibold uppercase tracking-widest text-smoke">
                      {p.subject ?? '?'} · grade {p.grade ?? '?'} · v{p.version_number ?? '?'} · {p.genre ?? 'no genre'}
                    </p>
                    <p className="font-semibold">{p.title ?? '(untitled passage)'}</p>
                    <p className="text-xs text-ink/60">{(p.body ?? '').slice(0, 140)}{(p.body?.length ?? 0) > 140 ? '…' : ''}</p>
                  </button>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${
                    p.status === 'draft' ? 'bg-sun/25 text-ink/70' :
                    p.status === 'published' ? 'bg-leaf/15 text-leaf' : 'bg-cloud text-ink/60'
                  }`}>{p.status}</span>
                  {p.source !== 'parent_manual' && (
                    <span className="rounded-full bg-sky/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-sky" title={p.source}>AI</span>
                  )}
                </div>
                {isOpen && (
                  <div className="border-t border-cloud px-4 py-3">
                    {p.passage_svg && (
                      <SvgImage svg={p.passage_svg} altText={p.passage_svg_alt_text ?? 'Passage figure'} className="mb-3" />
                    )}
                    <p className="whitespace-pre-line text-sm leading-relaxed text-ink/85">{p.body}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {p.status === 'draft' && (
                        <button
                          type="button"
                          className="btn-primary text-xs disabled:opacity-50"
                          disabled={busy === `p-${p.id}`}
                          onClick={() => void publishPassage(p.id)}
                        >
                          {busy === `p-${p.id}` ? 'Publishing…' : 'Publish'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        disabled={busy === `p-${p.id}`}
                        onClick={() => void softDeletePassage(p.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section className="card mb-6 p-5">
        <h2 className="font-display text-xl">Questions</h2>
        <p className="text-xs text-ink/60">{visibleQuestions.length} of {questions?.length ?? 0}</p>
        <div className="mt-4 space-y-2">
          {visibleQuestions.length === 0 && questions !== null && (
            <p className="text-sm text-ink/60">No questions in this tab.</p>
          )}
          {visibleQuestions.map((q) => {
            const isOpen = openIds.has(`q-${q.id}`)
            return (
              <div key={q.id} className="rounded-2xl border border-cloud bg-paper">
                <div className="flex items-start gap-3 px-4 py-3">
                  <button type="button" className="flex-1 text-left" onClick={() => toggleOpen(`q-${q.id}`)}>
                    <p className="text-xs font-semibold uppercase tracking-widest text-smoke">
                      {q.subject ?? '?'} · grade {q.grade ?? '?'}{q.standard_code ? ` · ${q.standard_code}` : ''}{q.difficulty ? ` · diff ${q.difficulty}` : ''}{q.passage_id ? ' · attached to a passage' : ''}
                    </p>
                    <p className="font-semibold">{(q.stem ?? '').slice(0, 140)}{(q.stem?.length ?? 0) > 140 ? '…' : ''}</p>
                  </button>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${
                    q.status === 'draft' ? 'bg-sun/25 text-ink/70' :
                    q.status === 'published' ? 'bg-leaf/15 text-leaf' : 'bg-cloud text-ink/60'
                  }`}>{q.status}</span>
                  {q.source !== 'parent_manual' && (
                    <span className="rounded-full bg-sky/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-sky" title={q.source}>AI</span>
                  )}
                </div>
                {isOpen && (
                  <div className="border-t border-cloud px-4 py-3">
                    {q.stem_svg && (
                      <SvgImage svg={q.stem_svg} altText={q.stem_svg_alt_text ?? 'Stem figure'} className="mb-3" />
                    )}
                    <p className="text-sm font-semibold">{q.stem}</p>
                    <ul className="mt-3 space-y-1.5 text-sm">
                      {q.choices.map((c) => (
                        <li key={c.id} className={`rounded-xl border px-3 py-2 ${c.is_correct ? 'border-leaf/50 bg-leaf/5' : 'border-cloud bg-cream/40'}`}>
                          <div className="flex items-start gap-2">
                            <span className="font-mono text-xs font-bold">{c.label}.</span>
                            <span className="flex-1">{c.text}</span>
                            {c.is_correct && <span className="text-[10px] font-semibold uppercase tracking-widest text-leaf">correct</span>}
                          </div>
                          {c.choice_svg && (
                            <SvgImage svg={c.choice_svg} altText={c.choice_svg_alt_text ?? 'Choice figure'} className="mt-2 max-w-[160px]" maxWidth={160} />
                          )}
                          {c.is_correct && c.explanation_correct && (
                            <p className="mt-1 text-xs text-ink/70">→ {c.explanation_correct}</p>
                          )}
                          {!c.is_correct && c.explanation_wrong && (
                            <p className="mt-1 text-xs italic text-ink/60">misconception: {c.explanation_wrong}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {q.status === 'draft' && (
                        <button
                          type="button"
                          className="btn-primary text-xs disabled:opacity-50"
                          disabled={busy === `q-${q.id}`}
                          onClick={() => void publishQuestion(q.id)}
                        >
                          {busy === `q-${q.id}` ? 'Publishing…' : 'Publish'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        disabled={busy === `q-${q.id}`}
                        onClick={() => void softDeleteQuestion(q.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
