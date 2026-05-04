import { createClient } from '@supabase/supabase-js'

// Vite browser builds expose env via `import.meta.env`; Node test runners (tsx)
// expose it via `process.env`. Read both so the same client works in scripts
// like test-adaptive-simulator.mjs without divergent setup.
const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env ?? {}
const procEnv: Record<string, string | undefined> =
  typeof process !== 'undefined' && process.env ? process.env : {}

const SUPABASE_URL = viteEnv.VITE_SUPABASE_URL ?? procEnv.SUPABASE_URL ?? procEnv.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY =
  viteEnv.VITE_SUPABASE_ANON_KEY ??
  procEnv.SUPABASE_PUBLISHABLE_KEY ??
  procEnv.VITE_SUPABASE_ANON_KEY ??
  procEnv.SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase config: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local (see .env.example).',
  )
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Authoritative read for a student's practice grade — the bank tests draw from.
// Pickers call this every render rather than caching, so a parent flip in the
// settings panel is reflected on the next request without a reload.
export async function fetchStudentGrade(studentId: string): Promise<number> {
  const { data, error } = await supabase
    .from('map_students')
    .select('grade')
    .eq('id', studentId)
    .single()
  if (error || !data) throw error ?? new Error('Student not found')
  return data.grade as number
}

// Returns both grades. school_grade is the kid's actual grade in school; grade
// is the practice grade tests draw from. They start equal at onboarding but
// diverge when a parent stretches up or drops down for review.
export async function fetchStudentGrades(
  studentId: string,
): Promise<{ schoolGrade: number; practiceGrade: number }> {
  const { data, error } = await supabase
    .from('map_students')
    .select('grade, school_grade')
    .eq('id', studentId)
    .single()
  if (error || !data) throw error ?? new Error('Student not found')
  return {
    schoolGrade: data.school_grade as number,
    practiceGrade: data.grade as number,
  }
}

// Per-student preferred test length. Picker uses this as planned_length when
// creating a session.
export async function fetchStudentDefaultTestLength(studentId: string): Promise<number> {
  const { data, error } = await supabase
    .from('map_students')
    .select('default_test_length')
    .eq('id', studentId)
    .single()
  if (error || !data) throw error ?? new Error('Student not found')
  return data.default_test_length as number
}

// Recommended default for a given grade. Used at student creation and to show
// a hint next to the length selector.
export function recommendedTestLengthForGrade(grade: number): number {
  if (grade <= 1) return 15
  if (grade === 2) return 25
  return 40
}

export const TEST_LENGTH_OPTIONS = [10, 15, 20, 25, 40, 50] as const
