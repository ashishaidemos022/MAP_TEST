// Smoke test for the adaptive picker. Creates a throwaway student + session,
// calls getNextAdaptiveQuestion 25 times against a scripted answer pattern,
// asserts the band sequence is sane, then cleans up.
//
// Run: npx tsx scripts/test-adaptive-picker.mjs [pattern]
//   pattern = "all_correct" | "all_wrong" | "mixed" | "warmup_wrong"  (default: all_correct)

import { createClient } from '@supabase/supabase-js'
import { getNextAdaptiveQuestion } from '../src/lib/adaptive/picker.ts'
import { bandIndex, BAND_ORDER } from '../src/lib/adaptive/bands.ts'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.error('Missing env: set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (see .env.example).')
  console.error('Run with: node --env-file=.env.local scripts/test-adaptive-picker.mjs')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

const pattern = process.argv[2] || 'all_correct'

function isCorrectFor(i, pattern) {
  // i is 1-based question index
  if (pattern === 'all_correct') return true
  if (pattern === 'all_wrong') return false
  if (pattern === 'warmup_wrong') return i > 3  // wrong on 1-3 then right
  if (pattern === 'mixed') {
    // ~70% correct, deterministic
    return [true, true, false, true, true, true, false, true, true, true][i % 10]
  }
  return true
}

async function main() {
  console.log(`Pattern: ${pattern}\n`)

  // 1. Create a throwaway student
  const { data: student, error: sErr } = await sb
    .from('map_students')
    .insert({ display_name: 'TEST_adaptive_picker' })
    .select('id')
    .single()
  if (sErr) throw sErr
  const studentId = student.id

  // 2. Create an empty adaptive session (start with no questions; picker fills it)
  const { data: session, error: sessErr } = await sb
    .from('map_test_sessions')
    .insert({
      student_id: studentId,
      subject: 'math',
      status: 'in_progress',
      question_ids: [],
      current_index: 0,
      correct_count: 0,
      kind: 'test',
      is_adaptive: true,
      start_band: '181_190',
      planned_length: 25,
    })
    .select('*')
    .single()
  if (sessErr) throw sessErr
  const sessionId = session.id
  console.log(`Created session ${sessionId} for student ${studentId}, start_band=${session.start_band}`)

  const sequence = []
  let stretchCount = 0
  let growthCount = 0
  const seenIds = new Set()

  try {
    for (let i = 1; i <= 25; i++) {
      const result = await getNextAdaptiveQuestion(sessionId)
      sequence.push({
        i,
        target: result.target_band,
        actual: result.picked_band,
        fallback: result.fallback_path,
        candidates: result.candidate_count,
      })

      // Assertions per acceptance §6
      if (seenIds.has(result.question_id)) {
        throw new Error(`§6.7 FAIL: question ${result.question_id} appeared twice (Q${i})`)
      }
      seenIds.add(result.question_id)

      const startIdx = bandIndex(session.start_band)
      const actualIdx = bandIndex(result.picked_band)
      if (Math.abs(actualIdx - startIdx) > 2) {
        throw new Error(`§1 FAIL: pick at Q${i} band=${result.picked_band} is more than 2 bands from start=${session.start_band}`)
      }
      if (actualIdx > startIdx) stretchCount++

      // Simulate the answer using map_record_attempt RPC
      const { data: choices, error: cErr } = await sb
        .from('map_question_choices')
        .select('id, is_correct')
        .eq('question_id', result.question_id)
      if (cErr) throw cErr
      const correct = isCorrectFor(i, pattern)
      const choice = correct
        ? choices.find((c) => c.is_correct)
        : choices.find((c) => !c.is_correct)
      if (!choice) throw new Error(`No matching choice for question ${result.question_id}`)

      const { error: rpcErr } = await sb.rpc('map_record_attempt', {
        p_session_id: sessionId,
        p_student_id: studentId,
        p_question_id: result.question_id,
        p_choice_id: choice.id,
        p_time_ms: 1000,
      })
      if (rpcErr) throw rpcErr
    }

    // 2026-05-03: removed §6.5 count-based stretch cap (was ≤5 of 25). With the
    // frustration guard, stretch_count is unbounded so long as the kid keeps
    // getting them right; only ceil_band (start+2) bounds the upper band.

    // Print sequence
    console.log('\nBand sequence:')
    console.log('  i  target     actual     fallback          cands')
    for (const s of sequence) {
      console.log(`  ${String(s.i).padStart(2)} ${s.target.padEnd(10)} ${s.actual.padEnd(10)} ${(s.fallback || '-').padEnd(17)} ${s.candidates}`)
    }
    console.log(`\nstretch_count: ${stretchCount} (no static cap; bounded by ceil_band)`)
    console.log(`unique question_ids: ${seenIds.size} of 25`)

    // Pattern-specific expectations
    if (pattern === 'all_correct') {
      // Should step up to start+2 by ~Q9 and stay capped
      const last10 = sequence.slice(-10)
      const allCapped = last10.every((s) => s.actual === BAND_ORDER[bandIndex(session.start_band) + 2])
      console.log(`\nall_correct: last 10 picks at ceil_band? ${allCapped ? 'YES' : 'NO (informational)'}`)
    } else if (pattern === 'all_wrong') {
      // Should step down to start-2 (= 161_170, which has 0 questions, expect band_step_back fallbacks)
      const fallbacks = sequence.filter((s) => s.fallback === 'band_step_back').length
      console.log(`\nall_wrong: band_step_back fallbacks fired ${fallbacks} times (expected, 161_170 has 0 questions)`)
    }

    console.log('\n✓ smoke test PASSED')
  } finally {
    // Cleanup
    await sb.from('map_pick_diagnostics').delete().eq('session_id', sessionId)
    await sb.from('map_attempts').delete().eq('session_id', sessionId)
    await sb.from('map_test_sessions').delete().eq('id', sessionId)
    await sb.from('map_misconception_signals').delete().eq('student_id', studentId)
    await sb.from('map_students').delete().eq('id', studentId)
    console.log('cleaned up')
  }
}

main().catch((e) => {
  console.error('\n✗ smoke test FAILED:', e.message)
  process.exit(1)
})
