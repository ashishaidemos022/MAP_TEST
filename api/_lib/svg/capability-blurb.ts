// Custom_Questions_Brief.md §5.0 — shared SVG capability text composed into
// every write tool's description. Concatenated at tool-registration time so
// agents reading tools/list see SVG support advertised up front.

export const SVG_CAPABILITY_BLURB = [
  'This tool supports inline SVG illustrations.',
  'SVG is accepted as a base64-encoded string in the *_svg fields and is required to come paired with a *_svg_alt_text describing the figure.',
  'Use SVG when a diagram or figure makes the question or passage clearer (geometry, charts, "which shape" choices).',
  'Constraints enforced server-side:',
  'root must be <svg> with a viewBox;',
  'no <script>, no <foreignObject>, no event handlers, no external URLs, no embedded raster images, no animations;',
  'size cap 64KB for passages and stems, 32KB per answer choice;',
  'on a single question either every choice has an SVG or none do.',
  'Violations are returned as invalid_svg errors with a specific reason — read the reason and retry.',
  'Use neutral colors that work on light or dark backgrounds.',
].join(' ')

// Per-tool clauses — inserted after the shared blurb in each tool's description.
export const SVG_TOOL_HINTS = {
  create_custom_questions:
    'On this tool: stem and choices may have SVG. Math questions cannot have a passage but can still have stem and choice SVG (e.g. a geometry diagram).',
  create_custom_passage_and_questions:
    'On this tool: passage, each question stem, and each choice may have SVG. A small figure inside a passage is fine; for math diagrams that ARE the question, use the stem_svg slot.',
  update_custom_question:
    'On this tool: replacing or adding SVG follows the same rules as creation. Pass *_svg = null explicitly to remove an existing SVG.',
  update_custom_passage:
    'On this tool: replacing or adding SVG follows the same rules as creation. Pass passage_svg = null explicitly to remove an existing SVG.',
} as const

export const BANK_NAMING_GUIDANCE = [
  'Every item created by this tool must belong to a custom Bank.',
  'Pass exactly one of bank_id (to reuse a bank from a previous tool result in this conversation) or bank_name (to create-or-find a bank by name in the family).',
  'When creating a new Bank, name it "{Topic} — {Subject} G{Grade}".',
  'Examples: "Fractions on a number line — Math G3", "Main idea — Reading G3", "Commas in compound sentences — Language G3".',
  'Use the topic phrasing the parent used in plain English; capitalize like a title; do not include the kid\'s name (banks are kid-agnostic and assignable to anyone).',
  'If the parent asks to add more to the same set, reuse the bank.id from the previous tool result, not bank_name (this avoids name-typo collisions).',
  'The tool may return a slightly different bank.name than you requested — if a same-name bank already existed in a different subject or grade, the server appends "(2)", "(3)", … and returns the resolved name.',
].join(' ');

/**
 * Compose a write tool's description with the shared SVG capability blurb
 * and a per-tool hint. Read tools that don't accept SVG don't need this.
 */
export function composeWriteToolDescription(
  baseDescription: string,
  toolKey: keyof typeof SVG_TOOL_HINTS,
): string {
  // Only the two creation tools take bank targets; update/publish/others don't.
  const includesBank = toolKey === 'create_custom_questions' || toolKey === 'create_custom_passage_and_questions';
  const parts = [baseDescription, SVG_CAPABILITY_BLURB, SVG_TOOL_HINTS[toolKey]];
  if (includesBank) parts.push(BANK_NAMING_GUIDANCE);
  return parts.join('\n\n');
}
