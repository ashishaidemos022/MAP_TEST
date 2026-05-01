// Debug script: run reading all_correct sessions with full diagnostic dump
// to figure out how a session can reach start+2 despite the 1-passage stretch cap.

import { createClient } from '@supabase/supabase-js'
import { addNextAdaptivePassage } from '../src/lib/adaptive/passagePicker.ts'
import { bandIndex } from '../src/lib/adaptive/bands.ts'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.error('Missing env: set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (see .env.example).')
  console.error('Run with: node --env-file=.env.local scripts/debug-reading-all-correct.mjs')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

const N = Number(process.argv[2] ?? 5)
let sessionsRun = 0
let sessionsFailed = 0

for (let i = 0; i < N; i++) {
  const { data: student } = await sb
    .from('map_students')
    .insert({ display_name: `DBG_${i}` })
    .select('id')
    .single()
  const studentId = student.id

  const { data: session } = await sb
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
  const sessionId = session.id

  let answered = 0
  const trajectory = []
  let maxBand = '181_190'

  try {
    while (answered < 25) {
      const { data: s } = await sb.from('map_test_sessions').select('*').eq('id', sessionId).single()
      if (s.question_ids.length <= answered) {
        const result = await addNextAdaptivePassage(sessionId)
        trajectory.push({
          after: answered,
          target: result.target_band,
          actual: result.picked_band,
          fallback: result.fallback_path,
          cands: result.candidate_count,
          qs: result.question_ids_added.length,
        })
        if (bandIndex(result.picked_band) > bandIndex(maxBand)) maxBand = result.picked_band
      }
      const { data: s2 } = await sb.from('map_test_sessions').select('*').eq('id', sessionId).single()
      const qid = s2.question_ids[answered]
      const { data: choices } = await sb
        .from('map_question_choices')
        .select('id, is_correct')
        .eq('question_id', qid)
      const choice = choices.find((c) => c.is_correct)
      await sb.rpc('map_record_attempt', {
        p_session_id: sessionId,
        p_student_id: studentId,
        p_question_id: qid,
        p_choice_id: choice.id,
        p_time_ms: 1000,
      })
      await sb.from('map_test_sessions').update({ current_index: answered + 1 }).eq('id', sessionId)
      answered++
    }

    const failed = bandIndex(maxBand) > bandIndex('191_200')  // > start+1
    sessionsRun++
    if (failed) sessionsFailed++

    console.log(`session ${i}: max=${maxBand} ${failed ? '✗' : '✓'}`)
    if (failed) {
      console.log('  trajectory:')
      trajectory.forEach((t) => {
        console.log(`    after q${t.after}: target=${t.target} actual=${t.actual} fallback=${t.fallback || '-'} cands=${t.cands} qs=${t.qs}`)
      })

      // Pull diagnostics for this session
      const { data: diags } = await sb
        .from('map_pick_diagnostics')
        .select('*')
        .eq('session_id', sessionId)
        .order('question_index')
      console.log(`  ${diags.length} diagnostic rows:`)
      // Print one per passage (since we log one per question, dedupe by actual_band+window)
      const passageBoundaries = []
      let prevBand = null
      diags.forEach((d) => {
        if (d.actual_band !== prevBand) {
          passageBoundaries.push(d)
          prevBand = d.actual_band
        }
      })
      passageBoundaries.forEach((d) => {
        console.log(`    q${d.question_index}: target=${d.target_band} actual=${d.actual_band} fallback=${d.fallback_path || '-'} window=${JSON.stringify(d.recent_window)}`)
      })

      // Pull all picked questions with their passage_ids and rit_bands
      const { data: qDetails } = await sb
        .from('map_questions')
        .select('id, rit_band, passage_id')
        .in('id', diags.map((d) => d.picked_question_id).filter(Boolean))
      const passageBandMap = new Map()
      for (const q of qDetails) {
        if (q.passage_id) passageBandMap.set(q.passage_id, q.rit_band)
      }
      console.log(`  unique passages used:`)
      const seen = new Set()
      diags.forEach((d) => {
        const q = qDetails.find((x) => x.id === d.picked_question_id)
        if (q?.passage_id && !seen.has(q.passage_id)) {
          seen.add(q.passage_id)
          console.log(`    ${q.passage_id} band=${q.rit_band}`)
        }
      })
    }
  } finally {
    await sb.from('map_pick_diagnostics').delete().eq('session_id', sessionId)
    await sb.from('map_attempts').delete().eq('session_id', sessionId)
    await sb.from('map_test_sessions').delete().eq('id', sessionId)
    await sb.from('map_misconception_signals').delete().eq('student_id', studentId)
    await sb.from('map_students').delete().eq('id', studentId)
  }
}

console.log(`\n${sessionsRun} sessions, ${sessionsFailed} exceeded start+1`)
