// Grade 5 question-bank coverage report.
// Mirrors scripts/grade4-coverage.mjs — same three sections (per-standard
// coverage, misconception-tag rollup, untagged-distractor count) — adapted
// to Grade 5 RIT bands per Grade5_Seeding_Brief §4 and the §17 Khan sub-skill
// table for the secondary breakdown beneath each math row.
//
// Run: node --env-file=.env.local scripts/grade5-coverage.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
// Service role: anon key can't read map_standards or map_questions under the
// multi-tenant RLS policies (returns silently empty). Coverage scripts run on
// the dev machine, so service role is the right choice.
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).')
  console.error('Run with: node --env-file=.env.local scripts/grade5-coverage.mjs')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

const RED   = (s) => `\x1b[31m${s}\x1b[0m`
const YEL   = (s) => `\x1b[33m${s}\x1b[0m`
const GREEN = (s) => `\x1b[32m${s}\x1b[0m`
const DIM   = (s) => `\x1b[2m${s}\x1b[0m`

function pad(s, n) { return String(s).padEnd(n) }
function lpad(n, w) { return String(n).padStart(w) }

// §17 Khan sub-skill mapping (math only). Keys are TEKS codes; each value is
// an array of [sub_skill_key, plano_label]. Used as a static annotation under
// each math row — sub-skill counts can't be queried from the DB because we
// deliberately don't store sub_skill on map_questions (§17.8). The author
// reading this report decides whether the existing questions in the cell
// hit a thin sub-skill.
const SUB_SKILLS = {
  '5.3A': [
    ['est_add_sub_multidigit', 'Estimate to add/subtract multi-digit'],
    ['est_add_sub_word_problems', 'Multi-digit add/sub estimation word problems'],
    ['est_mult_factors_of_10', 'Multiply by taking out factors of 10'],
    ['est_multidigit_mult', 'Estimate multi-digit multiplication'],
    ['est_div_factors_of_10', 'Divide by taking out factors of 10'],
    ['est_multidigit_div', 'Estimate multi-digit division'],
    ['est_word_problems_two_step', '2-step estimation word problems'],
  ],
  '5.3B': [
    ['mult_1digit_standard_algorithm', 'Multiply by 1-digit (standard algorithm)'],
    ['mult_2digit_by_2digit', 'Multiply 2-digit numbers'],
    ['mult_3digit_by_2digit', 'Multiply 3-digit by 2-digit'],
  ],
  '5.3C': [
    ['div_basic_multidigit', 'Basic multi-digit division'],
    ['div_by_2digit_divisor', 'Division by 2-digit numbers'],
  ],
  '5.4B': [
    ['multistep_word_problems_whole', 'Multi-step word problems with whole numbers'],
  ],
  '5.4E': [
    ['simplify_numerical_expressions', 'Simplify numerical expressions'],
    ['order_of_operations_intro', 'Order of operations (introduction)'],
  ],
  '5.4F': [
    ['eval_expressions_with_parentheses', 'Evaluate expressions with parentheses'],
    ['translate_expressions_with_parens', 'Translate verbal expressions with parentheses'],
    ['create_expressions_with_parens', 'Create expressions with parentheses'],
    ['expression_word_problems_basic', 'Writing basic expression word problems'],
  ],
  '5.review.factors': [
    ['factor_pairs', 'Factor pairs'],
    ['identify_factors', 'Identify factors of a number'],
    ['identify_multiples', 'Identify multiples'],
    ['relate_factors_multiples', 'Relate factors and multiples'],
  ],
  '5.4A': [
    ['prime_composite_intro', 'Prime/composite numbers (intro)'],
  ],
  '5.2A': [
    ['decimal_place_value_names', 'Place value names'],
    ['decimal_value_of_a_digit', 'Value of a digit'],
    ['decimal_expanded_form', 'Decimals in expanded form'],
  ],
  '5.2B': [
    ['decimal_compare_thousandths', 'Compare decimals through thousandths'],
    ['decimal_order', 'Order decimals'],
    ['decimal_compare_word_problems', 'Compare decimals word problems'],
  ],
  '5.2C': [
    ['decimal_round_on_number_line', 'Round decimals on the number line'],
    ['decimal_round', 'Round decimals'],
    ['decimal_round_word_problems', 'Decimal rounding word problems'],
  ],
  '5.3K': [
    ['decimal_on_number_line_thousandths', 'Decimals on the number line up to thousandths'],
    ['decimal_add_visually', 'Add decimals visually'],
    ['decimal_add_tenths', 'Add decimals (tenths)'],
    ['decimal_add_hundredths', 'Add decimals (hundredths)'],
    ['decimal_add_thousandths', 'Add decimals (thousandths)'],
    ['decimal_subtract_visually', 'Subtract decimals visually'],
    ['decimal_subtract_tenths', 'Subtract decimals (tenths)'],
    ['decimal_subtract_hundredths', 'Subtract decimals (hundredths)'],
    ['decimal_subtract_thousandths', 'Subtract decimals (thousandths)'],
    ['decimal_word_problems_add_sub', 'Decimal add/sub word problems'],
  ],
  '5.3D': [
    ['decimal_x_whole_visual', 'Multiply decimals × whole visually'],
    ['decimal_x_powers_of_tenth', 'Multiply whole numbers by 0.1 / 0.01'],
    ['decimal_x_whole_word_problems', 'Decimal × whole number word problems'],
  ],
  '5.3E': [
    ['decimal_x_decimal_grid', 'Multiply decimals using grids/area models'],
    ['decimal_x_decimal_tenths', 'Multiply decimals (tenths)'],
    ['decimal_x_decimal_hundredths', 'Decimal products (hundredths)'],
    ['decimal_mult_word_problems', 'Multiply decimals word problems'],
  ],
  '5.3F': [
    ['decimal_div_whole_to_decimal_quotient', 'Divide whole numbers → decimal quotient'],
    ['decimal_div_by_whole_visual', 'Divide decimals by whole numbers visually'],
    ['decimal_div_by_whole', 'Divide decimals by whole numbers'],
  ],
  '5.3G': [
    ['decimal_div_whole_by_decimal_visual', 'Divide whole numbers by decimals visually'],
    ['decimal_div_whole_by_powers_of_tenth', 'Divide whole numbers by 0.1 / 0.01'],
    ['decimal_div_whole_by_decimal', 'Divide whole numbers by decimals'],
  ],
  '5.3H': [
    ['frac_add_sub_visual', 'Visually add/subtract fractions'],
    ['frac_estimate_unlike_denom', 'Estimate sums/diffs with unlike denominators'],
    ['frac_common_denominators', 'Find common denominators'],
    ['frac_add_unlike_denom', 'Add fractions with unlike denominators'],
    ['frac_sub_unlike_denom', 'Subtract fractions with unlike denominators'],
    ['frac_mixed_no_regroup', 'Add/sub mixed numbers (no regrouping)'],
    ['frac_mixed_with_regroup', 'Add/sub mixed numbers (with regrouping)'],
    ['frac_add_sub_word_problems', 'Add/sub fractions word problems'],
  ],
  '5.3I': [
    ['frac_x_whole_models', 'Multiply fractions × whole using models'],
    ['frac_x_whole_number_line', 'Multiply fractions on the number line'],
    ['frac_x_whole', 'Multiply fractions and whole numbers'],
  ],
  '5.3J': [
    ['frac_div_unit_by_whole_visual', 'Divide unit fractions by whole numbers visually'],
    ['frac_div_unit_by_whole', 'Divide unit fractions by whole numbers'],
  ],
  '5.3L': [
    ['frac_div_whole_by_unit_visual', 'Divide whole numbers by unit fractions visually'],
    ['frac_div_whole_by_unit', 'Divide whole numbers by unit fractions'],
  ],
  '5.7A': [
    ['convert_metric', 'Convert metric units'],
    ['convert_metric_word_problems', 'Convert metric word problems'],
    ['convert_metric_multistep', 'Multi-step metric conversion'],
    ['convert_us_customary', 'Convert US customary units'],
    ['convert_us_customary_word', 'US customary word problems'],
    ['convert_us_customary_multistep', 'Multi-step US customary problems'],
  ],
  '5.5A': [
    ['classify_triangles_by_angles', 'Classify triangles by angles'],
    ['classify_triangles_by_sides_angles', 'Classify triangles by sides AND angles'],
    ['identify_quadrilaterals', 'Identify quadrilaterals'],
    ['quadrilateral_types_hierarchy', 'Quadrilateral types / properties hierarchy'],
  ],
  '5.6A': [
    ['volume_unit_cubes', 'Volume using unit cubes'],
    ['volume_rect_prism_unit_cubes', 'Volume of rectangular prisms with unit cubes'],
    ['volume_compare_unit_cubes', 'Compare volumes using unit cubes'],
  ],
  '5.6B': [
    ['volume_area_of_base_x_height', 'Volume as (area of base × height)'],
    ['volume_rect_prisms_formula', 'Volume of rectangular prisms (formula)'],
    ['volume_real_world', 'Real-world volume problems'],
  ],
  '5.4H': [
    ['area_perimeter_situations', 'Area / perimeter situations'],
    ['represent_rectangle_measurements', 'Represent rectangle measurements'],
    ['area_perimeter_word_problems', 'Area / perimeter word problems'],
  ],
}

// ---- 1. Per-standard coverage --------------------------------------------------

const { data: standards, error: e1 } = await sb
  .from('map_standards')
  .select('id, subject, teks_code, teks_title, sort_order, is_synthetic')
  .eq('grade', 5)
  .order('sort_order')

if (e1) { console.error('standards query failed:', e1.message); process.exit(1) }

const { data: questions, error: e2 } = await sb
  .from('map_questions')
  .select('id, standard_id, rit_band')
  .eq('grade', 5)
  .eq('is_active', true)

if (e2) { console.error('questions query failed:', e2.message); process.exit(1) }

// Grade 5 RIT bands per Grade5_Seeding_Brief §4. Below 191_200 is rare and
// not banked heavily; above_210 is the legacy catchall and is deprecated for
// Grade 5 authoring per §13. New authoring targets 191_200 → 231_240.
const BANDS = ['below_191', '191_200', '201_210', '211_220', '221_230', '231_240', 'legacy_above']
function bucket(b) {
  if (b === '191_200' || b === '201_210' || b === '211_220' || b === '221_230' || b === '231_240') return b
  if (b === 'above_210' || b === 'above_230') return 'legacy_above'
  return 'below_191'
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

console.log('\n' + GREEN('━━━ Grade 5 — Per-standard coverage ━━━'))
console.log(DIM('   < 6 questions per standard is flagged red. Target is 4–6 questions per (standard, band) cell.'))
console.log(DIM("   'legacy_above' = above_210/above_230 catchall bands; deprecated for Grade 5 authoring (§13).\n"))

const BAND_HEADERS = ['<191', '191-200', '201-210', '211-220', '221-230', '231-240', 'legacy']

for (const subject of ['math','reading','language']) {
  const rows = [...byStandard.values()].filter(r => r.subject === subject)
  const totalQ = rows.reduce((a,r) => a + r.total, 0)
  console.log(GREEN(`▌ ${subject.toUpperCase()} — ${rows.length} standards, ${totalQ} questions`))
  console.log(DIM(`  ${pad('TEKS', 18)} ${pad('Title', 46)} ${lpad('Tot', 4)} ${BAND_HEADERS.map(h => lpad(h, 8)).join(' ')}`))
  for (const r of rows) {
    const flag = r.total < 6 ? RED : (r.total < 19 ? YEL : GREEN)
    const synthMark = r.is_synthetic ? DIM(' (synthetic)') : ''
    const titleRaw = r.teks_title + (r.is_synthetic ? ' (synthetic)' : '')
    const title = titleRaw.length > 44 ? titleRaw.slice(0, 43) + '…' : titleRaw
    console.log(`  ${pad(r.teks_code, 18)} ${pad(title, 46)} ${flag(lpad(r.total, 4))} ${BANDS.map(b => lpad(r.bands[b], 8)).join(' ')}`)
    // §17 sub-skill annotation for math only
    if (subject === 'math' && SUB_SKILLS[r.teks_code]) {
      for (const [key, label] of SUB_SKILLS[r.teks_code]) {
        console.log(DIM(`     · ${pad(key, 42)} ${label}`))
      }
    }
  }
  console.log()
}

// ---- 2. Misconception-tag rollup ----------------------------------------------

const { data: choices, error: e3 } = await sb
  .from('map_question_choices')
  .select('misconception_tag, question_id, map_questions!inner(grade, subject, standard_id)')
  .eq('is_correct', false)
  .eq('map_questions.grade', 5)

if (e3) { console.error('choices query failed:', e3.message); process.exit(1) }

const tagAgg = new Map()
for (const c of choices) {
  if (!c.misconception_tag) continue
  const key = `${c.map_questions.subject}|${c.misconception_tag}`
  let row = tagAgg.get(key)
  if (!row) { row = { subject: c.map_questions.subject, tag: c.misconception_tag, uses: 0, standards: new Set() }; tagAgg.set(key, row) }
  row.uses += 1
  if (c.map_questions.standard_id) row.standards.add(c.map_questions.standard_id)
}

console.log(GREEN('━━━ Grade 5 — Misconception tag rollup ━━━'))
console.log(DIM('   Tags used only once are candidates to rename (fold) or grow (3+ examples).'))
console.log(DIM('   Tags > 30 uses may be candidates for splitting (too broad to drive useful diagnosis).\n'))
const tagRows = [...tagAgg.values()].sort((a,b) => a.subject === b.subject ? b.uses - a.uses : a.subject.localeCompare(b.subject))
for (const subject of ['math','reading','language']) {
  const subRows = tagRows.filter(t => t.subject === subject)
  if (subRows.length === 0) continue
  console.log(GREEN(`▌ ${subject.toUpperCase()} — ${subRows.length} distinct tags`))
  for (const r of subRows) {
    const useFlag =
      r.uses === 1 ? YEL :
      r.uses > 30 ? YEL :
      (txt => txt)
    console.log(`  ${pad(r.tag, 48)} ${useFlag(lpad(r.uses, 4))}  uses across ${lpad(r.standards.size, 3)} standards`)
  }
  console.log()
}

// ---- 3. Untagged distractors --------------------------------------------------

const { count: untagged, error: e4 } = await sb
  .from('map_question_choices')
  .select('id, map_questions!inner(grade)', { count: 'exact', head: true })
  .eq('is_correct', false)
  .is('misconception_tag', null)
  .eq('map_questions.grade', 5)

if (e4) { console.error('untagged query failed:', e4.message); process.exit(1) }

console.log(GREEN('━━━ Grade 5 — Untagged distractors (must be 0) ━━━'))
const flag = (untagged ?? 0) === 0 ? GREEN : RED
console.log(`  ${flag(`${untagged ?? 0} untagged distractor${untagged === 1 ? '' : 's'}`)}\n`)

if ((untagged ?? 0) > 0) process.exit(1)
