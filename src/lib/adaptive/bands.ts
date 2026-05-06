// Pure band-arithmetic helpers for the adaptive composer.
// No DB, no React. Trivially testable in a Node script.

import type { RitBand } from '../types'

// Ascending RIT order. above_210 is the deprecated catchall introduced
// for K-3 authoring; above_230 is a similar legacy catchall. Both sit at
// the top of the order so adaptive arithmetic never tries to step into
// them as a "real" band — they exist for backward-compat only. New
// authoring should use 211_220 / 221_230 / 231_240. (Grade5 brief §2.)
export const BAND_ORDER: RitBand[] = [
  'below_161',
  '161_170',
  '171_180',
  '181_190',
  '191_200',
  '201_210',
  '211_220',
  '221_230',
  '231_240',
  'above_230',
  'above_210',
]

const BAND_INDEX: Record<RitBand, number> = BAND_ORDER.reduce(
  (acc, b, i) => {
    acc[b] = i
    return acc
  },
  {} as Record<RitBand, number>,
)

export function bandIndex(b: RitBand): number {
  return BAND_INDEX[b]
}

export function clampBand(idx: number): RitBand {
  if (idx < 0) return BAND_ORDER[0]
  if (idx >= BAND_ORDER.length) return BAND_ORDER[BAND_ORDER.length - 1]
  return BAND_ORDER[idx]
}

export function stepBand(b: RitBand, delta: number): RitBand {
  return clampBand(bandIndex(b) + delta)
}

export function bandFloor(start: RitBand): RitBand {
  return stepBand(start, -2)
}

export function bandCeil(start: RitBand): RitBand {
  return stepBand(start, 2)
}

export const WARMUP_LENGTH = 3
export const WINDOW_MAX = 5
export const STEP_UP_THRESHOLD = 0.8
export const STEP_DOWN_THRESHOLD = 0.4

/**
 * Decide the target band for the next question.
 *
 * - During warmup (window < 3 answers) the band stays at `current_band`.
 *   Per §2: "First 3 questions are at the student's start band, no matter what."
 * - Once warmed up, accuracy of the rolling window decides:
 *   - acc >= 0.80 → step up by 1 (clamped to ceil_band)
 *   - acc <= 0.40 → step down by 1 (clamped to floor_band)
 *   - otherwise hold at current_band
 *
 * The window slides — caller is responsible for trimming to last 5 entries.
 */
export function decideBand(
  recentWindow: boolean[],
  currentBand: RitBand,
  floorBand: RitBand,
  ceilBand: RitBand,
): RitBand {
  if (recentWindow.length < WARMUP_LENGTH) return currentBand

  const correct = recentWindow.reduce((a, b) => a + (b ? 1 : 0), 0)
  const acc = correct / recentWindow.length

  if (acc >= STEP_UP_THRESHOLD) {
    const stepped = stepBand(currentBand, 1)
    return bandIndex(stepped) > bandIndex(ceilBand) ? ceilBand : stepped
  }
  if (acc <= STEP_DOWN_THRESHOLD) {
    const stepped = stepBand(currentBand, -1)
    return bandIndex(stepped) < bandIndex(floorBand) ? floorBand : stepped
  }
  return currentBand
}

/** Trim a boolean array to the last N entries (sliding-window mechanic). */
export function trimWindow(window: boolean[], max = WINDOW_MAX): boolean[] {
  return window.length <= max ? window : window.slice(-max)
}

export const FRUSTRATION_WINDOW = 3

/**
 * Frustration guard for the stretch zone (above start_band).
 *
 * Walks `picks` from newest to oldest, collecting up to FRUSTRATION_WINDOW
 * answers from picks whose band is above `startIdx`. Returns true only when
 * we have FRUSTRATION_WINDOW such answers AND every one is wrong.
 *
 * Picks above start_band that haven't been answered yet are skipped (the
 * picker can be filling slot N+3 while the user is still answering N).
 *
 * Used by picker.ts to override an upward `decideBand` target back to
 * start_band when the kid has demonstrated 3 consecutive failures in the
 * stretch zone — replaces the old count-based STRETCH_FRACTION cap.
 */
export function isFrustrated(
  picks: ReadonlyArray<{ id: string; rit_band: RitBand }>,
  attemptByQid: ReadonlyMap<string, boolean>,
  startIdx: number,
): boolean {
  const recent: boolean[] = []
  for (let i = picks.length - 1; i >= 0 && recent.length < FRUSTRATION_WINDOW; i--) {
    const pick = picks[i]
    if (bandIndex(pick.rit_band) <= startIdx) continue
    const ans = attemptByQid.get(pick.id)
    if (ans === undefined) continue
    recent.push(ans)
  }
  if (recent.length < FRUSTRATION_WINDOW) return false
  return recent.every((a) => a === false)
}
