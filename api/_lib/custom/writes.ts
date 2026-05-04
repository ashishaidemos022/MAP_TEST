// Service-role write helpers used by the MCP write tools.
//
// The RPCs in the migration are SECURITY DEFINER + auth.uid()-bound, which
// makes them right for the UI path but unusable from the MCP path (no auth.uid
// under service role). These helpers replicate the RPC behavior with explicit
// family_id from the auth context. The schema-level CHECK + trigger
// constraints are still the ultimate authority.

import type { McpContext } from '../mcp/auth.js'
import { McpError } from '../mcp/errors.js'
import { sanitizeSvg, SvgRejected, SVG_CAP_PASSAGE, SVG_CAP_STEM, SVG_CAP_CHOICE } from '../svg/sanitize.js'
import {
  validatePassageInput,
  validateQuestionDraft,
  type ChoiceInput,
} from './validation.js'

export interface PassageWriteInput {
  subject: string
  grade: number
  title?: string | null
  body: string
  genre?: string | null
  estimated_grade_level?: number | null
  standard_codes?: string[]
  passage_svg?: string | null // base64
  passage_svg_alt_text?: string | null
  ai_metadata?: Record<string, unknown> | null
}

export interface QuestionWriteInput {
  subject: string
  grade: number
  stem: string
  stem_svg?: string | null
  stem_svg_alt_text?: string | null
  standard_code?: string | null
  difficulty?: number | null
  question_focus?: string | null
  passage_version_id?: string | null
  ai_metadata?: Record<string, unknown> | null
  choices: ChoiceInput[]
}

function sanitizeOrThrow(b64: string | null | undefined, cap: number, slot: string): Buffer | null {
  if (!b64 || b64.length === 0) return null
  let decoded: string
  try {
    decoded = Buffer.from(b64, 'base64').toString('utf8')
  } catch {
    throw new McpError('invalid_svg', `${slot}: not valid base64`)
  }
  try {
    return sanitizeSvg(decoded, cap)
  } catch (e) {
    if (e instanceof SvgRejected) {
      throw new McpError('invalid_svg', `${slot}: ${e.reason}${e.detail ? ` (${e.detail})` : ''}`)
    }
    throw e
  }
}

function bytesToHexLiteral(buf: Buffer): string {
  return `\\x${buf.toString('hex')}`
}

/**
 * Insert a custom_passage + first version under the given family scope.
 * Sanitizes any SVG before persistence. Returns { passage_id, passage_version_id }.
 */
export async function createPassageInFamily(
  ctx: McpContext,
  input: PassageWriteInput,
  source: 'parent_manual' | 'parent_ai_assisted' | 'parent_ai_generated',
  createdVia: 'ui' | 'mcp',
): Promise<{ passage_id: string; passage_version_id: string }> {
  if (!ctx.family_id) throw new McpError('internal', 'family_id missing', 500)
  validatePassageInput(input)

  const svgBuf = sanitizeOrThrow(input.passage_svg ?? undefined, SVG_CAP_PASSAGE, 'passage_svg')

  // Step 1: header row.
  const { data: pHeader, error: pErr } = await ctx.supabase
    .from('map_custom_passages')
    .insert({
      family_id: ctx.family_id,
      source,
      created_via: createdVia,
      status: 'draft',
    })
    .select('id')
    .single()
  if (pErr || !pHeader) throw new McpError('internal', pErr?.message ?? 'passage insert failed', 500)
  const passage_id = (pHeader as { id: string }).id

  // Step 2: version row.
  const { data: pv, error: pvErr } = await ctx.supabase
    .from('map_custom_passage_versions')
    .insert({
      passage_id,
      version_number: 1,
      subject: input.subject,
      grade: input.grade,
      title: input.title ?? null,
      body: input.body,
      genre: input.genre ?? null,
      estimated_grade_level: input.estimated_grade_level ?? null,
      standard_codes: input.standard_codes ?? [],
      passage_svg: svgBuf ? bytesToHexLiteral(svgBuf) : null,
      passage_svg_alt_text: svgBuf ? input.passage_svg_alt_text ?? null : null,
      ai_metadata: input.ai_metadata ?? null,
    })
    .select('id')
    .single()
  if (pvErr || !pv) {
    // Roll back the header row so we don't leave an orphan.
    await ctx.supabase.from('map_custom_passages').delete().eq('id', passage_id)
    throw new McpError('invalid_passage_shape', pvErr?.message ?? 'passage version insert failed')
  }
  const passage_version_id = (pv as { id: string }).id

  // Step 3: link header → version.
  const { error: linkErr } = await ctx.supabase
    .from('map_custom_passages')
    .update({ current_version_id: passage_version_id })
    .eq('id', passage_id)
  if (linkErr) throw new McpError('internal', linkErr.message, 500)

  return { passage_id, passage_version_id }
}

/**
 * Insert a custom_question + first version + choices, scoped to the family.
 * If passage_version_id is provided, it is verified to belong to the family
 * by the caller (use getCustomPassageVersionInFamily before calling).
 */
export async function createQuestionInFamily(
  ctx: McpContext,
  input: QuestionWriteInput,
  source: 'parent_manual' | 'parent_ai_assisted' | 'parent_ai_generated',
  createdVia: 'ui' | 'mcp',
): Promise<{ question_id: string; question_version_id: string }> {
  if (!ctx.family_id) throw new McpError('internal', 'family_id missing', 500)
  validateQuestionDraft(input)

  const stemSvg = sanitizeOrThrow(input.stem_svg ?? undefined, SVG_CAP_STEM, 'stem_svg')
  // Sanitize each choice SVG up front so we abort the whole write before any
  // DB row is created if any single SVG is malformed.
  const choiceSvgs: (Buffer | null)[] = []
  for (const c of input.choices) {
    choiceSvgs.push(
      sanitizeOrThrow(c.choice_svg ?? undefined, SVG_CAP_CHOICE, `choices[${c.label}].choice_svg`),
    )
  }

  // Step 1: question header.
  const { data: qHeader, error: qErr } = await ctx.supabase
    .from('map_custom_questions')
    .insert({
      family_id: ctx.family_id,
      source,
      created_via: createdVia,
      status: 'draft',
    })
    .select('id')
    .single()
  if (qErr || !qHeader) throw new McpError('internal', qErr?.message ?? 'question insert failed', 500)
  const question_id = (qHeader as { id: string }).id

  // Step 2: version row.
  const { data: qv, error: qvErr } = await ctx.supabase
    .from('map_custom_question_versions')
    .insert({
      question_id,
      version_number: 1,
      subject: input.subject,
      grade: input.grade,
      stem: input.stem,
      stem_svg: stemSvg ? bytesToHexLiteral(stemSvg) : null,
      stem_svg_alt_text: stemSvg ? input.stem_svg_alt_text ?? null : null,
      passage_version_id: input.passage_version_id ?? null,
      question_focus: input.question_focus ?? null,
      standard_code: input.standard_code ?? null,
      difficulty: input.difficulty ?? null,
      ai_metadata: input.ai_metadata ?? null,
    })
    .select('id')
    .single()
  if (qvErr || !qv) {
    await ctx.supabase.from('map_custom_questions').delete().eq('id', question_id)
    throw new McpError('invalid_question_shape', qvErr?.message ?? 'question version insert failed')
  }
  const question_version_id = (qv as { id: string }).id

  // Step 3: choices.
  const choiceRows = input.choices.map((c, i) => ({
    version_id: question_version_id,
    ordinal: i,
    label: c.label,
    text: c.text,
    choice_svg: choiceSvgs[i] ? bytesToHexLiteral(choiceSvgs[i]!) : null,
    choice_svg_alt_text: choiceSvgs[i] ? c.choice_svg_alt_text ?? null : null,
    is_correct: c.is_correct,
    explanation_correct: c.explanation_correct ?? null,
    explanation_wrong: c.explanation_wrong ?? null,
    misconception_tag: c.misconception_tag ?? null,
  }))
  const { error: chErr } = await ctx.supabase
    .from('map_custom_question_choices')
    .insert(choiceRows)
  if (chErr) {
    await ctx.supabase.from('map_custom_questions').delete().eq('id', question_id)
    throw new McpError('invalid_question_shape', chErr.message)
  }

  // Step 4: link header → version.
  const { error: linkErr } = await ctx.supabase
    .from('map_custom_questions')
    .update({ current_version_id: question_version_id })
    .eq('id', question_id)
  if (linkErr) throw new McpError('internal', linkErr.message, 500)

  return { question_id, question_version_id }
}
