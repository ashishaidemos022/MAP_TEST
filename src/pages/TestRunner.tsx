import confetti from 'canvas-confetti'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ProgressDots, { type DotState } from '../components/ProgressDots'
import SpeakerButton from '../components/SpeakerButton'
import SvgFigure from '../components/SvgFigure'
import { stopSpeaking } from '../lib/tts'
import { supabase } from '../lib/supabase'
import type { Attempt, Choice, Passage, Question, Session, Standard } from '../lib/types'
import { getNextAdaptiveQuestion } from '../lib/adaptive/picker'
import { addNextAdaptivePassage } from '../lib/adaptive/passagePicker'

// Loading overlay only shows after this many ms — fast picks feel instant,
// slow picks feel intentional. Per spec: 400ms.
const PICK_LOADING_THRESHOLD_MS = 400

interface LoadedQuestion extends Question {
  choices: Choice[]
  passage: Passage | null
  standard: Pick<Standard, 'teks_code' | 'teks_title'> | null
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
      const ordered = s.question_ids
        .map((qid) => byId.get(qid))
        .filter((x): x is LoadedQuestion => Boolean(x))

      const map = new Map<string, Attempt>()
      ;(atts ?? []).forEach((a) => map.set((a as Attempt).question_id, a as Attempt))

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
    const { data: attemptId, error: aErr } = await supabase.rpc('map_record_attempt', {
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

      {current.passage && <PassagePanel passage={current.passage} />}

      <section className="mt-6 animate-slideUp">
        <div className="card p-6">
          <div className="flex items-start gap-3">
            <SpeakerButton text={current.stem} label="Read the question aloud" />
            <h2 className="font-display text-2xl leading-snug md:text-3xl">{current.stem}</h2>
          </div>
          {current.stem_image_svg && <SvgFigure svg={current.stem_image_svg} className="mt-5" />}
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
                {c.body_image_svg && (
                  <SvgFigure svg={c.body_image_svg} className="ml-auto h-24 w-24 p-2" />
                )}
              </button>
            )
          })}
        </div>

        {hasAttempt && (
          <FeedbackPanel
            isCorrect={!!reviewingAttempt?.is_correct}
            explanation={current.explanation}
            misconception={
              current.choices.find((c) => c.id === reviewingAttempt?.selected_choice_id)
                ?.misconception ?? null
            }
            standardCode={current.standard?.teks_code ?? null}
          />
        )}
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

function PassagePanel({ passage }: { passage: Passage }) {
  return (
    <section className="mt-6">
      <div className="card p-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-smoke">
              {passage.genre}
            </p>
            <h2 className="font-display text-2xl">{passage.title}</h2>
          </div>
          <SpeakerButton text={`${passage.title}. ${passage.body}`} label="Read passage aloud" />
        </div>
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
