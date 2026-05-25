// scripts/test-question-reports.mjs
// Data guard for question reporting: RPC insert stamps family_id, trims/caps
// reason_text, rejects non-vetted question ids, and RLS isolates families.
// Run: node --env-file=.env.local scripts/test-question-reports.mjs
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

const tag = `reportguard_${Date.now()}`
const made = { users: [], families: [] }

async function makeFamily(n) {
  const email = `${tag}_${n}@example.com`
  const password = 'guard-pw-12345!'
  const { data: u, error: ue } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
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

  // A vetted question + one of its choices for context.
  const { data: q } = await admin.from('map_questions').select('id').eq('is_active', true).limit(1).single()
  assert(q?.id, 'a vetted question exists')
  const { data: ch } = await admin.from('map_question_choices').select('id').eq('question_id', q.id).limit(1).single()
  assert(ch?.id, 'the vetted question has a choice')

  // 1. RPC insert stamps family_id and trims reason_text.
  const { data: reportId, error: rErr } = await A.client.rpc('map_report_question', {
    p_question_id: q.id,
    p_reason: 'confusing_wording',
    p_reason_text: '  too tricky  ',
    p_student_id: A.studentId,
    p_selected_choice_id: ch.id,
  })
  assert(!rErr && reportId, `RPC insert returns id (${rErr?.message ?? ''})`)
  const { data: row } = await admin.from('map_question_reports').select('*').eq('id', reportId).single()
  assert(row.family_id === A.familyId, 'family_id stamped server-side (not client-supplied)')
  assert(row.reason_text === 'too tricky', 'reason_text is trimmed')
  assert(row.status === 'new', 'status defaults to new')
  assert(row.question_id === q.id && row.selected_choice_id === ch.id, 'context columns persisted')

  // 2. Non-vetted / unknown question id is rejected.
  const { error: badErr } = await A.client.rpc('map_report_question', {
    p_question_id: '00000000-0000-0000-0000-000000000000',
    p_reason: 'other',
    p_reason_text: 'x',
  })
  assert(badErr && /not found in vetted bank/.test(badErr.message), 'unknown question id rejected')

  // 3. Family isolation under RLS.
  const { data: bSees } = await B.client.from('map_question_reports').select('id').eq('id', reportId)
  assert((bSees ?? []).length === 0, 'family B cannot read family A report (RLS)')
  const { data: aSees } = await A.client.from('map_question_reports').select('id').eq('id', reportId)
  assert((aSees ?? []).length === 1, 'family A can read its own report (RLS)')

  // 4. reason_text cap (1000) and empty -> null.
  const { data: capId } = await A.client.rpc('map_report_question', {
    p_question_id: q.id, p_reason: 'typo_or_error', p_reason_text: 'z'.repeat(2000),
  })
  const { data: capRow } = await admin.from('map_question_reports').select('reason_text').eq('id', capId).single()
  assert(capRow.reason_text.length === 1000, 'reason_text capped at 1000 chars')
  const { data: emptyId } = await A.client.rpc('map_report_question', {
    p_question_id: q.id, p_reason: 'other', p_reason_text: '   ',
  })
  const { data: emptyRow } = await admin.from('map_question_reports').select('reason_text').eq('id', emptyId).single()
  assert(emptyRow.reason_text === null, 'whitespace-only reason_text stored as null')

  console.log('\nAll question-report data guards passed.')
} finally {
  await cleanup()
}
