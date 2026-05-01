// End-to-end smoke test for the adaptive cutover.
// Calls createSession() (real path the UI uses), simulates a kid answering 25
// questions, asserts the full pipeline.
//
// Run: npx tsx scripts/test-end-to-end-adaptive.mjs [subject]
//   subject = "math" | "reading" | "language"  (default: math)

import { createClient } from '@supabase/supabase-js'
import { createSession } from '../src/lib/sessionBuilder.ts'
import { getNextAdaptiveQuestion } from '../src/lib/adaptive/picker.ts'
import { addNextAdaptivePassage } from '../src/lib/adaptive/passagePicker.ts'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.error('Missing env: set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (see .env.example).')
  console.error('Run with: node --env-file=.env.local scripts/test-end-to-end-adaptive.mjs')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

const subject = process.argv[2] || 'math'

async function main() {
  console.log(`Subject: ${subject}\n`)

  // Use a throwaway student for cleanup convenience
  const { data: student, error: sErr } = await sb
    .from('map_students')
    .insert({ display_name: 'TEST_e2e_adaptive' })
    .select('id')
    .single()
  if (sErr) throw sErr
  const studentId = student.id

  // Patch: createSession uses STUDENT_ID from supabase.ts. To use our throwaway
  // student here, we'd have to thread an arg through. For this smoke test the
  // real STUDENT_ID is fine — we'll clean up after.
  let sessionId
  try {
    sessionId = await createSession(subject)
    console.log(`Session created: ${sessionId}`)
  } catch (e) {
    console.error('createSession failed:', e.message)
    await sb.from('map_students').delete().eq('id', studentId)
    process.exit(1)
  }

  try {
    // Inspect what was pre-picked
    const { data: sess } = await sb.from('map_test_sessions').select('*').eq('id', sessionId).single()
    console.log(`After createSession: ${sess.question_ids.length} questions pre-picked, start_band=${sess.start_band}, is_adaptive=${sess.is_adaptive}, planned_length=${sess.planned_length}`)

    // Walk through 25 answers, mostly correct (mixed)
    for (let i = 0; i < sess.planned_length; i++) {
      // Read fresh state
      const { data: s } = await sb.from('map_test_sessions').select('*').eq('id', sessionId).single()

      // If questions[i] isn't loaded, call picker (mimics what the runner does
      // BETWEEN answers — except in the runner the picker fires after the
      // previous answer, not before the next).
      if (s.question_ids.length <= i) {
        if (subject === 'reading') {
          await addNextAdaptivePassage(sessionId)
        } else {
          await getNextAdaptiveQuestion(sessionId)
        }
      }

      const { data: s2 } = await sb.from('map_test_sessions').select('*').eq('id', sessionId).single()
      const qid = s2.question_ids[i]

      const { data: choices } = await sb
        .from('map_question_choices')
        .select('id, is_correct')
        .eq('question_id', qid)

      // Mostly correct (~75%) so we exercise step-up
      const wantCorrect = i % 4 !== 0
      const choice = wantCorrect
        ? choices.find((c) => c.is_correct)
        : choices.find((c) => !c.is_correct)

      await sb.rpc('map_record_attempt', {
        p_session_id: sessionId,
        p_student_id: s2.student_id,
        p_question_id: qid,
        p_choice_id: choice.id,
        p_time_ms: 1000,
      })

      // Increment current_index
      await sb.from('map_test_sessions').update({ current_index: i + 1 }).eq('id', sessionId)
    }

    // Final state
    const { data: final } = await sb.from('map_test_sessions').select('*').eq('id', sessionId).single()
    const { data: attempts } = await sb.from('map_attempts').select('*').eq('session_id', sessionId)
    const { data: diags } = await sb.from('map_pick_diagnostics').select('*').eq('session_id', sessionId).order('question_index')

    // Assertions
    if (final.question_ids.length !== final.planned_length) {
      throw new Error(`§6.* FAIL: question_ids.length=${final.question_ids.length}, expected ${final.planned_length}`)
    }
    if (attempts.length !== final.planned_length) {
      throw new Error(`Attempt count=${attempts.length}, expected ${final.planned_length}`)
    }
    const uniqueQids = new Set(final.question_ids)
    if (uniqueQids.size !== final.planned_length) {
      throw new Error(`§6.7 FAIL: ${uniqueQids.size} unique of ${final.planned_length}`)
    }
    if (diags.length === 0) {
      throw new Error('No pick diagnostics rows — picker should always log')
    }

    console.log(`\n✓ ${final.planned_length} questions answered, all unique`)
    console.log(`  diagnostics rows: ${diags.length}`)
    const fallbacks = diags.filter((d) => d.fallback_path !== null)
    if (fallbacks.length > 0) {
      console.log(`  fallback rows: ${fallbacks.length}`)
      const byPath = {}
      for (const d of fallbacks) byPath[d.fallback_path] = (byPath[d.fallback_path] || 0) + 1
      for (const [k, v] of Object.entries(byPath)) console.log(`    ${k}: ${v}`)
    }
    const bandHistogram = {}
    for (const d of diags) bandHistogram[d.actual_band] = (bandHistogram[d.actual_band] || 0) + 1
    console.log(`  band histogram:`, bandHistogram)

    console.log('\n✓ end-to-end smoke test PASSED')
  } finally {
    await sb.from('map_pick_diagnostics').delete().eq('session_id', sessionId)
    await sb.from('map_attempts').delete().eq('session_id', sessionId)
    await sb.from('map_test_sessions').delete().eq('id', sessionId)
    // Don't delete the throwaway student here since createSession used the real
    // STUDENT_ID; just clean any signals it accidentally created.
    await sb.from('map_students').delete().eq('id', studentId)
    console.log('cleaned up')
  }
}

main().catch((e) => {
  console.error('\n✗ end-to-end smoke test FAILED:', e.message)
  process.exit(1)
})
