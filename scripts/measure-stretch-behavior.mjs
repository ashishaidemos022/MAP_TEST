#!/usr/bin/env node
// Measures band-trajectory behavior across recent completed adaptive sessions.
// Used to validate the 2026-05-03 stretch-cap → frustration-guard change:
// the same script run before and after deploy reveals whether high performers
// are now reaching ceil_band more often.
//
// Usage:
//   node --env-file=.env.local scripts/measure-stretch-behavior.mjs [N]
//
// Reports for the last N (default 20) completed adaptive math/language sessions:
//   - subject, start_band, planned_length, accuracy
//   - distribution of bands (% at start, +1, +2, etc.)
//   - max band reached
//   - longest run at ceil_band
//   - did the frustration guard fire? at which pick?
//
// Reading sessions are excluded — different cap mechanism, separate analysis.

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(2);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const N = Number(process.argv[2] ?? 20);

const BAND_ORDER = [
  'below_161', '161_170', '171_180', '181_190',
  '191_200', '201_210', 'above_210',
];
const bandIdx = (b) => BAND_ORDER.indexOf(b);

const { data: sessions, error: e1 } = await sb
  .from('map_test_sessions')
  .select('id, student_id, subject, start_band, planned_length, started_at')
  .eq('is_adaptive', true)
  .eq('status', 'completed')
  .in('subject', ['math', 'language'])
  .order('started_at', { ascending: false })
  .limit(N);
if (e1) { console.error(e1.message); process.exit(2); }

if (sessions.length === 0) {
  console.log('No completed adaptive math/language sessions yet.');
  process.exit(0);
}

console.log(`Analyzing ${sessions.length} completed adaptive math/language sessions\n`);
console.log(
  ['session', 'subj', 'start', 'len', 'acc',
   'at_start', '+1', '+2', 'max', 'ceil_run', 'frustration'].join(' | '),
);
console.log('-'.repeat(110));

const aggregate = {
  bandDistribution: { atStart: 0, plus1: 0, plus2: 0, total: 0 },
  reachedCeil: 0,
  frustrationFired: 0,
  totalSessions: sessions.length,
};

for (const s of sessions) {
  const startIdx = bandIdx(s.start_band);
  const ceilIdx = startIdx + 2;

  const [{ data: diags }, { data: attempts }] = await Promise.all([
    sb.from('map_pick_diagnostics')
      .select('question_index, actual_band, picked_question_id')
      .eq('session_id', s.id)
      .order('question_index'),
    sb.from('map_attempts')
      .select('question_id, is_correct')
      .eq('session_id', s.id),
  ]);
  const ansByQid = new Map(attempts.map((a) => [a.question_id, a.is_correct]));

  let atStart = 0, plus1 = 0, plus2 = 0;
  let maxIdx = -Infinity;
  let currentRun = 0, longestCeilRun = 0;
  let frustrationAt = null;
  const aboveStartAnswers = []; // chronological list of answers to above-start picks

  for (const d of diags) {
    const aIdx = bandIdx(d.actual_band);
    if (aIdx === startIdx) atStart++;
    else if (aIdx === startIdx + 1) plus1++;
    else if (aIdx === startIdx + 2) plus2++;
    if (aIdx > maxIdx) maxIdx = aIdx;
    if (aIdx === ceilIdx) {
      currentRun++;
      if (currentRun > longestCeilRun) longestCeilRun = currentRun;
    } else {
      currentRun = 0;
    }

    if (aIdx > startIdx) {
      const ans = ansByQid.get(d.picked_question_id);
      if (ans !== null && ans !== undefined) {
        aboveStartAnswers.push({ idx: d.question_index, correct: ans });
      }
    }

    // Detect frustration trigger: a clamp back to start_band at this pick
    // when the prior 3 above-start picks were all wrong.
    if (frustrationAt === null && aIdx === startIdx && aboveStartAnswers.length >= 3) {
      const last3 = aboveStartAnswers.slice(-3);
      if (last3.every((x) => x.correct === false)) {
        frustrationAt = d.question_index;
      }
    }
  }

  const correct = attempts.filter((a) => a.is_correct).length;
  const total = attempts.length;
  const acc = total > 0 ? `${Math.round((correct / total) * 100)}%` : '—';
  const totalPicks = diags.length;
  const pct = (n) => totalPicks > 0 ? `${Math.round((n / totalPicks) * 100)}%` : '—';
  const maxBandLabel = maxIdx >= 0 ? BAND_ORDER[maxIdx] : '—';

  aggregate.bandDistribution.atStart += atStart;
  aggregate.bandDistribution.plus1 += plus1;
  aggregate.bandDistribution.plus2 += plus2;
  aggregate.bandDistribution.total += totalPicks;
  if (maxIdx >= ceilIdx) aggregate.reachedCeil++;
  if (frustrationAt !== null) aggregate.frustrationFired++;

  console.log(
    [
      s.id.slice(0, 8),
      s.subject.padEnd(8),
      s.start_band,
      String(s.planned_length).padStart(3),
      acc.padStart(4),
      pct(atStart).padStart(8),
      pct(plus1).padStart(4),
      pct(plus2).padStart(4),
      maxBandLabel.padEnd(9),
      String(longestCeilRun).padStart(8),
      frustrationAt !== null ? `pick ${frustrationAt}` : '—',
    ].join(' | '),
  );
}

console.log('\n=== Aggregate across all sessions ===');
const tot = aggregate.bandDistribution.total;
console.log(`% picks at start_band:    ${Math.round(100 * aggregate.bandDistribution.atStart / tot)}%`);
console.log(`% picks at start+1:       ${Math.round(100 * aggregate.bandDistribution.plus1 / tot)}%`);
console.log(`% picks at start+2:       ${Math.round(100 * aggregate.bandDistribution.plus2 / tot)}%`);
console.log(`Sessions reaching ceil:   ${aggregate.reachedCeil} / ${aggregate.totalSessions}`);
console.log(`Frustration guard fired:  ${aggregate.frustrationFired} / ${aggregate.totalSessions}`);
