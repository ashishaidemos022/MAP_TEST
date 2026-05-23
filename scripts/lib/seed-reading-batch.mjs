// scripts/lib/seed-reading-batch.mjs
// Shared harness for Grade 5 READING vetted-bank seed batches.
//
// Batch 01 (scripts/seed-g5-reading-batch01.mjs) carries the original inline
// version and the full rationale: the vetted-bank tables take plain row INSERTs
// (no DDL), so supabase-js with the service-role key both authors and applies
// them, idempotently. Batch 02+ import runSeed() from here instead of copying it.
//
// A batch script just defines a PASSAGES array and calls:
//   await runSeed(PASSAGES, { sourceNote: '...' })
//
// PASSAGE shape:
//   { title, genre, band, lexile, topic, body, questions: [Q...] }
// QUESTION shape:
//   { teks, difficulty, stem, explanation, svg?, choices: [[label,body,isCorrect,misc,tag], ...] }
//   - exactly one choice has isCorrect === true (its misc/tag must be null)
//   - every distractor has non-empty misc text + a tag in map_misconception_tags
//   - svg (optional) is inline SVG stored on map_questions.stem_image_svg

import { createClient } from '@supabase/supabase-js'

// Allowed first names (5thGradeSeedingGuide §5 / CLAUDE.md §11.3) — reference.
export const NAME_POOL = ['Maya', 'Ethan', 'Priya', 'Liam', 'Ava', 'Aarav', 'Zoe', 'Noor',
  'Diego', 'Mei', 'Caleb', 'Jamal', 'Selena', 'Hiroshi', 'Imani', 'Theo', 'Sofia', 'Ravi']

const WORD_RANGE = {
  literary: [280, 420], informational: [240, 380], poetry: [40, 180], drama: [180, 300],
}
const wc = (s) => s.trim().split(/\s+/).length

function svgError(svg) {
  if (!/^\s*<svg[\s>]/.test(svg)) return 'svg must start with <svg'
  if (!/viewBox=/.test(svg)) return 'svg needs a viewBox'
  if (svg.length > 64000) return 'svg exceeds 64KB'
  return null
}

function validate(passages, validTags, validTeks) {
  const errs = []
  const seenTitles = new Set()
  let qCount = 0
  for (const p of passages) {
    if (seenTitles.has(p.title)) errs.push(`duplicate title: ${p.title}`)
    seenTitles.add(p.title)
    if (!WORD_RANGE[p.genre]) { errs.push(`"${p.title}" bad genre ${p.genre}`); continue }
    const n = wc(p.body)
    const [lo, hi] = WORD_RANGE[p.genre]
    if (n < lo || n > hi) errs.push(`"${p.title}" word count ${n} outside ${p.genre} range ${lo}-${hi}`)
    for (const q of p.questions) {
      qCount++
      const where = `"${p.title}" / ${q.teks} / "${q.stem.slice(0, 40)}..."`
      if (!validTeks.has(q.teks)) errs.push(`${where}: TEKS ${q.teks} not a G5 reading standard`)
      if (wc(q.stem) > 45) errs.push(`${where}: stem ${wc(q.stem)} words > 45`)
      if (q.svg) { const e = svgError(q.svg); if (e) errs.push(`${where}: ${e}`) }
      const labels = q.choices.map((c) => c[0])
      if (labels.join('') !== 'ABCD') errs.push(`${where}: labels must be A,B,C,D (got ${labels.join(',')})`)
      const correct = q.choices.filter((c) => c[2] === true)
      if (correct.length !== 1) errs.push(`${where}: exactly one correct required (got ${correct.length})`)
      for (const [label, body, isCorrect, misc, tag] of q.choices) {
        if (!body || !body.trim()) errs.push(`${where} ${label}: empty body`)
        if (isCorrect) {
          if (misc !== null || tag !== null) errs.push(`${where} ${label}: correct choice must have null misconception/tag`)
        } else {
          if (!misc || !misc.trim()) errs.push(`${where} ${label}: distractor needs misconception text`)
          if (!tag) errs.push(`${where} ${label}: distractor needs misconception_tag`)
          else if (!validTags.has(tag)) errs.push(`${where} ${label}: tag "${tag}" not in map_misconception_tags`)
        }
      }
    }
  }
  return { errs, qCount }
}

export async function runSeed(passages, { sourceNote }) {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing env: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).')
    process.exit(1)
  }
  const DRY_RUN = process.argv.includes('--dry-run')
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

  const [{ data: tagRows, error: tagErr }, { data: stdRows, error: stdErr }] = await Promise.all([
    sb.from('map_misconception_tags').select('tag').eq('subject', 'reading'),
    sb.from('map_standards').select('id,teks_code').eq('subject', 'reading').eq('grade', 5),
  ])
  if (tagErr) { console.error('tag fetch failed:', tagErr.message); process.exit(1) }
  if (stdErr) { console.error('standards fetch failed:', stdErr.message); process.exit(1) }
  const validTags = new Set(tagRows.map((r) => r.tag))
  const teksToId = new Map(stdRows.map((r) => [r.teks_code, r.id]))
  const validTeks = new Set(teksToId.keys())

  const { errs, qCount } = validate(passages, validTags, validTeks)
  console.log(`Validating ${passages.length} passages, ${qCount} questions...`)
  if (errs.length) {
    console.error(`\n✗ ${errs.length} validation error(s):`)
    for (const e of errs) console.error('  - ' + e)
    process.exit(1)
  }
  console.log('✓ All content valid (one-correct, tags exist, TEKS exist, stem length, word counts, svg).')

  if (DRY_RUN) { console.log('\n--dry-run: no rows written.'); process.exit(0) }

  let createdP = 0, skippedP = 0, createdQ = 0, skippedQ = 0
  for (const p of passages) {
    let { data: existing } = await sb.from('map_reading_passages')
      .select('id').eq('title', p.title).eq('grade', 5).maybeSingle()
    let passageId = existing?.id
    if (!passageId) {
      const { data, error } = await sb.from('map_reading_passages').insert({
        title: p.title, body: p.body, genre: p.genre, word_count: wc(p.body),
        lexile: p.lexile, rit_band: p.band, source: 'original', topic: p.topic, grade: 5,
      }).select('id').single()
      if (error) { console.error(`passage insert failed (${p.title}):`, error.message); process.exit(1) }
      passageId = data.id; createdP++
      console.log(`+ passage: ${p.title} (${p.genre}, ${p.band}, ${wc(p.body)}w)`)
    } else {
      skippedP++
      console.log(`= passage exists: ${p.title}`)
    }

    for (const q of p.questions) {
      const { data: qExist } = await sb.from('map_questions')
        .select('id').eq('passage_id', passageId).eq('stem', q.stem).maybeSingle()
      if (qExist?.id) { skippedQ++; continue }
      const { data: qRow, error: qErr } = await sb.from('map_questions').insert({
        subject: 'reading', grade: 5, standard_id: teksToId.get(q.teks), passage_id: passageId,
        rit_band: p.band, difficulty: q.difficulty, stem: q.stem, stem_image_svg: q.svg ?? null,
        explanation: q.explanation, source_note: sourceNote, is_active: true, question_format: 'mcq',
      }).select('id').single()
      if (qErr) { console.error(`question insert failed (${q.stem.slice(0, 40)}):`, qErr.message); process.exit(1) }
      const rows = q.choices.map(([label, body, isCorrect, misc, tag], i) => ({
        question_id: qRow.id, label, body, is_correct: isCorrect,
        misconception: misc, misconception_tag: tag, sort_order: i + 1,
      }))
      const { error: cErr } = await sb.from('map_question_choices').insert(rows)
      if (cErr) { console.error(`choices insert failed (${q.stem.slice(0, 40)}):`, cErr.message); process.exit(1) }
      createdQ++
    }
  }
  console.log(`\nDone. Passages: +${createdP} created, ${skippedP} existed. Questions: +${createdQ} created, ${skippedQ} existed.`)
}
