// Custom_Questions_Brief.md §12.5 — cross-family WRITE isolation. CRITICAL.
// Two tokens for two families; this test verifies token B cannot see, modify,
// or attach to anything family A creates via the MCP write tools.
//
// Run: node --env-file=.env.local scripts/test-mcp-write-isolation.mjs
// Required env (matches scripts/test-mcp-isolation.mjs):
//   MCP_BASE_URL, MCP_TOKEN_A, MCP_TOKEN_B
//   MCP_BYPASS (optional Vercel deployment-protection bypass)

const BASE = process.env.MCP_BASE_URL
const TOKEN_A = process.env.MCP_TOKEN_A
const TOKEN_B = process.env.MCP_TOKEN_B
const BYPASS = process.env.MCP_BYPASS
if (!BASE || !TOKEN_A || !TOKEN_B) {
  console.error('Missing env: MCP_BASE_URL, MCP_TOKEN_A, MCP_TOKEN_B')
  process.exit(2)
}

let nextId = 0
async function rpc(token, method, params) {
  const id = ++nextId
  const res = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { _raw: text } }
  return { status: res.status, json }
}

async function callTool(token, toolName, args) {
  return rpc(token, 'tools/call', { name: toolName, arguments: args })
}

function toolError(r) {
  // MCP returns errors via the JSON-RPC `error` field OR via the tool's
  // structured payload. Treat any non-success path as an error string.
  if (r.json?.error) return r.json.error.message ?? JSON.stringify(r.json.error)
  if (r.json?.result?.isError) {
    const c = r.json.result?.content?.[0]
    return c?.text ?? 'tool error'
  }
  return null
}

function toolPayload(r) {
  const txt = r.json?.result?.content?.[0]?.text
  if (!txt) return null
  try { return JSON.parse(txt) } catch { return null }
}

let pass = 0, fail = 0
function assert(cond, label) {
  if (cond) { console.log(`PASS: ${label}`); pass++ }
  else { console.error(`FAIL: ${label}`); fail++ }
}

console.log(`${BASE}\n`)

// ===== Setup: token A creates a passage + question via the composite tool =====
const setup = await callTool(TOKEN_A, 'create_custom_passage_and_questions', {
  passage: {
    subject: 'reading',
    grade: 4,
    title: 'Isolation Test Passage',
    body: 'A short test passage authored by family A purely so the §12.5 isolation test has something for family B to fail to read or mutate. It must be at least fifty characters long for the body length CHECK constraint.',
    genre: 'informational',
  },
  questions: [
    {
      subject: 'reading',
      grade: 4,
      stem: 'What is the main purpose of this passage?',
      choices: [
        { label: 'A', text: 'To serve as a test fixture', is_correct: true,
          explanation_correct: 'It says exactly that.' },
        { label: 'B', text: 'To teach about volcanoes', is_correct: false },
        { label: 'C', text: 'To compare books', is_correct: false },
      ],
    },
  ],
})
const setupErr = toolError(setup)
if (setupErr) {
  console.error('SETUP FAILED — token A cannot create:', setupErr)
  process.exit(1)
}
const setupData = toolPayload(setup)
const passageA = setupData?.passage?.passage_id
const questionA = setupData?.questions?.[0]?.question_id
assert(!!passageA && !!questionA, 'setup: token A created passage + question')
console.log(`  family-A passage: ${passageA}`)
console.log(`  family-A question: ${questionA}`)
console.log()

// ===== Token B's full attack surface =====

// 1. list — token B should not see A's content
const listP = await callTool(TOKEN_B, 'list_custom_passages', {})
const listPData = toolPayload(listP)
const sawA_inPassages = (listPData?.passages ?? []).some((p) => p.passage_id === passageA)
assert(!sawA_inPassages, 'list_custom_passages from B does NOT include A passage')

const listQ = await callTool(TOKEN_B, 'list_custom_questions', {})
const listQData = toolPayload(listQ)
const sawA_inQuestions = (listQData?.questions ?? []).some((q) => q.question_id === questionA)
assert(!sawA_inQuestions, 'list_custom_questions from B does NOT include A question')

// 2. get — token B with A's IDs returns the structured "not in family" error
const getP = await callTool(TOKEN_B, 'get_custom_passage', { passage_id: passageA })
const getP_err = toolError(getP)
assert(getP_err && /passage_not_in_family|not found/i.test(getP_err),
  `get_custom_passage(B, A's id) → error (got: ${getP_err ?? 'success'})`)

const getQ = await callTool(TOKEN_B, 'get_custom_question', { question_id: questionA })
const getQ_err = toolError(getQ)
assert(getQ_err && /question_not_in_family|not found/i.test(getQ_err),
  `get_custom_question(B, A's id) → error (got: ${getQ_err ?? 'success'})`)

// 3. update — token B trying to update A's passage / question
const updP = await callTool(TOKEN_B, 'update_custom_passage', {
  passage_id: passageA,
  subject: 'reading',
  grade: 4,
  body: 'Token B should not be able to overwrite this. ' + 'x'.repeat(60),
})
const updP_err = toolError(updP)
assert(updP_err && /passage_not_in_family|not found/i.test(updP_err),
  `update_custom_passage(B, A's id) → error`)

const updQ = await callTool(TOKEN_B, 'update_custom_question', {
  question_id: questionA,
  subject: 'reading',
  grade: 4,
  stem: 'Token B should not overwrite this stem text either.',
  choices: [
    { label: 'A', text: 'X', is_correct: true, explanation_correct: 'because' },
    { label: 'B', text: 'Y', is_correct: false },
    { label: 'C', text: 'Z', is_correct: false },
  ],
})
const updQ_err = toolError(updQ)
assert(updQ_err && /question_not_in_family|not found/i.test(updQ_err),
  `update_custom_question(B, A's id) → error`)

// 4. publish — token B trying to publish A's content
const pubP = await callTool(TOKEN_B, 'publish_custom_passage', { passage_id: passageA })
const pubP_err = toolError(pubP)
assert(pubP_err && /passage_not_in_family|not found/i.test(pubP_err),
  `publish_custom_passage(B, A's id) → error`)

const pubQ = await callTool(TOKEN_B, 'publish_custom_question', { question_id: questionA })
const pubQ_err = toolError(pubQ)
assert(pubQ_err && /question_not_in_family|not found/i.test(pubQ_err),
  `publish_custom_question(B, A's id) → error`)

// 5. bulk upgrade — token B targeting A's passage
const bulk = await callTool(TOKEN_B, 'bulk_upgrade_passage_references', {
  passage_id: passageA,
  question_ids: [questionA],
})
const bulk_err = toolError(bulk)
assert(bulk_err && /passage_not_in_family|not found/i.test(bulk_err),
  `bulk_upgrade_passage_references(B, A's passage) → error`)

// 6. create — token B trying to create a question that attaches to A's passage
const createCross = await callTool(TOKEN_B, 'create_custom_questions', {
  questions: [{
    subject: 'reading', grade: 4, stem: 'cross-family attempt — should fail',
    passage_id: passageA,
    choices: [
      { label: 'A', text: 'A', is_correct: true, explanation_correct: 'b' },
      { label: 'B', text: 'B', is_correct: false },
      { label: 'C', text: 'C', is_correct: false },
    ],
  }],
})
const createCross_err = toolError(createCross)
assert(createCross_err && /passage_not_in_family|not found/i.test(createCross_err),
  `create_custom_questions(B, attaching to A passage) → error`)

// ===== Final report =====
console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) {
  console.error('\nCross-family isolation broken. DO NOT SHIP.')
  process.exit(1)
}
console.log('\nFamily A passage & question still in DB (kept for re-runs).')
console.log(`  passage_id:  ${passageA}`)
console.log(`  question_id: ${questionA}`)
process.exit(0)
