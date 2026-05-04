// Shared validation rules for custom passages and questions.
// Custom_Questions_Brief.md §4 (column constraints) + §5 (cross-field rules).
//
// These are runtime checks that complement the database CHECK / trigger
// constraints. The DB is authoritative; these surface clearer errors *before*
// the round-trip and let us return McpError 4xx with structured reasons rather
// than raw Postgres error strings.
//
// Both the MCP write tools (PR-1C) and the future UI handlers (Cycle 3) import
// these validators. Single source of truth.

import { McpError } from '../mcp/errors.js'

// Column-level limits (mirror the SQL CHECK constraints in the migration).
export const PASSAGE_BODY_MIN = 50
export const PASSAGE_BODY_MAX = 10000
export const PASSAGE_TITLE_MAX = 200
export const QUESTION_STEM_MIN = 5
export const QUESTION_STEM_MAX = 2000
export const QUESTION_FOCUS_MAX = 200
export const CHOICE_TEXT_MAX = 500
export const CHOICE_EXPL_MAX = 1500
export const SVG_ALT_PASSAGE_MAX = 500
export const SVG_ALT_STEM_MAX = 500
export const SVG_ALT_CHOICE_MAX = 300

export const VALID_PASSAGE_SUBJECTS = ['reading', 'language'] as const
export const VALID_QUESTION_SUBJECTS = ['math', 'reading', 'language'] as const
export const VALID_GENRES = [
  'fiction', 'nonfiction', 'poetry', 'drama', 'informational', 'editing_draft',
] as const
export const VALID_CHOICE_LABELS = ['A', 'B', 'C', 'D', 'E'] as const
export const MAX_CHOICES = 5
export const MIN_CHOICES_FOR_PUBLISH = 3
export const MAX_QUESTIONS_PER_BATCH = 25
export const MAX_QUESTIONS_PER_PASSAGE_BATCH = 8

export interface ChoiceInput {
  label: string
  text: string
  is_correct: boolean
  choice_svg?: string | null
  choice_svg_alt_text?: string | null
  explanation_correct?: string | null
  explanation_wrong?: string | null
  misconception_tag?: string | null
}

/**
 * §12.10d — all-or-none SVG across a question's choices.
 * Throws McpError('mixed_choice_svg_not_allowed') with the offending labels.
 *
 * NOTE: this is enforced both here (so the agent gets a clear error before
 * any DB write) and at the DB trigger layer (so the schema is the ultimate
 * authority).
 */
export function validateAllOrNoneChoiceSvg(choices: ChoiceInput[]): void {
  const withSvg: string[] = []
  const withoutSvg: string[] = []
  for (const c of choices) {
    if (c.choice_svg && c.choice_svg.length > 0) withSvg.push(c.label)
    else withoutSvg.push(c.label)
  }
  if (withSvg.length > 0 && withoutSvg.length > 0) {
    throw new McpError(
      'mixed_choice_svg_not_allowed',
      `choices ${withSvg.join(',')} have SVG but ${withoutSvg.join(',')} don't — must be all or none`,
    )
  }
}

/**
 * Alt-text presence: any non-null SVG must come with non-empty alt text.
 * Returns a list of slot labels that fail the rule (empty = all good).
 */
export function findSvgsMissingAltText(
  slots: Array<{ slot: string; svg?: string | null; alt?: string | null }>,
): string[] {
  const bad: string[] = []
  for (const s of slots) {
    if (s.svg && s.svg.length > 0) {
      if (!s.alt || s.alt.trim().length === 0) {
        bad.push(s.slot)
      }
    }
  }
  return bad
}

export function validateSvgAltText(
  slots: Array<{ slot: string; svg?: string | null; alt?: string | null }>,
): void {
  const bad = findSvgsMissingAltText(slots)
  if (bad.length > 0) {
    throw new McpError(
      'invalid_svg',
      `alt text required for SVG in slot(s): ${bad.join(', ')}`,
    )
  }
}

/**
 * Must have a unique correct answer when publishing. Drafts allow 0+ correct.
 */
export function validateExactlyOneCorrect(choices: ChoiceInput[]): void {
  const correct = choices.filter((c) => c.is_correct).length
  if (correct !== 1) {
    throw new McpError(
      'invalid_question_shape',
      `must have exactly 1 correct choice, found ${correct}`,
    )
  }
}

/**
 * Choice count rule for publish-eligible questions.
 */
export function validateChoiceCount(choices: ChoiceInput[]): void {
  if (choices.length < MIN_CHOICES_FOR_PUBLISH || choices.length > MAX_CHOICES) {
    throw new McpError(
      'invalid_question_shape',
      `must have ${MIN_CHOICES_FOR_PUBLISH}–${MAX_CHOICES} choices, found ${choices.length}`,
    )
  }
}

/**
 * Choice labels must be unique and from {A..E}.
 */
export function validateChoiceLabels(choices: ChoiceInput[]): void {
  const seen = new Set<string>()
  for (const c of choices) {
    if (!VALID_CHOICE_LABELS.includes(c.label as (typeof VALID_CHOICE_LABELS)[number])) {
      throw new McpError('invalid_question_shape', `choice label "${c.label}" not in A-E`)
    }
    if (seen.has(c.label)) {
      throw new McpError('invalid_question_shape', `choice label "${c.label}" used more than once`)
    }
    seen.add(c.label)
  }
}

/**
 * The correct choice MUST have an explanation_correct (DB CHECK enforces this
 * but we surface it here too for a clearer error before the RPC fires).
 */
export function validateCorrectHasExplanation(choices: ChoiceInput[]): void {
  for (const c of choices) {
    if (c.is_correct && (!c.explanation_correct || c.explanation_correct.trim().length === 0)) {
      throw new McpError(
        'invalid_question_shape',
        `correct choice "${c.label}" must have explanation_correct`,
      )
    }
  }
}

/**
 * Math questions cannot reference a passage. The DB CHECK enforces this on
 * the row; surface it at the tool layer for a clearer error before any insert.
 */
export function validateMathHasNoPassage(
  subject: string,
  passageId: string | null | undefined,
  passageVersionId?: string | null,
): void {
  if (subject === 'math' && (passageId || passageVersionId)) {
    throw new McpError(
      'invalid_question_shape',
      'math questions cannot reference a passage',
    )
  }
}

/**
 * Aggregate validator for a single question payload, draft-eligible.
 * Skips the publish-only rules (count, exactly-one-correct) since those
 * fire at publish time. Use validateQuestionForPublish() for that path.
 */
export function validateQuestionDraft(q: {
  subject: string
  grade: number
  stem: string
  stem_svg?: string | null
  stem_svg_alt_text?: string | null
  passage_id?: string | null
  passage_version_id?: string | null
  choices: ChoiceInput[]
}): void {
  if (!VALID_QUESTION_SUBJECTS.includes(q.subject as (typeof VALID_QUESTION_SUBJECTS)[number])) {
    throw new McpError('invalid_question_shape', `subject must be one of ${VALID_QUESTION_SUBJECTS.join(', ')}`)
  }
  if (q.grade < 0 || q.grade > 12) {
    throw new McpError('invalid_question_shape', `grade ${q.grade} outside 0..12`)
  }
  if (q.stem.length < QUESTION_STEM_MIN || q.stem.length > QUESTION_STEM_MAX) {
    throw new McpError(
      'invalid_question_shape',
      `stem length ${q.stem.length} outside ${QUESTION_STEM_MIN}..${QUESTION_STEM_MAX}`,
    )
  }
  validateMathHasNoPassage(q.subject, q.passage_id, q.passage_version_id)
  validateChoiceLabels(q.choices)
  validateAllOrNoneChoiceSvg(q.choices)
  validateCorrectHasExplanation(q.choices)
  validateSvgAltText([
    { slot: 'stem_svg', svg: q.stem_svg, alt: q.stem_svg_alt_text },
    ...q.choices.map((c) => ({ slot: `choices[${c.label}].choice_svg`, svg: c.choice_svg, alt: c.choice_svg_alt_text })),
  ])
}

export function validateQuestionForPublish(q: {
  subject: string
  passage_id?: string | null
  passage_version_id?: string | null
  choices: ChoiceInput[]
}): void {
  validateChoiceCount(q.choices)
  validateExactlyOneCorrect(q.choices)
  if (q.subject === 'reading' && !q.passage_id && !q.passage_version_id) {
    throw new McpError(
      'invalid_question_shape',
      'published reading questions must reference a passage',
    )
  }
}

/**
 * Aggregate validator for a passage payload.
 */
export function validatePassageInput(p: {
  subject: string
  grade: number
  title?: string | null
  body: string
  genre?: string | null
  passage_svg?: string | null
  passage_svg_alt_text?: string | null
}): void {
  if (!VALID_PASSAGE_SUBJECTS.includes(p.subject as (typeof VALID_PASSAGE_SUBJECTS)[number])) {
    throw new McpError(
      'invalid_passage_shape',
      `passage subject must be one of ${VALID_PASSAGE_SUBJECTS.join(', ')}`,
    )
  }
  if (p.grade < 0 || p.grade > 12) {
    throw new McpError('invalid_passage_shape', `grade ${p.grade} outside 0..12`)
  }
  if (p.body.length < PASSAGE_BODY_MIN || p.body.length > PASSAGE_BODY_MAX) {
    throw new McpError(
      'invalid_passage_shape',
      `body length ${p.body.length} outside ${PASSAGE_BODY_MIN}..${PASSAGE_BODY_MAX}`,
    )
  }
  if (p.title && p.title.length > PASSAGE_TITLE_MAX) {
    throw new McpError('invalid_passage_shape', `title longer than ${PASSAGE_TITLE_MAX}`)
  }
  if (p.genre && !VALID_GENRES.includes(p.genre as (typeof VALID_GENRES)[number])) {
    throw new McpError('invalid_passage_shape', `genre must be one of ${VALID_GENRES.join(', ')}`)
  }
  validateSvgAltText([{ slot: 'passage_svg', svg: p.passage_svg, alt: p.passage_svg_alt_text }])
}
