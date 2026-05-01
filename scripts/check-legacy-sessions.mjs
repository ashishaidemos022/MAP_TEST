// One-line diagnostic: how many in-progress non-adaptive sessions remain?
// When this hits 0, the legacy non-adaptive runner branch in TestRunner.tsx
// can be deleted (search for "TODO: remove non-adaptive branch").
//
// Run: npx tsx scripts/check-legacy-sessions.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.error('Missing env: set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (see .env.example).')
  console.error('Run with: node --env-file=.env.local scripts/check-legacy-sessions.mjs')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

const { count, error } = await sb
  .from('map_test_sessions')
  .select('id', { count: 'exact', head: true })
  .eq('is_adaptive', false)
  .eq('status', 'in_progress')

if (error) {
  console.error('query failed:', error.message)
  process.exit(1)
}

console.log(`Legacy in-progress non-adaptive sessions: ${count ?? 0}`)
if ((count ?? 0) === 0) {
  console.log('→ Safe to delete the non-adaptive branch in TestRunner.tsx.')
}
