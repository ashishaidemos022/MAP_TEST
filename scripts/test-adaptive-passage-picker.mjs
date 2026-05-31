// Smoke test for addNextAdaptivePassage. Creates a throwaway reading session,
// loops calling the picker until question_ids reaches planned_length, simulates
// answers per pattern, asserts §6.9 (no split passages), §6.10 (no passage
// repeats), §1 ±2 from start band, §6.7 unique question ids.
//
// Run: npx tsx scripts/test-adaptive-passage-picker.mjs [pattern]

import { createClient } from '@supabase/supabase-js'
import { addNextAdaptivePassage } from '../src/lib/adaptive/passagePicker.ts'
import { bandIndex } from '../src/lib/adaptive/bands.ts'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.error('Missing env: set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (see .env.example).')
  console.error('Run with: node --env-file=.env.local scripts/test-adaptive-passage-picker.mjs')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
// Teardown deletes go through the service role. map_students has RLS
// (students_delete_own requires family_id = map_current_family_id()), so an
// anon delete of a family-less throwaway student silently no-ops and leaks
// orphan rows. The service role bypasses RLS. Required since the 2026-04-28
// multi-tenant migration.
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing env: set SUPABASE_SERVICE_ROLE_KEY (needed to clean up throwaway test rows under RLS).')
  process.exit(1)
}
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const pattern = process.argv[2] || 'all_correct'

function correctRateFor(passageIndex, pattern) {
  // Returns target accuracy for THIS passage's questions (1-based).
  if (pattern === 'all_correct') return 1.0
  if (pattern === 'all_wrong') return 0.0
  if (pattern === 'mixed') return [0.8, 0.4, 0.6, 0.8, 0.6][passageIndex % 5]
  return 1.0
}

async function main() {
  console.log(`Pattern: ${pattern}\n`)

  const { data: student, error: sErr } = await sb
    .from('map_students')
    .insert({ display_name: 'TEST_passage_picker' })
    .select('id')
    .single()
  if (sErr) throw sErr
  const studentId = student.id

  const { data: session, error: sessErr } = await sb
    .from('map_test_sessions')
    .insert({
      student_id: studentId,
      subject: 'reading',
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
  if (sessErr) throw sErr
  const sessionId = session.id
  console.log(`Created reading session ${sessionId}, start_band=${session.start_band}`)

  const passages = []
  const seenQids = new Set()
  const seenPassageIds = new Set()
  let stretchPassages = 0

  try {
    let safety = 10  // upper bound on passage iterations (15-30 questions ~ 3-7 passages)
    let totalQuestions = 0
    while (totalQuestions < 25 && safety-- > 0) {
      const result = await addNextAdaptivePassage(sessionId)
      passages.push(result)
      totalQuestions += result.question_ids_added.length

      // §6.10: no passage repeats
      if (seenPassageIds.has(result.passage_id)) {
        throw new Error(`§6.10 FAIL: passage ${result.passage_id} appeared twice`)
      }
      seenPassageIds.add(result.passage_id)

      // §6.7: no question repeats
      for (const qid of result.question_ids_added) {
        if (seenQids.has(qid)) {
          throw new Error(`§6.7 FAIL: question ${qid} appeared twice`)
        }
        seenQids.add(qid)
      }

      // §1: ±2 from start
      const startIdx = bandIndex(session.start_band)
      const pickIdx = bandIndex(result.picked_band)
      if (Math.abs(pickIdx - startIdx) > 2) {
        throw new Error(
          `§1 FAIL: passage band=${result.picked_band} more than 2 from start=${session.start_band}`,
        )
      }
      if (pickIdx > startIdx) stretchPassages++

      // §4: stretch cap = 1 passage above start
      if (stretchPassages > 1) {
        throw new Error(
          `§4 FAIL: stretch passages=${stretchPassages} exceeds cap of 1`,
        )
      }

      // Simulate answers for this passage's questions per the rate
      const targetCorrectRate = correctRateFor(passages.length, pattern)
      const numCorrect = Math.round(result.question_ids_added.length * targetCorrectRate)

      for (let i = 0; i < result.question_ids_added.length; i++) {
        const qid = result.question_ids_added[i]
        const wantCorrect = i < numCorrect
        const { data: choices, error: cErr } = await sb
          .from('map_question_choices')
          .select('id, is_correct')
          .eq('question_id', qid)
        if (cErr) throw cErr
        const choice = wantCorrect
          ? choices.find((c) => c.is_correct)
          : choices.find((c) => !c.is_correct)
        if (!choice) throw new Error(`No matching choice for question ${qid}`)
        const { error: rpcErr } = await sb.rpc('map_record_attempt', {
          p_session_id: sessionId,
          p_student_id: studentId,
          p_question_id: qid,
          p_choice_id: choice.id,
          p_time_ms: 1000,
        })
        if (rpcErr) throw rpcErr
      }
    }

    // Print results
    console.log('\nPassage sequence:')
    console.log('  # passage_id (truncated)         band       fallback         qs_added  cands')
    passages.forEach((p, i) => {
      console.log(
        `  ${String(i + 1).padStart(2)} ${p.passage_id.slice(0, 32)}  ${p.picked_band.padEnd(10)} ${(p.fallback_path || '-').padEnd(16)} ${String(p.question_ids_added.length).padStart(2)}        ${p.candidate_count}`,
      )
    })
    console.log(`\ntotal questions: ${totalQuestions} (≤25 expected)`)
    console.log(`unique question ids: ${seenQids.size}`)
    console.log(`unique passage ids: ${seenPassageIds.size}`)
    console.log(`stretch passages: ${stretchPassages} (cap 1)`)

    if (totalQuestions > 25) {
      throw new Error(`§6.9 FAIL: total questions ${totalQuestions} > 25 (overshoot not trimmed)`)
    }

    console.log('\n✓ smoke test PASSED')
  } finally {
    await admin.from('map_pick_diagnostics').delete().eq('session_id', sessionId)
    await admin.from('map_attempts').delete().eq('session_id', sessionId)
    await admin.from('map_test_sessions').delete().eq('id', sessionId)
    await admin.from('map_misconception_signals').delete().eq('student_id', studentId)
    await admin.from('map_students').delete().eq('id', studentId)
    console.log('cleaned up')
  }
}

main().catch((e) => {
  console.error('\n✗ smoke test FAILED:', e.message)
  process.exit(1)
})
