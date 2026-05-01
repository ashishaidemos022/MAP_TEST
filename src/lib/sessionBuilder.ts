import { supabase, fetchStudentGrade, fetchStudentDefaultTestLength } from './supabase'
import type { RitBand, Subject } from './types'

const DEFAULT_BAND: RitBand = '181_190'
const WARMUP_PREPICK = 3
const BOOST_SIZE = 10

const BAND_ORDER: RitBand[] = [
  'below_161',
  '161_170',
  '171_180',
  '181_190',
  '191_200',
  '201_210',
  'above_210',
]

async function fetchCurrentBand(studentId: string): Promise<RitBand> {
  const { data } = await supabase
    .from('map_v_student_current_band')
    .select('current_band')
    .eq('student_id', studentId)
    .maybeSingle()
  return ((data?.current_band as RitBand) ?? DEFAULT_BAND)
}

/**
 * Create a new adaptive test session. New sessions are always adaptive; legacy
 * non-adaptive sessions only exist if an in-progress one was started before
 * this cutover. The runner branches on `is_adaptive` to handle both shapes.
 */
export async function createSession(subject: Subject, studentId: string): Promise<string> {
  const [startBand, grade, plannedLength] = await Promise.all([
    fetchCurrentBand(studentId),
    fetchStudentGrade(studentId),
    fetchStudentDefaultTestLength(studentId),
  ])

  // Insert an empty adaptive session shell. The pickers fill question_ids.
  // grade and planned_length are captured at session-creation time so:
  //   - History can show what grade a past test was at
  //   - Mid-test parent changes to default_test_length don't affect this
  //     session (its planned_length is locked at creation).
  const { data, error } = await supabase
    .from('map_test_sessions')
    .insert({
      student_id: studentId,
      subject,
      grade,
      status: 'in_progress',
      question_ids: [],
      current_index: 0,
      correct_count: 0,
      kind: 'test',
      is_adaptive: true,
      start_band: startBand,
      planned_length: plannedLength,
    })
    .select('id')
    .single()
  if (error || !data) throw error ?? new Error('Failed to create session')
  const sessionId = data.id as string

  // Pre-pick warmup. Math/language: 3 questions at start_band. Reading: 1
  // passage at start_band (≈ 4–6 questions; the runner walks within it before
  // calling for the next passage).
  try {
    if (subject === 'reading') {
      const { addNextAdaptivePassage } = await import('./adaptive/passagePicker')
      await addNextAdaptivePassage(sessionId)
    } else {
      const { getNextAdaptiveQuestion } = await import('./adaptive/picker')
      for (let i = 0; i < WARMUP_PREPICK; i++) {
        await getNextAdaptiveQuestion(sessionId)
      }
    }
  } catch (e) {
    // Roll back the session shell if warmup picking failed (no questions
    // available, etc.) so the user doesn't see an empty test.
    await supabase.from('map_test_sessions').delete().eq('id', sessionId)
    throw e
  }

  return sessionId
}

interface BoostQuestionRow {
  id: string
  rit_band: RitBand
  passage_id: string | null
  has_target_distractor: boolean
}

async function composeBoostSet(
  tag: string,
  relatedTeks: string[],
  subject: Subject,
  studentId: string,
): Promise<string[]> {
  const currentBand = await fetchCurrentBand(studentId)
  const idx = BAND_ORDER.indexOf(currentBand)
  const allowedBands = [currentBand]
  if (idx > 0) allowedBands.push(BAND_ORDER[idx - 1])

  const studentGrade = await fetchStudentGrade(studentId)

  // Questions answered correctly within 14 days are deprioritized
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const { data: seenRows } = await supabase
    .from('map_attempts')
    .select('question_id')
    .eq('student_id', studentId)
    .gte('answered_at', fourteenDaysAgo)
  const recentlySeen = new Set(
    ((seenRows ?? []) as { question_id: string }[]).map((r) => r.question_id),
  )

  // Questions on the tag's TEKS standards (scope to the active student's grade
  // so a Grade 3 boost doesn't pull from the Grade 2 standards row sharing a
  // teks_code, e.g. "3.3B" exists for both reading-Grade-3 and reading-Grade-2).
  const { data: stdRows } = await supabase
    .from('map_standards')
    .select('id')
    .eq('subject', subject)
    .eq('grade', studentGrade)
    .in('teks_code', relatedTeks)
  const standardIds = ((stdRows ?? []) as { id: string }[]).map((r) => r.id)
  if (standardIds.length === 0) return []

  const { data: qRows } = await supabase
    .from('map_questions')
    .select(
      'id, rit_band, passage_id, choices:map_question_choices(misconception_tag)',
    )
    .eq('subject', subject)
    .eq('grade', studentGrade)
    .eq('is_active', true)
    .in('standard_id', standardIds)
    .in('rit_band', allowedBands)

  const candidates: BoostQuestionRow[] = ((qRows ?? []) as Array<{
    id: string
    rit_band: RitBand
    passage_id: string | null
    choices: { misconception_tag: string | null }[]
  }>).map((q) => ({
    id: q.id,
    rit_band: q.rit_band,
    passage_id: q.passage_id,
    has_target_distractor: q.choices.some((c) => c.misconception_tag === tag),
  }))

  // Score: 2 for has-target-distractor, 1 otherwise; -1 if seen in 14d.
  const scored = candidates.map((c) => ({
    ...c,
    score:
      (c.has_target_distractor ? 2 : 1) + (recentlySeen.has(c.id) ? -1 : 0) + Math.random() * 0.001,
  }))
  scored.sort((a, b) => b.score - a.score)

  let picked = scored.slice(0, BOOST_SIZE).map((q) => q.id)

  // Reading: keep passages whole, then trim to BOOST_SIZE
  if (subject === 'reading') {
    const candById = new Map(candidates.map((c) => [c.id, c]))
    const byPassage = new Map<string, string[]>()
    for (const q of candidates) {
      if (!q.passage_id) continue
      const arr = byPassage.get(q.passage_id) ?? []
      arr.push(q.id)
      byPassage.set(q.passage_id, arr)
    }
    const passagesInOrder: string[] = []
    const seenPassage = new Set<string>()
    for (const id of picked) {
      const passageId = candById.get(id)?.passage_id
      if (!passageId || seenPassage.has(passageId)) continue
      seenPassage.add(passageId)
      passagesInOrder.push(passageId)
    }
    const expanded: string[] = []
    for (const pid of passagesInOrder) {
      const ids = byPassage.get(pid) ?? []
      expanded.push(...ids)
      if (expanded.length >= BOOST_SIZE) break
    }
    picked = expanded.slice(0, BOOST_SIZE)
  }

  return picked
}

export async function createBoostSession(tag: string, studentId: string): Promise<string> {
  const { data: tagRow, error: tagErr } = await supabase
    .from('map_misconception_tags')
    .select('tag, subject, related_teks')
    .eq('tag', tag)
    .single()
  if (tagErr || !tagRow) throw tagErr ?? new Error('Tag not found')

  const subject = tagRow.subject as Subject
  const relatedTeks = (tagRow.related_teks as string[] | null) ?? []
  if (relatedTeks.length === 0) {
    throw new Error('This skill is not yet linked to any standards.')
  }

  const ids = await composeBoostSet(tag, relatedTeks, subject, studentId)
  if (ids.length === 0) {
    throw new Error('No questions available for this skill right now.')
  }

  const grade = await fetchStudentGrade(studentId)

  const { data, error } = await supabase
    .from('map_test_sessions')
    .insert({
      student_id: studentId,
      subject,
      grade,
      status: 'in_progress',
      question_ids: ids,
      current_index: 0,
      correct_count: 0,
      kind: 'boost',
      misconception_tag: tag,
    })
    .select('id')
    .single()
  if (error || !data) throw error ?? new Error('Failed to create boost session')
  return data.id as string
}
