// §12.10a end-to-end — submit malicious SVGs through the live MCP server's
// create_custom_passage_and_questions tool and confirm invalid_svg with the
// right reason. Single-token script (no second family needed).
//
// Run: MCP_BASE_URL=... MCP_TOKEN=... node scripts/test-svg-end-to-end.mjs

const BASE = process.env.MCP_BASE_URL
const TOKEN = process.env.MCP_TOKEN
if (!BASE || !TOKEN) {
  console.error('Missing MCP_BASE_URL or MCP_TOKEN')
  process.exit(2)
}

let nextId = 0
async function callTool(toolName, args) {
  const id = ++nextId
  const res = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { _raw: text } }
  return { status: res.status, json }
}

function toolError(r) {
  if (r.json?.error) return r.json.error.message ?? JSON.stringify(r.json.error)
  if (r.json?.result?.isError) {
    return r.json.result?.content?.[0]?.text ?? 'tool error'
  }
  return null
}

const validPassageBody =
  'A short test passage authored for the §12.10a end-to-end SVG rejection acceptance test. Body length above the 50-char floor.'

function makeArgs(svgB64, where /* 'passage' | 'stem' | 'choice' */, altOk = true) {
  const altText = altOk ? 'Test alt text describing the figure' : null
  const passageBlock = {
    subject: 'reading',
    grade: 4,
    title: 'SVG E2E Test',
    body: validPassageBody,
    ...(where === 'passage' ? { passage_svg: svgB64, passage_svg_alt_text: altText } : {}),
  }
  const stemBlock = where === 'stem' ? { stem_svg: svgB64, stem_svg_alt_text: altText } : {}
  const choices = [
    { label: 'A', text: 'choice A', is_correct: true, explanation_correct: 'because' },
    { label: 'B', text: 'choice B', is_correct: false },
    { label: 'C', text: 'choice C', is_correct: false },
  ]
  if (where === 'choice') {
    choices.forEach((c) => { c.choice_svg = svgB64; c.choice_svg_alt_text = altText })
  }
  return {
    passage: passageBlock,
    questions: [{
      subject: 'reading', grade: 4,
      stem: 'Sample question for SVG e2e test',
      ...stemBlock,
      choices,
    }],
  }
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64')

// §12.10a corpus — each must reject with the listed reason via invalid_svg.
const cases = [
  { name: 'script element', svg: '<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>',
    expect: 'disallowed_element' },
  { name: 'foreignObject',  svg: '<svg viewBox="0 0 10 10"><foreignObject><iframe src="x"/></foreignObject></svg>',
    expect: 'disallowed_element' },
  { name: 'onload attr',    svg: '<svg viewBox="0 0 10 10" onload="alert(1)"><circle cx="5" cy="5" r="4"/></svg>',
    expect: 'disallowed_attribute' },
  { name: 'image href',     svg: '<svg viewBox="0 0 10 10"><image href="https://evil.example.com/track.png"/></svg>',
    expect: 'disallowed_element' },
  { name: 'use external',   svg: '<svg viewBox="0 0 10 10"><use href="https://evil.example.com/x.svg#foo"/></svg>',
    expect: 'external_reference' },
  { name: 'a hyperlink',    svg: '<svg viewBox="0 0 10 10"><a href="https://evil.example.com/"><circle cx="5" cy="5" r="4"/></a></svg>',
    expect: 'disallowed_element' },
  { name: 'style on root',  svg: '<svg viewBox="0 0 10 10" style="background: url(javascript:alert(1))"/>',
    expect: 'disallowed_attribute' },
  { name: 'missing viewBox', svg: '<svg><circle cx="5" cy="5" r="4"/></svg>',
    expect: 'missing_viewbox' },
  { name: 'animate element', svg: '<svg viewBox="0 0 10 10"><animate attributeName="r" from="1" to="10"/></svg>',
    expect: 'disallowed_element' },
]

let pass = 0, fail = 0
console.log(`Live MCP: ${BASE}\n`)

for (const c of cases) {
  const args = makeArgs(b64(c.svg), 'passage')
  const r = await callTool('create_custom_passage_and_questions', args)
  const err = toolError(r)
  if (!err) {
    console.error(`FAIL ${c.name}: NO error returned (server accepted malicious SVG!)`)
    fail++
    continue
  }
  if (!/invalid_svg/i.test(err)) {
    console.error(`FAIL ${c.name}: error message missing 'invalid_svg' classification (got: ${err})`)
    fail++
    continue
  }
  if (!new RegExp(c.expect, 'i').test(err)) {
    console.error(`FAIL ${c.name}: expected reason ${c.expect}, got: ${err}`)
    fail++
    continue
  }
  console.log(`PASS ${c.name} → invalid_svg / ${c.expect}`)
  pass++
}

// Now confirm a VALID svg would be accepted.
const validSvg = b64('<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#3366cc"/></svg>')
const ok = await callTool('create_custom_passage_and_questions', makeArgs(validSvg, 'passage'))
const okErr = toolError(ok)
if (okErr) {
  console.error(`FAIL valid SVG was rejected: ${okErr}`)
  fail++
} else {
  console.log('PASS valid SVG accepted (passage created)')
  pass++
  // Try to print out the new passage_id for cleanup.
  const text = ok.json?.result?.content?.[0]?.text
  if (text) {
    try {
      const payload = JSON.parse(text)
      console.log(`  created passage_id: ${payload?.passage?.passage_id}`)
      console.log(`  created question(s): ${(payload?.questions ?? []).map(q => q.question_id).join(', ')}`)
    } catch { /* shrug */ }
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
