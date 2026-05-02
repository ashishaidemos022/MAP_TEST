// Acceptance §11.6: forbidden origin → 403; allowed/empty origin → 200 (with valid token).
// Run: node --env-file=.env.local scripts/test-mcp-origin.mjs
// Required env: MCP_BASE_URL, MCP_TOKEN. Optional: MCP_BYPASS.

const BASE = process.env.MCP_BASE_URL;
const TOKEN = process.env.MCP_TOKEN;
const BYPASS = process.env.MCP_BYPASS;
if (!BASE || !TOKEN) { console.error('Set MCP_BASE_URL and MCP_TOKEN'); process.exit(2); }

async function call(origin) {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  return res.status;
}

let s = await call('https://evil.example.com');
if (s !== 403) { console.error('FAIL evil origin →', s); process.exit(1); }
console.log('PASS evil origin → 403');

s = await call('https://claude.ai');
if (s !== 200) { console.error('FAIL claude.ai →', s); process.exit(1); }
console.log('PASS claude.ai → 200');

s = await call(null);
if (s !== 200) { console.error('FAIL no-origin →', s); process.exit(1); }
console.log('PASS no-origin → 200');
