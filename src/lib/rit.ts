import type { RitBand } from './types'

export const BAND_CENTROID: Record<RitBand, number> = {
  below_161: 155,
  '161_170': 165,
  '171_180': 175,
  '181_190': 185,
  '191_200': 195,
  '201_210': 205,
  above_210: 215,
}

export const BAND_LABEL: Record<RitBand, string> = {
  below_161: 'Pre-K / K',
  '161_170': 'Kindergarten',
  '171_180': 'Early 1st grade',
  '181_190': 'Late 1st / Early 2nd',
  '191_200': 'Mid-to-late 2nd',
  '201_210': 'Early 3rd grade',
  above_210: '3rd grade+',
}

export function gradeContext(rit: number): string {
  if (rit < 165) return 'pre-K to kindergarten range'
  if (rit < 175) return 'beginning of 1st grade'
  if (rit < 185) return 'middle of 1st grade'
  if (rit < 192) return 'beginning of 2nd grade'
  if (rit < 200) return 'middle to end of 2nd grade'
  if (rit < 210) return 'beginning of 3rd grade'
  return 'above 3rd grade'
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
