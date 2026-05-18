// scripts/test-banks-phase2-data.mjs
// Phase-2 data guard: custom bank create -> set items (manual published) ->
// >=5 ready gate -> assign freezes version-id snapshot -> snapshot stable
// after bank edits -> compose session from snapshot -> cross-family RLS.
// Run: node --env-file=.env.local scripts/test-banks-phase2-data.mjs
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

const tag = `bank2_${Date.now()}`
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
    .insert({ display_name: `${tag}_kid_${n}`, family_id: fam.id, grade: 3, school_grade: 3 })
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

async function makePublishedQ(client, i) {
  const { data: qid, error } = await client.rpc('map_create_custom_question', {
    p_source: 'parent_manual', p_created_via: 'ui', p_subject: 'math', p_grade: 3,
    p_stem: `Guard Q${i}: 2+${i}?`, p_standard_code: null, p_difficulty: null,
    p_ai_metadata: null,
    p_choices: [
      { label: 'A', text: String(2 + i), is_correct: true, ordinal: 0, explanation_correct: 'yes', explanation_wrong: null, misconception_tag: null },
      { label: 'B', text: String(2 + i + 1), is_correct: false, ordinal: 1, explanation_correct: null, explanation_wrong: 'off by one', misconception_tag: null },
      { label: 'C', text: String(2 + i + 2), is_correct: false, ordinal: 2, explanation_correct: null, explanation_wrong: 'off by two', misconception_tag: null },
      { label: 'D', text: String(2 + i + 3), is_correct: false, ordinal: 3, explanation_correct: null, explanation_wrong: 'off by three', misconception_tag: null },
    ],
    p_passage_version_id: null, p_question_focus: null, p_stem_svg: null, p_stem_svg_alt_text: null,
  })
  if (error) throw error
  const { error: pErr } = await client.rpc('map_publish_custom_question', { p_question_id: qid })
  if (pErr) throw pErr
  return qid
}

try {
  const A = await makeFamily('A')
  const B = await makeFamily('B')

  const { data: bankId, error: cbErr } = await A.client.rpc('map_create_bank', {
    p_name: 'Fractions + Coins', p_subject: 'math', p_grade: 3, p_lane: 'custom',
    p_standard_codes: [], p_planned_length: null, p_difficulty: null,
  })
  assert(!cbErr && bankId, 'map_create_bank (custom) returns an id')

  const qids = []
  for (let i = 1; i <= 6; i++) qids.push(await makePublishedQ(A.client, i))
  assert(qids.length === 6, 'created 6 published custom questions')

  const { error: s4 } = await A.client.rpc('map_set_bank_items', {
    p_bank_id: bankId, p_custom_question_ids: qids.slice(0, 4),
  })
  assert(!s4, 'map_set_bank_items accepts 4 items')
  const { error: aFail } = await A.client.rpc('map_assign_bank', {
    p_bank_id: bankId, p_student_ids: [A.studentId], p_due_by: null, p_parent_note: null,
  })
  assert(!!aFail, 'assign blocked with <5 ready items')

  const { error: s6 } = await A.client.rpc('map_set_bank_items', {
    p_bank_id: bankId, p_custom_question_ids: qids,
  })
  assert(!s6, 'map_set_bank_items accepts 6 items')
  const { data: aids, error: aErr } = await A.client.rpc('map_assign_bank', {
    p_bank_id: bankId, p_student_ids: [A.studentId], p_due_by: null, p_parent_note: 'do these',
  })
  assert(!aErr && aids?.length === 1, 'assign succeeds with >=5 ready')
  const assignmentId = aids[0]

  const { data: asg } = await admin.from('map_bank_assignments')
    .select('snapshot_question_ids').eq('id', assignmentId).single()
  assert(Array.isArray(asg.snapshot_question_ids) && asg.snapshot_question_ids.length === 6,
    'assignment froze a 6-id snapshot')
  const { data: resolved } = await admin.from('map_custom_questions_resolved')
    .select('version_id').in('version_id', asg.snapshot_question_ids)
  assert((resolved ?? []).length === 6, 'snapshot ids are resolvable custom version ids')

  await A.client.rpc('map_set_bank_items', { p_bank_id: bankId, p_custom_question_ids: qids.slice(0, 5) })
  const { data: asg2 } = await admin.from('map_bank_assignments')
    .select('snapshot_question_ids').eq('id', assignmentId).single()
  assert(asg2.snapshot_question_ids.length === 6, 'snapshot stable after bank edits (frozen)')

  const { data: bItems } = await B.client.from('map_v_bank_items').select('bank_id').eq('bank_id', bankId)
  assert((bItems ?? []).length === 0, 'family B cannot see A bank items (RLS)')
  const { error: bSet } = await B.client.rpc('map_set_bank_items', {
    p_bank_id: bankId, p_custom_question_ids: [],
  })
  assert(!!bSet, 'family B cannot set items on A bank')

  const { data: sess, error: seErr } = await admin.from('map_test_sessions').insert({
    student_id: A.studentId, subject: 'math', grade: 3, status: 'in_progress',
    question_ids: asg.snapshot_question_ids, current_index: 0, correct_count: 0,
    kind: 'custom', is_adaptive: false, planned_length: 6,
    custom_config: { source: 'mine', standard_ids: [], requested_count: 6, actual_count: 6, shortfall_reason: null },
  }).select('id').single()
  assert(!seErr && sess?.id, 'custom session composed from snapshot version ids')
  const { error: linkErr } = await A.client.rpc('map_start_bank_assignment', {
    p_assignment_id: assignmentId, p_session_id: sess.id,
  })
  assert(!linkErr, 'map_start_bank_assignment links the custom session')

  console.log('\nPhase-2 bank data checks complete.')
} finally {
  await cleanup()
}
