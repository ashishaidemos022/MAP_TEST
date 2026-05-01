// Generates a paste-ready author prompt for one (subject, teks_code, rit_band) cell.
// You paste the printed prompt into a fresh Claude Sonnet conversation, get a JSON array back,
// then write a migration to insert the questions.
//
// Usage:
//   node scripts/grade3-author-prompt.mjs --subject math --teks 3.4F --band 181_190
//   node scripts/grade3-author-prompt.mjs --subject reading --teks 3.6F --band 191_200 --count 5
//   node scripts/grade3-author-prompt.mjs --subject language --teks 3.11D.vii --band 181_190
//
// The language pattern is auto-detected from the standard:
//   3.11D.vii (pronouns), 3.11D.i (SVA), 3.11D.iii (nouns) → edit_pick (Pattern A)
//   3.2C.ii (homophones), 3.11D.vi (prep phrases)         → mcq cloze (Pattern B)
//   3.11D.viii (conjunctions), 3.11C.i (combine)          → sentence_combine (Pattern C)

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.error('Missing env: set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (see .env.example).')
  console.error('Run with: node --env-file=.env.local scripts/grade3-author-prompt.mjs --subject ...')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

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
  console.error('usage: node scripts/grade3-author-prompt.mjs --subject <math|reading|language> --teks <code> --band <rit_band> [--count 5]')
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
  .eq('grade', 3)
  .eq('teks_code', teks)
  .single()

if (error || !std) {
  console.error(`standard not found: subject=${subject} grade=3 teks=${teks}`)
  if (error) console.error(error.message)
  process.exit(1)
}

const PATTERN_A = new Set(['3.11D.i','3.11D.ii','3.11D.iii','3.11D.iv','3.11D.v','3.11D.vii','3.11D.ix','3.11D.x','3.11C.ii'])
const PATTERN_B = new Set(['3.2C.ii','3.11D.vi','3.2B.vi','3.11D.xi','3.2C.i'])
const PATTERN_C = new Set(['3.11D.viii','3.11C.i'])

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

const namesGr2 = 'Maya, Ethan, Priya, Liam, Ava, Aarav, Zoe'
const namesGr3 = 'Noor, Diego, Mei, Caleb'

// Pull the live misconception_tag taxonomy for this subject (across grades 2 and 3 — a tag
// established in Grade 2 is still the right one to reuse in Grade 3). The point of injecting
// this into the prompt is to anchor the LLM to existing tags so the taxonomy doesn't sprawl.
// Without this, batch #20 invents a new spelling for what batch #1 already named.
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

const prompt = `You are authoring practice questions for a Grade 3 MAP-style test, aligned to Texas TEKS.

Standard: ${std.teks_code} — ${std.teks_title}
Full description: ${std.teks_description}
Khan Academy unit reference: ${std.khan_unit ?? '(none)'}
NWEA goal area: ${std.nwea_goal_area ?? '(none)'}
Target RIT band: ${band}
Subject: ${subject}
question_format: ${questionFormat}
${langPatternHint}${taxonomyBlock}
Author ${count} questions. For each, output a JSON object with this exact shape:

{
  "stem": "string — the question text (≤ 35 words for math/reading; longer is OK for language patterns A and C because the stem IS the workspace)",
  "stem_image_svg": "string or null — inline <svg viewBox='...' xmlns='http://www.w3.org/2000/svg'>...</svg> when a figure is needed",
  "explanation": "string — teach the solution method, do not just state the answer",
  "source_note": "Khan Academy: ${std.khan_unit ?? 'Grade 3 practice'}",
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
- Reuse tags from the LIVE TAXONOMY block above whenever one fits the misconception. Only invent a new tag when none of the existing ones capture it.
- Names allowed: ${namesGr2}, ${namesGr3}. No Sarah/John clichés.
- No verbatim Khan Academy or NWEA content. Original wording, original numbers, original passages.
- For math, place value, fractions, area, perimeter, geometry, multiplication arrays: use stem_image_svg with single-quoted attributes inside the SVG (so the string can sit in a SQL VALUES list). No external images.
- For reading, anchor every question to a passage; the passage should be authored separately and shared by all 4–6 questions.
- Tier-2 academic vocabulary is welcome (migrate, ancient, burrow, emerged); tier-3 (photosynthesis, metamorphosis) is out of scope.

Output ONLY a JSON array of ${count} objects. No prose, no markdown fences, no commentary.
`

console.log(prompt)
