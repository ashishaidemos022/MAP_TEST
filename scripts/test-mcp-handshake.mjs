// Acceptance §11.3: initialize + tools/list returns all 9 tools.
// Run: node --env-file=.env.local scripts/test-mcp-handshake.mjs
// Required env: MCP_BASE_URL, MCP_TOKEN, optional MCP_BYPASS

const BASE = process.env.MCP_BASE_URL;
const TOKEN = process.env.MCP_TOKEN;
const BYPASS = process.env.MCP_BYPASS;
if (!BASE || !TOKEN) {
  console.error('Set MCP_BASE_URL and MCP_TOKEN');
  process.exit(2);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
  ...(BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {}),
};

let nextId = 0;
async function rpc(method, params = {}) {
  const id = ++nextId;
  const res = await fetch(`${BASE}/api/mcp`, {
    method: 'POST', headers,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  return { status: res.status, body: await res.text() };
}

const init = await rpc('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'curl', version: '0' },
});
if (init.status !== 200 || !init.body.includes('map-practice-family')) {
  console.error('FAIL initialize:', init);
  process.exit(1);
}
console.log('PASS initialize');

const list = await rpc('tools/list', {});
if (list.status !== 200) { console.error('FAIL tools/list:', list); process.exit(1); }
const expected = [
  'list_kids',
  'get_kid_overview',
  'list_recent_sessions',
  'get_session_details',
  'get_recent_wrong_answers',
  'get_accuracy_by_standard',
  'get_top_misconceptions',
  'get_activity_calendar',
  'compare_kids',
];
for (const name of expected) {
  if (!list.body.includes(`"${name}"`)) {
    console.error('FAIL missing tool:', name);
    process.exit(1);
  }
}
console.log(`PASS tools/list (all ${expected.length} present)`);
