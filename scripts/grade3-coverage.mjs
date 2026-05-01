// Grade 3 question-bank coverage report.
// Runs the three queries from Grade3_Seeding_Brief.md §10 and prints results.
//
// Run: node scripts/grade3-coverage.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.error('Missing env: set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (see .env.example).')
  console.error('Run with: node --env-file=.env.local scripts/grade3-coverage.mjs')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

const RED   = (s) => `\x1b[31m${s}\x1b[0m`
const YEL   = (s) => `\x1b[33m${s}\x1b[0m`
const GREEN = (s) => `\x1b[32m${s}\x1b[0m`
const DIM   = (s) => `\x1b[2m${s}\x1b[0m`

function pad(s, n) { return String(s).padEnd(n) }
function lpad(n, w) { return String(n).padStart(w) }

// ---- 1. Per-standard coverage --------------------------------------------------

const { data: standards, error: e1 } = await sb
  .from('map_standards')
  .select('id, subject, teks_code, teks_title, sort_order')
  .eq('grade', 3)
  .order('sort_order')

if (e1) { console.error('standards query failed:', e1.message); process.exit(1) }

const { data: questions, error: e2 } = await sb
  .from('map_questions')
  .select('id, standard_id, rit_band')
  .eq('grade', 3)
  .eq('is_active', true)

if (e2) { console.error('questions query failed:', e2.message); process.exit(1) }

const BANDS = ['below_181','181_190','191_200','201_210','above_210']
function bucket(b) {
  if (b === '181_190' || b === '191_200' || b === '201_210' || b === 'above_210') return b
  return 'below_181'
}

const byStandard = new Map()
for (const s of standards) {
  byStandard.set(s.id, { ...s, total: 0, bands: Object.fromEntries(BANDS.map(b => [b, 0])) })
}
for (const q of questions) {
  const row = byStandard.get(q.standard_id)
  if (!row) continue
  row.total += 1
  row.bands[bucket(q.rit_band)] += 1
}

console.log('\n' + GREEN('━━━ Grade 3 — Per-standard coverage ━━━'))
console.log(DIM('   < 6 questions per standard is flagged red. Target is 4–6 questions per (standard, band) cell.\n'))

for (const subject of ['math','reading','language']) {
  const rows = [...byStandard.values()].filter(r => r.subject === subject)
  const totalQ = rows.reduce((a,r) => a + r.total, 0)
  console.log(GREEN(`▌ ${subject.toUpperCase()} — ${rows.length} standards, ${totalQ} questions`))
  console.log(DIM(`  ${pad('TEKS', 12)} ${pad('Title', 50)} ${lpad('Tot', 4)} ${BANDS.map(b => lpad(b, 9)).join(' ')}`))
  for (const r of rows) {
    const flag = r.total < 6 ? RED : (r.total < 21 ? YEL : GREEN)
    const title = r.teks_title.length > 48 ? r.teks_title.slice(0, 47) + '…' : r.teks_title
    console.log(`  ${pad(r.teks_code, 12)} ${pad(title, 50)} ${flag(lpad(r.total, 4))} ${BANDS.map(b => lpad(r.bands[b], 9)).join(' ')}`)
  }
  console.log()
}

// ---- 2. Misconception-tag rollup ----------------------------------------------

const { data: choices, error: e3 } = await sb
  .from('map_question_choices')
  .select('misconception_tag, question_id, map_questions!inner(grade, subject, standard_id)')
  .eq('is_correct', false)
  .eq('map_questions.grade', 3)

if (e3) { console.error('choices query failed:', e3.message); process.exit(1) }

const tagAgg = new Map() // key: subject + '|' + tag
for (const c of choices) {
  if (!c.misconception_tag) continue
  const key = `${c.map_questions.subject}|${c.misconception_tag}`
  let row = tagAgg.get(key)
  if (!row) { row = { subject: c.map_questions.subject, tag: c.misconception_tag, uses: 0, standards: new Set() }; tagAgg.set(key, row) }
  row.uses += 1
  if (c.map_questions.standard_id) row.standards.add(c.map_questions.standard_id)
}

console.log(GREEN('━━━ Grade 3 — Misconception tag rollup ━━━'))
console.log(DIM('   Tags used only once are candidates to rename (fold) or grow (3+ examples).\n'))
const tagRows = [...tagAgg.values()].sort((a,b) => a.subject === b.subject ? b.uses - a.uses : a.subject.localeCompare(b.subject))
for (const subject of ['math','reading','language']) {
  const subRows = tagRows.filter(t => t.subject === subject)
  if (subRows.length === 0) continue
  console.log(GREEN(`▌ ${subject.toUpperCase()} — ${subRows.length} distinct tags`))
  for (const r of subRows) {
    const useFlag = r.uses === 1 ? YEL : (txt => txt)
    console.log(`  ${pad(r.tag, 42)} ${useFlag(lpad(r.uses, 4))}  uses across ${lpad(r.standards.size, 3)} standards`)
  }
  console.log()
}

// ---- 3. Untagged distractors --------------------------------------------------

const { count: untagged, error: e4 } = await sb
  .from('map_question_choices')
  .select('id, map_questions!inner(grade)', { count: 'exact', head: true })
  .eq('is_correct', false)
  .is('misconception_tag', null)
  .eq('map_questions.grade', 3)

if (e4) { console.error('untagged query failed:', e4.message); process.exit(1) }

console.log(GREEN('━━━ Grade 3 — Untagged distractors (must be 0) ━━━'))
const flag = (untagged ?? 0) === 0 ? GREEN : RED
console.log(`  ${flag(`${untagged ?? 0} untagged distractor${untagged === 1 ? '' : 's'}`)}\n`)

if ((untagged ?? 0) > 0) process.exit(1)
