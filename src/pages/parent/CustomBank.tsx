// /parent/custom-bank — per-bank review + publish queue (requires ?bank=<uuid>).
// When ?bank= is present, loads only items belonging to that bank via
// map_question_bank_items and shows bank-scoped header with rename + bulk-publish.
// Without ?bank= renders an empty-state pointing back to /parent/ai-studio.
//
// Connect AI is reached via a settings-style button on the action bar that sets
// ?tab=connect, which AiStudio.tsx then routes to ConnectAi.
//
// Bulk-select preserved. Per-card "Publish" label kept (passage publish does NOT
// cascade to attached questions).

import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import SvgImage from '../../components/SvgImage'
import { supabase } from '../../lib/supabase'
import { renameBank } from '../../lib/banks/mutations'
import { AssignBankDialog } from '../../components/parent/AssignBankDialog'

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
  passage_version_id: string | null // the version the question links to
  passage_is_outdated: boolean       // true if the passage's current version moved on
  standard_code: string | null
  difficulty: number | null
  choices: ChoicePreview[]
}

type Tab = 'all' | 'draft' | 'published' | 'archived'
type TypeFilter = 'all' | 'questions' | 'passages'

/* ---------- inline SVG icons (no dependency) ---------- */
type IconProps = { className?: string }
function IconClipboard({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z" />
      <path d="M8 6H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2" />
      <path d="M9 11h6M9 15h4" />
    </svg>
  )
}
function IconBook({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5Z" />
      <path d="M4 19a2 2 0 0 0 2 2h12" />
      <path d="M8 7h7M8 11h7" />
    </svg>
  )
}
function IconPlus({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
function IconPlug({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M9 2v4M15 2v4" />
      <path d="M7 6h10v5a5 5 0 0 1-10 0V6Z" />
      <path d="M12 16v6" />
    </svg>
  )
}
function IconSparkles({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 4l1.5 4L18 9.5 13.5 11 12 15l-1.5-4L6 9.5 10.5 8 12 4Z" />
      <path d="M18.5 16l.7 1.8L21 18.5l-1.8.7L18.5 21l-.7-1.8L16 18.5l1.8-.7.7-1.8Z" />
    </svg>
  )
}
function IconUser({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.7-3.5 3.5-5.5 7-5.5s6.3 2 7 5.5" />
    </svg>
  )
}
function IconDots({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
    </svg>
  )
}
function IconInfo({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v.01M11 12h1v5h1" />
    </svg>
  )
}

/* ---------- pure visual helpers ---------- */
function timeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const diff = Date.now() - t
  const mins = Math.round(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days < 7) return days === 1 ? 'yesterday' : `${days} days ago`
  const weeks = Math.round(days / 7)
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleDateString()
}
function isAi(source: string): boolean { return source !== 'parent_manual' }
function statusPillStyle(status: Status): { bg: string; fg: string } {
  if (status === 'draft') return { bg: '#FAEEDA', fg: '#854F0B' }
  if (status === 'published') return { bg: '#EAF3DE', fg: '#27500A' }
  return { bg: '#EAEEF3', fg: '#475569' }
}

export default function CustomBank() {
  // ----- search params -----
  const [params, setParams] = useSearchParams()
  const bankId = params.get('bank')

  // ----- state -----
  const [passages, setPassages] = useState<PassageRow[] | null>(null)
  const [questions, setQuestions] = useState<QuestionRow[] | null>(null)
  const [bankMeta, setBankMeta] = useState<{ name: string; subject: 'math' | 'reading' | 'language'; grade: number } | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [showAssign, setShowAssign] = useState(false)
  const [tab, setTab] = useState<Tab>('draft')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const [selectedPassageIds, setSelectedPassageIds] = useState<Set<string>>(new Set())
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set())
  const [menuFor, setMenuFor] = useState<string | null>(null)

  // ===== data loading =====
  async function loadAll() {
    if (!bankId) return
    setError(null)

    // Step 1: Fetch bank meta
    const { data: bMeta } = await supabase
      .from('map_question_banks')
      .select('name, subject, grade')
      .eq('id', bankId)
      .maybeSingle()
    if (bMeta) setBankMeta(bMeta as { name: string; subject: 'math' | 'reading' | 'language'; grade: number })

    // Step 2: Fetch item rows for this bank
    const { data: itemRows } = await supabase
      .from('map_question_bank_items')
      .select('custom_question_id, custom_passage_id')
      .eq('bank_id', bankId)
    const questionIdsInBank = (itemRows ?? []).map((r) => (r as { custom_question_id: string | null }).custom_question_id).filter(Boolean) as string[]
    const passageIdsInBank  = (itemRows ?? []).map((r) => (r as { custom_passage_id: string | null }).custom_passage_id).filter(Boolean) as string[]

    // If both arrays are empty, set [] on both lists and skip the rest of the load.
    if (questionIdsInBank.length === 0 && passageIdsInBank.length === 0) {
      setQuestions([])
      setPassages([])
      return
    }

    const passageQuery = passageIdsInBank.length > 0
      ? supabase
          .from('map_custom_passages')
          .select(
            'id, status, source, current_version_id, created_at, ' +
              'map_custom_passage_versions!current_version_id(version_number, subject, grade, title, body, passage_svg, passage_svg_alt_text, genre)',
          )
          .in('id', passageIdsInBank)
          .is('soft_deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [], error: null })

    const questionQuery = questionIdsInBank.length > 0
      ? supabase
          .from('map_custom_questions')
          .select(
            'id, status, source, current_version_id, created_at, ' +
              'map_custom_question_versions!current_version_id(' +
                'subject, grade, stem, stem_svg, stem_svg_alt_text, passage_version_id, standard_code, difficulty, ' +
                'map_custom_passage_versions(passage_id), ' +
                'choices:map_custom_question_choices(id, label, text, is_correct, ordinal, choice_svg, choice_svg_alt_text, explanation_correct, explanation_wrong))',
          )
          .in('id', questionIdsInBank)
          .is('soft_deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [], error: null })

    const [pRes, qRes] = await Promise.all([passageQuery, questionQuery])
    if (pRes.error) {
      setError(`passages: ${pRes.error.message}`)
      return
    }
    if (qRes.error) {
      setError(`questions: ${qRes.error.message}`)
      return
    }

    const currentByPassageId = new Map<string, string | null>()
    for (const row of pRes.data ?? []) {
      const r = row as unknown as { id: string; current_version_id: string | null }
      currentByPassageId.set(r.id, r.current_version_id)
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
      const passageId = v?.map_custom_passage_versions?.passage_id ?? null
      const passageVid = v?.passage_version_id ?? null
      const passageCurrent = passageId ? (currentByPassageId.get(passageId) ?? null) : null
      const isOutdated = !!(passageVid && passageCurrent && passageCurrent !== passageVid)
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
        passage_id: passageId,
        passage_version_id: passageVid,
        passage_is_outdated: isOutdated,
        standard_code: v?.standard_code ?? null,
        difficulty: v?.difficulty ?? null,
        choices,
      }
    })

    setPassages(passageRows)
    setQuestions(questionRows)
  }

  useEffect(() => { void loadAll() }, [bankId]) // eslint-disable-line react-hooks/exhaustive-deps

  function filterByTab<T extends { status: Status }>(rows: T[] | null): T[] {
    if (!rows) return []
    if (tab === 'all') return rows
    return rows.filter((r) => r.status === tab)
  }

  const visiblePassages = useMemo(() => filterByTab(passages), [passages, tab])
  const visibleQuestions = useMemo(() => filterByTab(questions), [questions, tab])

  function toggleOpen(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ===== handlers (unchanged) =====
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
    const { error: e } = await supabase.rpc('map_soft_delete_custom_passage', { p_passage_id: id })
    setBusy(null)
    if (e) { setError(e.message); return }
    await loadAll()
  }
  async function softDeleteQuestion(id: string) {
    if (!window.confirm('Delete this question? Existing kid attempts on it stay intact, but it can no longer appear in new tests.')) return
    setBusy(`q-${id}`); setError(null)
    const { error: e } = await supabase.rpc('map_soft_delete_custom_question', { p_question_id: id })
    setBusy(null)
    if (e) { setError(e.message); return }
    await loadAll()
  }

  function togglePassageSelection(id: string) {
    setSelectedPassageIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function toggleQuestionSelection(id: string) {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function bulkPublish() {
    const draftPassageIds = (passages ?? [])
      .filter((p) => selectedPassageIds.has(p.id) && p.status === 'draft')
      .map((p) => p.id)
    const draftQuestionIds = (questions ?? [])
      .filter((q) => selectedQuestionIds.has(q.id) && q.status === 'draft')
      .map((q) => q.id)
    const passageIds = draftPassageIds
    const questionIds = draftQuestionIds
    if (passageIds.length + questionIds.length === 0) return
    if (!window.confirm(`Publish ${passageIds.length} passage(s) and ${questionIds.length} question(s)?`)) return
    setBulkBusy(true); setError(null)
    const errors: string[] = []
    for (const id of passageIds) {
      const { error: e } = await supabase.rpc('map_publish_custom_passage', { p_passage_id: id })
      if (e) errors.push(`passage ${id.slice(0, 8)}: ${e.message}`)
    }
    for (const id of questionIds) {
      const { error: e } = await supabase.rpc('map_publish_custom_question', { p_question_id: id })
      if (e) errors.push(`question ${id.slice(0, 8)}: ${e.message}`)
    }
    setBulkBusy(false)
    if (errors.length > 0) {
      setError(`${errors.length} of ${passageIds.length + questionIds.length} failed:\n${errors.join('\n')}`)
    } else {
      setSelectedPassageIds(new Set())
      setSelectedQuestionIds(new Set())
    }
    await loadAll()
  }

  async function bulkDelete() {
    const passageIds = [...selectedPassageIds]
    const questionIds = [...selectedQuestionIds]
    if (passageIds.length + questionIds.length === 0) return
    if (!window.confirm(
      `Delete ${passageIds.length} passage(s) and ${questionIds.length} question(s)?\n\n` +
      `Existing kid attempts on these stay intact, but they won't appear in new tests.`,
    )) return
    setBulkBusy(true); setError(null)
    const errors: string[] = []
    for (const id of questionIds) {
      const { error: e } = await supabase.rpc('map_soft_delete_custom_question', { p_question_id: id })
      if (e) errors.push(`question ${id.slice(0, 8)}: ${e.message}`)
    }
    for (const id of passageIds) {
      const { error: e } = await supabase.rpc('map_soft_delete_custom_passage', { p_passage_id: id })
      if (e) errors.push(`passage ${id.slice(0, 8)}: ${e.message}`)
    }
    setBulkBusy(false)
    if (errors.length > 0) {
      setError(`${errors.length} of ${passageIds.length + questionIds.length} failed:\n${errors.join('\n')}`)
    } else {
      setSelectedPassageIds(new Set())
      setSelectedQuestionIds(new Set())
    }
    await loadAll()
  }

  function selectAllVisible() {
    setSelectedPassageIds(new Set(visiblePassages.filter((p) => p.status !== 'archived').map((p) => p.id)))
    setSelectedQuestionIds(new Set(visibleQuestions.filter((q) => q.status !== 'archived').map((q) => q.id)))
  }
  function clearSelection() {
    setSelectedPassageIds(new Set())
    setSelectedQuestionIds(new Set())
  }

  function countSelectedDrafts(): number {
    let n = 0
    for (const p of passages ?? []) {
      if (selectedPassageIds.has(p.id) && p.status === 'draft') n++
    }
    for (const q of questions ?? []) {
      if (selectedQuestionIds.has(q.id) && q.status === 'draft') n++
    }
    return n
  }

  // ===== presentational derivations =====
  const draftCount = (passages?.filter((p) => p.status === 'draft').length ?? 0) +
    (questions?.filter((q) => q.status === 'draft').length ?? 0)
  const publishedCount = (passages?.filter((p) => p.status === 'published').length ?? 0) +
    (questions?.filter((q) => q.status === 'published').length ?? 0)
  const totalCount = (passages?.length ?? 0) + (questions?.length ?? 0)

  // Bank-scoped counts for bulk-publish and assign CTA
  const bankDraftQuestionIds = (questions ?? []).filter((q) => q.status === 'draft').map((q) => q.id)
  const bankReadyCount = (questions ?? []).filter((q) => q.status === 'published').length

  // Questions per passage (for the "passage + N questions" type pill).
  const questionsByPassage = useMemo(() => {
    const m = new Map<string, number>()
    for (const q of questions ?? []) {
      if (q.passage_id) m.set(q.passage_id, (m.get(q.passage_id) ?? 0) + 1)
    }
    return m
  }, [questions])

  // Merge passages + questions into one chronological queue, then apply the
  // type filter. Each item carries an internal `kind` discriminator.
  type Item =
    | ({ kind: 'passage' } & PassageRow)
    | ({ kind: 'question' } & QuestionRow)
  const items: Item[] = useMemo(() => {
    const ps = visiblePassages.map((p): Item => ({ ...p, kind: 'passage' }))
    const qs = visibleQuestions.map((q): Item => ({ ...q, kind: 'question' }))
    const merged: Item[] = [...ps, ...qs]
    const typed = typeFilter === 'questions'
      ? merged.filter((i) => i.kind === 'question')
      : typeFilter === 'passages'
        ? merged.filter((i) => i.kind === 'passage')
        : merged
    typed.sort((a, b) => b.created_at.localeCompare(a.created_at))
    return typed
  }, [visiblePassages, visibleQuestions, typeFilter])

  const anyLoaded = passages !== null && questions !== null
  const selCount = selectedPassageIds.size + selectedQuestionIds.size

  // ----- missing ?bank= early return -----
  if (!bankId) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-zinc-500">
          No bank selected. <Link to="/parent/ai-studio" className="underline">Go to all banks</Link>.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* ---------- bank-scoped header ---------- */}
      <header className="mb-6 mt-2">
        <div className="mb-2">
          <Link to="/parent/ai-studio" className="text-sm text-zinc-500 hover:underline">← All banks</Link>
        </div>
        {bankMeta && (
          <div className="flex items-center justify-between">
            <div>
              {!renaming ? (
                <h1 className="font-display text-3xl flex items-center gap-2">
                  {bankMeta.name}
                  <button
                    type="button"
                    className="text-zinc-400 hover:text-zinc-700 text-base"
                    onClick={() => { setRenameValue(bankMeta.name); setRenaming(true) }}
                    title="Edit name"
                  >
                    ✎
                  </button>
                </h1>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    maxLength={120}
                    className="border rounded px-2 py-1 text-lg"
                  />
                  <button
                    type="button"
                    className="btn-primary text-sm"
                    onClick={async () => {
                      try {
                        await renameBank({ bankId, name: renameValue.trim() })
                        setBankMeta((m) => m ? { ...m, name: renameValue.trim() } : m)
                        setRenaming(false)
                      } catch (e) {
                        alert(e instanceof Error ? e.message : 'Rename failed')
                      }
                    }}
                  >
                    Save
                  </button>
                  <button type="button" className="btn-ghost text-sm" onClick={() => setRenaming(false)}>
                    Cancel
                  </button>
                </div>
              )}
              <p className="text-sm text-zinc-500 mt-1">{bankMeta.subject} · G{bankMeta.grade}</p>
            </div>
            <div className="flex gap-2">
              {bankDraftQuestionIds.length > 0 && (
                <button
                  type="button"
                  className="btn-secondary text-sm disabled:opacity-50"
                  disabled={bulkBusy}
                  onClick={async () => {
                    setBulkBusy(true)
                    setError(null)
                    for (const id of bankDraftQuestionIds) {
                      await publishQuestion(id)
                    }
                    setBulkBusy(false)
                  }}
                >
                  {bulkBusy ? 'Publishing…' : `Publish all drafts (${bankDraftQuestionIds.length})`}
                </button>
              )}
              {bankDraftQuestionIds.length === 0 && bankReadyCount >= 5 && (
                <button type="button" className="btn-primary text-sm" onClick={() => setShowAssign(true)}>
                  Assign to kid →
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ---------- action bar ---------- */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Link to={`/parent/custom-bank/new-question?bank=${bankId}`} className="btn-primary text-sm">
            <IconPlus className="h-4 w-4" />
            New question
          </Link>
          <Link to={`/parent/custom-bank/new-passage?bank=${bankId}`} className="btn-secondary text-sm">
            <IconPlus className="h-4 w-4" />
            New passage
          </Link>
        </div>
        <button
          type="button"
          className="btn-secondary text-sm"
          onClick={() => setParams({ tab: 'connect' }, { replace: false })}
        >
          <IconPlug className="h-4 w-4" />
          Connect AI
        </button>
      </div>

      {error && (
        <p className="mt-3 whitespace-pre-line rounded-xl bg-berry/10 px-3 py-2 text-sm text-berry ring-1 ring-berry/30">
          {error}
        </p>
      )}

      {/* ---------- filter row: status (with counts) | type ---------- */}
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-cloud/70 pt-4">
        <div className="flex gap-1">
          {([
            ['draft', 'Drafts', draftCount],
            ['published', 'Published', publishedCount],
            ['all', 'All', totalCount],
          ] as const).map(([key, label, count]) => {
            const active = tab === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`rounded-full px-3 py-1 text-xs transition ${
                  active
                    ? 'font-semibold ring-1'
                    : 'text-smoke hover:text-ink'
                }`}
                style={
                  active
                    ? key === 'draft'
                      ? { background: '#FAEEDA', color: '#854F0B', boxShadow: 'inset 0 0 0 1px #FAC775' }
                      : key === 'published'
                        ? { background: '#EAF3DE', color: '#27500A', boxShadow: 'inset 0 0 0 1px #BFD79A' }
                        : { background: '#EAEEF3', color: '#334155', boxShadow: 'inset 0 0 0 1px #CBD5E1' }
                    : undefined
                }
              >
                {label} <span className="opacity-70">· {count}</span>
              </button>
            )
          })}
        </div>
        <div className="h-4 w-px bg-cloud" aria-hidden="true" />
        <div className="flex gap-1">
          {([
            ['all', 'All types'],
            ['questions', 'Questions'],
            ['passages', 'Passages'],
          ] as const).map(([key, label]) => {
            const active = typeFilter === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTypeFilter(key)}
                className={`rounded-full px-3 py-1 text-xs transition ${
                  active ? 'font-semibold text-ink' : 'text-smoke hover:text-ink'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* bulk-select toolbar (right side, only when there's anything to act on) */}
        {anyLoaded && items.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" className="text-xs text-smoke underline hover:text-ink"
              onClick={selectAllVisible}>
              Select all
            </button>
            {selCount > 0 && (
              <>
                <button type="button" className="text-xs text-smoke underline hover:text-ink"
                  onClick={clearSelection}>
                  Clear
                </button>
                {countSelectedDrafts() > 0 && (
                  <button
                    type="button"
                    className="btn-primary text-xs disabled:opacity-50"
                    disabled={bulkBusy}
                    onClick={() => void bulkPublish()}
                  >
                    {bulkBusy
                      ? 'Working…'
                      : `Publish ${countSelectedDrafts()} draft${countSelectedDrafts() === 1 ? '' : 's'}`}
                  </button>
                )}
                <button
                  type="button"
                  className="rounded-2xl px-3 py-1 text-xs font-semibold disabled:opacity-50"
                  style={{ background: '#FBE7E7', color: '#B42318', boxShadow: 'inset 0 0 0 1px #F3B5B5' }}
                  disabled={bulkBusy}
                  onClick={() => void bulkDelete()}
                >
                  {bulkBusy ? 'Working…' : `Delete ${selCount}`}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ---------- single unified item list ---------- */}
      <div className="mt-3 flex flex-col gap-2">
        {anyLoaded && items.length === 0 && (
          <div className="rounded-2xl bg-white p-6 text-center text-sm text-smoke ring-1 ring-cloud/70">
            Nothing in this filter yet.
          </div>
        )}

        {items.map((item) => {
          const isPassage = item.kind === 'passage'
          const sp = statusPillStyle(item.status)
          const cardKey = `${isPassage ? 'p' : 'q'}-${item.id}`
          const isOpen = openIds.has(cardKey)
          const selected = isPassage
            ? selectedPassageIds.has(item.id)
            : selectedQuestionIds.has(item.id)
          const ai = isAi(item.source)

          // Meta line
          let meta = `${item.subject ?? '?'} · Grade ${item.grade ?? '?'}`
          if (isPassage) {
            meta += item.genre ? ` · ${item.genre}` : ''
          } else {
            if (item.standard_code) meta += ` · ${item.standard_code}`
            if (item.difficulty) meta += ` · diff ${item.difficulty}`
          }

          // Type pill text
          const attached = isPassage ? (questionsByPassage.get(item.id) ?? 0) : 0
          const typeLabel = isPassage
            ? attached > 0
              ? `passage + ${attached} question${attached === 1 ? '' : 's'}`
              : 'passage'
            : 'question'

          // Header preview text
          const headerText = isPassage
            ? item.title ?? '(untitled passage)'
            : item.stem ?? ''
          const bodyExcerpt = isPassage
            ? (item.body ?? '').slice(0, 140) + ((item.body?.length ?? 0) > 140 ? '…' : '')
            : ''

          return (
            <div key={cardKey} className="rounded-2xl bg-white ring-1 ring-cloud/70">
              <div className="flex items-start gap-3 p-4">
                {item.status !== 'archived' && (
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 cursor-pointer"
                    checked={selected}
                    onChange={() =>
                      isPassage ? togglePassageSelection(item.id) : toggleQuestionSelection(item.id)
                    }
                    aria-label="Select for bulk action"
                  />
                )}
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: '#FAEEDA', color: '#854F0B' }}
                >
                  {isPassage
                    ? <IconBook className="h-[18px] w-[18px]" />
                    : <IconClipboard className="h-[18px] w-[18px]" />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ background: sp.bg, color: sp.fg }}
                    >
                      {item.status}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px]"
                      style={{ background: '#EAEEF3', color: '#475569' }}
                    >
                      {typeLabel}
                    </span>
                    <span className="text-xs text-smoke">{meta}</span>
                    {!isPassage && item.passage_is_outdated && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
                        style={{ background: '#FAEEDA', color: '#854F0B' }}
                        title="The passage this question references has a newer version."
                      >
                        stale passage
                      </span>
                    )}
                  </div>

                  {isPassage ? (
                    <>
                      <div className="mt-2 text-sm font-semibold">{headerText}</div>
                      {bodyExcerpt && (
                        <div className="mt-1 text-[13px] leading-relaxed text-smoke">{bodyExcerpt}</div>
                      )}
                    </>
                  ) : (
                    <div className="mt-2 text-sm leading-snug">{headerText}</div>
                  )}

                  <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-smoke">
                    {ai ? (
                      <IconSparkles className="h-3 w-3" />
                    ) : (
                      <IconUser className="h-3 w-3" />
                    )}
                    <span>
                      {ai ? 'Generated by AI' : 'Authored by you'} · {timeAgo(item.created_at)}
                    </span>
                  </div>
                </div>

                {/* per-card actions */}
                <div className="relative flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    onClick={() => toggleOpen(cardKey)}
                  >
                    {isOpen ? 'Hide' : 'Preview'}
                  </button>
                  {item.status === 'draft' && (
                    <button
                      type="button"
                      className="btn-primary text-xs disabled:opacity-50"
                      disabled={busy === cardKey}
                      onClick={() =>
                        void (isPassage ? publishPassage(item.id) : publishQuestion(item.id))
                      }
                    >
                      {busy === cardKey ? 'Publishing…' : 'Publish'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-ghost px-2 text-xs"
                    aria-label="More actions"
                    aria-haspopup="menu"
                    aria-expanded={menuFor === cardKey}
                    onClick={() => setMenuFor(menuFor === cardKey ? null : cardKey)}
                  >
                    <IconDots className="h-4 w-4" />
                  </button>
                  {menuFor === cardKey && (
                    <div
                      role="menu"
                      className="absolute right-0 top-full z-10 mt-1 min-w-[8rem] rounded-xl bg-white py-1 shadow-card ring-1 ring-cloud"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="block w-full px-3 py-1.5 text-left text-xs text-berry hover:bg-cream disabled:opacity-50"
                        disabled={busy === cardKey}
                        onClick={() => {
                          setMenuFor(null)
                          void (isPassage ? softDeletePassage(item.id) : softDeleteQuestion(item.id))
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* expanded preview — same content as before, kept verbatim */}
              {isOpen && (
                <div className="border-t border-cloud/70 px-4 py-3">
                  {isPassage ? (
                    <>
                      {item.passage_svg && (
                        <SvgImage svg={item.passage_svg} altText={item.passage_svg_alt_text ?? 'Passage figure'} className="mb-3" />
                      )}
                      <p className="whitespace-pre-line text-sm leading-relaxed text-ink/85">{item.body}</p>
                    </>
                  ) : (
                    <>
                      {item.stem_svg && (
                        <SvgImage svg={item.stem_svg} altText={item.stem_svg_alt_text ?? 'Stem figure'} className="mb-3" />
                      )}
                      <p className="text-sm font-semibold">{item.stem}</p>
                      <ul className="mt-3 space-y-1.5 text-sm">
                        {item.choices.map((c) => (
                          <li
                            key={c.id}
                            className={`rounded-xl border px-3 py-2 ${
                              c.is_correct ? 'border-leaf/50 bg-leaf/5' : 'border-cloud bg-cream/40'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <span className="font-mono text-xs font-bold">{c.label}.</span>
                              <span className="flex-1">{c.text}</span>
                              {c.is_correct && (
                                <span className="text-[10px] font-semibold uppercase tracking-widest text-leaf">
                                  correct
                                </span>
                              )}
                            </div>
                            {c.choice_svg && (
                              <SvgImage
                                svg={c.choice_svg}
                                altText={c.choice_svg_alt_text ?? 'Choice figure'}
                                className="mt-2 max-w-[160px]"
                                maxWidth={160}
                              />
                            )}
                            {c.is_correct && c.explanation_correct && (
                              <p className="mt-1 text-xs text-ink/70">→ {c.explanation_correct}</p>
                            )}
                            {!c.is_correct && c.explanation_wrong && (
                              <p className="mt-1 text-xs italic text-ink/60">
                                misconception: {c.explanation_wrong}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ---------- footnote disclaimer ---------- */}
      <div
        className="mt-6 flex items-center gap-2 rounded-xl px-4 py-3 text-xs text-smoke"
        style={{ background: '#F5F6F8' }}
      >
        <IconInfo className="h-4 w-4 shrink-0 text-[#854F0B]" />
        <span>Drafts are unvetted — preview before publishing. Kids can only see published items.</span>
      </div>

      {/* ---------- assign bank dialog ---------- */}
      {showAssign && bankMeta && (
        <AssignBankDialog
          bankId={bankId}
          bankName={bankMeta.name}
          onClose={() => setShowAssign(false)}
          onAssigned={() => setShowAssign(false)}
        />
      )}
    </div>
  )
}
