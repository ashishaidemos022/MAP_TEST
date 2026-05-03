#!/usr/bin/env node
// Reports any misconception_tag values used on map_question_choices
// that are not registered in map_misconception_tags. Run after every
// authoring batch (per CLAUDE.md §9.5) and gate any merge that adds
// distractors with new tags.
//
// Usage: node --env-file=.env.local scripts/check-misconception-orphans.mjs
// Exits 0 when the bank is clean, 1 when orphans exist.

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(2);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: parentTags, error: e1 } = await sb
  .from('map_misconception_tags')
  .select('tag');
if (e1) { console.error('parent fetch failed:', e1.message); process.exit(2); }
const valid = new Set(parentTags.map((r) => r.tag));

// PostgREST caps pages at 1000 by default — paginate explicitly so we never
// silently miss orphans (the bug that hid 10 tags on the first pass of this check).
const PAGE = 1000;
const choices = [];
for (let from = 0; ; from += PAGE) {
  const { data, error: e2 } = await sb
    .from('map_question_choices')
    .select('misconception_tag, map_questions!inner(grade, subject)')
    .not('misconception_tag', 'is', null)
    .order('id', { ascending: true })
    .range(from, from + PAGE - 1);
  if (e2) { console.error('choices fetch failed:', e2.message); process.exit(2); }
  choices.push(...data);
  if (data.length < PAGE) break;
}

const orphanCounts = new Map(); // tag -> { total, byGradeSubject: Map }
for (const c of choices) {
  if (valid.has(c.misconception_tag)) continue;
  const tag = c.misconception_tag;
  const key = `G${c.map_questions.grade} ${c.map_questions.subject}`;
  if (!orphanCounts.has(tag)) orphanCounts.set(tag, { total: 0, byKey: new Map() });
  const entry = orphanCounts.get(tag);
  entry.total += 1;
  entry.byKey.set(key, (entry.byKey.get(key) ?? 0) + 1);
}

console.log(`parent taxonomy: ${valid.size} tags`);
console.log(`distinct tags used on choices: ${new Set(choices.map((c) => c.misconception_tag)).size}`);

if (orphanCounts.size === 0) {
  console.log('✓ no orphan misconception tags');
  process.exit(0);
}

console.log(`✗ ${orphanCounts.size} orphan tag(s) — these will 409 in map_record_attempt:`);
const sorted = [...orphanCounts.entries()].sort((a, b) => b[1].total - a[1].total);
for (const [tag, info] of sorted) {
  const byKey = [...info.byKey.entries()].map(([k, n]) => `${k}: ${n}`).join(', ');
  console.log(`  ${tag} — ${info.total} distractor(s) [${byKey}]`);
}
process.exit(1);
