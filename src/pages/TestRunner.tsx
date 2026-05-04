import confetti from 'canvas-confetti'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ProgressDots, { type DotState } from '../components/ProgressDots'
import SpeakerButton from '../components/SpeakerButton'
import SvgFigure from '../components/SvgFigure'
import SvgImage from '../components/SvgImage'
import { stopSpeaking } from '../lib/tts'
import { supabase } from '../lib/supabase'
import type { Attempt, Choice, Passage, Question, Session, Standard } from '../lib/types'
import { getNextAdaptiveQuestion } from '../lib/adaptive/picker'
import { addNextAdaptivePassage } from '../lib/adaptive/passagePicker'
import { loadCustomQuestionsByVersionIds, type LoadedCustomQuestion } from '../lib/customQuestionLoader'

// Loading overlay only shows after this many ms — fast picks feel instant,
// slow picks feel intentional. Per spec: 400ms.
const PICK_LOADING_THRESHOLD_MS = 400

interface LoadedQuestion extends Question {
  choices: Choice[]
  passage: Passage | null
  standard: Pick<Standard, 'teks_code' | 'teks_title'> | null
  // Phase 4 Cycle 2 — when truthy, this question came from the parent-authored
  // bank; rendering uses SvgImage (base64 <img>) instead of SvgFigure
  // (dangerouslySetInnerHTML), and submit uses map_record_custom_attempt.
  custom?: LoadedCustomQuestion
}

export default function TestRunner() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null>(null)
  const [questions, setQuestions] = useState<LoadedQuestion[]>([])
  const [attemptsByQ, setAttemptsByQ] = useState<Map<string, Attempt>>(new Map())
  const [viewIndex, setViewIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [picking, setPicking] = useState(false)
  const startedAtRef = useRef<number>(Date.now())

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
      const s = sess as Session
      if (s.status === 'completed') {
        navigate(`/test/${id}/results`, { replace: true })
        return
      }

      const [{ data: qs, error: qErr }, { data: atts, error: aErr }] = await Promise.all([
        supabase
          .from('map_questions')
          .select(
            `*, choices:map_question_choices(*), passage:map_reading_passages(*), standard:map_standards(teks_code, teks_title)`,
          )
          .in('id', s.question_ids),
        supabase
          .from('map_attempts')
          .select('*')
          .eq('session_id', s.id)
          .order('answered_at'),
      ])
      if (qErr) {
        setError(qErr.message)
        return
      }
      if (aErr) {
        setError(aErr.message)
        return
      }

      const byId = new Map<string, LoadedQuestion>()
      ;(qs ?? []).forEach((q) => {
        const loaded = q as unknown as LoadedQuestion
        loaded.choices = [...loaded.choices].sort((a, b) => a.sort_order - b.sort_order)
        byId.set(loaded.id, loaded)
      })

      // Phase 4 Cycle 2 — any question_ids that weren't found in map_questions
      // are treated as custom_question_version_ids and loaded from the
      // resolved view.
      const missingIds = s.question_ids.filter((qid) => !byId.has(qid))
      if (missingIds.length > 0) {
        try {
          const customs = await loadCustomQuestionsByVersionIds(missingIds)
          for (const c of customs) {
            byId.set(c.version_id, customToLoadedQuestion(c))
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not load custom questions.')
          return
        }
      }

      const ordered = s.question_ids
        .map((qid) => byId.get(qid))
        .filter((x): x is LoadedQuestion => Boolean(x))

      const map = new Map<string, Attempt>()
      ;(atts ?? []).forEach((a) => {
        const att = a as Attempt & { custom_question_version_id?: string | null }
        const key = att.question_id ?? att.custom_question_version_id
        if (key) map.set(key, att as Attempt)
      })

      if (cancelled) return
      setSession(s)
      setQuestions(ordered)
      setAttemptsByQ(map)
      setViewIndex(Math.min(s.current_index, Math.max(0, ordered.length - 1)))
    })()
    return () => {
      cancelled = true
    }
  }, [id, navigate])

  const current = useMemo(() => questions[viewIndex] ?? null, [questions, viewIndex])

  useEffect(() => {
    setSelected(null)
    startedAtRef.current = Date.now()
    stopSpeaking()
  }, [viewIndex])

  /**
   * Adaptive only: after an answer is recorded, ensure the next slot is loaded.
   * The picker writes to map_test_sessions.question_ids; this function fetches
   * any newly-added questions and appends to the local `questions` state so the
   * runner can render them without a full reload.
   *
   * The 400ms loading-state threshold lives here: a quick pick (<400ms) shows
   * no spinner; a slow pick shows "Picking your next question…".
   */
  const maybePickNextAdaptive = useCallback(
    async (sess: Session, currentQuestionIds: string[]): Promise<{
      newSession: Session
      newQuestions: LoadedQuestion[]
    } | null> => {
      if (!sess.is_adaptive) return null
      if (currentQuestionIds.length >= sess.planned_length) return null

      const loadingTimer = window.setTimeout(() => setPicking(true), PICK_LOADING_THRESHOLD_MS)
      try {
        if (sess.subject === 'reading') {
          await addNextAdaptivePassage(sess.id)
        } else {
          await getNextAdaptiveQuestion(sess.id)
        }
        // Re-read the session to learn which question_ids the picker added.
        const { data: refreshed, error: rErr } = await supabase
          .from('map_test_sessions')
          .select('*')
          .eq('id', sess.id)
          .single()
        if (rErr || !refreshed) throw rErr ?? new Error('Could not reload session.')
        const newSession = refreshed as Session
        const addedIds = newSession.question_ids.slice(currentQuestionIds.length)
        if (addedIds.length === 0) {
          return { newSession, newQuestions: [] }
        }
        // Fetch the newly added questions with full joins.
        const { data: addedQs, error: aErr } = await supabase
          .from('map_questions')
          .select(
            `*, choices:map_question_choices(*), passage:map_reading_passages(*), standard:map_standards(teks_code, teks_title)`,
          )
          .in('id', addedIds)
        if (aErr) throw aErr
        const byId = new Map<string, LoadedQuestion>()
        ;(addedQs ?? []).forEach((q) => {
          const loaded = q as unknown as LoadedQuestion
          loaded.choices = [...loaded.choices].sort((a, b) => a.sort_order - b.sort_order)
          byId.set(loaded.id, loaded)
        })
        const newQuestions = addedIds
          .map((qid) => byId.get(qid))
          .filter((x): x is LoadedQuestion => Boolean(x))
        return { newSession, newQuestions }
      } finally {
        window.clearTimeout(loadingTimer)
        setPicking(false)
      }
    },
    [],
  )

  // Adapter: shape a LoadedCustomQuestion so the existing TestRunner JSX (built
  // for vetted questions) can render it without changes. The `custom` reference
  // is preserved so the render path knows to use SvgImage for SVG fields.
  function customToLoadedQuestion(c: LoadedCustomQuestion): LoadedQuestion {
    return {
      // Question core fields
      id: c.version_id,
      subject: c.subject,
      grade: c.grade,
      stem: c.stem,
      stem_image_svg: null, // We render via custom.stem_svg + SvgImage instead.
      explanation: '', // Custom uses per-choice explanations; FeedbackPanel branches on `custom`.
      created_at: '',
      is_active: true,
      standard_id: null,
      rit_band: null as unknown as Question['rit_band'],
      difficulty: (c.difficulty ?? 1) as unknown as Question['difficulty'],
      passage_id: c.passage?.passage_id ?? null,
      source_note: null,
      audio_supported: false,
      // Joined relations
      choices: c.choices.map((ch) => ({
        id: ch.id,
        question_id: c.version_id,
        label: ch.label as Choice['label'],
        body: ch.text,
        body_image_svg: null,
        is_correct: ch.is_correct,
        sort_order: ch.ordinal,
        misconception: ch.explanation_wrong ?? null,
      })),
      passage: c.passage
        ? ({
            id: c.passage.passage_id,
            title: c.passage.title ?? '',
            body: c.passage.body,
            genre: (c.passage.genre as Passage['genre']) ?? 'literary',
            grade: c.grade,
            subject: c.subject,
            lexile_level: null,
            created_at: '',
            word_count: null,
            lexile: null,
            rit_band: null,
            source: null,
            topic: null,
          } as unknown as Passage)
        : null,
      standard: c.standard_code
        ? { teks_code: c.standard_code, teks_title: '' }
        : null,
      custom: c,
    }
  }

  // `total` is the canonical denominator for progress display — the number of
  // slots the test will eventually have, not the number currently loaded. Under
  // adaptive, questions.length grows from 3 → planned_length over the test.
  const total = session?.planned_length ?? questions.length
  const reviewingAttempt = current ? (attemptsByQ.get(current.id) ?? null) : null
  const hasAttempt = !!reviewingAttempt
  const displaySelectedId = reviewingAttempt?.selected_choice_id ?? selected
  const isAtCurrent = !!session && viewIndex === session.current_index
  const isLastQuestion = total > 0 && viewIndex === total - 1

  const dotStates: DotState[] = useMemo(() => {
    if (!session) return []
    const states: DotState[] = []
    for (let i = 0; i < total; i++) {
      const q = questions[i]
      if (q) {
        const a = attemptsByQ.get(q.id)
        if (a) {
          states.push(a.is_correct ? 'correct' : 'wrong')
          continue
        }
      }
      if (i === session.current_index) states.push('current')
      else states.push('pending')
    }
    return states
  }, [questions, attemptsByQ, session, total])

  const submit = useCallback(async () => {
    if (!session || !current || !selected || hasAttempt || submitting) return
    setSubmitting(true)
    const choice = current.choices.find((c) => c.id === selected)
    if (!choice) {
      setSubmitting(false)
      return
    }
    const correct = choice.is_correct
    const elapsed = Date.now() - startedAtRef.current

    if (!session.student_id) {
      setError('Session is missing a student id; cannot save your answer.')
      setSubmitting(false)
      return
    }
    // Phase 4 Cycle 2: branch on source. Custom questions write the
    // polymorphic custom_question_version_id column; the XOR check on
    // map_attempts ensures question_id stays NULL for these rows.
    const { data: attemptId, error: aErr } = current.custom
      ? await supabase.rpc('map_record_custom_attempt', {
          p_session_id: session.id,
          p_student_id: session.student_id,
          p_custom_question_version_id: current.id,
          p_choice_id: choice.id,
          p_time_ms: elapsed,
        })
      : await supabase.rpc('map_record_attempt', {
          p_session_id: session.id,
          p_student_id: session.student_id,
          p_question_id: current.id,
          p_choice_id: choice.id,
          p_time_ms: elapsed,
        })
    if (aErr || !attemptId) {
      setError(aErr?.message ?? 'Could not save your answer.')
      setSubmitting(false)
      return
    }

    const newCorrect = session.correct_count + (correct ? 1 : 0)
    const { error: sErr } = await supabase
      .from('map_test_sessions')
      .update({ correct_count: newCorrect })
      .eq('id', session.id)
    if (sErr) setError(sErr.message)

    const insertedAttempt: Attempt = {
      id: attemptId as string,
      session_id: session.id,
      student_id: session.student_id,
      question_id: current.id,
      selected_choice_id: choice.id,
      is_correct: correct,
      time_spent_ms: elapsed,
      answered_at: new Date().toISOString(),
    }
    setAttemptsByQ((prev) => {
      const next = new Map(prev)
      next.set(current.id, insertedAttempt)
      return next
    })
    const sessionAfterAnswer: Session = { ...session, correct_count: newCorrect }
    setSession(sessionAfterAnswer)
    setSubmitting(false)

    if (correct) {
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#FFB703', '#3B82F6', '#16A34A', '#E11D48'],
        scalar: 0.9,
      })
    }

    // Adaptive: pre-fetch the next question(s) into the buffer so goNext finds
    // them already loaded. Non-adaptive sessions skip this entirely.
    // TODO: remove the non-adaptive code path when no in-progress legacy
    // sessions remain. Run `npx tsx scripts/check-legacy-sessions.mjs` to see.
    if (sessionAfterAnswer.is_adaptive) {
      try {
        const result = await maybePickNextAdaptive(
          sessionAfterAnswer,
          sessionAfterAnswer.question_ids,
        )
        if (result) {
          setSession(result.newSession)
          if (result.newQuestions.length > 0) {
            setQuestions((prev) => [...prev, ...result.newQuestions])
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not pick the next question.'
        setError(msg)
      }
    }
  }, [session, current, selected, hasAttempt, submitting, maybePickNextAdaptive])

  const goNext = useCallback(async () => {
    if (!session) return
    if (viewIndex === session.current_index && hasAttempt) {
      const nextIndex = viewIndex + 1
      // Test completion fires from current_index reaching planned_length, not
      // from running off the questions array. Adaptive's questions array may
      // be ≤ planned_length until the last pick lands.
      if (nextIndex >= session.planned_length) {
        const { error: completeErr } = await supabase
          .from('map_test_sessions')
          .update({
            current_index: session.planned_length,
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', session.id)
        if (completeErr) {
          setError(completeErr.message)
          return
        }
        navigate(`/test/${session.id}/results`)
        return
      }
      const { error: uErr } = await supabase
        .from('map_test_sessions')
        .update({ current_index: nextIndex })
        .eq('id', session.id)
      if (uErr) setError(uErr.message)
      setSession({ ...session, current_index: nextIndex })
      setViewIndex(nextIndex)
      return
    }
    if (viewIndex < total - 1) setViewIndex(viewIndex + 1)
  }, [session, viewIndex, hasAttempt, total, navigate])

  const goPrev = useCallback(() => {
    setViewIndex((i) => (i > 0 ? i - 1 : i))
  }, [])

  const goTo = useCallback(
    (index: number) => {
      if (!session) return
      const clamped = Math.max(0, Math.min(index, session.current_index))
      setViewIndex(clamped)
    },
    [session],
  )

  const goToCurrent = useCallback(() => {
    if (!session) return
    setViewIndex(session.current_index)
  }, [session])

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-6 py-12 text-center">
        <div className="card p-8">
          <p className="font-display text-2xl">Something went wrong.</p>
          <p className="mt-2 text-sm text-ink/60">{error}</p>
          <Link to="/" className="btn-primary mt-6">
            Back home
          </Link>
        </div>
      </div>
    )
  }

  if (!session || !current) {
    return (
      <div className="mx-auto max-w-xl px-6 py-12 text-center">
        <p className="font-display text-2xl">Loading test…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-5 pb-24 pt-6">
      {picking && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 backdrop-blur-sm">
          <div className="rounded-2xl bg-white p-6 shadow-xl ring-1 ring-cloud">
            <div className="flex items-center gap-3">
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-sky border-t-transparent" />
              <p className="font-display text-lg">Picking your next question…</p>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <Link
          to="/"
          onClick={stopSpeaking}
          className="btn-ghost text-sm"
          title="Save and finish later"
        >
          ✕ Save & exit
        </Link>
        <ProgressDots states={dotStates} active={viewIndex} onSelect={goTo} />
        <div className="flex items-center gap-2">
          {session.kind === 'custom' && (
            <span
              className="rounded-full bg-sun/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-ink/70"
              title="A grown-up built this test for you."
            >
              🎯 Custom
            </span>
          )}
          {session.kind === 'boost' && (
            <span className="rounded-full bg-sky/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-sky">
              ⚡ Boost
            </span>
          )}
          <span className="pill">
            {viewIndex + 1} / {total}
          </span>
        </div>
      </div>

      {!isAtCurrent && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-sky/10 px-4 py-3 ring-1 ring-sky/30">
          <p className="text-sm font-semibold text-ink/80">
            Reviewing question {viewIndex + 1}. Your spot is question{' '}
            {session.current_index + 1}.
          </p>
          <button
            type="button"
            onClick={goToCurrent}
            className="text-sm font-display font-semibold text-sky hover:underline"
          >
            Back to current →
          </button>
        </div>
      )}

      {current.passage && (
        <PassagePanel
          passage={current.passage}
          customSvg={current.custom?.passage?.passage_svg ?? null}
          customSvgAlt={current.custom?.passage?.passage_svg_alt_text ?? null}
          isCustom={!!current.custom}
        />
      )}

      <section className="mt-6 animate-slideUp">
        <div className="card p-6">
          <div className="flex items-start gap-3">
            <SpeakerButton text={current.stem} label="Read the question aloud" />
            <h2 className="font-display text-2xl leading-snug md:text-3xl">{current.stem}</h2>
            {current.custom && (
              <span
                className="ml-auto rounded-full bg-sun/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-ink/70"
                title="A grown-up wrote this question for you."
              >
                By you
              </span>
            )}
          </div>
          {current.custom?.stem_svg ? (
            <SvgImage
              svg={current.custom.stem_svg}
              altText={current.custom.stem_svg_alt_text ?? 'Figure'}
              className="mt-5"
            />
          ) : current.stem_image_svg ? (
            <SvgFigure svg={current.stem_image_svg} className="mt-5" />
          ) : null}
        </div>

        <div className="mt-5 grid gap-3">
          {current.choices.map((c) => {
            const chosen = displaySelectedId === c.id
            const showFeedback = hasAttempt
            const isThisCorrect = showFeedback && c.is_correct
            const isThisWrong = showFeedback && chosen && !c.is_correct
            const muted = showFeedback && !isThisCorrect && !isThisWrong
            return (
              <button
                key={c.id}
                type="button"
                disabled={hasAttempt}
                onClick={() => setSelected(c.id)}
                className={`choice ${chosen && !showFeedback ? 'ring-2 ring-sky' : ''} ${
                  isThisCorrect ? 'bg-leaf/15 ring-2 ring-leaf' : ''
                } ${isThisWrong ? 'bg-berry/10 ring-2 ring-berry' : ''} ${
                  muted ? 'opacity-60' : ''
                } ${hasAttempt ? 'cursor-default' : ''}`}
              >
                <span
                  className={`choice-letter ${
                    isThisCorrect
                      ? 'bg-leaf text-white ring-leaf'
                      : isThisWrong
                        ? 'bg-berry text-white ring-berry'
                        : chosen && !showFeedback
                          ? 'bg-sky text-white ring-sky'
                          : ''
                  }`}
                >
                  {c.label}
                </span>
                <span className="flex-1 text-base font-semibold leading-snug md:text-lg">
                  {c.body}
                </span>
                {(() => {
                  const customChoice = current.custom?.choices.find((cc) => cc.id === c.id)
                  if (customChoice?.choice_svg) {
                    return (
                      <SvgImage
                        svg={customChoice.choice_svg}
                        altText={customChoice.choice_svg_alt_text ?? 'Choice figure'}
                        className="ml-auto h-24 w-24"
                        maxWidth={96}
                      />
                    )
                  }
                  if (c.body_image_svg) {
                    return <SvgFigure svg={c.body_image_svg} className="ml-auto h-24 w-24 p-2" />
                  }
                  return null
                })()}
              </button>
            )
          })}
        </div>

        {hasAttempt && (() => {
          // Custom-question explanation lives per-choice on the chosen
          // answer. Vetted-question explanation is one-per-question.
          const chosenId = reviewingAttempt?.selected_choice_id
          let explanation = current.explanation
          let misconception =
            current.choices.find((c) => c.id === chosenId)?.misconception ?? null
          if (current.custom) {
            const cc = current.custom.choices.find((c) => c.id === chosenId)
            if (cc) {
              explanation = reviewingAttempt?.is_correct
                ? cc.explanation_correct ?? ''
                : cc.explanation_wrong ?? cc.explanation_correct ?? ''
              misconception = cc.explanation_wrong ?? null
            }
          }
          return (
            <FeedbackPanel
              isCorrect={!!reviewingAttempt?.is_correct}
              explanation={explanation}
              misconception={misconception}
              standardCode={current.standard?.teks_code ?? null}
            />
          )
        })()}
      </section>

      <div className="sticky bottom-4 mt-8 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={viewIndex === 0}
          className="btn-secondary disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Previous
        </button>
        {!hasAttempt ? (
          <button
            type="button"
            disabled={!selected || submitting}
            onClick={submit}
            className="btn-primary text-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Checking…' : 'Check answer'}
          </button>
        ) : (
          <button type="button" onClick={goNext} className="btn-primary text-lg">
            {isAtCurrent && isLastQuestion ? 'See your results →' : 'Next question →'}
          </button>
        )}
      </div>
    </div>
  )
}

function PassagePanel({
  passage,
  customSvg,
  customSvgAlt,
  isCustom,
}: {
  passage: Passage
  customSvg?: string | null
  customSvgAlt?: string | null
  isCustom?: boolean
}) {
  return (
    <section className="mt-6">
      <div className="card p-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-smoke">
              {passage.genre}
              {isCustom && (
                <span className="ml-2 rounded-full bg-sun/25 px-2 py-0.5 text-[10px] font-semibold text-ink/70">
                  By you
                </span>
              )}
            </p>
            <h2 className="font-display text-2xl">{passage.title}</h2>
          </div>
          <SpeakerButton text={`${passage.title}. ${passage.body}`} label="Read passage aloud" />
        </div>
        {customSvg && (
          <SvgImage svg={customSvg} altText={customSvgAlt ?? 'Passage figure'} className="my-3" />
        )}
        <div className="prose prose-slate max-w-none whitespace-pre-line text-base leading-relaxed text-ink/90">
          {passage.body}
        </div>
      </div>
    </section>
  )
}

function FeedbackPanel({
  isCorrect,
  explanation,
  misconception,
  standardCode,
}: {
  isCorrect: boolean
  explanation: string | null
  misconception: string | null
  standardCode: string | null
}) {
  return (
    <div
      className={`mt-5 animate-slideUp rounded-3xl p-5 ring-1 ${
        isCorrect ? 'bg-leaf/10 ring-leaf/40' : 'bg-sun/15 ring-sun/40'
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`grid h-10 w-10 place-items-center rounded-full text-lg font-bold text-white ${
            isCorrect ? 'bg-leaf' : 'bg-sun text-ink'
          }`}
        >
          {isCorrect ? '★' : '↻'}
        </span>
        <p className="font-display text-2xl">
          {isCorrect ? 'You got it!' : 'Not quite — let’s look at it together.'}
        </p>
      </div>
      {!isCorrect && misconception && (
        <p className="mt-3 text-sm font-semibold text-ink/80">
          What might have happened: <span className="font-normal">{misconception}</span>
        </p>
      )}
      {explanation && <p className="mt-3 text-base leading-relaxed text-ink/85">{explanation}</p>}
      {standardCode && (
        <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-smoke">
          Topic {standardCode}
        </p>
      )}
    </div>
  )
}
