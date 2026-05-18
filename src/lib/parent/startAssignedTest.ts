// src/lib/parent/startAssignedTest.ts
// Compose a kid session from an assignment's definition recipe, then link the
// assignment via map_start_assignment. Vetted-bank fidelity (subject +
// standards + length); empty standard_codes → adaptive fallback. Error policy
// per spec §4.1: composition failure propagates (assignment untouched);
// startAssignment failure post-compose is non-fatal (session is valid
// practice; assignment self-heals — stays 'assigned').
import { supabase } from '../supabase'
import type { Subject } from '../types'
import { createCustomTest } from '../customTest'
import { createSession } from '../sessionBuilder'
import { getTestDefinition } from './queries'
import { startAssignment } from './mutations'
import type { AssignmentOverviewRow } from './types'

export async function startAssignedTest(
  assignment: AssignmentOverviewRow,
  studentId: string,
): Promise<string> {
  const def = await getTestDefinition(assignment.definition_id)
  if (!def) {
    throw new Error('This assigned test is no longer available.')
  }

  let standardIds: string[] = []
  if (def.standard_codes.length > 0) {
    const { data, error } = await supabase
      .from('map_standards')
      .select('id')
      .in('teks_code', def.standard_codes)
      .eq('subject', def.subject)
      .eq('grade', def.grade)
    if (error) throw error
    standardIds = (data ?? []).map((r) => r.id as string)
  }

  let sessionId: string
  if (standardIds.length > 0) {
    const created = await createCustomTest({
      studentId,
      subject: def.subject as Subject,
      standardIds,
      requestedCount: def.planned_length,
    })
    sessionId = created.sessionId
  } else {
    // Definition with no standard_codes = "any standard for the subject/grade".
    sessionId = await createSession(def.subject as Subject, studentId)
  }

  // Link the assignment. If this fails the session is still valid practice;
  // surface non-fatally and still return sessionId — the assignment stays
  // 'assigned' and reappears on the next panel load (self-healing). Bounded,
  // documented residual (spec §4.1 / §5).
  try {
    await startAssignment(assignment.assignment_id, sessionId)
  } catch (e) {
    console.error(
      '[startAssignedTest] startAssignment failed (session still valid):',
      e,
    )
  }

  return sessionId
}
