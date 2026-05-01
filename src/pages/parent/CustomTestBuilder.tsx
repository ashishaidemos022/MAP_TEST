import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useActiveStudent } from '../../lib/activeStudent'
import {
  CUSTOM_MAX_COUNT,
  CUSTOM_MIN_COUNT,
  CrossSubjectError,
  NoQuestionsError,
  createCustomTest,
  previewCustomTest,
} from '../../lib/customTest'
import { SUBJECTS, subjectMeta } from '../../lib/subjects'
import { supabase } from '../../lib/supabase'
import type { Difficulty, Subject } from '../../lib/types'

interface StandardRow {
  id: string
  subject: Subject
  grade: number
  teks_code: string
  teks_title: string
  reporting_category: string | null
  nwea_goal_area: string | null
  sort_order: number
  active_q_count: number
}

type Step = 'subject' | 'topics' | 'config'

const SUPPORTED_GRADES = [1, 2, 3, 4] as const

function teksPrefix(code: string): string {
  return code.replace(/[A-Za-z.]+$/, '').replace(/\.$/, '') || code
}

export default function CustomTestBuilder() {
  const { activeStudent } = useActiveStudent()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const preselectSubject = searchParams.get('subject') as Subject | null
  const preselectIds = useMemo(
    () => (searchParams.get('standard_ids')?.split(',').filter(Boolean) ?? []),
    [searchParams],
  )

  const [step, setStep] = useState<Step>(preselectSubject ? 'topics' : 'subject')
  const [subject, setSubject] = useState<Subject | null>(preselectSubject ?? null)
  const [standards, setStandards] = useState<StandardRow[] | null>(null)
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set(preselectIds))
  const [openGrades, setOpenGrades] = useState<Set<number>>(
    new Set([activeStudent?.grade ?? 4]),
  )
  const [requestedCount, setRequestedCount] = useState(15)
  const [difficulty, setDifficulty] = useState<Difficulty | 'any'>('any')
  const [preview, setPreview] = useState<{
    actualCount: number
    passageCount: number
  } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load standards (and per-standard active question counts) when the subject
  // is set. One round-trip; small payload.
  useEffect(() => {
    if (!subject) return
    let cancelled = false
    void (async () => {
      const { data, error: e1 } = await supabase
        .from('map_standards')
        .select('id, subject, grade, teks_code, teks_title, reporting_category, nwea_goal_area, sort_order')
        .eq('subject', subject)
        .order('grade')
        .order('sort_order')
      if (e1 || !data) {
        if (!cancelled) setError(e1?.message ?? 'Could not load topics.')
        return
      }
      const ids = data.map((s) => s.id as string)
      // Per-standard count of active questions. Single grouped query.
      const counts = new Map<string, number>()
      // PostgREST doesn't expose GROUP BY directly; do this with one head-only
      // query per standard would be wasteful. Use a small RPC-free workaround:
      // fetch all matching question rows (id, standard_id) and tally locally.
      // The total across all subjects is bounded (~3,600 rows project-wide;
      // single subject is ~1,200) and head requests are slower in batch.
      const { data: qRows, error: e2 } = await supabase
        .from('map_questions')
        .select('standard_id')
        .eq('subject', subject)
        .eq('is_active', true)
        .in('standard_id', ids)
        .limit(10000)
      if (e2 || !qRows) {
        if (!cancelled) setError(e2?.message ?? 'Could not count questions per topic.')
        return
      }
      for (const r of qRows) {
        const sid = r.standard_id as string | null
        if (!sid) continue
        counts.set(sid, (counts.get(sid) ?? 0) + 1)
      }
      if (cancelled) return
      setStandards(
        data.map((s) => ({
          ...(s as Omit<StandardRow, 'active_q_count'>),
          active_q_count: counts.get(s.id as string) ?? 0,
        })),
      )
    })()
    return () => {
      cancelled = true
    }
  }, [subject])

  const selectedStandards = useMemo(
    () => (standards ?? []).filter((s) => pickedIds.has(s.id)),
    [standards, pickedIds],
  )
  const selectedGrades = useMemo(
    () => Array.from(new Set(selectedStandards.map((s) => s.grade))).sort(),
    [selectedStandards],
  )
  const poolSize = useMemo(
    () => selectedStandards.reduce((acc, s) => acc + s.active_q_count, 0),
    [selectedStandards],
  )

  // Clamp the requested count to the selectable pool. Never above CUSTOM_MAX_COUNT
  // and never above the pool itself; never below CUSTOM_MIN_COUNT.
  const sliderMax = Math.min(CUSTOM_MAX_COUNT, Math.max(CUSTOM_MIN_COUNT, poolSize))
  useEffect(() => {
    if (requestedCount > sliderMax) setRequestedCount(sliderMax)
  }, [sliderMax, requestedCount])

  // Live preview: only meaningful for reading (passage rounding) and for
  // bank-thin warnings. Debounced lightly via the slider step (5).
  useEffect(() => {
    if (step !== 'config') return
    if (!activeStudent || !subject || pickedIds.size === 0) {
      setPreview(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const p = await previewCustomTest({
          studentId: activeStudent.id,
          subject,
          standardIds: Array.from(pickedIds),
          requestedCount,
          difficulty,
        })
        if (!cancelled) setPreview({ actualCount: p.actualCount, passageCount: p.passageCount })
      } catch {
        if (!cancelled) setPreview(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [step, activeStudent, subject, pickedIds, requestedCount, difficulty])

  const togglePick = (id: string) => {
    setPickedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const clearAll = () => setPickedIds(new Set())
  const toggleGrade = (g: number) => {
    setOpenGrades((prev) => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      return next
    })
  }

  const submit = async () => {
    if (!activeStudent || !subject) return
    setError(null)
    setSubmitting(true)
    try {
      const { sessionId } = await createCustomTest({
        studentId: activeStudent.id,
        subject,
        standardIds: Array.from(pickedIds),
        requestedCount,
        difficulty,
      })
      navigate(`/test/${sessionId}`)
    } catch (e: unknown) {
      if (e instanceof NoQuestionsError) {
        setError(
          'No questions found for these topics. Try picking more topics or removing the difficulty filter.',
        )
      } else if (e instanceof CrossSubjectError) {
        setError('Selected topics span multiple subjects. Please restart and pick one subject.')
      } else {
        setError(e instanceof Error ? e.message : 'Could not start the test.')
      }
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 mt-2 flex items-center justify-between">
        <div>
          <p className="font-display text-lg uppercase tracking-widest text-smoke">
            Parent view
          </p>
          <h1 className="font-display text-4xl">Build a custom test</h1>
        </div>
        <Link to="/parent" className="btn-ghost text-sm">
          Back to parent
        </Link>
      </header>

      <Stepper step={step} subject={subject} pickedCount={pickedIds.size} />

      {error && (
        <p className="mt-4 rounded-xl bg-berry/10 px-3 py-2 text-sm text-berry ring-1 ring-berry/30">
          {error}
        </p>
      )}

      {step === 'subject' && (
        <section className="mt-6 grid gap-4 md:grid-cols-3">
          {SUBJECTS.map(({ key, label, emoji }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setSubject(key)
                setPickedIds(new Set())
                setStep('topics')
              }}
              className="card group flex flex-col items-start gap-2 p-6 text-left transition hover:-translate-y-0.5 hover:shadow-cardHover"
            >
              <span className="text-5xl" aria-hidden>
                {emoji}
              </span>
              <p className="font-display text-3xl">{label}</p>
              <p className="text-sm text-ink/60">
                Pick topics across grades, then build a one-off test.
              </p>
            </button>
          ))}
        </section>
      )}

      {step === 'topics' && subject && (
        <section className="mt-6">
          {!standards ? (
            <p className="card p-8 text-center text-sm text-ink/60">Loading topics…</p>
          ) : (
            <div className="card divide-y divide-cloud/70">
              {SUPPORTED_GRADES.map((g) => {
                const inGrade = standards.filter((s) => s.grade === g)
                if (inGrade.length === 0) return null
                const open = openGrades.has(g)
                const pickedInGrade = inGrade.filter((s) => pickedIds.has(s.id)).length
                return (
                  <div key={g}>
                    <button
                      type="button"
                      onClick={() => toggleGrade(g)}
                      aria-expanded={open}
                      className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition hover:bg-cream/40"
                    >
                      <span className="font-display text-2xl">Grade {g}</span>
                      <span className="flex items-center gap-2 text-xs text-ink/60">
                        <span>
                          {inGrade.length} topic{inGrade.length === 1 ? '' : 's'}
                          {pickedInGrade > 0 && (
                            <span className="ml-1 font-semibold text-sky">
                              · {pickedInGrade} picked
                            </span>
                          )}
                        </span>
                        <span aria-hidden>{open ? '▾' : '▸'}</span>
                      </span>
                    </button>
                    {open && (
                      <ul className="bg-paper">
                        {groupedRender(inGrade).map((block, i) => (
                          <li key={i}>
                            {block.label && (
                              <p className="border-t border-cloud/70 px-5 py-2 text-[10px] font-semibold uppercase tracking-widest text-smoke/80">
                                {block.label}
                              </p>
                            )}
                            <ul>
                              {block.items.map((s) => {
                                const checked = pickedIds.has(s.id)
                                const empty = s.active_q_count === 0
                                return (
                                  <li
                                    key={s.id}
                                    className={`flex items-center gap-3 border-t border-cloud/40 px-5 py-3 ${
                                      empty ? 'opacity-50' : 'hover:bg-cream/30'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={empty}
                                      onChange={() => togglePick(s.id)}
                                      className="h-5 w-5 cursor-pointer accent-sky disabled:cursor-not-allowed"
                                      id={`std-${s.id}`}
                                    />
                                    <label
                                      htmlFor={`std-${s.id}`}
                                      className="flex flex-1 cursor-pointer items-center gap-3"
                                    >
                                      <span className="flex-1 text-sm">{s.teks_title}</span>
                                      <span className="font-mono text-[10px] text-ink/40">
                                        {s.teks_code}
                                      </span>
                                      <span
                                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                          empty
                                            ? 'bg-cloud text-ink/40'
                                            : 'bg-cream text-ink/60 ring-1 ring-cloud'
                                        }`}
                                      >
                                        {s.active_q_count} q
                                      </span>
                                    </label>
                                  </li>
                                )
                              })}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="sticky bottom-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-paper/95 p-3 ring-1 ring-cloud shadow-card backdrop-blur">
            <p className="text-sm text-ink/80">
              <span className="font-semibold">{pickedIds.size}</span> topic
              {pickedIds.size === 1 ? '' : 's'} selected
              {selectedGrades.length > 0 && (
                <>
                  {' '}across {selectedGrades.length} grade{selectedGrades.length === 1 ? '' : 's'}
                </>
              )}
              {' · '}
              <span className="text-ink/60">{poolSize} questions available</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearAll}
                disabled={pickedIds.size === 0}
                className="btn-ghost text-sm disabled:opacity-40"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => setStep('config')}
                disabled={pickedIds.size === 0 || poolSize < CUSTOM_MIN_COUNT}
                className="btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue →
              </button>
            </div>
          </div>
          {pickedIds.size > 0 && poolSize < CUSTOM_MIN_COUNT && (
            <p className="mt-2 text-xs text-ink/60">
              Add another topic — these have only {poolSize} question{poolSize === 1 ? '' : 's'}{' '}
              between them (minimum is {CUSTOM_MIN_COUNT}).
            </p>
          )}
        </section>
      )}

      {step === 'config' && subject && (
        <section className="mt-6 space-y-5">
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-smoke">
              Test length
            </p>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="font-display text-5xl">{requestedCount}</span>
              <span className="text-sm text-ink/60">questions</span>
            </div>
            <input
              type="range"
              min={CUSTOM_MIN_COUNT}
              max={sliderMax}
              step={5}
              value={requestedCount}
              onChange={(e) => setRequestedCount(Number(e.target.value))}
              className="mt-3 w-full accent-sky"
              aria-label="Number of questions"
            />
            <div className="mt-1 flex justify-between text-[10px] text-ink/50">
              <span>{CUSTOM_MIN_COUNT}</span>
              <span>{sliderMax}</span>
            </div>
            <p className="mt-3 text-sm text-ink/70">
              {preview ? (
                subject === 'reading' ? (
                  <>
                    Your test will have{' '}
                    <span className="font-semibold">{preview.actualCount}</span> question
                    {preview.actualCount === 1 ? '' : 's'} across{' '}
                    <span className="font-semibold">{preview.passageCount}</span> passage
                    {preview.passageCount === 1 ? '' : 's'}.
                  </>
                ) : (
                  <>
                    Available pool: <span className="font-semibold">{poolSize}</span>. Your test
                    will have{' '}
                    <span className="font-semibold">{preview.actualCount}</span> question
                    {preview.actualCount === 1 ? '' : 's'}.
                  </>
                )
              ) : (
                <>Calculating…</>
              )}
            </p>
            {subject === 'reading' && (
              <p className="mt-2 text-xs text-ink/50">
                Reading tests stay grouped by passage, so the final count may round up to the
                nearest passage.
              </p>
            )}
          </div>

          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-smoke">
              Difficulty
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(['any', 'easy', 'medium', 'hard'] as const).map((d) => {
                const active = difficulty === d
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    aria-pressed={active}
                    className={`rounded-full px-4 py-2 text-sm font-semibold capitalize transition ${
                      active
                        ? 'bg-sky text-white shadow-card'
                        : 'bg-paper text-ink/70 ring-1 ring-cloud hover:ring-sky/40'
                    }`}
                  >
                    {d === 'any' ? 'Any' : d}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-smoke">
              Selected topics
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              {selectedStandards.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <span className="flex-1">{s.teks_title}</span>
                  <span className="font-mono text-[10px] text-ink/40">
                    G{s.grade} · {s.teks_code}
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setStep('topics')}
              className="btn-ghost mt-3 text-xs"
            >
              ← Edit topics
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-cream text-xl">
              {subjectMeta(subject).emoji}
            </span>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting || (preview?.actualCount ?? 0) === 0}
              className="btn-primary flex-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Building test…' : 'Start test'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

function Stepper({
  step,
  subject,
  pickedCount,
}: {
  step: Step
  subject: Subject | null
  pickedCount: number
}) {
  const steps: { key: Step; label: string; sub?: string }[] = [
    { key: 'subject', label: '1. Subject', sub: subject ? subjectMeta(subject).label : '' },
    { key: 'topics', label: '2. Topics', sub: pickedCount > 0 ? `${pickedCount} picked` : '' },
    { key: 'config', label: '3. Length & difficulty' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {steps.map((s, i) => {
        const active = s.key === step
        return (
          <span
            key={s.key}
            className={`rounded-full px-3 py-1 font-semibold uppercase tracking-widest ${
              active
                ? 'bg-sky text-white'
                : 'bg-cream text-ink/60 ring-1 ring-cloud'
            }`}
          >
            {s.label}
            {s.sub && <span className="ml-1 font-normal normal-case opacity-80">· {s.sub}</span>}
            {i < steps.length - 1 && <span aria-hidden className="ml-1">→</span>}
          </span>
        )
      })}
    </div>
  )
}

interface RenderBlock {
  label: string | null
  items: StandardRow[]
}

/** Group standards by NWEA goal area when present, else by reporting category
 * when present, else flat (no header). The bank state for grades 3–4 is mixed,
 * so we degrade gracefully per-grade. */
function groupedRender(rows: StandardRow[]): RenderBlock[] {
  const labelOf = (r: StandardRow): string | null =>
    r.nwea_goal_area ?? r.reporting_category ?? null
  // If no rows have a label, render flat with no header.
  if (rows.every((r) => labelOf(r) === null)) {
    return [{ label: null, items: rows }]
  }
  // Otherwise group by label, preserving the input order (already sort_order).
  const blocks = new Map<string, StandardRow[]>()
  const noLabel: StandardRow[] = []
  for (const r of rows) {
    const lbl = labelOf(r)
    if (lbl == null) {
      noLabel.push(r)
      continue
    }
    if (!blocks.has(lbl)) blocks.set(lbl, [])
    blocks.get(lbl)!.push(r)
  }
  const out: RenderBlock[] = []
  for (const [lbl, items] of blocks) {
    out.push({ label: lbl, items })
  }
  if (noLabel.length > 0) out.push({ label: null, items: noLabel })
  return out
}

// Silence the unused-import warning for a helper that may come back when we
// decide to roll up by TEKS prefix (e.g. 3.3A/B/C → 3.3 cluster headings).
void teksPrefix
