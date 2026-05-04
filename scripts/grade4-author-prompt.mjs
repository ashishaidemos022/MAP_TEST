// Generates a paste-ready author prompt for one Grade 4 (subject, teks_code, rit_band) cell.
// You paste the printed prompt into a fresh Claude Sonnet conversation, get a JSON array back,
// then write a migration to insert the questions.
//
// Usage:
//   node --env-file=.env.local scripts/grade4-author-prompt.mjs --subject math --teks 4.4H --band 201_210
//   node --env-file=.env.local scripts/grade4-author-prompt.mjs --subject math --teks 4.3D --band above_210
//   node --env-file=.env.local scripts/grade4-author-prompt.mjs --subject reading --teks 4.6F --band 201_210 --count 5
//
// Language pattern is auto-detected from the standard:
//   Pattern A (edit_pick)       — pronouns, SVA, nouns, adjectives, adverbs, capitalization, punctuation, sentence boundaries
//   Pattern B (mcq cloze)       — homophones, prepositional phrases, spelling, decoding, homographs, thesaurus
//   Pattern C (sentence_combine)— conjunctions, sentence combining

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
// Service role: anon key can't read map_standards under multi-tenant RLS.
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).')
  console.error('Run with: node --env-file=.env.local scripts/grade4-author-prompt.mjs --subject ...')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, tok, i, arr) => {
    if (tok.startsWith('--')) acc.push([tok.slice(2), arr[i + 1]])
    return acc
  }, []),
)

const subject = args.subject
const teks    = args.teks
const band    = args.band
const count   = Number(args.count ?? 5)

if (!subject || !teks || !band) {
  console.error('usage: node --env-file=.env.local scripts/grade4-author-prompt.mjs --subject <math|reading|language> --teks <code> --band <rit_band> [--count 5]')
  process.exit(2)
}

const VALID_BANDS = new Set(['below_161','161_170','171_180','181_190','191_200','201_210','above_210'])
if (!VALID_BANDS.has(band)) {
  console.error(`invalid band ${band}; valid: ${[...VALID_BANDS].join(', ')}`)
  process.exit(2)
}

const { data: std, error } = await sb
  .from('map_standards')
  .select('teks_code, teks_title, teks_description, khan_unit, nwea_goal_area')
  .eq('subject', subject)
  .eq('grade', 4)
  .eq('teks_code', teks)
  .single()

if (error || !std) {
  console.error(`standard not found: subject=${subject} grade=4 teks=${teks}`)
  if (error) console.error(error.message)
  process.exit(1)
}

const PATTERN_A = new Set([
  '4.11D.i','4.11D.ii','4.11D.iii','4.11D.iv','4.11D.v','4.11D.vii',
  '4.11D.ix','4.11D.x','4.11C.ii','4.11C.iii',
])
const PATTERN_B = new Set([
  '4.2C.i','4.2C.ii','4.2C.iii','4.2B.vi','4.11D.vi','4.11D.xi','4.3D','4.3E',
])
const PATTERN_C = new Set(['4.11D.viii','4.11C.i'])

let langPatternHint = ''
let questionFormat = 'mcq'
if (subject === 'language') {
  if (PATTERN_A.has(teks)) {
    questionFormat = 'edit_pick'
    langPatternHint = `\nLanguage pattern: A (edit_pick).\nStem: "Which sentence is written correctly?"\nThe four choices are full sentences. Exactly one is grammatically correct. Each wrong choice models a specific error type.\nThe stem may exceed 35 words because the sentences ARE the workspace.\n`
  } else if (PATTERN_C.has(teks)) {
    questionFormat = 'sentence_combine'
    langPatternHint = `\nLanguage pattern: C (sentence_combine).\nStem: "Which sentence best combines these two sentences?" followed by two short sentences (use bullet points • ).\nThe four choices are full combined sentences. Exactly one is correct. Distractors should model: comma splice, wrong conjunction, garbled word order, missing connector.\nThe stem may exceed 35 words because the sentences ARE the workspace.\n`
  } else {
    questionFormat = 'mcq'
    langPatternHint = `\nLanguage pattern: B (cloze mcq).\nStem: a single sentence with one blank ___ embedded in it.\nThe four choices are short word(s) or phrases. Exactly one fits the blank. Distractors should model homophone confusion, similar-word confusion, or wrong-category-of-word.\n`
  }
}

// G4 stretches the name set further — older characters and broader cultural range
// fit Grade 4 reading levels. Keep the existing G2/G3 names so a student moving up
// sees familiar characters.
const namesGr2 = 'Maya, Ethan, Priya, Liam, Ava, Aarav, Zoe'
const namesGr3 = 'Noor, Diego, Mei, Caleb'
const namesGr4 = 'Amara, Jonas, Ines, Rohan, Soren'

// Pull the live misconception_tag taxonomy for this subject across G2-G4. Anchors
// the LLM to existing tags so the taxonomy doesn't sprawl with each new batch.
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

// G4 RIT context for the LLM — at end of G4 (Spring) median is ~205. above_210 means
// content that stretches well above grade-level expectation.
const RIT_CONTEXT = {
  'below_181': 'well below G4 fall median (~190); review-band material',
  '181_190':   'below G4 fall median; foundational review',
  '191_200':   'on-grade for G4 fall',
  '201_210':   'on-grade for G4 spring; the typical end-of-year target',
  'above_210': 'above G4 expectation; stretch material aimed at the top of the bell curve',
}

const prompt = `You are authoring practice questions for a Grade 4 MAP-style test, aligned to Texas TEKS (TAC §111.6 math, §110.6 ELAR).

Standard: ${std.teks_code} — ${std.teks_title}
Full description: ${std.teks_description}
Khan Academy unit reference: ${std.khan_unit ?? '(none)'}
NWEA goal area: ${std.nwea_goal_area ?? '(none)'}
Target RIT band: ${band} (${RIT_CONTEXT[band] ?? 'see NWEA RIT scale'})
Subject: ${subject}
question_format: ${questionFormat}
${langPatternHint}${taxonomyBlock}
Author ${count} questions. For each, output a JSON object with this exact shape:

{
  "stem": "string — the question text (≤ 40 words for math/reading; longer is OK for language patterns A and C because the stem IS the workspace)",
  "stem_image_svg": "string or null — inline <svg viewBox='...' xmlns='http://www.w3.org/2000/svg'>...</svg> when a figure is needed",
  "explanation": "string — teach the solution method, do not just state the answer",
  "source_note": "Khan Academy: ${std.khan_unit ?? 'Grade 4 practice'}",
  "question_format": "${questionFormat}",
  "choices": [
    { "label": "A", "body": "...", "is_correct": false, "misconception": "free-text reason a student might pick this", "misconception_tag": "snake_case_tag" },
    { "label": "B", "body": "...", "is_correct": true,  "misconception": null, "misconception_tag": null },
    { "label": "C", "body": "...", "is_correct": false, "misconception": "...", "misconception_tag": "snake_case_tag" },
    { "label": "D", "body": "...", "is_correct": false, "misconception": "...", "misconception_tag": "snake_case_tag" }
  ]
}

Hard requirements:
- Exactly one is_correct = true. The correct choice has misconception = null and misconception_tag = null.
- Every distractor has BOTH a free-text "misconception" AND a snake_case "misconception_tag".
- Reuse tags from the LIVE TAXONOMY block above whenever one fits. Only invent a new tag when none capture the misconception.
- Names allowed: ${namesGr2}, ${namesGr3}, ${namesGr4}. No Sarah/John clichés.
- No verbatim Khan Academy or NWEA content. Original wording, original numbers, original passages.
- For math (place value to 1,000,000,000s, decimals to hundredths, fractions, area, perimeter, geometry, multi-step problems): use stem_image_svg with single-quoted attributes inside the SVG (so the string sits cleanly in a SQL VALUES list). No external images.
- For reading: anchor every question to a passage of 200-320 words (literary) or 180-300 words (informational). The passage should be authored separately and shared by all 4-6 questions.
- Tier-2 academic vocabulary is welcome (transformed, abundant, persuade, fragment, hesitate); tier-3 (photosynthesis, metamorphosis, stratosphere) belongs in science class.
- For ${band} specifically: ${RIT_CONTEXT[band]}. Calibrate difficulty accordingly — 'above_210' should genuinely challenge a top-of-class G4 student, not just be normal G4 work.

Output ONLY a JSON array of ${count} objects. No prose, no markdown fences, no commentary.
`

console.log(prompt)
