// scripts/flip-parent-v2.mjs
// Per-family parent_v2 rollout flip (the brief's dev→beta→all mechanism).
// Reversible: pass false to roll a family back instantly.
// Run: node --env-file=.env.local scripts/flip-parent-v2.mjs <familyId> <true|false>
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const [familyId, flagArg] = process.argv.slice(2);
if (!familyId || (flagArg !== 'true' && flagArg !== 'false')) {
  console.error(
    'Usage: node --env-file=.env.local scripts/flip-parent-v2.mjs <familyId> <true|false>',
  );
  process.exit(2);
}
const flag = flagArg === 'true';

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: before, error: be } = await admin
  .from('map_families')
  .select('id, parent_v2')
  .eq('id', familyId)
  .single();
if (be || !before) {
  console.error('Family not found:', familyId, be?.message ?? '');
  process.exit(1);
}

const { error: ue } = await admin
  .from('map_families')
  .update({ parent_v2: flag })
  .eq('id', familyId);
if (ue) {
  console.error('Update failed:', ue.message);
  process.exit(1);
}

const { data: after, error: ae } = await admin
  .from('map_families')
  .select('parent_v2')
  .eq('id', familyId)
  .single();
if (ae) {
  console.error('Re-read failed:', ae.message);
  process.exit(1);
}

console.log(`${familyId}: parent_v2 ${before.parent_v2} → ${after.parent_v2}`);
