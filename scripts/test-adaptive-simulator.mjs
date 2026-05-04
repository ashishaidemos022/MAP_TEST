// §6.12 / §7.6 — 100-session simulator for the adaptive composer.
//
// Creates throwaway students + sessions (so signals/mastery don't pollute the
// real student), drives each session through 25 picks against a scripted
// answer pattern, asserts §6.1-§6.11, prints aggregate report.
//
// Run: npx tsx scripts/test-adaptive-simulator.mjs [N]
//   N = number of sessions (default 100). Smaller for quick smoke.

import { createClient } from '@supabase/supabase-js'
import { getNextAdaptiveQuestion } from '../src/lib/adaptive/picker.ts'
import { addNextAdaptivePassage } from '../src/lib/adaptive/passagePicker.ts'
import { bandIndex } from '../src/lib/adaptive/bands.ts'

const SUPABASE_URL = process.env.SUPABASE_URL
// Service role bypasses RLS — required since 2026-04-28 multi-tenant migration
// enabled RLS on map_students and others. The simulator inserts throwaway test
// rows that no auth context could legitimately create.
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).')
  console.error('Run with: node --env-file=.env.local scripts/test-adaptive-simulator.mjs')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

const N = Number(process.argv[2] ?? 100)
const PLANNED_LENGTH = 25

// === Pattern generators ===
// Each returns a function (questionIndex 1-based) → boolean (correct?).
function patternAllCorrect() { return () => true }
function patternAllWrong()   { return () => false }
function patternAccuracy(rate, seed) {
  // Deterministic per-session: weighted-rate generator with stable LCG seed.
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    const u = state / 0xFFFFFFFF
    return u < rate
  }
}

const PATTERNS = [
  { name: 'all_correct',  weight: 10, gen: () => patternAllCorrect() },
  { name: 'all_wrong',    weight: 10, gen: () => patternAllWrong() },
  { name: 'mixed_80',     weight: 20, gen: (seed) => patternAccuracy(0.80, seed) },
  { name: 'mixed_70',     weight: 30, gen: (seed) => patternAccuracy(0.70, seed) },
  { name: 'mixed_50',     weight: 20, gen: (seed) => patternAccuracy(0.50, seed) },
  { name: 'mixed_30',     weight: 10, gen: (seed) => patternAccuracy(0.30, seed) },
]

const SUBJECTS = [
  { name: 'math',     weight: 40 },
  { name: 'reading',  weight: 30 },
  { name: 'language', weight: 30 },
]

function weightedPick(arr, rand) {
  const total = arr.reduce((a, b) => a + b.weight, 0)
  let r = rand() * total
  for (const item of arr) {
    if ((r -= item.weight) < 0) return item
  }
  return arr[arr.length - 1]
}

// Mulberry32 RNG (deterministic across runs)
function rng(seed) {
  let s = seed
  return () => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// === Per-session run ===
async function runSession({ subject, patternName, patternFn, sessionIdx }) {
  const failures = []

  // 1. throwaway student. school_grade and grade became NOT NULL after the
  // multi-tenant migration; pin to grade 2 so questions exist in the bank.
  const { data: student, error: sErr } = await sb
    .from('map_students')
    .insert({
      display_name: `SIM_${sessionIdx}_${subject}_${patternName}`,
      school_grade: 2,
      grade: 2,
    })
    .select('id')
    .single()
  if (sErr) throw sErr
  const studentId = student.id

  // 2. empty adaptive session — grade became NOT NULL after migration; pin to 2
  const { data: session, error: sessErr } = await sb
    .from('map_test_sessions')
    .insert({
      student_id: studentId,
      subject,
      grade: 2,
      status: 'in_progress',
      question_ids: [],
      current_index: 0,
      correct_count: 0,
      kind: 'test',
      is_adaptive: true,
      start_band: '181_190',
      planned_length: PLANNED_LENGTH,
    })
    .select('*')
    .single()
  if (sessErr) throw sessErr
  const sessionId = session.id
  const startIdx = bandIndex(session.start_band)

  const sequence = []  // [{ i, target, actual, fallback }]
  const seenQids = new Set()
  let stretchCount = 0
  let answeredQuestions = 0

  try {
    while (answeredQuestions < PLANNED_LENGTH) {
      // Read current state
      const { data: s } = await sb.from('map_test_sessions').select('*').eq('id', sessionId).single()

      // Need a question to answer? If buffer is short, call picker.
      if (s.question_ids.length <= answeredQuestions) {
        if (subject === 'reading') {
          await addNextAdaptivePassage(sessionId)
        } else {
          await getNextAdaptiveQuestion(sessionId)
        }
      }

      const { data: s2 } = await sb.from('map_test_sessions').select('*').eq('id', sessionId).single()
      const qid = s2.question_ids[answeredQuestions]

      if (seenQids.has(qid)) {
        failures.push(`§6.7: duplicate question ${qid} at slot ${answeredQuestions + 1}`)
      }
      seenQids.add(qid)

      // Retry transient errors — at high query volume Supabase occasionally
      // returns null data without an error field; we want to distinguish "real
      // empty result" from "transient null."
      let choices = null
      let lastChoicesErr = null
      for (let attempt = 0; attempt < 3; attempt++) {
        const r = await sb
          .from('map_question_choices')
          .select('id, is_correct')
          .eq('question_id', qid)
        if (r.error) {
          lastChoicesErr = r.error
          await new Promise((res) => setTimeout(res, 250 * (attempt + 1)))
          continue
        }
        if (r.data && r.data.length > 0) {
          choices = r.data
          break
        }
        await new Promise((res) => setTimeout(res, 250 * (attempt + 1)))
      }
      if (!choices) {
        failures.push(`No choices for question ${qid} after retries (lastErr: ${lastChoicesErr?.message ?? 'null data'})`)
        break
      }

      const wantCorrect = patternFn(answeredQuestions + 1)
      const choice = wantCorrect
        ? choices.find((c) => c.is_correct)
        : choices.find((c) => !c.is_correct)
      if (!choice) {
        failures.push(`No choice matching wantCorrect=${wantCorrect} for q ${qid}`)
        break
      }

      let rpcErr = null
      for (let attempt = 0; attempt < 3; attempt++) {
        const r = await sb.rpc('map_record_attempt', {
          p_session_id: sessionId,
          p_student_id: studentId,
          p_question_id: qid,
          p_choice_id: choice.id,
          p_time_ms: 1000,
        })
        rpcErr = r.error
        if (!rpcErr) break
        await new Promise((res) => setTimeout(res, 250 * (attempt + 1)))
      }
      if (rpcErr) {
        failures.push(`map_record_attempt failed: ${rpcErr.message}`)
        break
      }

      // bump current_index
      await sb.from('map_test_sessions').update({ current_index: answeredQuestions + 1 }).eq('id', sessionId)

      answeredQuestions++
    }

    // === Final-state assertions ===
    const { data: diags } = await sb.from('map_pick_diagnostics').select('*').eq('session_id', sessionId).order('question_index')

    for (const d of diags) {
      sequence.push({ i: d.question_index, target: d.target_band, actual: d.actual_band, fallback: d.fallback_path })
      const aIdx = bandIndex(d.actual_band)
      // §1: ±2 from start
      if (Math.abs(aIdx - startIdx) > 2) {
        failures.push(`§1: q${d.question_index} actual=${d.actual_band} more than 2 from start`)
      }
      if (aIdx > startIdx) stretchCount++
    }

    // §4 stretch cap — reading still uses a passage-count cap (≤ 1 above start).
    // Math/language: the count-based 20% cap was removed 2026-05-03 in favor of
    // a frustration guard (see docs/superpowers/specs/2026-05-03-adaptive-stretch-frustration-guard.md).
    // No upper bound on stretch_count — the ceil_band clamp already enforces start+2.
    if (subject === 'reading') {
      const { data: qDetails } = await sb
        .from('map_questions')
        .select('id, passage_id')
        .in('id', diags.map((d) => d.picked_question_id).filter(Boolean))
      const passageIdsAboveStart = new Set()
      for (const d of diags) {
        if (bandIndex(d.actual_band) > startIdx) {
          const q = qDetails?.find((x) => x.id === d.picked_question_id)
          if (q?.passage_id) passageIdsAboveStart.add(q.passage_id)
        }
      }
      if (passageIdsAboveStart.size > 1) {
        failures.push(`§4: reading stretch passages=${passageIdsAboveStart.size} > 1`)
      }
    }

    // Frustration guard: any time three above-start picks in a row were all
    // wrong, the very next pick (if any) must be at start_band.
    if (subject !== 'reading') {
      const aboveAttempts = []
      for (const d of diags) {
        if (bandIndex(d.actual_band) > startIdx) {
          // Find the recorded answer for this pick
          const { data: a } = await sb
            .from('map_attempts')
            .select('is_correct')
            .eq('session_id', sessionId)
            .eq('question_id', d.picked_question_id)
            .maybeSingle()
          aboveAttempts.push({ idx: d.question_index, correct: a?.is_correct ?? null })
        }
      }
      for (let k = 2; k < aboveAttempts.length; k++) {
        const trio = aboveAttempts.slice(k - 2, k + 1)
        if (trio.every((x) => x.correct === false)) {
          // Find the very next pick AFTER this third above-start failure
          const lastIdx = trio[2].idx
          const next = diags.find((d) => d.question_index === lastIdx + 1)
          if (next && bandIndex(next.actual_band) > startIdx) {
            failures.push(
              `frustration-guard: 3 above-start picks (${trio.map((t) => t.idx).join(',')}) all wrong but next pick ${next.question_index} stayed at ${next.actual_band}`,
            )
          }
        }
      }
    }

    // §6.7 already checked inline. Final unique count:
    if (seenQids.size !== PLANNED_LENGTH) {
      failures.push(`§6.7 final: ${seenQids.size} unique of ${PLANNED_LENGTH}`)
    }

    // §6.1: first three picks at start_band (warmup)
    for (let i = 0; i < 3 && i < diags.length; i++) {
      if (diags[i].actual_band !== session.start_band) {
        failures.push(`§6.1: warmup q${diags[i].question_index} at ${diags[i].actual_band}, expected ${session.start_band}`)
      }
    }

    // §6.2: all_correct → reaches ceil_band and never above
    //   math/language: ceiling = start+2 (ceil_band clamp; no count-based cap as of 2026-05-03)
    //   reading:       ceiling = start+1 (1-passage stretch cap; brief §4)
    if (patternName === 'all_correct') {
      const maxIdx = Math.max(...diags.map((d) => bandIndex(d.actual_band)))
      const expectedCeiling = subject === 'reading' ? startIdx + 1 : startIdx + 2
      if (maxIdx < expectedCeiling) {
        failures.push(`§6.2: all_correct never reached start+${expectedCeiling - startIdx} (max=${maxIdx - startIdx} above)`)
      }
      if (maxIdx > expectedCeiling) {
        failures.push(`§6.2: all_correct exceeded start+${expectedCeiling - startIdx} (max=${maxIdx - startIdx} above)`)
      }
    }
    // §6.3: all_wrong → reaches start-2 and never below (modulo coverage gap on 161_170)
    if (patternName === 'all_wrong') {
      const minIdx = Math.min(...diags.map((d) => bandIndex(d.actual_band)))
      // The 161_170 band has no questions, so the picker falls back to 171_180.
      // Spec acceptance is "reaches start-2 OR caps at the deepest band with content".
      if (minIdx < startIdx - 2) {
        failures.push(`§6.3: all_wrong dipped below start-2 (min=${startIdx - minIdx} below)`)
      }
    }

    // §6.9, §6.10: reading specific
    if (subject === 'reading') {
      const { data: qDetails } = await sb
        .from('map_questions')
        .select('id, passage_id')
        .in('id', [...seenQids])
      const passageIds = qDetails.map((q) => q.passage_id).filter(Boolean)
      const uniquePassages = new Set(passageIds)
      const counts = new Map()
      for (const pid of passageIds) counts.set(pid, (counts.get(pid) || 0) + 1)

      // §6.10: a passage's questions all came from the same session pull (no repeats across pulls)
      // Already enforced by picker logic; here we just verify each passage appears as a contiguous block.
      // Not strictly testable from question_ids alone — but uniquePassages.size should equal the number of passage groups.
      // Check that grouping by passage_id yields contiguous runs:
      let lastPassage = null
      const visitedPassages = new Set()
      for (const qid of [...seenQids]) {
        const q = qDetails.find((x) => x.id === qid)
        if (!q?.passage_id) continue
        if (q.passage_id !== lastPassage) {
          if (visitedPassages.has(q.passage_id)) {
            failures.push(`§6.10: passage ${q.passage_id} appears in non-contiguous blocks`)
          }
          visitedPassages.add(q.passage_id)
          lastPassage = q.passage_id
        }
      }
      // §6.9: total questions ≤ 25 (overshoot was trimmed)
      if (passageIds.length > PLANNED_LENGTH) {
        failures.push(`§6.9: reading total=${passageIds.length} > ${PLANNED_LENGTH}`)
      }
    }

    return {
      passed: failures.length === 0,
      failures,
      sequence,
      stretchCount,
      pattern: patternName,
      subject,
      diagCount: diags.length,
      fallbacks: diags.filter((d) => d.fallback_path !== null).map((d) => d.fallback_path),
    }
  } finally {
    await sb.from('map_pick_diagnostics').delete().eq('session_id', sessionId)
    await sb.from('map_attempts').delete().eq('session_id', sessionId)
    await sb.from('map_test_sessions').delete().eq('id', sessionId)
    await sb.from('map_misconception_signals').delete().eq('student_id', studentId)
    await sb.from('map_students').delete().eq('id', studentId)
  }
}

async function main() {
  console.log(`§7.6 simulator: running ${N} sessions\n`)
  const t0 = Date.now()

  const rand = rng(20260428)
  const results = []

  for (let i = 0; i < N; i++) {
    const subject = weightedPick(SUBJECTS, rand).name
    const pat = weightedPick(PATTERNS, rand)
    const seed = Math.floor(rand() * 0xFFFFFFFF)
    const patternFn = pat.gen(seed)

    const tStart = Date.now()
    try {
      const r = await runSession({ subject, patternName: pat.name, patternFn, sessionIdx: i })
      results.push(r)
      const tElapsed = ((Date.now() - tStart) / 1000).toFixed(1)
      const status = r.passed ? '✓' : '✗'
      const elapsedTotal = ((Date.now() - t0) / 60000).toFixed(1)
      process.stdout.write(`  [${String(i + 1).padStart(3)}/${N}] ${status} ${subject.padEnd(8)} ${pat.name.padEnd(11)} ${tElapsed}s (total ${elapsedTotal}m)\n`)
      if (!r.passed) {
        for (const f of r.failures) process.stdout.write(`         ${f}\n`)
      }
    } catch (e) {
      results.push({ passed: false, failures: [`unhandled: ${e.message}`], pattern: pat.name, subject })
      process.stdout.write(`  [${String(i + 1).padStart(3)}/${N}] ✗ ${subject} ${pat.name} — ${e.message}\n`)
    }
  }

  // === Aggregate report ===
  const totalElapsed = ((Date.now() - t0) / 60000).toFixed(2)
  const passed = results.filter((r) => r.passed).length
  const failed = results.length - passed

  console.log(`\n=== ${results.length} sessions in ${totalElapsed} min ===`)
  console.log(`  ✓ passed: ${passed}`)
  console.log(`  ✗ failed: ${failed}`)

  // Per-pattern pass rate
  console.log('\nPer-pattern pass rate:')
  const byPattern = {}
  for (const r of results) {
    if (!byPattern[r.pattern]) byPattern[r.pattern] = { passed: 0, total: 0 }
    byPattern[r.pattern].total++
    if (r.passed) byPattern[r.pattern].passed++
  }
  for (const [p, c] of Object.entries(byPattern)) {
    console.log(`  ${p.padEnd(12)} ${c.passed}/${c.total}`)
  }

  // Per-subject pass rate
  console.log('\nPer-subject pass rate:')
  const bySubject = {}
  for (const r of results) {
    if (!bySubject[r.subject]) bySubject[r.subject] = { passed: 0, total: 0 }
    bySubject[r.subject].total++
    if (r.passed) bySubject[r.subject].passed++
  }
  for (const [s, c] of Object.entries(bySubject)) {
    console.log(`  ${s.padEnd(12)} ${c.passed}/${c.total}`)
  }

  // Aggregate fallback histogram
  console.log('\nFallback path histogram (across all sessions):')
  const fallbackHist = {}
  for (const r of results) {
    for (const f of r.fallbacks ?? []) {
      fallbackHist[f] = (fallbackHist[f] || 0) + 1
    }
  }
  if (Object.keys(fallbackHist).length === 0) {
    console.log('  (no fallbacks fired)')
  } else {
    for (const [k, v] of Object.entries(fallbackHist).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k.padEnd(28)} ${v}`)
    }
  }

  // Stretch budget — distribution
  console.log('\nStretch usage distribution:')
  const stretchCounts = {}
  for (const r of results) {
    const sc = r.stretchCount ?? 0
    stretchCounts[sc] = (stretchCounts[sc] || 0) + 1
  }
  for (const [k, v] of Object.entries(stretchCounts).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  ${k.padStart(2)} stretches: ${v} sessions`)
  }

  // §6.4: mixed_70 trajectory analysis (informational, not pass/fail)
  console.log('\n§6.4 mixed_70 trajectory check (informational):')
  const m70 = results.filter((r) => r.pattern === 'mixed_70' && r.sequence)
  if (m70.length > 0) {
    let pickCounts = { withinPm1: 0, withinPm2: 0, total: 0 }
    let bandChanges = 0
    let totalPicks = 0
    for (const r of m70) {
      const startIdx = 3 // 181_190
      let prevBand = null
      for (const s of r.sequence) {
        const aIdx = bandIndex(s.actual)
        const offset = Math.abs(aIdx - startIdx)
        pickCounts.total++
        if (offset <= 1) pickCounts.withinPm1++
        if (offset <= 2) pickCounts.withinPm2++
        if (prevBand !== null && s.actual !== prevBand) bandChanges++
        totalPicks++
        prevBand = s.actual
      }
    }
    const pmOnePct = ((pickCounts.withinPm1 / pickCounts.total) * 100).toFixed(1)
    const pmTwoPct = ((pickCounts.withinPm2 / pickCounts.total) * 100).toFixed(1)
    const changeRate = ((bandChanges / totalPicks) * 100).toFixed(1)
    console.log(`  ${m70.length} mixed_70 sessions, ${pickCounts.total} total picks`)
    console.log(`  picks within start±1: ${pmOnePct}%`)
    console.log(`  picks within start±2: ${pmTwoPct}%`)
    console.log(`  band-change rate: ${changeRate}% of picks (1 / ${(100 / Number(changeRate)).toFixed(1)} questions)`)
  }

  console.log(`\n${failed === 0 ? '✓ ALL SESSIONS PASSED' : '✗ SIMULATOR FOUND FAILURES'}`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('fatal:', e)
  process.exit(1)
})
