// scripts/_parent-redesign-helpers.mjs
// Shared setup/teardown for the parent-area foundation verification scripts.
// Mints two ephemeral families, each owned by a real Supabase Auth user, so
// map_current_family_id() (which keys off auth.uid()) resolves correctly.
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

export const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tag = `pr-test-${Date.now()}`;

async function makeFamily(label) {
  const email = `${tag}-${label}@example.invalid`;
  const password = `Pw-${tag}-${label}!`;
  const { data: u, error: ue } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (ue) throw ue;
  const userId = u.user.id;
  const { data: fam, error: fe } = await admin
    .from('map_families')
    .insert({ owner_user_id: userId, family_name: `${tag}-${label}` })
    .select('id')
    .single();
  if (fe) throw fe;
  const familyId = fam.id;
  const { data: kids, error: ke } = await admin
    .from('map_students')
    .insert([
      { family_id: familyId, display_name: `${label}-kid1`, grade: 2, school_grade: 2 },
      { family_id: familyId, display_name: `${label}-kid2`, grade: 4, school_grade: 4 },
    ])
    .select('id, grade');
  if (ke) throw ke;
  return { email, password, userId, familyId, kids };
}

export async function setup() {
  const A = await makeFamily('A');
  const B = await makeFamily('B');
  // One legacy custom session in family A's kid1 for backfill assertions.
  const { data: sess, error: se } = await admin
    .from('map_test_sessions')
    .insert({
      student_id: A.kids[0].id,
      subject: 'math',
      status: 'completed',
      kind: 'custom',
      question_ids: [],
      current_index: 0,
      correct_count: 3,
      estimated_rit: 185,
      grade: 2,
      planned_length: 5,
      started_at: new Date(Date.now() - 86400000).toISOString(),
      completed_at: new Date(Date.now() - 86000000).toISOString(),
      custom_config: { standard_ids: [], requested_count: 5, actual_count: 3, shortfall_reason: null },
    })
    .select('id')
    .single();
  if (se) throw se;
  return { A, B, customSessionId: sess.id };
}

export async function signInClient(email, password) {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

export async function teardown(ctx) {
  const famIds = [ctx.A.familyId, ctx.B.familyId];
  const kidIds = [...ctx.A.kids, ...ctx.B.kids].map((k) => k.id);
  await admin.from('map_test_assignments').delete().in('family_id', famIds);
  await admin.from('map_test_definitions').delete().in('family_id', famIds);
  await admin.from('map_test_sessions').delete().in('student_id', kidIds);
  await admin.from('map_students').delete().in('family_id', famIds);
  await admin.from('map_families').delete().in('id', famIds);
  await admin.auth.admin.deleteUser(ctx.A.userId).catch(() => {});
  await admin.auth.admin.deleteUser(ctx.B.userId).catch(() => {});
}

export function assert(cond, label) {
  if (!cond) { console.error('FAIL:', label); process.exitCode = 1; return false; }
  console.log('PASS:', label);
  return true;
}
