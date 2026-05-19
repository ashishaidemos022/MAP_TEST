// scripts/test-assignment-dismiss-data.mjs
// Dismiss guard: completed/revoked dismiss → hidden from the overview view;
// dismissing assigned / in_progress → raises & stays; already-dismissed →
// raises; cross-family blocked.
// Run: node --env-file=.env.local scripts/test-assignment-dismiss-data.mjs
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

const tag = `dismiss_${Date.now()}`
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
async function makeBank(client, std) {
  const { data, error } = await client.rpc('map_create_bank', {
    p_name: 'DismissGuard', p_subject: 'math', p_grade: 5, p_lane: 'vetted',
    p_standard_codes: [std], p_planned_length: 5, p_difficulty: 'any',
  })
  if (error) throw error
  return data
}
async function assign(client, bankId, studentId) {
  const { data, error } = await client.rpc('map_assign_bank', {
    p_bank_id: bankId, p_student_ids: [studentId], p_due_by: null, p_parent_note: null,
  })
  if (error) throw error
  return data[0]
}
function inView(client, aid) {
  return client.from('map_v_bank_assignment_overview').select('assignment_id')
    .eq('assignment_id', aid).maybeSingle().then(({ data }) => !!data)
}

try {
  const A = await makeFamily('A')
  const B = await makeFamily('B')
  const { data: std } = await admin.from('map_standards')
    .select('teks_code').eq('subject', 'math').eq('grade', 5).limit(1).single()
  assert(std?.teks_code, 'a vetted math/G5 standard exists')
  const bank = await makeBank(A.client, std.teks_code)

  // assigned → dismiss must RAISE and the row stays in the view.
  const aAssigned = await assign(A.client, bank, A.studentId)
  const { error: e1 } = await A.client.rpc('map_dismiss_bank_assignment', { p_assignment_id: aAssigned })
  assert(!!e1, 'dismiss of an assigned assignment raises')
  assert(await inView(A.client, aAssigned), 'assigned row still visible after blocked dismiss')

  // revoked → dismiss succeeds, row leaves the view.
  await A.client.rpc('map_revoke_bank_assignment', { p_assignment_id: aAssigned })
  const { error: e2 } = await A.client.rpc('map_dismiss_bank_assignment', { p_assignment_id: aAssigned })
  assert(!e2, 'dismiss of a revoked assignment succeeds')
  assert(!(await inView(A.client, aAssigned)), 'revoked+dismissed row gone from view')
  const { data: r1 } = await admin.from('map_bank_assignments')
    .select('dismissed_at').eq('id', aAssigned).single()
  assert(r1.dismissed_at !== null, 'dismissed_at is set')

  // already dismissed → raises.
  const { error: e3 } = await A.client.rpc('map_dismiss_bank_assignment', { p_assignment_id: aAssigned })
  assert(!!e3, 'dismissing an already-dismissed assignment raises')

  // completed path: assign → start (in_progress) → dismiss raises → complete → dismiss ok.
  const aDone = await assign(A.client, bank, A.studentId)
  const { data: sess } = await admin.from('map_test_sessions').insert({
    student_id: A.studentId, subject: 'math', grade: 5, status: 'in_progress',
    question_ids: [], current_index: 0, correct_count: 0, kind: 'custom',
    is_adaptive: false, planned_length: 5,
    custom_config: { standard_ids: [], requested_count: 5, actual_count: 5, shortfall_reason: null },
  }).select('id').single()
  await A.client.rpc('map_start_bank_assignment', { p_assignment_id: aDone, p_session_id: sess.id })
  const { error: e4 } = await A.client.rpc('map_dismiss_bank_assignment', { p_assignment_id: aDone })
  assert(!!e4, 'dismiss of an in_progress assignment raises')
  await admin.from('map_test_sessions')
    .update({ status: 'completed', current_index: 5, completed_at: new Date().toISOString() })
    .eq('id', sess.id)
  const { data: aRow } = await admin.from('map_bank_assignments').select('status').eq('id', aDone).single()
  assert(aRow.status === 'completed', 'assignment reached completed via trigger')
  const { error: e5 } = await A.client.rpc('map_dismiss_bank_assignment', { p_assignment_id: aDone })
  assert(!e5, 'dismiss of a completed assignment succeeds')
  assert(!(await inView(A.client, aDone)), 'completed+dismissed row gone from view')

  // cross-family: B cannot dismiss A's row.
  const aX = await assign(A.client, bank, A.studentId)
  await A.client.rpc('map_revoke_bank_assignment', { p_assignment_id: aX })
  const { error: e6 } = await B.client.rpc('map_dismiss_bank_assignment', { p_assignment_id: aX })
  assert(!!e6, 'family B cannot dismiss family A assignment')
  const { data: rX } = await admin.from('map_bank_assignments').select('dismissed_at').eq('id', aX).single()
  assert(rX.dismissed_at === null, "A's row untouched by B")

  console.log('\nAssignment-dismiss data checks complete.')
} finally {
  await cleanup()
}
