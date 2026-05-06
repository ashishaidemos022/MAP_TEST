// Generates a paste-ready author prompt for one Grade 5 (subject, teks_code, rit_band) cell.
// You paste the printed prompt into a fresh Claude Sonnet conversation, get a JSON array back,
// then write a migration to insert the questions.
//
// Usage:
//   node --env-file=.env.local scripts/grade5-author-prompt.mjs --subject math --teks 5.3K --band 211_220
//   node --env-file=.env.local scripts/grade5-author-prompt.mjs --subject math --teks 5.3K --band 211_220 --sub-skill decimal_add_hundredths
//   node --env-file=.env.local scripts/grade5-author-prompt.mjs --subject reading --teks 5.6F --band 201_210 --count 5
//   node --env-file=.env.local scripts/grade5-author-prompt.mjs --subject language --teks 5.11C.iii --band 211_220 --pattern d
//
// Language pattern is auto-detected from the standard:
//   Pattern A (edit_pick)         — verbs, pronouns, SVA, nouns, adjectives, adverbs, capitalization, punctuation, sentence boundaries
//   Pattern B (mcq cloze)         — homophones, prepositional phrases, spelling, suffixes
//   Pattern C (sentence_combine)  — conjunctions, sentence combining, organize-idea transitions
//   Pattern D (paragraph_editing) — Grade 5 STAAR shape; opt-in via --pattern d (any TEKS code can host it)
//
// --sub-skill <key> is math-only and adds a "Focus on this Khan sub-skill" hint to the prompt.
//   See Grade5_Seeding_Brief §17 for the full mapping.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
// Service role: anon key can't read map_standards under multi-tenant RLS.
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).')
  console.error('Run with: node --env-file=.env.local scripts/grade5-author-prompt.mjs --subject ...')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, tok, i, arr) => {
    if (tok.startsWith('--')) acc.push([tok.slice(2), arr[i + 1]])
    return acc
  }, []),
)

const subject       = args.subject
const teks          = args.teks
const band          = args.band
const count         = Number(args.count ?? 5)
const subSkill      = args['sub-skill'] ?? null
const patternOverride = (args.pattern ?? '').toLowerCase() // '' | 'a' | 'b' | 'c' | 'd'

if (!subject || !teks || !band) {
  console.error('usage: node --env-file=.env.local scripts/grade5-author-prompt.mjs --subject <math|reading|language> --teks <code> --band <rit_band> [--count 5] [--sub-skill <key>] [--pattern <a|b|c|d>]')
  process.exit(2)
}

// Grade 5 valid bands per Brief §4. above_210 is in the enum but deprecated
// for Grade 5 authoring per §13 — refuse it as a target.
const VALID_BANDS = new Set(['191_200','201_210','211_220','221_230','231_240'])
if (!VALID_BANDS.has(band)) {
  console.error(`invalid Grade 5 band: ${band}`)
  console.error(`valid for new authoring: ${[...VALID_BANDS].join(', ')}`)
  console.error("(above_210 / above_230 are legacy catchall bands; deprecated for Grade 5 per §13.)")
  process.exit(2)
}

const { data: std, error } = await sb
  .from('map_standards')
  .select('teks_code, teks_title, teks_description, khan_unit, nwea_goal_area, is_synthetic')
  .eq('subject', subject)
  .eq('grade', 5)
  .eq('teks_code', teks)
  .single()

if (error || !std) {
  console.error(`standard not found: subject=${subject} grade=5 teks=${teks}`)
  if (error) console.error(error.message)
  process.exit(1)
}

// ---- Language pattern detection (Grade 5 mirrors Grade 3/4 mapping) -----------

const PATTERN_A = new Set([
  '5.11D.i','5.11D.ii','5.11D.iii','5.11D.iv','5.11D.v','5.11D.vii',
  '5.11D.ix','5.11D.x','5.11C.ii',
])
const PATTERN_B = new Set([
  '5.11D.vi','5.11D.xi',
])
const PATTERN_C = new Set([
  '5.11D.viii','5.11C.i',
])
// 5.11C.iii (edit drafts) defaults to Pattern D — that's its STAAR-G5 shape.
const PATTERN_D_DEFAULT = new Set([
  '5.11C.iii',
])

let langPatternHint = ''
let questionFormat = 'mcq'
if (subject === 'language') {
  let pattern
  if (patternOverride === 'a' || patternOverride === 'b' || patternOverride === 'c' || patternOverride === 'd') {
    pattern = patternOverride
  } else if (PATTERN_D_DEFAULT.has(teks)) {
    pattern = 'd'
  } else if (PATTERN_A.has(teks)) {
    pattern = 'a'
  } else if (PATTERN_C.has(teks)) {
    pattern = 'c'
  } else {
    pattern = 'b'
  }

  if (pattern === 'a') {
    questionFormat = 'edit_pick'
    langPatternHint = `\nLanguage pattern: A (edit_pick).
Stem: "Which sentence is written correctly?"
The four choices are full sentences. Exactly one is grammatically correct. Each wrong choice models a specific error type matching the TEKS sub-letter (e.g., subject-verb agreement, pronoun case, perfect-tense helper, capitalization, comma after introductory phrase).
The stem may exceed 45 words because the sentences ARE the workspace.
`
  } else if (pattern === 'c') {
    questionFormat = 'sentence_combine'
    langPatternHint = `\nLanguage pattern: C (sentence_combine).
Stem: "Which sentence best combines these two sentences?" followed by two short sentences (use bullet points • ).
The four choices are full combined sentences. Exactly one is correct. Distractors should model: comma splice, wrong conjunction (matching the wrong logical relationship), garbled word order, missing connector.
The stem may exceed 45 words because the sentences ARE the workspace.
`
  } else if (pattern === 'd') {
    questionFormat = 'paragraph_editing'
    langPatternHint = `\nLanguage pattern: D (paragraph_editing) — the dominant STAAR-Grade-5 language item shape.
Author ONE editing-draft passage of 4–6 numbered sentences with 2–4 specific errors (NOT one error per sentence — at least one sentence must already be correct so kids can't game the test). Then author ${count} questions about the passage.
Passage shape:
  - Body in the form: "(1) Sentence one. (2) Sentence two. (3) ..." — sentence numbers are part of the body text.
  - Genre = 'editing_draft'. The passage will go in map_reading_passages with subject='language'.
Question shapes (mix these in the ${count}-question set):
  - Sentence-targeted edits: "What change should be made to sentence N?" — set target_sentence_number = N. Choices are revised versions of that sentence (or "no change needed").
  - Revision opportunities: "Where should the writer add the sentence '...'?" — target_sentence_number = null, choices are positions (before sentence 1, between 2 and 3, etc.).
Each distractor's misconception_tag should target a specific error type from the §10 taxonomy (e.g., capitalization_proper_noun, comma_in_compound_sentence_missing, pronoun_compound_subject_wrong_case, homophone_their_there_theyre).
The stem may exceed 45 words.
`
  } else {
    questionFormat = 'mcq'
    langPatternHint = `\nLanguage pattern: B (cloze mcq).
Stem: a single sentence with one blank ___ embedded in it (≤ 45 words).
The four choices are short word(s) or phrases. Exactly one fits the blank. Distractors should model homophone confusion, similar-word confusion, or wrong-category-of-word.
`
  }
}

// ---- Sub-skill mapping (math only, §17) ---------------------------------------

const SUB_SKILLS = {
  '5.3A': {
    est_add_sub_multidigit: 'Estimate to add multi-digit numbers; estimate to subtract',
    est_add_sub_word_problems: 'Multi-digit addition & subtraction estimation word problems',
    est_mult_factors_of_10: 'Multiply by taking out factors of 10',
    est_multidigit_mult: 'Estimate multi-digit multiplication',
    est_div_factors_of_10: 'Divide by taking out factors of 10',
    est_multidigit_div: 'Estimate multi-digit division problems',
    est_word_problems_two_step: '2-step estimation word problems',
  },
  '5.3B': {
    mult_1digit_standard_algorithm: 'Multiply by 1-digit numbers (standard algorithm)',
    mult_2digit_by_2digit: 'Multiply 2-digit numbers',
    mult_3digit_by_2digit: 'Multiply 3-digit by 2-digit (standard algorithm)',
  },
  '5.3C': {
    div_basic_multidigit: 'Basic multi-digit division',
    div_by_2digit_divisor: 'Division by 2-digit numbers',
  },
  '5.4B': { multistep_word_problems_whole: 'Multi-step word problems with whole numbers' },
  '5.4E': {
    simplify_numerical_expressions: 'Simplify numerical expressions',
    order_of_operations_intro: 'Order of operations (introduction)',
  },
  '5.4F': {
    eval_expressions_with_parentheses: 'Evaluate expressions with parentheses',
    translate_expressions_with_parens: 'Translate verbal expressions involving parentheses',
    create_expressions_with_parens: 'Create expressions with parentheses',
    expression_word_problems_basic: 'Writing basic expression word problems',
  },
  '5.review.factors': {
    factor_pairs: 'Factor pairs',
    identify_factors: 'Identify factors of a number',
    identify_multiples: 'Identify multiples',
    relate_factors_multiples: 'Relate factors and multiples',
  },
  '5.4A': { prime_composite_intro: 'Identify prime numbers; identify composite numbers; understand the difference' },
  '5.2A': {
    decimal_place_value_names: 'Place value names',
    decimal_value_of_a_digit: 'Value of a digit',
    decimal_expanded_form: 'Write decimals in expanded form',
  },
  '5.2B': {
    decimal_compare_thousandths: 'Compare decimals through thousandths',
    decimal_order: 'Order decimals',
    decimal_compare_word_problems: 'Compare decimals word problems',
  },
  '5.2C': {
    decimal_round_on_number_line: 'Round decimals on the number line',
    decimal_round: 'Round decimals',
    decimal_round_word_problems: 'Decimal rounding word problems',
  },
  '5.3K': {
    decimal_on_number_line_thousandths: 'Decimals on the number line up to thousandths',
    decimal_add_visually: 'Add decimals visually',
    decimal_add_tenths: 'Add decimals (tenths)',
    decimal_add_hundredths: 'Add decimals (hundredths)',
    decimal_add_thousandths: 'Add decimals (thousandths)',
    decimal_subtract_visually: 'Subtract decimals visually',
    decimal_subtract_tenths: 'Subtract decimals (tenths)',
    decimal_subtract_hundredths: 'Subtract decimals (hundredths)',
    decimal_subtract_thousandths: 'Subtract decimals (thousandths)',
    decimal_word_problems_add_sub: 'Adding & subtracting decimals word problems',
  },
  '5.3D': {
    decimal_x_whole_visual: 'Multiply decimals and whole numbers visually',
    decimal_x_powers_of_tenth: 'Multiply whole numbers by 0.1 and 0.01',
    decimal_x_whole_word_problems: 'Decimal × whole number word problems',
  },
  '5.3E': {
    decimal_x_decimal_grid: 'Multiply decimals using grids and area models',
    decimal_x_decimal_tenths: 'Multiply decimals (tenths)',
    decimal_x_decimal_hundredths: 'Decimal products (hundredths)',
    decimal_mult_word_problems: 'Multiply decimals word problems',
  },
  '5.3F': {
    decimal_div_whole_to_decimal_quotient: 'Divide whole numbers to get a decimal quotient',
    decimal_div_by_whole_visual: 'Divide decimals by whole numbers visually',
    decimal_div_by_whole: 'Divide decimals by whole numbers',
  },
  '5.3G': {
    decimal_div_whole_by_decimal_visual: 'Divide whole numbers by decimals visually',
    decimal_div_whole_by_powers_of_tenth: 'Divide whole numbers by 0.1 or 0.01',
    decimal_div_whole_by_decimal: 'Divide whole numbers by decimals',
  },
  '5.3H': {
    frac_add_sub_visual: 'Visually add and subtract fractions',
    frac_estimate_unlike_denom: 'Estimate sums and differences with unlike denominators',
    frac_common_denominators: 'Find common denominators',
    frac_add_unlike_denom: 'Add fractions with unlike denominators',
    frac_sub_unlike_denom: 'Subtract fractions with unlike denominators',
    frac_mixed_no_regroup: 'Add & subtract mixed numbers (no regrouping)',
    frac_mixed_with_regroup: 'Add & subtract mixed numbers (with regrouping)',
    frac_add_sub_word_problems: 'Add and subtract fractions word problems',
  },
  '5.3I': {
    frac_x_whole_models: 'Multiply fractions and whole numbers using fraction models',
    frac_x_whole_number_line: 'Multiply fractions on the number line',
    frac_x_whole: 'Multiply fractions and whole numbers',
  },
  '5.3J': {
    frac_div_unit_by_whole_visual: 'Divide unit fractions by whole numbers visually',
    frac_div_unit_by_whole: 'Divide unit fractions by whole numbers',
  },
  '5.3L': {
    frac_div_whole_by_unit_visual: 'Divide whole numbers by unit fractions visually',
    frac_div_whole_by_unit: 'Divide whole numbers by unit fractions',
  },
  '5.7A': {
    convert_metric: 'Convert metric units',
    convert_metric_word_problems: 'Convert metric unit word problems',
    convert_metric_multistep: 'Multi-step metric conversion problems',
    convert_us_customary: 'Convert US customary units',
    convert_us_customary_word: 'Convert US customary word problems',
    convert_us_customary_multistep: 'Multi-step US customary problems',
  },
  '5.5A': {
    classify_triangles_by_angles: 'Classify triangles by angles',
    classify_triangles_by_sides_angles: 'Classify triangles by sides and angles',
    identify_quadrilaterals: 'Identify quadrilaterals',
    quadrilateral_types_hierarchy: 'Types of quadrilaterals; classifying shapes; properties of shapes',
  },
  '5.6A': {
    volume_unit_cubes: 'Volume using unit cubes',
    volume_rect_prism_unit_cubes: 'Volume of rectangular prisms with unit cubes',
    volume_compare_unit_cubes: 'Compare volumes using unit cubes',
  },
  '5.6B': {
    volume_area_of_base_x_height: 'Volume as (area of base × height)',
    volume_rect_prisms_formula: 'Volume of rectangular prisms (formula)',
    volume_real_world: 'Solve real-world volume problems',
  },
  '5.4H': {
    area_perimeter_situations: 'Area and perimeter situations',
    represent_rectangle_measurements: 'Represent rectangle measurements',
    area_perimeter_word_problems: 'Area & perimeter word problems',
  },
}

let subSkillHint = ''
if (subSkill) {
  if (subject !== 'math') {
    console.error(`--sub-skill is math-only (Brief §17 — reading and language don't have a parallel sub-skill axis at Grade 5).`)
    process.exit(2)
  }
  const cellSkills = SUB_SKILLS[teks] ?? null
  if (!cellSkills) {
    console.error(`No §17 sub-skill mapping defined for ${teks}. Coordinate-plane (5.8*), data (5.9*), and financial-literacy (5.10*) clusters are intentionally TEKS-grain only — see §17.7.`)
    process.exit(2)
  }
  if (!cellSkills[subSkill]) {
    console.error(`Sub-skill '${subSkill}' is not a valid key for ${teks}. Valid keys:`)
    for (const k of Object.keys(cellSkills)) console.error(`  - ${k}: ${cellSkills[k]}`)
    process.exit(2)
  }
  subSkillHint = `\nKHAN SUB-SKILL FOCUS — author all ${count} questions to target this specific sub-skill within ${teks}: **${subSkill}** — ${cellSkills[subSkill]}.\n`
}

// ---- Names pool (Grade 2 + Grade 3 + Grade 5 additions per Brief §5) ---------

const namesGr2 = 'Maya, Ethan, Priya, Liam, Ava, Aarav, Zoe'
const namesGr3 = 'Noor, Diego, Mei, Caleb'
const namesGr5 = 'Jamal, Selena, Hiroshi, Imani, Theo, Sofia, Ravi'

// ---- Live-taxonomy block (anchors LLM to existing tags, prevents drift) ------

const { data: tagRows, error: tagErr } = await sb
  .from('map_question_choices')
  .select('misconception_tag, map_questions!inner(subject)')
  .eq('is_correct', false)
  .not('misconception_tag', 'is', null)
  .eq('map_questions.subject', subject)

if (tagErr) {
  console.error('tag-rollup query failed:', tagErr.message)
  process.exit(1)
}

const tagCounts = new Map()
for (const r of tagRows ?? []) {
  tagCounts.set(r.misconception_tag, (tagCounts.get(r.misconception_tag) ?? 0) + 1)
}
const liveTags = [...tagCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([tag, n]) => `${tag} (${n})`)

const taxonomyBlock = liveTags.length > 0
  ? `\nLIVE TAXONOMY — these misconception_tag values already exist for ${subject} (count after each tag = times used). PREFER reusing these if one fits. Inventing a near-duplicate tag is the single biggest source of taxonomy drift; only invent a new tag when none of these capture the misconception:\n${liveTags.map(t => `  - ${t}`).join('\n')}\n`
  : `\nLIVE TAXONOMY — no ${subject} tags exist yet. You're seeding the taxonomy; pick names that will generalize across many future questions.\n`

// ---- Grade 5 RIT context ------------------------------------------------------

const RIT_CONTEXT = {
  '191_200': 'below G5 fall median (~200); foundational review band',
  '201_210': 'on-grade for G5 fall/winter — the typical mid-year target',
  '211_220': 'on-grade for G5 spring; the typical end-of-year target',
  '221_230': 'above G5 spring expectation; stretch material aimed at the upper-quartile G5 student',
  '231_240': 'well above G5 expectation; ceiling-band stretch (top of bell curve / advanced)',
}

// ---- The prompt ---------------------------------------------------------------

const synthNote = std.is_synthetic
  ? `\nNOTE: This standard is synthetic (not a TEKS code) — it's a review/cluster anchor used by the bank, not by the parent dashboard's TEKS heatmap. Author the questions exactly as you would for a TEKS standard.\n`
  : ''

const prompt = `You are authoring practice questions for a Grade 5 MAP-style test, aligned to Texas TEKS (TAC §111.7 math, §110.7 ELAR).

Standard: ${std.teks_code} — ${std.teks_title}
Full description: ${std.teks_description}
Khan Academy unit reference: ${std.khan_unit ?? '(none)'}
NWEA goal area: ${std.nwea_goal_area ?? '(none)'}
Target RIT band: ${band} (${RIT_CONTEXT[band]})
Subject: ${subject}
question_format: ${questionFormat}
${synthNote}${langPatternHint}${subSkillHint}${taxonomyBlock}
Author ${count} questions${questionFormat === 'paragraph_editing' ? ` against ONE editing-draft passage` : ''}. For each question, output a JSON object with this exact shape:

{
  "stem": "string — the question text (≤ 45 words for math/reading and Pattern B language; longer is OK for Patterns A, C, and D because the stem IS the workspace)",
  "stem_image_svg": "string or null — inline <svg viewBox='...' xmlns='http://www.w3.org/2000/svg'>...</svg> when a figure is needed",
  "explanation": "string — teach the solution method, do not just state the answer",
  "source_note": "Khan Academy: ${std.khan_unit ?? 'Grade 5 practice'}",
  "question_format": "${questionFormat}",${questionFormat === 'paragraph_editing' ? '\n  "target_sentence_number": null | 1..6,  // sentence number for sentence-targeted edits, null for revision-opportunity questions' : ''}
  "choices": [
    { "label": "A", "body": "...", "is_correct": false, "misconception": "free-text reason a student might pick this", "misconception_tag": "snake_case_tag" },
    { "label": "B", "body": "...", "is_correct": true,  "misconception": null, "misconception_tag": null },
    { "label": "C", "body": "...", "is_correct": false, "misconception": "...", "misconception_tag": "snake_case_tag" },
    { "label": "D", "body": "...", "is_correct": false, "misconception": "...", "misconception_tag": "snake_case_tag" }
  ]
}
${questionFormat === 'paragraph_editing' ? `
Output shape for paragraph_editing — wrap the question array inside an object with the passage:

{
  "passage": {
    "genre": "editing_draft",
    "subject": "language",
    "grade": 5,
    "title": "string — short title for the draft",
    "body": "(1) Sentence one. (2) Sentence two. (3) ...",
    "lexile": null,
    "rit_band": "${band}"
  },
  "questions": [ /* the ${count} question objects above */ ]
}
` : ''}
Hard requirements:
- Exactly one is_correct = true. The correct choice has misconception = null and misconception_tag = null.
- Every distractor has BOTH a free-text "misconception" AND a snake_case "misconception_tag".
- Reuse tags from the LIVE TAXONOMY block above whenever one fits. Only invent a new tag when none capture the misconception.
- Names allowed: ${namesGr2}, ${namesGr3}, ${namesGr5}. No Sarah/John clichés.
- No verbatim Khan Academy, NWEA, or STAAR content. Original wording, original numbers, original passages. STAAR practice books are not okay to copy from either.
- For math (decimals, fractions, volume, coordinate plane Q1, order of operations, patterns, measurement conversion, financial literacy): use stem_image_svg with single-quoted attributes inside the SVG (so the string sits cleanly in a SQL VALUES list). No external images. Reuse the §7.1 SVG patterns: fraction bars, fraction number lines, decimal grids (10×10 hundredths), unit-cube prisms (isometric), coordinate planes with gridlines.
- Two-step problems should make up roughly 30% of math output. Both numbers must appear in the stem; structure must be transparent.
- For reading: anchor every question to a passage of 280–420 words (literary), 240–380 (informational), 60–180 (poetry), 180–300 (drama). Lexile 700L–950L target. Authoring proportions: ≥ 40% inference/purpose/craft, ≤ 30% literal recall, the rest vocabulary and text-evidence.
- Tier-2 academic vocabulary is welcome (inferred, summarize, perspective, evidence, convey, concise, symbolic, rural, urban, sediment, erode, accomplish). Tier-3 (photosynthesis, metamorphosis, stratosphere) belongs in science class.
- For ${band} specifically: ${RIT_CONTEXT[band]}. Calibrate difficulty accordingly — '231_240' should genuinely challenge a top-of-class G5 student, not just be normal G5 work.
- Distractors must be plausible misconception paths, not "obviously wrong". A Grade 5 student should be able to argue for any of the wrong answers if they made a specific reasoning error.
- No raster images. SVG only. If the figure can't be SVG, omit the figure.

Output ONLY ${questionFormat === 'paragraph_editing' ? 'the JSON object described above (with passage and questions keys)' : `a JSON array of ${count} objects`}. No prose, no markdown fences, no commentary.
`

console.log(prompt)
