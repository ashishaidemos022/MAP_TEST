// Adaptive picker for reading sessions. Operates at PASSAGE grain, not question.
// §4 of the brief: the band decision is made between passages, never within.
// One passage append = N questions appended at once (typically 4–6).
//
// Window mechanics: after each completed passage, accuracy is computed and a
// single boolean (accuracy >= 0.60) is appended to the rolling window.

import { supabase } from '../supabase'
import type { RitBand } from '../types'
import {
  bandIndex,
  bandFloor,
  bandCeil,
  clampBand,
  decideBand,
  trimWindow,
  WARMUP_LENGTH,
} from './bands'
import { logPickDiagnostic, type FallbackPath } from './diagnostics'

const PASSAGE_RECENCY_DAYS = 14
const READING_PASSAGE_ACC_THRESHOLD = 0.6
const READING_STRETCH_CAP_PER_SESSION = 1

interface SessionRow {
  id: string
  student_id: string | null
  subject: string
  question_ids: string[]
  start_band: RitBand | null
  planned_length: number
}

interface PassageRow {
  id: string
  rit_band: RitBand
}

interface AttemptRow {
  question_id: string
  is_correct: boolean | null
  answered_at: string
}

interface QuestionWithPassage {
  id: string
  rit_band: RitBand
  passage_id: string | null
  standard_id: string | null
}

export interface AdaptivePassageResult {
  passage_id: string
  question_ids_added: string[]
  picked_band: RitBand
  target_band: RitBand
  fallback_path: FallbackPath | null
  candidate_count: number
}

/**
 * Append the next passage's questions to a reading session.
 *
 * Contract: caller (runner / sessionBuilder) ensures `question_ids.length <
 * planned_length` before calling. The picker stops appending once the next
 * passage's questions would overflow planned_length and trims to fit, so the
 * total never overshoots.
 */
export async function addNextAdaptivePassage(
  sessionId: string,
): Promise<AdaptivePassageResult> {
  const fourteenDaysAgo = new Date(
    Date.now() - PASSAGE_RECENCY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

  const [sessRes, attemptsRes, allPassagesRes] = await Promise.all([
    supabase.from('map_test_sessions').select('*').eq('id', sessionId).single(),
    supabase
      .from('map_attempts')
      .select('question_id, is_correct, answered_at')
      .eq('session_id', sessionId)
      .order('answered_at'),
    supabase.from('map_reading_passages').select('id, rit_band'),
  ])
  if (sessRes.error || !sessRes.data) {
    throw new Error(sessRes.error?.message ?? 'Session not found.')
  }
  if (attemptsRes.error) throw new Error(attemptsRes.error.message)
  if (allPassagesRes.error) throw new Error(allPassagesRes.error.message)

  const session = sessRes.data as SessionRow
  if (session.subject !== 'reading') {
    throw new Error('addNextAdaptivePassage is only for reading sessions.')
  }
  if (session.question_ids.length >= session.planned_length) {
    throw new Error('Session is already full.')
  }

  const studentId = session.student_id
  if (!studentId) throw new Error('Session is missing a student_id; cannot pick adaptively.')
  const attempts = (attemptsRes.data ?? []) as AttemptRow[]
  const rawPassages = (allPassagesRes.data ?? []) as PassageRow[]

  // Passages are grade-scoped via the questions that point to them, not by a
  // direct column. Restrict to passages with ≥1 active reading question at the
  // student's grade so a Grade 3 reading session doesn't fall back into Grade 2
  // passages.
  const studentRes = await supabase
    .from('map_students')
    .select('grade')
    .eq('id', studentId)
    .single()
  if (studentRes.error || !studentRes.data) {
    throw new Error(studentRes.error?.message ?? 'Student not found.')
  }
  const studentGrade = studentRes.data.grade as number

  const { data: gradePassageRows, error: gpErr } = await supabase
    .from('map_questions')
    .select('passage_id')
    .eq('subject', 'reading')
    .eq('grade', studentGrade)
    .eq('is_active', true)
    .not('passage_id', 'is', null)
  if (gpErr) throw new Error(gpErr.message)
  const gradePassageIds = new Set(
    ((gradePassageRows ?? []) as { passage_id: string | null }[])
      .map((r) => r.passage_id)
      .filter((p): p is string => Boolean(p)),
  )
  const allPassages = rawPassages.filter((p) => gradePassageIds.has(p.id))

  // Question rows already in the session — find which passages are touched.
  const sessionQuestionDetails: QuestionWithPassage[] =
    session.question_ids.length === 0
      ? []
      : await (async () => {
          const { data, error } = await supabase
            .from('map_questions')
            .select('id, rit_band, passage_id, standard_id')
            .in('id', session.question_ids)
          if (error) throw new Error(error.message)
          return (data ?? []) as QuestionWithPassage[]
        })()

  const usedPassageIds = new Set(
    sessionQuestionDetails
      .map((q) => q.passage_id)
      .filter((p): p is string => Boolean(p)),
  )

  // Passages this student saw in the last 14 days (cross-session) — deprioritized.
  const { data: recentAttemptsData } = await supabase
    .from('map_attempts')
    .select('map_questions!inner(passage_id)')
    .eq('student_id', studentId)
    .gte('answered_at', fourteenDaysAgo)
  const recentlySeenPassages = new Set<string>()
  for (const row of (recentAttemptsData ?? []) as Array<{
    map_questions: { passage_id: string | null } | { passage_id: string | null }[]
  }>) {
    const mq = Array.isArray(row.map_questions) ? row.map_questions[0] : row.map_questions
    if (mq?.passage_id) recentlySeenPassages.add(mq.passage_id)
  }

  // Resolve start band (set on first call, reuse thereafter)
  const startBand: RitBand =
    session.start_band ?? sessionQuestionDetails[0]?.rit_band ?? '181_190'
  const floorBand = bandFloor(startBand)
  const ceilBand = bandCeil(startBand)
  const startIdx = bandIndex(startBand)

  // Build per-passage rolling window (booleans = passage accuracy ≥ threshold)
  const window = buildPassageWindow(sessionQuestionDetails, attempts)

  // Current passage band: band of the most recently appended PASSAGE
  // (NOT the band of the most recent question — reading questions can have
  // their own rit_band that differs from the passage's; using question band
  // here lets a single high-band question incorrectly drive currentBand up
  // even when the passage that contains it is at start_band).
  const lastQid = session.question_ids[session.question_ids.length - 1]
  const lastDetail = sessionQuestionDetails.find((q) => q.id === lastQid)
  const lastPassageId = lastDetail?.passage_id
  const lastPassage = lastPassageId
    ? allPassages.find((p) => p.id === lastPassageId)
    : null
  const currentBand: RitBand = lastPassage?.rit_band ?? startBand

  // Decide target band (per-passage, not per-question)
  let targetBand: RitBand =
    window.length < WARMUP_LENGTH
      ? startBand
      : decideBand(window, currentBand, floorBand, ceilBand)

  // Reading stretch cap: at most 1 passage above start.
  const stretchUsed = sessionQuestionDetails
    .map((q) => q.passage_id)
    .filter((p, i, arr): p is string => Boolean(p) && arr.indexOf(p) === i)
    .map((pid) => allPassages.find((p) => p.id === pid))
    .filter((p): p is PassageRow => Boolean(p))
    .filter((p) => bandIndex(p.rit_band) > startIdx).length
  const stretchRemaining = Math.max(0, READING_STRETCH_CAP_PER_SESSION - stretchUsed)
  if (bandIndex(targetBand) > startIdx && stretchRemaining <= 0) {
    targetBand = startBand
  }

  // Pick a candidate passage, with two-tier fallback.
  const resolution = pickPassage({
    targetBand,
    startBand,
    allPassages,
    usedPassageIds,
    recentlySeenPassages,
  })

  if (!resolution.passage) {
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
    throw new Error('No candidate passages available even after fallbacks.')
  }

  // Pull all active questions for the picked passage in stable order.
  const { data: pqs, error: pqErr } = await supabase
    .from('map_questions')
    .select('id, created_at')
    .eq('passage_id', resolution.passage.id)
    .eq('is_active', true)
    .order('created_at')
  if (pqErr) throw new Error(pqErr.message)
  const passageQuestionIds = ((pqs ?? []) as Array<{ id: string }>).map((q) => q.id)
  if (passageQuestionIds.length === 0) {
    throw new Error(
      `Passage ${resolution.passage.id} has no active questions; data integrity issue.`,
    )
  }

  // Trim if appending all would overshoot planned_length.
  const slotsLeft = session.planned_length - session.question_ids.length
  const idsToAdd = passageQuestionIds.slice(0, slotsLeft)
  const newQuestionIds = [...session.question_ids, ...idsToAdd]

  // Atomically append + persist start_band/is_adaptive on first call.
  const updates: Record<string, unknown> = { question_ids: newQuestionIds }
  if (!session.start_band) updates.start_band = startBand
  if (session.question_ids.length === 0) updates.is_adaptive = true
  const { error: updErr } = await supabase
    .from('map_test_sessions')
    .update(updates)
    .eq('id', sessionId)
  if (updErr) throw new Error(updErr.message)

  // Log one diagnostic row per question added (so the simulator gets a clean
  // band sequence indexed by question_index, like math/language sessions).
  // Promote a first-passage fallback to warmup_band_unavailable — the warmup
  // passage should anchor at start_band, so a band miss here is a special signal.
  const isFirstPassage = session.question_ids.length === 0
  const firstFallbackPath =
    isFirstPassage && resolution.fallback && resolution.passage.rit_band !== startBand
      ? 'warmup_band_unavailable'
      : resolution.fallback
  for (let i = 0; i < idsToAdd.length; i++) {
    await logPickDiagnostic({
      sessionId,
      questionIndex: session.question_ids.length + i + 1,
      targetBand,
      actualBand: resolution.passage.rit_band,
      pickedQuestionId: idsToAdd[i],
      candidateCount: resolution.candidateCount,
      fallbackPath: i === 0 ? firstFallbackPath : null,
      recentWindow: window,
    })
  }

  return {
    passage_id: resolution.passage.id,
    question_ids_added: idsToAdd,
    picked_band: resolution.passage.rit_band,
    target_band: targetBand,
    fallback_path: resolution.fallback,
    candidate_count: resolution.candidateCount,
  }
}

interface PickPassageInput {
  targetBand: RitBand
  startBand: RitBand
  allPassages: PassageRow[]
  usedPassageIds: Set<string>
  recentlySeenPassages: Set<string>
}

interface PickPassageResult {
  passage: PassageRow | null
  candidateCount: number
  fallback: FallbackPath | null
}

function pickPassage(i: PickPassageInput): PickPassageResult {
  // Pass 1: target band, not used in session, not seen in last 14 days
  const fresh = i.allPassages.filter(
    (p) =>
      p.rit_band === i.targetBand &&
      !i.usedPassageIds.has(p.id) &&
      !i.recentlySeenPassages.has(p.id),
  )
  if (fresh.length > 0) {
    return { passage: pickRandom(fresh), candidateCount: fresh.length, fallback: null }
  }

  // Pass 2: target band, not used in session (allow recently seen)
  const sessionFresh = i.allPassages.filter(
    (p) => p.rit_band === i.targetBand && !i.usedPassageIds.has(p.id),
  )
  if (sessionFresh.length > 0) {
    return {
      passage: pickRandom(sessionFresh),
      candidateCount: sessionFresh.length,
      fallback: null, // recency relax isn't a real fallback per the brief
    }
  }

  // Pass 3: step toward start_band by one
  const startIdx = bandIndex(i.startBand)
  const tIdx = bandIndex(i.targetBand)
  const stepIdx =
    tIdx === startIdx ? tIdx : tIdx > startIdx ? tIdx - 1 : tIdx + 1
  if (stepIdx !== tIdx) {
    const stepBand = clampBand(stepIdx)
    const stepped = i.allPassages.filter(
      (p) => p.rit_band === stepBand && !i.usedPassageIds.has(p.id),
    )
    if (stepped.length > 0) {
      return {
        passage: pickRandom(stepped),
        candidateCount: stepped.length,
        fallback: 'passage_step_back',
      }
    }
  }

  // Pass 4: any unused passage at start_band ±1
  const widerBands = new Set<RitBand>()
  for (const delta of [-1, 0, 1]) {
    widerBands.add(clampBand(startIdx + delta))
  }
  const wider = i.allPassages.filter(
    (p) => widerBands.has(p.rit_band) && !i.usedPassageIds.has(p.id),
  )
  if (wider.length > 0) {
    return { passage: pickRandom(wider), candidateCount: wider.length, fallback: 'wider_net' }
  }

  return { passage: null, candidateCount: 0, fallback: 'wider_net' }
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function buildPassageWindow(
  sessionQuestions: QuestionWithPassage[],
  attempts: AttemptRow[],
): boolean[] {
  // Group session questions by passage in append order
  const byPassage = new Map<string, QuestionWithPassage[]>()
  const passageOrder: string[] = []
  for (const q of sessionQuestions) {
    if (!q.passage_id) continue
    if (!byPassage.has(q.passage_id)) {
      byPassage.set(q.passage_id, [])
      passageOrder.push(q.passage_id)
    }
    byPassage.get(q.passage_id)!.push(q)
  }

  const attemptByQid = new Map<string, boolean>()
  for (const a of attempts) {
    if (a.is_correct === null) continue
    attemptByQid.set(a.question_id, a.is_correct)
  }

  const result: boolean[] = []
  for (const pid of passageOrder) {
    const qs = byPassage.get(pid)!
    // Only count a passage as "completed" once every question has an attempt.
    const allAnswered = qs.every((q) => attemptByQid.has(q.id))
    if (!allAnswered) continue
    const correct = qs.filter((q) => attemptByQid.get(q.id) === true).length
    const acc = correct / qs.length
    result.push(acc >= READING_PASSAGE_ACC_THRESHOLD)
  }
  return trimWindow(result)
}

export const __testing = {
  buildPassageWindow,
  pickPassage,
}
