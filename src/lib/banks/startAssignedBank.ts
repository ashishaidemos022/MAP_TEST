// src/lib/banks/startAssignedBank.ts
// Vetted lane: resolve the bank's standard_codes -> standard ids, compose a
// fresh session via the proven createCustomTest, then link the assignment.
// Error policy (ported from the validated Cycle-1 startAssignedTest):
//  - compose failure  -> propagate; do NOT link; assignment stays 'assigned'
//  - link failure after a session exists -> log, still return the sessionId
import { supabase } from '../supabase'
import { createCustomTest } from '../customTest'
import type { Subject } from '../types'
import type { BankAssignmentOverviewRow } from './types'

export async function startAssignedBank(
  assignment: BankAssignmentOverviewRow,
  studentId: string,
): Promise<string> {
  if (assignment.lane !== 'vetted') {
    throw new Error('custom-lane banks are not playable in Phase 1')
  }

  const { data: bank, error: bErr } = await supabase
    .from('map_question_banks')
    .select('subject,grade,standard_codes,planned_length,difficulty')
    .eq('id', assignment.bank_id)
    .single()
  if (bErr || !bank) {
    throw new Error('This assigned test is no longer available.')
  }

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
  if (standardIds.length === 0) {
    throw new Error('This assigned test has no questions yet.')
  }

  const { sessionId } = await createCustomTest({
    studentId,
    subject: bank.subject as Subject,
    standardIds,
    requestedCount: bank.planned_length as number,
    difficulty: (bank.difficulty as 'easy' | 'medium' | 'hard' | 'any') ?? 'any',
  })

  try {
    const { error: linkErr } = await supabase.rpc('map_start_bank_assignment', {
      p_assignment_id: assignment.assignment_id,
      p_session_id: sessionId,
    })
    if (linkErr) throw linkErr
  } catch (e) {
    console.error('[startAssignedBank] link failed (session still valid):', e)
  }

  return sessionId
}
