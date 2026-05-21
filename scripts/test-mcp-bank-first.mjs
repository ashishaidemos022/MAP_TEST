// scripts/test-mcp-bank-first.mjs
// MCP integration test for bank-first authoring.
// Verifies:
//   * bank_name creates a new bank, returns bank.id
//   * second call with same bank_id reuses it (item_count grows)
//   * second call with same bank_name reuses the same bank
//   * mixed subjects in one call → mixed_subjects_in_call error
//   * unknown bank_id → bank_target_mismatch
// Run: node --env-file=.env.local scripts/test-mcp-bank-first.mjs
// Required env: MCP_BASE_URL, MCP_TOKEN, optional MCP_BYPASS

const BASE = process.env.MCP_BASE_URL;
const TOKEN = process.env.MCP_TOKEN;
const BYPASS = process.env.MCP_BYPASS;
if (!BASE || !TOKEN) { console.error('Missing env: MCP_BASE_URL, MCP_TOKEN'); process.exit(2); }

let nextId = 0;
async function call(name, args) {
  const id = ++nextId;
  const res = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, json };
}
function payload(r) {
  const t = r.json?.result?.content?.[0]?.text ?? '';
  try { return JSON.parse(t); } catch { return null; }
}
function assert(c, l) { if (!c) { console.error('FAIL:', l); process.exit(1); } console.log('PASS:', l); }

const bankName = `Mcp test ${Date.now()} — Math G3`;

function buildQ(stem) {
  return {
    subject: 'math', grade: 3, stem,
    standard_code: null, difficulty: null, question_focus: null,
    stem_svg: null, stem_svg_alt_text: null, ai_metadata: null,
    choices: [
      { label:'A', text:'a', is_correct:true,  ordinal:0, explanation_correct:'Correct.', explanation_wrong:null, misconception_tag:null },
      { label:'B', text:'b', is_correct:false, ordinal:1, explanation_correct:null, explanation_wrong:null, misconception_tag:null },
      { label:'C', text:'c', is_correct:false, ordinal:2, explanation_correct:null, explanation_wrong:null, misconception_tag:null },
      { label:'D', text:'d', is_correct:false, ordinal:3, explanation_correct:null, explanation_wrong:null, misconception_tag:null },
    ],
  };
}

// 1. bank_name path: creates the bank.
let r = await call('create_custom_questions', { bank_name: bankName, questions: [buildQ('Q1')] });
assert(r.status === 200, 'first call HTTP 200');
let p = payload(r);
assert(p?.bank?.was_created === true && p.bank?.name === bankName, 'first call created bank');
const bankId = p.bank.id;

// 2. bank_id path: reuses the bank.
r = await call('create_custom_questions', { bank_id: bankId, questions: [buildQ('Q2'), buildQ('Q3')] });
assert(r.status === 200, 'bank_id call HTTP 200');
p = payload(r);
assert(p?.bank?.id === bankId && p.bank.was_created === false, 'bank_id call reused bank');
assert(p.bank.item_count === 3, `item_count = ${p.bank.item_count} (expect 3)`);

// 3. bank_name reuse: same exact name reuses too.
r = await call('create_custom_questions', { bank_name: bankName, questions: [buildQ('Q4')] });
p = payload(r);
assert(p?.bank?.id === bankId && p.bank.was_created === false, 'bank_name reuse hit same bank');
assert(p.bank.item_count === 4, `item_count = ${p.bank.item_count} (expect 4)`);

// 4. Mixed subjects in one call → mixed_subjects_in_call.
const qReading = { ...buildQ('Q-mix'), subject: 'reading' };
r = await call('create_custom_questions', { bank_name: bankName, questions: [buildQ('Q5'), qReading] });
const errText = JSON.stringify(r.json);
assert(/mixed_subjects_in_call|all questions/i.test(errText), `mixed subjects rejected: ${errText.slice(0, 200)}`);

// 5. Unknown bank_id → bank_target_mismatch.
r = await call('create_custom_questions', {
  bank_id: '00000000-0000-0000-0000-000000000000',
  questions: [buildQ('Q6')],
});
const err2 = JSON.stringify(r.json);
assert(/bank_target_mismatch|not found/i.test(err2), `unknown bank_id rejected: ${err2.slice(0, 200)}`);

console.log('\n✅ MCP bank-first integration test passed');
