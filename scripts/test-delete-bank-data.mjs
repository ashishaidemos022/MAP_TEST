// scripts/test-delete-bank-data.mjs
// Delete-bank data guard: soft-delete with no assignments succeeds & hides
// the bank; delete blocked when an assignment exists; cross-family blocked;
// nonexistent/already-deleted raises.
// Run: node --env-file=.env.local scripts/test-delete-bank-data.mjs
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

const tag = `delbank_${Date.now()}`
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

async function makeVettedBank(client, std) {
  const { data, error } = await client.rpc('map_create_bank', {
    p_name: 'DelGuard', p_subject: 'math', p_grade: 5, p_lane: 'vetted',
    p_standard_codes: [std], p_planned_length: 5, p_difficulty: 'any',
  })
  if (error) throw error
  return data
}

try {
  const A = await makeFamily('A')
  const B = await makeFamily('B')
  const { data: std } = await admin.from('map_standards')
    .select('teks_code').eq('subject', 'math').eq('grade', 5).limit(1).single()
  assert(std?.teks_code, 'a vetted math/G5 standard exists')

  // 1. Delete with no assignments → succeeds, hidden from listBanks-shaped query.
  const bank1 = await makeVettedBank(A.client, std.teks_code)
  const { error: d1 } = await A.client.rpc('map_soft_delete_bank', { p_bank_id: bank1 })
  assert(!d1, 'map_soft_delete_bank succeeds with no assignments')
  const { data: listed } = await A.client
    .from('map_question_banks').select('id').is('soft_deleted_at', null)
  assert(!(listed ?? []).some((r) => r.id === bank1), 'deleted bank no longer in listBanks query')
  const { data: row1 } = await admin.from('map_question_banks')
    .select('soft_deleted_at').eq('id', bank1).single()
  assert(row1.soft_deleted_at !== null, 'soft_deleted_at is set')

  // 2. Re-deleting an already-soft-deleted bank → raises.
  const { error: d1b } = await A.client.rpc('map_soft_delete_bank', { p_bank_id: bank1 })
  assert(!!d1b, 'deleting an already-soft-deleted bank raises')

  // 3. Nonexistent id → raises.
  const { error: dN } = await A.client.rpc('map_soft_delete_bank', {
    p_bank_id: '00000000-0000-0000-0000-000000000000',
  })
  assert(!!dN, 'deleting a nonexistent bank raises')

  // 4. Bank with an assignment → blocked, bank still listed.
  const bank2 = await makeVettedBank(A.client, std.teks_code)
  const { error: aErr } = await A.client.rpc('map_assign_bank', {
    p_bank_id: bank2, p_student_ids: [A.studentId], p_due_by: null, p_parent_note: null,
  })
  assert(!aErr, 'assigned bank2 to A kid')
  const { error: d2 } = await A.client.rpc('map_soft_delete_bank', { p_bank_id: bank2 })
  assert(!!d2, 'map_soft_delete_bank blocked when an assignment exists')
  const { data: row2 } = await admin.from('map_question_banks')
    .select('soft_deleted_at').eq('id', bank2).single()
  assert(row2.soft_deleted_at === null, 'blocked bank is still live (not soft-deleted)')

  // 5. Cross-family: B cannot delete A's bank.
  const bank3 = await makeVettedBank(A.client, std.teks_code)
  const { error: dX } = await B.client.rpc('map_soft_delete_bank', { p_bank_id: bank3 })
  assert(!!dX, 'family B cannot delete family A bank')
  const { data: row3 } = await admin.from('map_question_banks')
    .select('soft_deleted_at').eq('id', bank3).single()
  assert(row3.soft_deleted_at === null, "A's bank untouched by B's delete attempt")

  console.log('\nDelete-bank data checks complete.')
} finally {
  await cleanup()
}
