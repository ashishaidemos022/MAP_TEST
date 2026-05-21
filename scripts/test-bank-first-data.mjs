// scripts/test-bank-first-data.mjs
// Bank-first authoring data guard. Verifies:
//   * map_create_or_find_custom_bank reuse vs suffix paths
//   * map_add_items_to_bank ownership and subject/grade match
//   * map_rename_bank collision check
//   * map_v_custom_bank_overview counts
//   * cross-family RLS isolation (family A can't see family B's bank)
// Run: node --env-file=.env.local scripts/test-bank-first-data.mjs
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

const tag = `bankfirst_${Date.now()}`
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

async function makeCustomQuestion(client, subject, grade) {
  const { data, error } = await client.rpc('map_create_custom_question', {
    p_source: 'parent_manual',
    p_created_via: 'ui',
    p_subject: subject,
    p_grade: grade,
    p_stem: `Test stem ${tag} ${Math.random()}`,
    p_standard_code: null,
    p_difficulty: null,
    p_ai_metadata: null,
    p_choices: [
      { label: 'A', text: 'a', is_correct: true,  ordinal: 0, explanation_correct: 'Correct.', explanation_wrong: null, misconception_tag: null },
      { label: 'B', text: 'b', is_correct: false, ordinal: 1, explanation_correct: null, explanation_wrong: null, misconception_tag: null },
      { label: 'C', text: 'c', is_correct: false, ordinal: 2, explanation_correct: null, explanation_wrong: null, misconception_tag: null },
      { label: 'D', text: 'd', is_correct: false, ordinal: 3, explanation_correct: null, explanation_wrong: null, misconception_tag: null },
    ],
    p_passage_version_id: null,
    p_question_focus: null,
    p_stem_svg: null,
    p_stem_svg_alt_text: null,
  })
  if (error) throw error
  return data
}

async function cleanup() {
  for (const id of made.families) await admin.from('map_families').delete().eq('id', id)
  for (const id of made.users)    await admin.auth.admin.deleteUser(id).catch(() => {})
}

try {
  const A = await makeFamily('A')
  const B = await makeFamily('B')

  // 1. Reuse path: same (name, subject, grade) returns the same bank.
  const { data: r1, error: e1 } = await A.client.rpc('map_create_or_find_custom_bank',
    { p_name: 'Fractions on a number line — Math G3', p_subject: 'math', p_grade: 3 })
  if (e1) throw e1
  assert(r1[0].was_created === true, 'A first call created bank')
  const bankId = r1[0].bank_id

  const { data: r2, error: e2 } = await A.client.rpc('map_create_or_find_custom_bank',
    { p_name: 'Fractions on a number line — Math G3', p_subject: 'math', p_grade: 3 })
  if (e2) throw e2
  assert(r2[0].bank_id === bankId && r2[0].was_created === false, 'A second call reused bank')

  // 2. Suffix path: same name but different subject → '(2)'.
  const { data: r3, error: e3 } = await A.client.rpc('map_create_or_find_custom_bank',
    { p_name: 'Fractions on a number line — Math G3', p_subject: 'reading', p_grade: 3 })
  if (e3) throw e3
  assert(r3[0].resolved_name === 'Fractions on a number line — Math G3 (2)' && r3[0].was_created === true,
    'A same name + different subject → suffix (2)')

  // 3. Cross-family isolation: B cannot see A's bank.
  const { data: bList, error: bErr } = await B.client.from('map_v_custom_bank_overview')
    .select('id').eq('id', bankId)
  if (bErr) throw bErr
  assert((bList ?? []).length === 0, 'B cannot see A bank via overview view')

  // 4. add_items_to_bank: ownership + subject/grade match.
  const qA = await makeCustomQuestion(A.client, 'math', 3)
  const { error: addErr } = await A.client.rpc('map_add_items_to_bank',
    { p_bank_id: bankId, p_question_ids: [qA], p_passage_ids: [] })
  assert(!addErr, `A added own math/G3 question to math/G3 bank${addErr ? ': ' + addErr.message : ''}`)

  const qWrongGrade = await makeCustomQuestion(A.client, 'math', 2)
  const { error: gradeErr } = await A.client.rpc('map_add_items_to_bank',
    { p_bank_id: bankId, p_question_ids: [qWrongGrade], p_passage_ids: [] })
  assert(gradeErr !== null, 'add_items rejects mismatched grade')

  const qB = await makeCustomQuestion(B.client, 'math', 3)
  const { error: crossErr } = await A.client.rpc('map_add_items_to_bank',
    { p_bank_id: bankId, p_question_ids: [qB], p_passage_ids: [] })
  assert(crossErr !== null, 'A cannot add B-owned question to A bank')

  // 5. Rename collision: create a sibling bank then try to rename onto it.
  const { data: sib, error: sibErr } = await A.client.rpc('map_create_or_find_custom_bank',
    { p_name: 'Sibling — Math G3', p_subject: 'math', p_grade: 3 })
  if (sibErr) throw sibErr
  const { error: renameErr } = await A.client.rpc('map_rename_bank',
    { p_bank_id: sib[0].bank_id, p_name: 'Fractions on a number line — Math G3' })
  assert(renameErr !== null, 'rename refuses collision with sibling bank')
  const { error: renameOk } = await A.client.rpc('map_rename_bank',
    { p_bank_id: sib[0].bank_id, p_name: 'Sibling renamed — Math G3' })
  assert(renameOk === null, 'rename accepts non-colliding name')

  // 6. Overview counts: A's primary bank should have question_count = 1, ready_question_count = 0 (draft).
  const { data: ov, error: ovErr } = await A.client.from('map_v_custom_bank_overview')
    .select('question_count, ready_question_count, draft_question_count')
    .eq('id', bankId).single()
  if (ovErr) throw ovErr
  assert(ov.question_count === 1 && ov.draft_question_count === 1 && ov.ready_question_count === 0,
    `overview counts: q=${ov.question_count} draft=${ov.draft_question_count} ready=${ov.ready_question_count}`)

  console.log('\n✅ ALL BANK-FIRST DATA GUARDS PASSED')
} catch (e) {
  console.error(e)
  process.exitCode = 1
} finally {
  await cleanup()
}
