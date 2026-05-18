// src/lib/banks/startAssignedBank.ts
// Vetted lane: resolve standard_codes -> standard ids, compose fresh via the
// proven createCustomTest. Custom lane: compose a session directly from the
// frozen snapshot version ids (self-healing past soft-deleted ones), like
// createCustomTestFromMyBank. Then link the assignment.
// Error policy (ported from the validated Cycle-1 startAssignedTest):
//  - compose failure -> propagate; do NOT link; assignment stays 'assigned'
//  - link failure after a session exists -> log; still return the sessionId
import { supabase, fetchStudentGrade } from '../supabase'
import { createCustomTest, CUSTOM_MIN_COUNT } from '../customTest'
import type { Subject } from '../types'
import type { BankAssignmentOverviewRow } from './types'

export async function startAssignedBank(
  assignment: BankAssignmentOverviewRow,
  studentId: string,
): Promise<string> {
  if (assignment.lane === 'vetted') {
    return startVetted(assignment, studentId)
  }
  return startCustom(assignment, studentId)
}

async function startVetted(
  assignment: BankAssignmentOverviewRow,
  studentId: string,
): Promise<string> {
  const { data: bank, error: bErr } = await supabase
    .from('map_question_banks')
    .select('subject,grade,standard_codes,planned_length,difficulty')
    .eq('id', assignment.bank_id)
    .single()
  if (bErr || !bank) throw new Error('This assigned test is no longer available.')

  const codes = (bank.standard_codes as string[]) ?? []
  let standardIds: string[] = []
  if (codes.length > 0) {
    const { data: stds, error: sErr } = await supabase
      .from('map_standards')
      .select('id')
      .in('teks_code', codes)
      .eq('subject', bank.subject)
      .eq('grade', bank.grade)
    if (sErr) throw sErr
    standardIds = (stds ?? []).map((r) => r.id as string)
  }
  if (standardIds.length === 0) throw new Error('This assigned test has no questions yet.')

  const { sessionId } = await createCustomTest({
    studentId,
    subject: bank.subject as Subject,
    standardIds,
    requestedCount: bank.planned_length as number,
    difficulty: (bank.difficulty as 'easy' | 'medium' | 'hard' | 'any') ?? 'any',
  })
  await linkAssignment(assignment.assignment_id, sessionId)
  return sessionId
}

async function startCustom(
  assignment: BankAssignmentOverviewRow,
  studentId: string,
): Promise<string> {
  const { data: bank, error: bErr } = await supabase
    .from('map_question_banks')
    .select('subject')
    .eq('id', assignment.bank_id)
    .single()
  if (bErr || !bank) throw new Error('This assigned test is no longer available.')

  // Frozen version ids captured at assign time.
  const { data: asg, error: aErr } = await supabase
    .from('map_bank_assignments')
    .select('snapshot_question_ids')
    .eq('id', assignment.assignment_id)
    .single()
  if (aErr || !asg) throw new Error('This assigned test is no longer available.')
  const snapshot = (asg.snapshot_question_ids as string[] | null) ?? []

  // Self-heal: keep only version ids still resolvable (not soft-deleted).
  let playable: string[] = []
  if (snapshot.length > 0) {
    const { data: live, error: lErr } = await supabase
      .from('map_custom_questions_resolved')
      .select('version_id')
      .in('version_id', snapshot)
    if (lErr) throw lErr
    const ok = new Set((live ?? []).map((r) => r.version_id as string))
    playable = snapshot.filter((v) => ok.has(v))
  }
  if (playable.length < CUSTOM_MIN_COUNT) {
    throw new Error('This assigned test is not ready yet.')
  }

  const grade = await fetchStudentGrade(studentId)
  const customConfig = {
    source: 'mine',
    standard_ids: [] as string[],
    requested_count: playable.length,
    actual_count: playable.length,
    shortfall_reason: null,
  }
  const { data, error: insErr } = await supabase
    .from('map_test_sessions')
    .insert({
      student_id: studentId,
      subject: bank.subject,
      grade,
      status: 'in_progress',
      question_ids: playable,
      current_index: 0,
      correct_count: 0,
      kind: 'custom',
      is_adaptive: false,
      planned_length: playable.length,
      custom_config: customConfig,
    })
    .select('id')
    .single()
  if (insErr || !data) {
    throw new Error(insErr?.message ?? 'Failed to create custom session')
  }
  const sessionId = data.id as string
  await linkAssignment(assignment.assignment_id, sessionId)
  return sessionId
}

// Ported error policy: a link failure after a valid session exists is
// non-fatal — the kid still plays; the assignment self-heals on next load.
async function linkAssignment(assignmentId: string, sessionId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('map_start_bank_assignment', {
      p_assignment_id: assignmentId,
      p_session_id: sessionId,
    })
    if (error) throw error
  } catch (e) {
    console.error('[startAssignedBank] link failed (session still valid):', e)
  }
}
