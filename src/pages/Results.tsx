import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import SvgFigure from '../components/SvgFigure'
import ReportQuestionButton from '../components/ReportQuestionButton'
import { estimateRit, gradeContext } from '../lib/rit'
import { supabase } from '../lib/supabase'
import { loadCustomQuestionsByVersionIds } from '../lib/customQuestionLoader'
import type { Attempt, Choice, Question, RitBand, Session, Standard } from '../lib/types'

interface QuestionFull extends Question {
  choices: Choice[]
  standard: Pick<Standard, 'teks_code' | 'teks_title'> | null
}

interface AttemptWithQuestion extends Attempt {
  question: QuestionFull | null
}

export default function Results() {
  const { id } = useParams<{ id: string }>()
  const [session, setSession] = useState<Session | null>(null)
  const [attempts, setAttempts] = useState<AttemptWithQuestion[]>([])
  const [error, setError] = useState<string | null>(null)
  const [savedRit, setSavedRit] = useState<number | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    void (async () => {
      const { data: sess, error: sErr } = await supabase
        .from('map_test_sessions')
        .select('*')
        .eq('id', id)
        .single()
      if (sErr || !sess) {
        setError(sErr?.message ?? 'Session not found.')
        return
      }
      const { data: atts, error: aErr } = await supabase
        .from('map_attempts')
        .select(
          `*, question:map_questions(*, choices:map_question_choices(*), standard:map_standards(teks_code, teks_title))`,
        )
        .eq('session_id', id)
        .order('answered_at')
      if (aErr) {
        setError(aErr.message)
        return
      }
      if (cancelled) return
      const s = sess as Session
      const a = (atts ?? []) as unknown as AttemptWithQuestion[]
      a.forEach((x) => {
        if (x.question) {
          x.question.choices = [...x.question.choices].sort((p, q) => p.sort_order - q.sort_order)
        }
      })
      // Custom-question attempts have question_id NULL + custom_question_version_id
      // set, so the map_questions join above leaves them with question === null.
      // Backfill them from the resolved custom view so By-skill and the
      // tricky-ones review render (score already uses session.correct_count).
      const customVids = a
        .filter((x) => !x.question)
        .map((x) => (x as unknown as { custom_question_version_id: string | null }).custom_question_version_id)
        .filter((v): v is string => !!v)
      if (customVids.length > 0) {
        const customs = await loadCustomQuestionsByVersionIds(customVids)
        const byVid = new Map(customs.map((c) => [c.version_id, c]))
        for (const x of a) {
          if (x.question) continue
          const vid = (x as unknown as { custom_question_version_id: string | null })
            .custom_question_version_id
          const c = vid ? byVid.get(vid) : undefined
          if (!c) continue
          const correctChoice = c.choices.find((ch) => ch.is_correct)
          x.question = {
            id: c.version_id,
            stem: c.stem,
            stem_image_svg: null,
            explanation: correctChoice?.explanation_correct ?? null,
            rit_band: null as unknown as Question['rit_band'],
            standard: c.standard_code
              ? { teks_code: c.standard_code, teks_title: c.standard_code }
              : null,
            choices: c.choices.map((ch) => ({
              id: ch.id,
              question_id: c.version_id,
              label: ch.label as Choice['label'],
              body: ch.text,
              body_image_svg: null,
              is_correct: ch.is_correct,
              misconception: ch.explanation_wrong,
              sort_order: ch.ordinal,
            })),
          } as unknown as QuestionFull
        }
      }
      if (cancelled) return
      setSession(s)
      setAttempts(a)
      setSavedRit(s.estimated_rit)
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const stats = useMemo(() => {
    if (!session) return null
    // planned_length is the canonical denominator. If a session ever ends
    // short (kid bails, picker hits hard fallback returning null), using
    // attempts.length or question_ids.length would drift.
    const total = session.planned_length
    const correctBands = attempts
      .filter((a) => a.is_correct && a.question && a.question.rit_band)
      .map((a) => a.question!.rit_band as RitBand)
    const rit = estimateRit(correctBands, total)
    const accuracy = total > 0 ? session.correct_count / total : 0
    const byStandard = new Map<string, { code: string; title: string; correct: number; total: number }>()
    for (const a of attempts) {
      if (!a.question || !a.question.standard) continue
      const key = a.question.standard.teks_code
      const row = byStandard.get(key) ?? {
        code: a.question.standard.teks_code,
        title: a.question.standard.teks_title,
        correct: 0,
        total: 0,
      }
      row.total += 1
      if (a.is_correct) row.correct += 1
      byStandard.set(key, row)
    }
    return {
      total,
      correct: session.correct_count,
      accuracy,
      rit,
      byStandard: Array.from(byStandard.values()).sort((x, y) =>
        x.correct / x.total === y.correct / y.total
          ? x.code.localeCompare(y.code)
          : x.correct / x.total - y.correct / y.total,
      ),
    }
  }, [session, attempts])

  useEffect(() => {
    if (!session || !stats) return
    // RIT estimate is only meaningful on the standard adaptive 'test' flow.
    // Boost is fixed-skill drill; Custom is parent-curated with a non-
    // representative topic mix — reporting a RIT for either would be
    // misleading.
    if (session.kind !== 'test') return
    if (savedRit === stats.rit) return
    void (async () => {
      const { error: uErr } = await supabase
        .from('map_test_sessions')
        .update({ estimated_rit: stats.rit })
        .eq('id', session.id)
      if (!uErr) setSavedRit(stats.rit)
    })()
  }, [session, stats, savedRit])

  if (error) {
    return (
      <div className="mx-auto max-w-2xl text-center">
        <div className="card mt-12 p-8">
          <p className="font-display text-2xl">Couldn’t load results.</p>
          <p className="mt-2 text-sm text-ink/60">{error}</p>
          <Link to="/" className="btn-primary mt-6">
            Back home
          </Link>
        </div>
      </div>
    )
  }
  if (!session || !stats) {
    return <p className="mx-auto mt-12 max-w-xl text-center font-display text-2xl">Loading…</p>
  }

  const misses = attempts.filter((a) => !a.is_correct && a.question)
  const accuracyPct = Math.round(stats.accuracy * 100)
  const isBoost = session.kind === 'boost'
  const isCustom = session.kind === 'custom'
  const cheer = isBoost
    ? accuracyPct >= 80
      ? '⚡ Skill unlocked!'
      : accuracyPct >= 50
        ? '⚡ Getting stronger!'
        : '⚡ Keep at it — your brain is growing!'
    : isCustom
      ? accuracyPct >= 90
        ? '🎯 Topic-perfect!'
        : accuracyPct >= 75
          ? '🎯 Strong drill!'
          : accuracyPct >= 50
            ? '🎯 Good practice!'
            : '🎯 Practice gets it — keep going.'
      : accuracyPct >= 90
        ? 'Amazing work!'
        : accuracyPct >= 75
          ? 'Great job!'
          : accuracyPct >= 50
            ? 'Nice effort!'
            : 'Keep practicing — every test makes you stronger.'
  const customRetryParams = isCustom && session.custom_config
    ? `?subject=${session.subject}&standard_ids=${session.custom_config.standard_ids.join(',')}`
    : ''

  return (
    <div className="mx-auto max-w-3xl">
      <section className="mt-4 animate-slideUp text-center">
        <p className="font-display text-lg uppercase tracking-widest text-smoke">
          {isBoost
            ? 'Boost recap'
            : isCustom
              ? `Custom ${session.subject} test`
              : `${session.subject} test results`}
        </p>
        <h1 className="font-display text-5xl">{cheer}</h1>
        {isBoost ? (
          <>
            <p className="mt-3 text-lg text-ink/70">
              You got {stats.correct} of {stats.total} right on this skill — keep going!
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <BigStat label="Right" value={`${stats.correct} / ${stats.total}`} />
              <BigStat label="On track" value={`${accuracyPct}%`} />
            </div>
          </>
        ) : isCustom ? (
          <>
            <p className="mt-3 text-lg text-ink/70">
              Drill complete — see how each topic landed below.
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <BigStat label="Score" value={`${stats.correct} / ${stats.total}`} />
              <BigStat label="Accuracy" value={`${accuracyPct}%`} />
            </div>
          </>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <BigStat label="Score" value={`${stats.correct} / ${stats.total}`} />
            <BigStat label="Accuracy" value={`${accuracyPct}%`} />
            <BigStat
              label="Estimated RIT"
              value={`${stats.rit}`}
              sub={
                stats.total < 15
                  ? `${gradeContext(stats.rit)} · rough estimate (short test)`
                  : gradeContext(stats.rit)
              }
            />
          </div>
        )}
      </section>

      {isCustom && customRetryParams && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Link
            to={`/parent/custom-test${customRetryParams}`}
            className="btn-secondary text-sm"
          >
            🎯 Build a similar test
          </Link>
          <Link to="/parent" className="btn-ghost text-sm">
            Back to parent
          </Link>
        </div>
      )}

      <section className="mt-10 animate-slideUp">
        <h2 className="mb-3 font-display text-2xl">By skill</h2>
        <div className="card divide-y divide-cloud/70">
          {stats.byStandard.length === 0 && (
            <p className="p-5 text-sm text-ink/60">No skill data yet.</p>
          )}
          {stats.byStandard.map((row) => {
            const pct = Math.round((row.correct / row.total) * 100)
            const tone =
              pct >= 80 ? 'bg-leaf' : pct >= 50 ? 'bg-sky' : 'bg-berry'
            return (
              <div key={row.code} className="flex items-center gap-4 p-4">
                <span className="font-mono text-xs font-semibold text-smoke">{row.code}</span>
                <div className="flex-1">
                  <p className="font-semibold leading-snug">{row.title}</p>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-cream">
                    <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <span className="font-mono text-sm font-semibold">
                  {row.correct}/{row.total}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      {misses.length > 0 && (
        <section className="mt-10 animate-slideUp">
          <h2 className="mb-3 font-display text-2xl">Let’s look at the tricky ones</h2>
          <div className="grid gap-4">
            {misses.map((a) => {
              if (!a.question) return null
              const correct = a.question.choices.find((c) => c.is_correct)
              const picked = a.question.choices.find((c) => c.id === a.selected_choice_id)
              return (
                <div key={a.id} className="card p-5">
                  <p className="font-display text-lg">{a.question.stem}</p>
                  {a.question.stem_image_svg && (
                    <SvgFigure svg={a.question.stem_image_svg} className="mt-3" />
                  )}
                  <div className="mt-3 grid gap-2 text-sm">
                    {picked && (
                      <p>
                        <span className="font-mono font-semibold text-berry">You picked {picked.label}:</span>{' '}
                        {picked.body}
                        {picked.misconception && (
                          <span className="ml-1 text-ink/70">— {picked.misconception}</span>
                        )}
                      </p>
                    )}
                    {correct && (
                      <p>
                        <span className="font-mono font-semibold text-leaf">Correct {correct.label}:</span>{' '}
                        {correct.body}
                      </p>
                    )}
                    {a.question.explanation && (
                      <p className="rounded-2xl bg-cream p-3 text-ink/85">{a.question.explanation}</p>
                    )}
                  </div>
                  {!(a as unknown as { custom_question_version_id?: string | null })
                    .custom_question_version_id && (
                    <div className="mt-3 flex justify-end">
                      <ReportQuestionButton
                        questionId={a.question.id}
                        sessionId={a.session_id}
                        studentId={a.student_id}
                        selectedChoiceId={a.selected_choice_id}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section className="mt-10 mb-12 flex flex-wrap items-center justify-center gap-3">
        <Link to={`/test/new?subject=${session.subject}`} className="btn-primary">
          Take another {session.subject} test
        </Link>
        <Link to="/history" className="btn-secondary">
          See history
        </Link>
        <Link to="/" className="btn-ghost">
          Home
        </Link>
      </section>
    </div>
  )
}

function BigStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-smoke">{label}</p>
      <p className="mt-1 font-display text-4xl">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink/60">{sub}</p>}
    </div>
  )
}
