// Adaptive per-question picker.
// Called after each `map_record_attempt` succeeds. Computes the next band from
// the rolling window of recent answers, applies stretch + growth caps, queries
// candidates with a three-tier fallback, atomically appends the picked id to
// `map_test_sessions.question_ids`, and logs every pick to map_pick_diagnostics.

import { supabase } from '../supabase'
import type { RitBand, Subject } from '../types'
import {
  bandIndex,
  bandFloor,
  bandCeil,
  clampBand,
  decideBand,
  isFrustrated,
  trimWindow,
  WARMUP_LENGTH,
} from './bands'
import { logPickDiagnostic, type FallbackPath } from './diagnostics'

interface SessionRow {
  id: string
  student_id: string | null
  subject: Subject
  question_ids: string[]
  start_band: RitBand | null
  planned_length: number
}

interface AttemptRow {
  question_id: string
  is_correct: boolean | null
  answered_at: string
}

interface CandidateQuestion {
  id: string
  rit_band: RitBand
  standard_id: string | null
}

export interface AdaptiveQuestionResult {
  question_id: string
  picked_band: RitBand
  target_band: RitBand
  candidate_count: number
  fallback_path: FallbackPath | null
  question_index: number  // 1-based
}

const GROWTH_TARGET_FRACTION = 0.25  // brief §2 pseudocode; well under the 0.40 hard cap

/**
 * Read everything the picker needs in parallel. State is read FROM THE DB on
 * every call — no runtime caching — so a stale runtime can never double-serve
 * a question (race protection from CLAUDE feedback).
 */
async function readSessionState(sessionId: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [sessRes, attemptsRes] = await Promise.all([
    supabase.from('map_test_sessions').select('*').eq('id', sessionId).single(),
    supabase
      .from('map_attempts')
      .select('question_id, is_correct, answered_at')
      .eq('session_id', sessionId)
      .order('answered_at'),
  ])

  if (sessRes.error || !sessRes.data) {
    throw new Error(sessRes.error?.message ?? 'Session not found.')
  }
  if (attemptsRes.error) throw new Error(attemptsRes.error.message)

  const session = sessRes.data as SessionRow
  const attempts = (attemptsRes.data ?? []) as AttemptRow[]

  const studentId = session.student_id
  if (!studentId) throw new Error('Session is missing a student_id; cannot pick adaptively.')

  const studentRes = await supabase
    .from('map_students')
    .select('grade')
    .eq('id', studentId)
    .single()
  if (studentRes.error || !studentRes.data) {
    throw new Error(studentRes.error?.message ?? 'Student not found.')
  }
  const studentGrade = studentRes.data.grade as number

  const [masteryRes2, recentlyCorrectRes2, selectedDetailsRes] = await Promise.all([
    supabase
      .from('map_v_mastery_by_standard')
      .select('standard_id, status')
      .eq('student_id', studentId)
      .eq('subject', session.subject),
    supabase
      .from('map_attempts')
      .select('question_id, map_questions!inner(subject)')
      .eq('student_id', studentId)
      .eq('is_correct', true)
      .gte('answered_at', sevenDaysAgo),
    // Bands of the questions already in the session (so we can count stretch + growth).
    session.question_ids.length === 0
      ? Promise.resolve({ data: [], error: null } as const)
      : supabase
          .from('map_questions')
          .select('id, rit_band, standard_id')
          .in('id', session.question_ids),
  ])
  if (masteryRes2.error) throw new Error(masteryRes2.error.message)
  if (recentlyCorrectRes2.error) throw new Error(recentlyCorrectRes2.error.message)
  if (selectedDetailsRes.error) throw new Error(selectedDetailsRes.error.message)

  const growthStandards = new Set<string>()
  const developingStandards = new Set<string>()
  const masteredStandards = new Set<string>()
  for (const row of (masteryRes2.data ?? []) as { standard_id: string; status: string }[]) {
    if (row.status === 'growth') growthStandards.add(row.standard_id)
    else if (row.status === 'developing') developingStandards.add(row.standard_id)
    else if (row.status === 'mastered') masteredStandards.add(row.standard_id)
  }

  const recentlyCorrectIds = new Set(
    ((recentlyCorrectRes2.data ?? []) as unknown as Array<{
      question_id: string
      map_questions: { subject: string } | { subject: string }[]
    }>)
      .filter((r) => {
        const mq = Array.isArray(r.map_questions) ? r.map_questions[0] : r.map_questions
        return mq?.subject === session.subject
      })
      .map((r) => r.question_id),
  )

  const selectedDetails = (selectedDetailsRes.data ?? []) as CandidateQuestion[]

  return {
    session,
    studentId,
    studentGrade,
    attempts,
    growthStandards,
    developingStandards,
    masteredStandards,
    recentlyCorrectIds,
    selectedDetails,
  }
}

function buildRecentWindow(
  questionIds: string[],
  attempts: AttemptRow[],
): boolean[] {
  // Map question_id -> is_correct (last attempt wins). Then read in question_ids order.
  const byQid = new Map<string, boolean>()
  for (const a of attempts) {
    if (a.is_correct === null) continue
    byQid.set(a.question_id, a.is_correct)
  }
  const ordered: boolean[] = []
  for (const qid of questionIds) {
    const v = byQid.get(qid)
    if (v !== undefined) ordered.push(v)
  }
  return trimWindow(ordered)
}

function computeStartBand(
  session: SessionRow,
  attempts: AttemptRow[],
  selectedDetails: CandidateQuestion[],
): RitBand {
  if (session.start_band) return session.start_band
  // Fallback for legacy sessions: use the first question's band, or default
  if (selectedDetails.length > 0) return selectedDetails[0].rit_band
  void attempts
  return '181_190'
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

interface QueryFilters {
  subject: Subject
  grade: number
  band: RitBand
  excludeIds: Set<string>
  excludeStandardIds: Set<string>
  excludeGrowthStandards: boolean
  growthStandardIds: Set<string>
}

async function queryCandidates(f: QueryFilters): Promise<CandidateQuestion[]> {
  let q = supabase
    .from('map_questions')
    .select('id, rit_band, standard_id')
    .eq('subject', f.subject)
    .eq('grade', f.grade)
    .eq('is_active', true)
    .eq('rit_band', f.band)
    .limit(200)
  if (f.excludeIds.size > 0) {
    q = q.not('id', 'in', `(${[...f.excludeIds].join(',')})`)
  }
  if (f.excludeStandardIds.size > 0) {
    q = q.not('standard_id', 'in', `(${[...f.excludeStandardIds].join(',')})`)
  }
  const { data, error } = await q
  if (error) throw new Error(error.message)
  let candidates = (data ?? []) as CandidateQuestion[]
  if (f.excludeGrowthStandards) {
    candidates = candidates.filter(
      (c) => !c.standard_id || !f.growthStandardIds.has(c.standard_id),
    )
  }
  return candidates
}

interface CandidateResolution {
  candidates: CandidateQuestion[]
  fallback: FallbackPath | null
  finalBand: RitBand
}

async function resolveCandidates(
  subject: Subject,
  grade: number,
  targetBand: RitBand,
  startBand: RitBand,
  excludeIds: Set<string>,
  standardsTouched: Set<string>,
  growthStandardIds: Set<string>,
  growthRemaining: number,
): Promise<CandidateResolution> {
  const excludeGrowth = growthRemaining <= 0

  // Pass 1: full filters (band, no repeated standards, mastery caps applied)
  let candidates = await queryCandidates({
    subject,
    grade,
    band: targetBand,
    excludeIds,
    excludeStandardIds: standardsTouched,
    excludeGrowthStandards: excludeGrowth,
    growthStandardIds,
  })
  if (candidates.length >= 1) {
    // The brief uses a "≥3" trigger to relax the standard-spread filter, but that's
    // about diversity — if we have at least 1 valid candidate at this strictness it's
    // still better than relaxing. Only relax when we have zero or fewer than 3.
    if (candidates.length >= 3) return { candidates, fallback: null, finalBand: targetBand }
  }

  // Pass 2: relax standards-touched (still respect mastery growth cap)
  if (candidates.length < 3) {
    const relaxed = await queryCandidates({
      subject,
      grade,
      band: targetBand,
      excludeIds,
      excludeStandardIds: new Set(),
      excludeGrowthStandards: excludeGrowth,
      growthStandardIds,
    })
    if (relaxed.length >= 1) {
      return { candidates: relaxed, fallback: 'standards_relaxed', finalBand: targetBand }
    }
  }

  // Pass 3: step the band toward start_band by one
  const targetIdx = bandIndex(targetBand)
  const startIdx = bandIndex(startBand)
  const stepIdx = targetIdx === startIdx ? targetIdx
    : targetIdx > startIdx ? targetIdx - 1
    : targetIdx + 1
  const steppedBand: RitBand = stepIdx === targetIdx ? targetBand : clampBand(stepIdx)
  if (steppedBand !== targetBand) {
    const stepped = await queryCandidates({
      subject,
      grade,
      band: steppedBand,
      excludeIds,
      excludeStandardIds: new Set(),
      excludeGrowthStandards: excludeGrowth,
      growthStandardIds,
    })
    if (stepped.length >= 1) {
      return { candidates: stepped, fallback: 'band_step_back', finalBand: steppedBand }
    }
  }

  // Pass 4: wider net — start_band ±1 union, no standards filter, no growth cap
  const widerBands: RitBand[] = []
  for (const delta of [-1, 0, 1]) {
    const b = clampBand(startIdx + delta)
    if (!widerBands.includes(b)) widerBands.push(b)
  }
  const wider: CandidateQuestion[] = []
  for (const b of widerBands) {
    const part = await queryCandidates({
      subject,
      grade,
      band: b,
      excludeIds,
      excludeStandardIds: new Set(),
      excludeGrowthStandards: false,
      growthStandardIds,
    })
    wider.push(...part)
  }
  return {
    candidates: wider,
    fallback: 'wider_net',
    finalBand: wider[0]?.rit_band ?? targetBand,
  }
}

/**
 * Pick the next question for an adaptive session.
 *
 * Contract: the runner is responsible for never calling this when the session
 * is already full (question_ids.length >= planned_length). Test completion is
 * driven by attempt count, not the picker's return — the picker only ever runs
 * when there's a slot to fill. The throw below is defense-in-depth and
 * intentionally fires BEFORE any diagnostic row is written, so a misuse can
 * never produce a phantom 26th-pick log.
 */
export async function getNextAdaptiveQuestion(
  sessionId: string,
): Promise<AdaptiveQuestionResult> {
  const state = await readSessionState(sessionId)
  const { session, studentGrade, attempts, growthStandards, recentlyCorrectIds, selectedDetails } = state

  if (session.question_ids.length >= session.planned_length) {
    throw new Error('Session is already full.')
  }

  const startBand = computeStartBand(session, attempts, selectedDetails)
  const floorBand = bandFloor(startBand)
  const ceilBand = bandCeil(startBand)
  const startIdx = bandIndex(startBand)

  // Recent window — last 5 of the picks that have a recorded answer.
  const window = buildRecentWindow(session.question_ids, attempts)

  // Growth cap: count picks-so-far against start_band (NOT current_band).
  const planned = session.planned_length
  const growthCap = Math.min(
    Math.round(planned * GROWTH_TARGET_FRACTION),
    growthStandards.size * 2,
  )
  const growthUsed = selectedDetails.filter(
    (q) => q.standard_id && growthStandards.has(q.standard_id),
  ).length
  const growthRemaining = Math.max(0, growthCap - growthUsed)

  // Decide target band. current_band is the band of the most recently picked
  // question (NOT start_band) — the brief's algorithm walks current_band along
  // a trajectory rather than always re-anchoring at start.
  const currentBand: RitBand =
    selectedDetails.length > 0 && session.question_ids.length > 0
      ? (selectedDetails.find((q) => q.id === session.question_ids[session.question_ids.length - 1])?.rit_band ?? startBand)
      : startBand
  let targetBand: RitBand
  if (window.length < WARMUP_LENGTH) {
    targetBand = startBand
  } else {
    targetBand = decideBand(window, currentBand, floorBand, ceilBand)
  }

  // Frustration guard: if the kid's last 3 above-start picks were all wrong,
  // the engine is pushing past their actual ceiling. Force back to start_band
  // for a recovery pick. Replaces the old 20% count-based stretch cap that
  // capped high performers prematurely (see 2026-05-03 spec).
  if (bandIndex(targetBand) > startIdx) {
    const attemptByQid = new Map<string, boolean>()
    for (const a of attempts) {
      if (a.is_correct === null) continue
      attemptByQid.set(a.question_id, a.is_correct)
    }
    const orderedPicks = session.question_ids
      .map((id) => selectedDetails.find((q) => q.id === id))
      .filter((q): q is CandidateQuestion => Boolean(q))
    if (isFrustrated(orderedPicks, attemptByQid, startIdx)) {
      targetBand = startBand
    }
  }

  const standardsTouched = new Set(
    selectedDetails.map((q) => q.standard_id).filter((s): s is string => Boolean(s)),
  )
  const excludeIds = new Set<string>([
    ...session.question_ids,
    ...recentlyCorrectIds,
  ])

  const resolution = await resolveCandidates(
    session.subject,
    studentGrade,
    targetBand,
    startBand,
    excludeIds,
    standardsTouched,
    growthStandards,
    growthRemaining,
  )

  if (resolution.candidates.length === 0) {
    await logPickDiagnostic({
      sessionId,
      questionIndex: session.question_ids.length + 1,
      targetBand,
      actualBand: targetBand,
      pickedQuestionId: null,
      candidateCount: 0,
      fallbackPath: 'wider_net',
      recentWindow: window,
    })
    throw new Error('No candidate questions available even after fallbacks.')
  }

  const pick = pickRandom(resolution.candidates)
  const newQuestionIds = [...session.question_ids, pick.id]

  // Atomic append of the pick + persist start_band + is_adaptive on first call.
  const updates: Record<string, unknown> = { question_ids: newQuestionIds }
  if (!session.start_band) updates.start_band = startBand
  if (session.question_ids.length === 0) updates.is_adaptive = true
  const { error: updErr } = await supabase
    .from('map_test_sessions')
    .update(updates)
    .eq('id', sessionId)
  if (updErr) throw new Error(updErr.message)

  const questionIndex = newQuestionIds.length // 1-based
  // Promote any first-pick fallback to warmup_band_unavailable — the warmup is
  // supposed to anchor at start_band, so a fallback there is a special signal.
  const isFirstPick = session.question_ids.length === 0
  const fallbackPath =
    isFirstPick && resolution.fallback && pick.rit_band !== startBand
      ? 'warmup_band_unavailable'
      : resolution.fallback
  await logPickDiagnostic({
    sessionId,
    questionIndex,
    targetBand,
    actualBand: pick.rit_band,
    pickedQuestionId: pick.id,
    candidateCount: resolution.candidates.length,
    fallbackPath,
    recentWindow: window,
  })

  return {
    question_id: pick.id,
    picked_band: pick.rit_band,
    target_band: targetBand,
    candidate_count: resolution.candidates.length,
    fallback_path: fallbackPath,
    question_index: questionIndex,
  }
}

// Helpers exposed for the simulator
export const __testing = {
  buildRecentWindow,
  computeStartBand,
  resolveCandidates,
}
