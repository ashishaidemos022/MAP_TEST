// scripts/test-delete-student.mjs
// Delete-student data guard: hard delete cascades sessions/attempts/signals and
// bank assignments; the in_progress-assignment trap case succeeds (assignments
// deleted before sessions); question reports survive with student_id NULL;
// cross-family blocked; already-deleted raises.
// Run: node --env-file=.env.local scripts/test-delete-student.mjs
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!URL || !SERVICE || !ANON) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY')
  process.exit(2)
}
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
function assert(c, l) { if (!c) { console.error('FAIL:', l); process.exitCode = 1; throw new Error(l) } console.log('PASS:', l) }

const tag = `delstu_${Date.now()}`
const made = { users: [], families: [] }

async function makeFamily(n) {
  const email = `${tag}_${n}@example.com`, password = 'guard-pw-12345!'
  const { data: u, error: ue } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (ue) throw ue
  made.users.push(u.user.id)
  const { data: fam, error: fe } = await admin.from('map_families')
    .insert({ owner_user_id: u.user.id, family_name: `${tag}_${n}` }).select('id').single()
  if (fe) throw fe
  made.families.push(fam.id)
  const { data: stu, error: se } = await admin.from('map_students')
    .insert({ display_name: `${tag}_kid_${n}`, family_id: fam.id, grade: 5, school_grade: 5 })
    .select('id').single()
  if (se) throw se
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: le } = await client.auth.signInWithPassword({ email, password })
  if (le) throw le
  return { familyId: fam.id, studentId: stu.id, client }
}
async function cleanup() {
  for (const id of made.families) await admin.from('map_families').delete().eq('id', id)
  for (const id of made.users) await admin.auth.admin.deleteUser(id).catch(() => {})
}

try {
  const A = await makeFamily('A')
  const B = await makeFamily('B')

  // A vetted math/G5 standard to build a bank from.
  const { data: std } = await admin.from('map_standards')
    .select('teks_code').eq('subject', 'math').eq('grade', 5).limit(1).single()
  assert(std?.teks_code, 'a vetted math/G5 standard exists')

  // A real active question + one of its choices, to make the attempt meaningful.
  const { data: q } = await admin.from('map_questions')
    .select('id').eq('is_active', true).limit(1).single()
  assert(q?.id, 'an active question exists')
  const { data: ch } = await admin.from('map_question_choices')
    .select('id').eq('question_id', q.id).limit(1).single()
  assert(ch?.id, 'the question has a choice')

  // A creates + assigns a bank (assign returns an array of assignment ids).
  const { data: bankId, error: cErr } = await A.client.rpc('map_create_bank', {
    p_name: 'DelStu Set', p_subject: 'math', p_grade: 5, p_lane: 'vetted',
    p_standard_codes: [std.teks_code], p_planned_length: 5, p_difficulty: 'any',
  })
  assert(!cErr && bankId, 'map_create_bank returns a bank id')
  const { data: aids, error: aErr } = await A.client.rpc('map_assign_bank', {
    p_bank_id: bankId, p_student_ids: [A.studentId], p_due_by: null, p_parent_note: null,
  })
  assert(!aErr && Array.isArray(aids) && aids.length === 1, 'map_assign_bank creates one assignment')
  const assignmentId = aids[0]

  // Admin-insert a session for the kid (same shape as test-banks-phase1-data.mjs).
  const { data: sess, error: seErr } = await admin.from('map_test_sessions').insert({
    student_id: A.studentId, subject: 'math', grade: 5, status: 'in_progress',
    question_ids: [q.id], current_index: 0, correct_count: 0, kind: 'custom',
    is_adaptive: false, planned_length: 5,
    custom_config: { standard_ids: [], requested_count: 5, actual_count: 5, shortfall_reason: null },
  }).select('id').single()
  assert(!seErr && sess?.id, 'composed a session row for the kid')
  const sessionId = sess.id

  // Admin-insert one attempt in that session (proves the session-cascade path).
  const { error: atErr } = await admin.from('map_attempts').insert({
    session_id: sessionId, student_id: A.studentId, question_id: q.id,
    selected_choice_id: ch.id, is_correct: false, time_spent_ms: 1000,
  })
  assert(!atErr, 'inserted one attempt in the session')

  // Seed one pick-diagnostic (session cascade) and one misconception signal
  // (student cascade). The runner/picker normally writes these; we insert them
  // directly so the post-delete count-0 assertions below are NOT vacuous —
  // without a row to begin with, "deleted" would pass even if the cascade broke.
  const { error: pdErr } = await admin.from('map_pick_diagnostics').insert({
    session_id: sessionId, question_index: 0,
    target_band: '201_210', actual_band: '201_210', candidate_count: 1,
  })
  assert(!pdErr, 'seeded a pick-diagnostic row for the session')
  const { data: tagRow } = await admin.from('map_misconception_tags')
    .select('tag').limit(1).single()
  assert(tagRow?.tag, 'a misconception tag exists')
  const { error: msErr } = await admin.from('map_misconception_signals').insert({
    student_id: A.studentId, misconception_tag: tagRow.tag, occurrence_count: 1,
  })
  assert(!msErr, 'seeded a misconception signal for the kid')

  // Pre-delete sanity: both rows are really there, so the count-0 checks bite.
  const preDiag = await admin.from('map_pick_diagnostics')
    .select('id', { count: 'exact', head: true }).eq('session_id', sessionId)
  assert((preDiag.count ?? 0) > 0, 'pick diagnostics exist before delete')
  const preSignals = await admin.from('map_misconception_signals')
    .select('id', { count: 'exact', head: true }).eq('student_id', A.studentId)
  assert((preSignals.count ?? 0) > 0, 'misconception signals exist before delete')

  // Link the assignment to the session -> in_progress (this is the trap case).
  const { error: startErr } = await A.client.rpc('map_start_bank_assignment', {
    p_assignment_id: assignmentId, p_session_id: sessionId,
  })
  assert(!startErr, 'map_start_bank_assignment links session (assigned -> in_progress)')
  const { data: aRow } = await admin.from('map_bank_assignments')
    .select('status, session_id').eq('id', assignmentId).single()
  assert(aRow.status === 'in_progress' && aRow.session_id === sessionId, 'assignment is in_progress + linked')

  // A files a question report tied to the kid + session, via the RPC (reports
  // are SELECT-only under RLS; writes only through map_report_question).
  const { data: reportId, error: rErr } = await A.client.rpc('map_report_question', {
    p_question_id: q.id, p_reason: 'wrong_answer',
    p_session_id: sessionId, p_student_id: A.studentId,
  })
  assert(!rErr && reportId, 'A files a question report tied to the kid')

  // 1. Cross-family: B cannot delete A's kid.
  const { error: dX } = await B.client.rpc('map_delete_student', { p_student_id: A.studentId })
  assert(!!dX, 'family B cannot delete family A kid')
  const { data: stillThere } = await admin.from('map_students')
    .select('id').eq('id', A.studentId).maybeSingle()
  assert(!!stillThere, "A's kid untouched by B's delete attempt")

  // 2. A deletes its own kid -> succeeds despite the in_progress assignment (trap case).
  const { error: d1 } = await A.client.rpc('map_delete_student', { p_student_id: A.studentId })
  assert(!d1, 'map_delete_student succeeds with an in_progress bank assignment (trap handled)')

  // 3. Student + all per-student data gone.
  const { data: goneStu } = await admin.from('map_students')
    .select('id').eq('id', A.studentId).maybeSingle()
  assert(!goneStu, 'student row deleted')
  const afterSessions = await admin.from('map_test_sessions')
    .select('id', { count: 'exact', head: true }).eq('student_id', A.studentId)
  assert((afterSessions.count ?? 0) === 0, 'sessions deleted')
  const afterAttempts = await admin.from('map_attempts')
    .select('id', { count: 'exact', head: true }).eq('session_id', sessionId)
  assert((afterAttempts.count ?? 0) === 0, 'attempts deleted (session cascade)')
  const afterDiag = await admin.from('map_pick_diagnostics')
    .select('id', { count: 'exact', head: true }).eq('session_id', sessionId)
  assert((afterDiag.count ?? 0) === 0, 'pick diagnostics deleted (session cascade)')
  const afterSignals = await admin.from('map_misconception_signals')
    .select('id', { count: 'exact', head: true }).eq('student_id', A.studentId)
  assert((afterSignals.count ?? 0) === 0, 'misconception signals deleted')
  const afterAssign = await admin.from('map_bank_assignments')
    .select('id', { count: 'exact', head: true }).eq('student_id', A.studentId)
  assert((afterAssign.count ?? 0) === 0, 'bank assignments deleted')

  // 4. Question report survives, anonymized (student_id NULL).
  const { data: survived } = await admin.from('map_question_reports')
    .select('id, student_id').eq('id', reportId).maybeSingle()
  assert(!!survived, 'question report survives the kid delete')
  assert(survived.student_id === null, 'surviving report is anonymized (student_id NULL)')

  // 5. Deleting an already-deleted kid -> raises.
  const { error: d2 } = await A.client.rpc('map_delete_student', { p_student_id: A.studentId })
  assert(!!d2, 'deleting an already-deleted kid raises')

  console.log('\nDelete-student data checks complete.')
} finally {
  await cleanup()
}
