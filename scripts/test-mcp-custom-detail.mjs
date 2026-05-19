// Acceptance: custom-test detail in MCP read tools.
// Run: node --env-file=.env.local scripts/test-mcp-custom-detail.mjs
// Required env: MCP_BASE_URL, MCP_TOKEN (a family token whose family owns a
//   completed custom session), MCP_CUSTOM_SESSION (a kind='custom' session_id
//   in that family), MCP_CUSTOM_STUDENT (the student_id of that session).
// Optional: MCP_BYPASS (Vercel protection bypass header).

const BASE = process.env.MCP_BASE_URL;
const TOKEN = process.env.MCP_TOKEN;
const SESSION = process.env.MCP_CUSTOM_SESSION;
const STUDENT = process.env.MCP_CUSTOM_STUDENT;
const BYPASS = process.env.MCP_BYPASS;
if (!BASE || !TOKEN || !SESSION || !STUDENT) {
  console.error('Missing env: MCP_BASE_URL, MCP_TOKEN, MCP_CUSTOM_SESSION, MCP_CUSTOM_STUDENT');
  process.exit(2);
}

let nextId = 0;
async function rpc(method, params) {
  const id = ++nextId;
  const res = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, json };
}
function payload(r) { return JSON.parse(r.json?.result?.content?.[0]?.text ?? '{}'); }
function assert(cond, label) {
  if (!cond) { console.error('FAIL:', label); process.exit(1); }
  console.log('PASS:', label);
}

// 1. get_session_details on a custom session returns populated detail.
const sd = await rpc('tools/call', { name: 'get_session_details', arguments: { session_id: SESSION } });
assert(sd.status === 200, 'get_session_details HTTP 200');
const sdp = payload(sd);
assert(sdp.session?.kind === 'custom', 'session header kind === custom');
assert('bank_name' in (sdp.session ?? {}), 'session header has bank_name field');
assert(Array.isArray(sdp.attempts) && sdp.attempts.length > 0, 'attempts present');
const filled = sdp.attempts.filter((a) => a.stem && a.correct_text);
assert(filled.length === sdp.attempts.length, 'every custom attempt has stem + correct_text');
const anyChosen = sdp.attempts.some((a) => a.chosen_text);
assert(anyChosen, 'at least one attempt has chosen_text');

// 2. get_recent_wrong_answers includes the custom session's wrong answers.
const wa = await rpc('tools/call', {
  name: 'get_recent_wrong_answers',
  arguments: { student_id: STUDENT, since_days: 365, limit: 50 },
});
assert(wa.status === 200, 'get_recent_wrong_answers HTTP 200');
const wap = payload(wa);
const wrongInSession = (sdp.attempts ?? []).filter((a) => !a.is_correct).length;
assert(wrongInSession > 0, 'the custom session has >=1 wrong answer to find');
assert(
  (wap.wrong_answers ?? []).some((w) => w.stem && w.correct_text),
  'wrong_answers includes at least one fully-populated custom miss',
);

// 3. list_recent_sessions tags the custom session.
const ls = await rpc('tools/call', {
  name: 'list_recent_sessions',
  arguments: { student_id: STUDENT, limit: 50 },
});
assert(ls.status === 200, 'list_recent_sessions HTTP 200');
const row = (payload(ls).sessions ?? []).find((s) => s.session_id === SESSION);
assert(row, 'custom session appears in list_recent_sessions');
assert(row.kind === 'custom', 'list_recent_sessions row kind === custom');
assert('bank_name' in row, 'list_recent_sessions row has bank_name field');

console.log('ALL PASS');
