// scripts/test-banks-phase1-data.mjs
// Phase-1 data guard: vetted bank create -> assign -> compose -> complete
// trigger -> revoke semantics -> cross-family RLS (show-stopper).
// Run: node --env-file=.env.local scripts/test-banks-phase1-data.mjs
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!URL || !SERVICE || !ANON) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY')
  process.exit(2)
}
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

function assert(cond, label) {
  if (!cond) { console.error('FAIL:', label); process.exitCode = 1; throw new Error(label) }
  console.log('PASS:', label)
}

const tag = `bankguard_${Date.now()}`
const made = { users: [], families: [] }

async function makeFamily(n) {
  const email = `${tag}_${n}@example.com`
  const password = 'guard-pw-12345!'
  const { data: u, error: ue } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (ue) throw ue
  made.users.push(u.user.id)
  const { data: fam, error: fe } = await admin.from('map_families')
    .insert({ owner_user_id: u.user.id, family_name: `${tag}_${n}` })
    .select('id').single()
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

  const { data: std } = await admin.from('map_standards')
    .select('teks_code').eq('subject', 'math').eq('grade', 5).limit(1).single()
  assert(std?.teks_code, 'a vetted math/G5 standard exists')

  const { data: bankId, error: cbErr } = await A.client.rpc('map_create_bank', {
    p_name: 'Guard Fractions', p_subject: 'math', p_grade: 5, p_lane: 'vetted',
    p_standard_codes: [std.teks_code], p_planned_length: 5, p_difficulty: 'any',
  })
  assert(!cbErr && bankId, 'map_create_bank (vetted) returns an id')

  // (Phase 1 originally asserted custom-lane raises a "Phase-2" stub error.
  // Phase 2 intentionally activated the custom lane, so that stub is gone —
  // custom-lane behavior is now covered by scripts/test-banks-phase2-data.mjs.)

  const { data: aids, error: abErr } = await A.client.rpc('map_assign_bank', {
    p_bank_id: bankId, p_student_ids: [A.studentId], p_due_by: null, p_parent_note: 'go',
  })
  assert(!abErr && Array.isArray(aids) && aids.length === 1, 'map_assign_bank creates one assignment')
  const assignmentId = aids[0]

  const { data: bBanks } = await B.client.from('map_question_banks').select('id')
  assert(!(bBanks ?? []).some((r) => r.id === bankId), 'family B cannot see A bank (RLS)')
  const { data: bAsg } = await B.client.from('map_v_bank_assignment_overview').select('assignment_id')
  assert(!(bAsg ?? []).some((r) => r.assignment_id === assignmentId), 'family B cannot see A assignment (RLS)')

  const { error: xErr } = await B.client.rpc('map_assign_bank', {
    p_bank_id: bankId, p_student_ids: [B.studentId], p_due_by: null, p_parent_note: null,
  })
  assert(!!xErr, 'family B cannot assign family A bank (RLS/ownership)')

  const { data: sess, error: seErr } = await admin.from('map_test_sessions').insert({
    student_id: A.studentId, subject: 'math', grade: 5, status: 'in_progress',
    question_ids: [], current_index: 0, correct_count: 0, kind: 'custom',
    is_adaptive: false, planned_length: 5,
    custom_config: { standard_ids: [], requested_count: 5, actual_count: 5, shortfall_reason: null },
  }).select('id').single()
  assert(!seErr && sess?.id, 'composed a custom session row')
  const { error: startErr } = await A.client.rpc('map_start_bank_assignment', {
    p_assignment_id: assignmentId, p_session_id: sess.id,
  })
  assert(!startErr, 'map_start_bank_assignment links session (assigned -> in_progress)')
  const { data: a1 } = await admin.from('map_bank_assignments')
    .select('status,session_id').eq('id', assignmentId).single()
  assert(a1.status === 'in_progress' && a1.session_id === sess.id, 'assignment is in_progress + linked')

  const { error: rvErr } = await A.client.rpc('map_revoke_bank_assignment', { p_assignment_id: assignmentId })
  assert(!!rvErr, 'map_revoke_bank_assignment rejects a non-assigned assignment')

  const { error: cErr } = await admin.from('map_test_sessions')
    .update({ status: 'completed', current_index: 5, completed_at: new Date().toISOString() })
    .eq('id', sess.id)
  assert(!cErr, 'session marked completed')
  const { data: a2 } = await admin.from('map_bank_assignments')
    .select('status,completed_at').eq('id', assignmentId).single()
  assert(a2.status === 'completed' && a2.completed_at, 'trigger flipped assignment -> completed')

  const { data: aids2 } = await A.client.rpc('map_assign_bank', {
    p_bank_id: bankId, p_student_ids: [A.studentId], p_due_by: null, p_parent_note: null,
  })
  const { error: rv2 } = await A.client.rpc('map_revoke_bank_assignment', { p_assignment_id: aids2[0] })
  assert(!rv2, 'map_revoke_bank_assignment succeeds from assigned')

  console.log('\nPhase-1 bank data checks complete.')
} finally {
  await cleanup()
}
