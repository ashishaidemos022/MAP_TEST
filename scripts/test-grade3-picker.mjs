// Targeted smoke for Grade 3 grade-awareness in the picker.
// Creates a throwaway Grade 3 student, runs 5 picks (math), and asserts every
// picked question has grade = 3. Cleans up after.
//
// Run: npx tsx scripts/test-grade3-picker.mjs

import { createClient } from '@supabase/supabase-js'
import { getNextAdaptiveQuestion } from '../src/lib/adaptive/picker.ts'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.error('Missing env: set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (see .env.example).')
  console.error('Run with: node --env-file=.env.local scripts/test-grade3-picker.mjs')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

const subject = 'math'

const { data: student, error: sErr } = await sb
  .from('map_students')
  .insert({ display_name: 'GRADE3_PICKER_TEST', grade: 3 })
  .select('id')
  .single()
if (sErr) throw sErr
const studentId = student.id

const { data: session, error: sessErr } = await sb
  .from('map_test_sessions')
  .insert({
    student_id: studentId,
    subject,
    status: 'in_progress',
    question_ids: [],
    current_index: 0,
    correct_count: 0,
    kind: 'test',
    is_adaptive: true,
    start_band: '181_190',
    planned_length: 5,
  })
  .select('id')
  .single()
if (sessErr) throw sessErr
const sessionId = session.id

let pickedIds = []
try {
  for (let i = 0; i < 5; i++) {
    const r = await getNextAdaptiveQuestion(sessionId)
    pickedIds.push(r.question_id)
    console.log(`pick ${i + 1}: q=${r.question_id} band=${r.picked_band} fallback=${r.fallback_path ?? '-'}`)
  }
} catch (e) {
  console.error('picker threw:', e.message)
}

const { data: qRows } = await sb
  .from('map_questions')
  .select('id, grade, subject')
  .in('id', pickedIds)

let allGrade3 = true
for (const q of qRows ?? []) {
  if (q.grade !== 3) {
    console.error(`✗ picked Grade ${q.grade} question (${q.id}) for a Grade 3 student`)
    allGrade3 = false
  }
}

await sb.from('map_attempts').delete().eq('session_id', sessionId)
await sb.from('map_pick_diagnostics').delete().eq('session_id', sessionId)
await sb.from('map_test_sessions').delete().eq('id', sessionId)
await sb.from('map_students').delete().eq('id', studentId)

if (allGrade3 && pickedIds.length > 0) {
  console.log(`\n✓ all ${pickedIds.length} picks were Grade 3`)
  process.exit(0)
} else if (pickedIds.length === 0) {
  console.error('\n✗ picker returned zero picks')
  process.exit(1)
} else {
  process.exit(1)
}
