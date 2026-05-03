// Acceptance §11.4: cross-family isolation. CRITICAL gate.
// Run: node --env-file=.env.local scripts/test-mcp-isolation.mjs
// Required env: MCP_BASE_URL, MCP_TOKEN_A, MCP_TOKEN_B,
//   MCP_STUDENT_FROM_B, MCP_SESSION_FROM_B (any session_id in family B; can be 0000…
//   if family B has no sessions yet — the test still passes via session_not_in_family).
// Optional: MCP_BYPASS.

const BASE = process.env.MCP_BASE_URL;
const TOKEN_A = process.env.MCP_TOKEN_A;
const TOKEN_B = process.env.MCP_TOKEN_B;
const STUDENT_FROM_B = process.env.MCP_STUDENT_FROM_B;
const SESSION_FROM_B = process.env.MCP_SESSION_FROM_B;
const BYPASS = process.env.MCP_BYPASS;
if (!BASE || !TOKEN_A || !TOKEN_B || !STUDENT_FROM_B || !SESSION_FROM_B) {
  console.error('Missing env: MCP_BASE_URL, MCP_TOKEN_A, MCP_TOKEN_B, MCP_STUDENT_FROM_B, MCP_SESSION_FROM_B');
  process.exit(2);
}

let nextId = 0;
async function rpc(token, method, params) {
  const id = ++nextId;
  const res = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
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

function assert(cond, label) {
  if (!cond) { console.error('FAIL:', label); process.exit(1); }
  console.log('PASS:', label);
}

// 1. Each token's list_kids returns only its own family.
const aKids = await rpc(TOKEN_A, 'tools/call', { name: 'list_kids', arguments: {} });
const bKids = await rpc(TOKEN_B, 'tools/call', { name: 'list_kids', arguments: {} });
assert(aKids.status === 200, 'A list_kids HTTP 200');
assert(bKids.status === 200, 'B list_kids HTTP 200');

const aText = aKids.json?.result?.content?.[0]?.text ?? '';
const bText = bKids.json?.result?.content?.[0]?.text ?? '';
const aKidIds = new Set((JSON.parse(aText).kids ?? []).map((k) => k.student_id));
const bKidIds = new Set((JSON.parse(bText).kids ?? []).map((k) => k.student_id));
assert(aKidIds.size > 0 && bKidIds.size > 0, 'each family has at least one kid');
const intersect = [...aKidIds].some((id) => bKidIds.has(id));
assert(!intersect, 'no kids in both families');

// 2. Token A asking about B-student via get_kid_overview → student_not_in_family.
const xfer = await rpc(TOKEN_A, 'tools/call', {
  name: 'get_kid_overview',
  arguments: { student_id: STUDENT_FROM_B },
});
const xferText = JSON.stringify(xfer.json);
assert(/student_not_in_family|not found in this family/i.test(xferText) && !aKidIds.has(STUDENT_FROM_B),
  'A cannot read B-student via get_kid_overview');

// 3. Token A asking about B-session via get_session_details → session_not_in_family.
const xfer2 = await rpc(TOKEN_A, 'tools/call', {
  name: 'get_session_details',
  arguments: { session_id: SESSION_FROM_B },
});
const xfer2Text = JSON.stringify(xfer2.json);
assert(/session_not_in_family|not found in this family/i.test(xfer2Text),
  'A cannot read B-session via get_session_details');

console.log('\nAll isolation checks passed.');

// Note (Task 15): The PAT isolation cases above prove the family-scope invariant
// (auth.ts produces the same McpContext for both PAT and OAuth paths). The OAuth
// path is exercised by test-mcp-oauth-handshake.mjs, which confirms tools return
// only the connecting parent's family data via a real session round-trip.
console.log('NOTE OAuth isolation covered by test-mcp-oauth-handshake.mjs');
