import type { RitBand } from './types'

export const BAND_CENTROID: Record<RitBand, number> = {
  below_161: 155,
  '161_170': 165,
  '171_180': 175,
  '181_190': 185,
  '191_200': 195,
  '201_210': 205,
  // Grade 5 additions (Grade5 brief §2). Centroids are mid-band.
  '211_220': 215,
  '221_230': 225,
  '231_240': 235,
  // Legacy catchalls — same bucket as 231_240 / 211_220 respectively.
  above_230: 235,
  above_210: 215,
}

export const BAND_LABEL: Record<RitBand, string> = {
  below_161: 'Pre-K / K',
  '161_170': 'Kindergarten',
  '171_180': 'Early 1st grade',
  '181_190': 'Late 1st / Early 2nd',
  '191_200': 'Mid-to-late 2nd',
  '201_210': 'Early 3rd grade / Late 4th',
  '211_220': 'Mid 5th grade',
  '221_230': 'End-of-5th / 6th',
  '231_240': 'Above 5th grade',
  above_230: 'Above 5th grade',
  above_210: '3rd grade+',
}

export function gradeContext(rit: number): string {
  if (rit < 165) return 'pre-K to kindergarten range'
  if (rit < 175) return 'beginning of 1st grade'
  if (rit < 185) return 'middle of 1st grade'
  if (rit < 192) return 'beginning of 2nd grade'
  if (rit < 200) return 'middle to end of 2nd grade'
  if (rit < 210) return 'beginning of 3rd grade'
  if (rit < 218) return 'mid 4th to early 5th grade'
  if (rit < 228) return 'mid-to-late 5th grade'
  return 'above 5th grade'
}

export function estimateRit(
  bandsCorrect: RitBand[],
  totalQuestions: number,
): number {
  if (bandsCorrect.length === 0) return 165
  const sum = bandsCorrect.reduce((acc, b) => acc + BAND_CENTROID[b], 0)
  const avg = sum / bandsCorrect.length
  const accuracy = bandsCorrect.length / totalQuestions
  let rit = avg
  if (accuracy > 0.85) rit += 5
  else if (accuracy < 0.5) rit -= 5
  return Math.round(rit)
}
