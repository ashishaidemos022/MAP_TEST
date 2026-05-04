// Loader for custom-question content (Phase 4 Cycle 2). Reads the
// map_custom_questions_resolved view and shapes rows into a normalized form
// the existing TestRunner can render alongside vetted questions.
//
// SVG fields come back as `\xHEX` bytea strings from supabase-js; the
// kid-side renderer converts them to base64 data URLs via SvgImage.

import { supabase } from './supabase'

export interface CustomChoice {
  id: string
  label: string
  text: string
  is_correct: boolean
  ordinal: number
  choice_svg: string | null
  choice_svg_alt_text: string | null
  explanation_correct: string | null
  explanation_wrong: string | null
  misconception_tag: string | null
}

export interface LoadedCustomQuestion {
  /** version_id from map_custom_question_versions — this is what goes into
   * map_test_sessions.question_ids and into map_attempts.custom_question_version_id. */
  version_id: string
  /** question_id (header) — used for parent UI links, not test-running. */
  question_id: string
  status: string
  source: string
  subject: 'math' | 'reading' | 'language'
  grade: number
  stem: string
  stem_svg: string | null
  stem_svg_alt_text: string | null
  standard_code: string | null
  difficulty: number | null
  question_focus: string | null
  passage: {
    passage_id: string
    passage_version_id: string
    title: string | null
    body: string
    passage_svg: string | null
    passage_svg_alt_text: string | null
    genre: string | null
  } | null
  choices: CustomChoice[]
}

export async function loadCustomQuestionsByVersionIds(
  versionIds: string[],
): Promise<LoadedCustomQuestion[]> {
  if (versionIds.length === 0) return []
  const { data, error } = await supabase
    .from('map_custom_questions_resolved')
    .select('*')
    .in('version_id', versionIds)
  if (error) throw new Error(error.message)
  const out: LoadedCustomQuestion[] = []
  for (const r of (data ?? []) as unknown as Array<Record<string, unknown>>) {
    const choicesRaw = (r.choices ?? []) as Array<Record<string, unknown>>
    const choices: CustomChoice[] = choicesRaw
      .map((c) => ({
        id: c.id as string,
        label: c.label as string,
        text: c.text as string,
        is_correct: !!c.is_correct,
        ordinal: (c.ordinal as number) ?? 0,
        choice_svg: (c.choice_svg as string | null) ?? null,
        choice_svg_alt_text: (c.choice_svg_alt_text as string | null) ?? null,
        explanation_correct: (c.explanation_correct as string | null) ?? null,
        explanation_wrong: (c.explanation_wrong as string | null) ?? null,
        misconception_tag: (c.misconception_tag as string | null) ?? null,
      }))
      .sort((a, b) => a.ordinal - b.ordinal)

    out.push({
      version_id: r.version_id as string,
      question_id: r.question_id as string,
      status: r.question_status as string,
      source: r.question_source as string,
      subject: r.subject as 'math' | 'reading' | 'language',
      grade: r.grade as number,
      stem: r.stem as string,
      stem_svg: (r.stem_svg as string | null) ?? null,
      stem_svg_alt_text: (r.stem_svg_alt_text as string | null) ?? null,
      standard_code: (r.standard_code as string | null) ?? null,
      difficulty: (r.difficulty as number | null) ?? null,
      question_focus: (r.question_focus as string | null) ?? null,
      passage: r.passage_version_id
        ? {
            passage_id: r.passage_id as string,
            passage_version_id: r.passage_version_id as string,
            title: (r.passage_title as string | null) ?? null,
            body: r.passage_body as string,
            passage_svg: (r.passage_svg as string | null) ?? null,
            passage_svg_alt_text: (r.passage_svg_alt_text as string | null) ?? null,
            genre: (r.passage_genre as string | null) ?? null,
          }
        : null,
      choices,
    })
  }
  return out
}
