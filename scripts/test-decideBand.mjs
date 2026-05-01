// Standalone test runner for decideBand. Run with: npx tsx scripts/test-decideBand.mjs
// Pure function — no DB, no network.

import {
  decideBand,
  trimWindow,
  bandFloor,
  bandCeil,
  stepBand,
  WARMUP_LENGTH,
  WINDOW_MAX,
} from '../src/lib/adaptive/bands.ts'

let pass = 0
let fail = 0
const failures = []

function eq(actual, expected, name) {
  const ok = actual === expected
  if (ok) {
    pass++
  } else {
    fail++
    failures.push(`  ✗ ${name}\n      expected: ${expected}\n      actual:   ${actual}`)
  }
}

function deepEq(actual, expected, name) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    pass++
  } else {
    fail++
    failures.push(`  ✗ ${name}\n      expected: ${e}\n      actual:   ${a}`)
  }
}

const start = '181_190'
const floor = bandFloor(start) // 161_170
const ceil = bandCeil(start) // 201_210

// === Warmup: window < 3 always returns current_band, regardless of content ===
eq(decideBand([], start, floor, ceil), start, 'warmup: empty window returns current')
eq(decideBand([true], start, floor, ceil), start, 'warmup: 1 correct returns current')
eq(decideBand([false], start, floor, ceil), start, 'warmup: 1 wrong returns current (no immediate downshift)')
eq(decideBand([true, true], start, floor, ceil), start, 'warmup: 2 correct returns current')
eq(decideBand([false, false], start, floor, ceil), start, 'warmup: 2 wrong returns current')

// Boundary: exactly WARMUP_LENGTH triggers band logic
eq(WARMUP_LENGTH, 3, 'WARMUP_LENGTH constant is 3')

// === Step up: acc >= 0.80 ===
eq(decideBand([true, true, true], start, floor, ceil), '191_200', 'step up: 3/3 → +1')
eq(decideBand([true, true, true, true], start, floor, ceil), '191_200', 'step up: 4/4 → +1')
eq(decideBand([true, true, true, true, true], start, floor, ceil), '191_200', 'step up: 5/5 → +1')
// 4/5 = 0.80, exactly at threshold
eq(decideBand([true, true, true, true, false], start, floor, ceil), '191_200', 'step up: 4/5 (0.80 inclusive) → +1')

// === Step down: acc <= 0.40 ===
eq(decideBand([false, false, false], start, floor, ceil), '171_180', 'step down: 0/3 → -1')
eq(decideBand([true, false, false], start, floor, ceil), '171_180', 'step down: 1/3 (0.33) → -1')
// 2/5 = 0.40, exactly at threshold
eq(decideBand([true, true, false, false, false], start, floor, ceil), '171_180', 'step down: 2/5 (0.40 inclusive) → -1')

// === Hold: 0.40 < acc < 0.80 ===
eq(decideBand([true, true, false], start, floor, ceil), start, 'hold: 2/3 (0.67) → unchanged')
eq(decideBand([true, false, true, false, true], start, floor, ceil), start, 'hold: 3/5 (0.60) → unchanged')
// 3/4 = 0.75
eq(decideBand([true, true, true, false], start, floor, ceil), start, 'hold: 3/4 (0.75) → unchanged')

// === Ceiling cap: at ceil already, all correct still pins to ceil ===
eq(decideBand([true, true, true, true, true], ceil, floor, ceil), ceil, 'ceil cap: at ceil + all correct stays at ceil (no +1 to above_210)')
// Step up from one-below-ceil should land exactly on ceil
eq(decideBand([true, true, true], '191_200', floor, ceil), ceil, 'one below ceil + 3/3 → ceil')

// === Floor cap: at floor already, all wrong stays at floor ===
eq(decideBand([false, false, false], floor, floor, ceil), floor, 'floor cap: at floor + all wrong stays at floor (no -1 to below_161)')
eq(decideBand([false, false, false], '171_180', floor, ceil), floor, 'one above floor + 0/3 → floor')

// === Sliding window: trim to WINDOW_MAX ===
eq(WINDOW_MAX, 5, 'WINDOW_MAX constant is 5')
deepEq(trimWindow([true, true, false]), [true, true, false], 'trim: under max returns unchanged')
deepEq(trimWindow([true, true, true, true, true, false, false]), [true, true, true, false, false], 'trim: trims to last 5')
deepEq(trimWindow([true, true, true, true, true]), [true, true, true, true, true], 'trim: exactly 5 unchanged')
// Sliding behavior: an old wrong falls off, recent right answers cause step-up
const longWindow = trimWindow([false, false, true, true, true, true, true])
eq(decideBand(longWindow, start, floor, ceil), '191_200', 'slide: old wrongs fall off, last 5 → 4/5 → +1')

// === Edge: 4-step accuracy boundary ===
// 3/4 = 0.75 → hold, 2/4 = 0.50 → hold, 1/4 = 0.25 → step down
eq(decideBand([true, false, false, false], start, floor, ceil), '171_180', 'step down: 1/4 (0.25) → -1')
eq(decideBand([true, true, false, false], start, floor, ceil), start, 'hold: 2/4 (0.50) → unchanged')

// === Edge: tight floor/ceil (start at floor or ceil already) ===
eq(decideBand([true, true, true], floor, floor, ceil), '171_180', 'at floor + 3/3 → +1 (does not break)')
eq(decideBand([false, false, false], ceil, floor, ceil), '191_200', 'at ceil + 0/3 → -1 (does not break)')

// === stepBand sanity (clamps at array ends) ===
eq(stepBand('below_161', -1), 'below_161', 'stepBand clamps at low end')
eq(stepBand('above_210', 1), 'above_210', 'stepBand clamps at high end')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(f)
  process.exit(1)
}
process.exit(0)
