// Custom Tests picker + session creation.
//
// Sibling to lib/sessionBuilder.ts. Builds a one-off non-adaptive session from
// the parent's TEKS standard picks. Math + language pick bare questions;
// reading picks whole passages and sticks all of their matching questions in
// one block, so the child never sees a passage half-answered.

import { supabase, fetchStudentGrade } from './supabase'
import type { Subject, Difficulty } from './types'

export const CUSTOM_MIN_COUNT = 5
export const CUSTOM_MAX_COUNT = 50
const RECENT_CORRECT_DAYS = 7

export interface CustomTestRequest {
  studentId: string
  subject: Subject
  standardIds: string[]
  requestedCount: number
  difficulty?: Difficulty | 'any'
}

export interface CustomTestPreview {
  /** How many questions the test would actually contain. May exceed requested
   * for reading because passages are atomic, or fall short for any subject if
   * the bank is thin. */
  actualCount: number
  /** Reading only: how many distinct passages the test would draw from. */
  passageCount: number
  shortfallReason: 'bank_thin' | null
  /** Total active questions matching the selection (no recency filter applied
   * here — used to drive the slider max in the UI). */
  poolSize: number
}

export interface CustomTestCreated {
  sessionId: string
  actualCount: number
  shortfallReason: 'bank_thin' | null
}

interface MatchingQuestion {
  id: string
  passage_id: string | null
  difficulty: Difficulty
  standard_id: string | null
  recently_correct: boolean
}

interface PassageGroup {
  passage_id: string
  question_ids: string[]
}

// ---------- Internal helpers ----------

function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const copy = arr.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Round-robin distribute target picks across the buckets keyed by standard.
 * Falls back to filling the remainder from any bucket once a bucket is empty.
 * Returns picked question IDs in shuffled order so the child does not see all
 * of one standard in a row. */
function roundRobinAcrossStandards(
  candidatesByStandard: Map<string, string[]>,
  target: number,
): string[] {
  const buckets = Array.from(candidatesByStandard.entries()).map(([sid, ids]) => ({
    sid,
    pool: shuffle(ids),
  }))
  const picked: string[] = []
  let i = 0
  let safety = 0
  while (picked.length < target && safety < target * buckets.length + 10) {
    const b = buckets[i % buckets.length]
    if (b && b.pool.length > 0) {
      picked.push(b.pool.pop()!)
    }
    i++
    safety++
    if (buckets.every((x) => x.pool.length === 0)) break
  }
  return shuffle(picked)
}

async function fetchMatchingQuestions(
  subject: Subject,
  standardIds: string[],
  studentId: string,
  difficulty: Difficulty | 'any',
): Promise<MatchingQuestion[]> {
  // Active questions matching the parent's selected standards.
  let q = supabase
    .from('map_questions')
    .select('id, passage_id, difficulty, standard_id')
    .eq('subject', subject)
    .eq('is_active', true)
    .in('standard_id', standardIds)
  if (difficulty !== 'any') {
    q = q.eq('difficulty', difficulty)
  }
  const { data: rows, error } = await q
  if (error) throw error

  // Recently correct (last 7 days) so we can de-prioritize them. Anon role can
  // read map_attempts for its own student; this is the standard recency join.
  const cutoff = new Date(Date.now() - RECENT_CORRECT_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: recents, error: aErr } = await supabase
    .from('map_attempts')
    .select('question_id')
    .eq('student_id', studentId)
    .eq('is_correct', true)
    .gte('answered_at', cutoff)
  if (aErr) throw aErr
  const recentSet = new Set((recents ?? []).map((r) => r.question_id as string))

  return (rows ?? []).map((r) => ({
    id: r.id as string,
    passage_id: (r.passage_id as string | null) ?? null,
    difficulty: r.difficulty as Difficulty,
    standard_id: (r.standard_id as string | null) ?? null,
    recently_correct: recentSet.has(r.id as string),
  }))
}

// ---------- Math + Language path ----------

function pickBareQuestions(
  matches: MatchingQuestion[],
  requestedCount: number,
): { picked: string[]; shortfall: boolean } {
  // Pass 1: respect the recency filter.
  const fresh = matches.filter((m) => !m.recently_correct)
  const freshByStandard = new Map<string, string[]>()
  for (const m of fresh) {
    const sid = m.standard_id ?? '__no_std__'
    if (!freshByStandard.has(sid)) freshByStandard.set(sid, [])
    freshByStandard.get(sid)!.push(m.id)
  }
  let picked = roundRobinAcrossStandards(freshByStandard, requestedCount)
  if (picked.length >= requestedCount) {
    return { picked: picked.slice(0, requestedCount), shortfall: false }
  }

  // Pass 2: relax recency, top up from anything (excluding what's already picked).
  const usedIds = new Set(picked)
  const fallbackByStandard = new Map<string, string[]>()
  for (const m of matches) {
    if (usedIds.has(m.id)) continue
    const sid = m.standard_id ?? '__no_std__'
    if (!fallbackByStandard.has(sid)) fallbackByStandard.set(sid, [])
    fallbackByStandard.get(sid)!.push(m.id)
  }
  const topUp = roundRobinAcrossStandards(fallbackByStandard, requestedCount - picked.length)
  picked = picked.concat(topUp)
  picked = shuffle(picked)
  return {
    picked: picked.slice(0, requestedCount),
    shortfall: picked.length < requestedCount,
  }
}

// ---------- Reading path ----------

function groupByPassage(matches: MatchingQuestion[]): PassageGroup[] {
  const byPassage = new Map<string, string[]>()
  for (const m of matches) {
    if (!m.passage_id) continue // reading rows should always have a passage_id
    if (!byPassage.has(m.passage_id)) byPassage.set(m.passage_id, [])
    byPassage.get(m.passage_id)!.push(m.id)
  }
  return Array.from(byPassage.entries()).map(([passage_id, question_ids]) => ({
    passage_id,
    question_ids,
  }))
}

/** Greedy passage fill. Adds whole passages until adding the next would
 * overshoot — except if zero passages have been added yet, in which case we
 * always add the first (so a parent who asks for 10 and the only candidate
 * passage has 12 questions still gets a test, sized at 12). */
function pickReadingPassages(
  matches: MatchingQuestion[],
  requestedCount: number,
): { questionIds: string[]; passageCount: number; shortfall: boolean } {
  const groups = shuffle(groupByPassage(matches))
  const picked: PassageGroup[] = []
  let total = 0
  for (const g of groups) {
    if (picked.length === 0) {
      picked.push(g)
      total += g.question_ids.length
      if (total >= requestedCount) break
      continue
    }
    if (total >= requestedCount) break
    // Permit the next passage to overshoot by any amount — passages are atomic.
    picked.push(g)
    total += g.question_ids.length
  }
  // Ensure passages aren't too aggressive — the brief allows surfacing the
  // overshoot in the UI before submit, but here we just commit the build.
  const questionIds = picked.flatMap((p) => p.question_ids)
  return {
    questionIds,
    passageCount: picked.length,
    shortfall: total < requestedCount,
  }
}

// ---------- Public API: preview + create ----------

/** Cheap pre-flight that the slider preview hits while the parent picks
 * topics. Returns the test's actual size given the selection, without
 * creating anything. */
export async function previewCustomTest(
  request: CustomTestRequest,
): Promise<CustomTestPreview> {
  const { studentId, subject, standardIds, requestedCount, difficulty = 'any' } = request
  if (standardIds.length === 0) {
    return { actualCount: 0, passageCount: 0, shortfallReason: null, poolSize: 0 }
  }
  const matches = await fetchMatchingQuestions(subject, standardIds, studentId, difficulty)
  const poolSize = matches.length
  if (poolSize === 0) {
    return { actualCount: 0, passageCount: 0, shortfallReason: null, poolSize: 0 }
  }

  if (subject === 'reading') {
    const r = pickReadingPassages(matches, requestedCount)
    return {
      actualCount: r.questionIds.length,
      passageCount: r.passageCount,
      shortfallReason: r.shortfall ? 'bank_thin' : null,
      poolSize,
    }
  }
  const r = pickBareQuestions(matches, requestedCount)
  return {
    actualCount: r.picked.length,
    passageCount: 0,
    shortfallReason: r.shortfall ? 'bank_thin' : null,
    poolSize,
  }
}

/** Build the session row, picking questions exactly once and committing them
 * to question_ids. The runner takes over from here. Returns 422-style
 * shape (`{ reason: 'no_questions_for_selection' }`) by throwing a typed
 * error the caller can branch on. */
export class NoQuestionsError extends Error {
  constructor() {
    super('no_questions_for_selection')
    this.name = 'NoQuestionsError'
  }
}
export class CrossSubjectError extends Error {
  constructor() {
    super('standards_span_multiple_subjects')
    this.name = 'CrossSubjectError'
  }
}

/**
 * Build a test session from the family's PUBLISHED custom-question bank
 * (Phase 4 Cycle 2). Returns the new session id; question_ids on the row
 * are custom_question_version_ids, which the TestRunner detects and routes
 * to the polymorphic loader + map_record_custom_attempt RPC.
 *
 * Reading mode picks whole passages: every published question that links to
 * a chosen passage's current version comes along, like the vetted-reading
 * picker, so the kid never sees a passage half-answered.
 */
export async function createCustomTestFromMyBank(args: {
  studentId: string
  subject: Subject
  requestedCount: number
}): Promise<CustomTestCreated> {
  const { studentId, subject, requestedCount } = args
  if (requestedCount < CUSTOM_MIN_COUNT || requestedCount > CUSTOM_MAX_COUNT) {
    throw new Error(`requested_count out of range (${CUSTOM_MIN_COUNT}-${CUSTOM_MAX_COUNT})`)
  }
  const grade = await fetchStudentGrade(studentId)

  // Pull all published custom-question versions for this family/subject/grade.
  // RLS on map_custom_questions restricts to the family automatically.
  const { data: rows, error } = await supabase
    .from('map_custom_questions_resolved')
    .select('version_id, subject, grade, passage_id, passage_version_id, question_status')
    .eq('subject', subject)
    .eq('grade', grade)
    .eq('question_status', 'published')
  if (error) throw new Error(error.message)
  const pool = (rows ?? []) as Array<{
    version_id: string
    subject: string
    grade: number
    passage_id: string | null
    passage_version_id: string | null
    question_status: string
  }>
  if (pool.length === 0) throw new NoQuestionsError()

  let questionIds: string[]
  let shortfall = false
  if (subject === 'reading') {
    // Group by passage_id and pick passages whole until we reach the count.
    const byPassage = new Map<string, string[]>()
    for (const r of pool) {
      const pid = r.passage_id ?? '__standalone__'
      const list = byPassage.get(pid) ?? []
      list.push(r.version_id)
      byPassage.set(pid, list)
    }
    const passages = shuffle([...byPassage.values()])
    questionIds = []
    for (const p of passages) {
      if (questionIds.length >= requestedCount) break
      questionIds.push(...p)
    }
    if (questionIds.length === 0) throw new NoQuestionsError()
    shortfall = questionIds.length < requestedCount
  } else {
    const shuffled = shuffle(pool.map((r) => r.version_id))
    questionIds = shuffled.slice(0, requestedCount)
    shortfall = questionIds.length < requestedCount
  }

  const actualCount = questionIds.length
  const customConfig = {
    source: 'mine',
    requested_count: requestedCount,
    actual_count: actualCount,
    shortfall_reason: shortfall ? 'bank_thin' : null,
  }
  const { data, error: insErr } = await supabase
    .from('map_test_sessions')
    .insert({
      student_id: studentId,
      subject,
      grade,
      status: 'in_progress',
      question_ids: questionIds,
      current_index: 0,
      correct_count: 0,
      kind: 'custom',
      is_adaptive: false,
      planned_length: actualCount,
      custom_config: customConfig,
    })
    .select('id')
    .single()
  if (insErr || !data) throw insErr ?? new Error('Failed to create custom session')

  return {
    sessionId: data.id as string,
    actualCount,
    shortfallReason: shortfall ? 'bank_thin' : null,
  }
}

export async function createCustomTest(
  request: CustomTestRequest,
): Promise<CustomTestCreated> {
  const { studentId, subject, standardIds, requestedCount, difficulty = 'any' } = request

  if (standardIds.length === 0) throw new NoQuestionsError()
  if (requestedCount < CUSTOM_MIN_COUNT || requestedCount > CUSTOM_MAX_COUNT) {
    throw new Error(`requested_count out of range (${CUSTOM_MIN_COUNT}-${CUSTOM_MAX_COUNT})`)
  }

  // Defense in depth: confirm every standard belongs to the same subject the
  // request claims. The UI prevents this but the brief asks for it explicitly.
  const { data: stdRows, error: stdErr } = await supabase
    .from('map_standards')
    .select('id, subject')
    .in('id', standardIds)
  if (stdErr) throw stdErr
  if ((stdRows ?? []).length !== standardIds.length) {
    throw new Error('one or more standard_ids not found')
  }
  const subjects = new Set((stdRows ?? []).map((r) => r.subject as Subject))
  if (subjects.size > 1 || !subjects.has(subject)) {
    throw new CrossSubjectError()
  }

  const matches = await fetchMatchingQuestions(subject, standardIds, studentId, difficulty)
  if (matches.length === 0) throw new NoQuestionsError()

  let questionIds: string[]
  let actualCount: number
  let shortfall: boolean
  if (subject === 'reading') {
    const r = pickReadingPassages(matches, requestedCount)
    questionIds = r.questionIds
    actualCount = r.questionIds.length
    shortfall = r.shortfall
  } else {
    const r = pickBareQuestions(matches, requestedCount)
    questionIds = r.picked
    actualCount = r.picked.length
    shortfall = r.shortfall
  }

  if (actualCount === 0) throw new NoQuestionsError()

  // Capture the student's current grade on the row so History/dashboard can
  // render "Custom · Grade 3" without joining standards. Passes the existing
  // grade column constraint regardless of how many grades the standards span.
  const grade = await fetchStudentGrade(studentId)

  const customConfig = {
    standard_ids: standardIds,
    requested_count: requestedCount,
    actual_count: actualCount,
    shortfall_reason: shortfall ? 'bank_thin' : null,
  }

  const { data, error } = await supabase
    .from('map_test_sessions')
    .insert({
      student_id: studentId,
      subject,
      grade,
      status: 'in_progress',
      question_ids: questionIds,
      current_index: 0,
      correct_count: 0,
      kind: 'custom',
      is_adaptive: false,
      planned_length: actualCount,
      custom_config: customConfig,
    })
    .select('id')
    .single()
  if (error || !data) throw error ?? new Error('Failed to create custom session')

  return {
    sessionId: data.id as string,
    actualCount,
    shortfallReason: shortfall ? 'bank_thin' : null,
  }
}
