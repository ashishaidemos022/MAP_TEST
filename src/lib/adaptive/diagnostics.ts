// Shared diagnostics writer for both adaptive pickers (question + passage).
// Every pick logs a row; happy path is NOT optional. The §7.6 simulator and the
// parent dashboard both depend on a complete band-sequence record per session.

import { supabase } from '../supabase'
import type { RitBand } from '../types'

export type FallbackPath =
  | 'standards_relaxed'
  | 'band_step_back'
  | 'wider_net'
  | 'passage_step_back'
  // First pick of a session that wanted start_band but couldn't get it. Distinct
  // from band_step_back so the validator can flag warmup-anchor failures.
  | 'warmup_band_unavailable'

export interface DiagnosticRow {
  sessionId: string
  questionIndex: number   // 1-based, the slot the question occupies in question_ids
  targetBand: RitBand
  actualBand: RitBand     // band of the question/passage actually picked
  pickedQuestionId: string | null
  candidateCount: number
  fallbackPath: FallbackPath | null
  recentWindow: boolean[]
}

export async function logPickDiagnostic(d: DiagnosticRow): Promise<void> {
  await supabase.from('map_pick_diagnostics').insert({
    session_id: d.sessionId,
    question_index: d.questionIndex,
    target_band: d.targetBand,
    actual_band: d.actualBand,
    picked_question_id: d.pickedQuestionId,
    candidate_count: d.candidateCount,
    fallback_path: d.fallbackPath,
    recent_window: d.recentWindow,
  })
}
