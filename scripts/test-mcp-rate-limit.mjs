// Acceptance §11.7: 70 requests in <60s → at least one 429.
// Run: node --env-file=.env.local scripts/test-mcp-rate-limit.mjs
// Required env: MCP_BASE_URL, MCP_TOKEN. Optional: MCP_BYPASS.
// Note: per-warm-instance limiter on Vercel may need consistent invocation
// against a single instance to engage. Re-run if cold-start cycling masks it.

const BASE = process.env.MCP_BASE_URL;
const TOKEN = process.env.MCP_TOKEN;
const BYPASS = process.env.MCP_BYPASS;
if (!BASE || !TOKEN) { console.error('Set MCP_BASE_URL and MCP_TOKEN'); process.exit(2); }

async function ping() {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  return res.status;
}

const start = Date.now();
let okCount = 0;
let limitedCount = 0;
for (let i = 0; i < 70; i++) {
  const s = await ping();
  if (s === 200) okCount += 1;
  else if (s === 429) limitedCount += 1;
}
console.log(`okCount=${okCount} limitedCount=${limitedCount} elapsed=${Date.now() - start}ms`);
if (okCount > 60) { console.error('FAIL: more than 60 OKs in a minute'); process.exit(1); }
if (limitedCount === 0) {
  console.error('FAIL: no 429s observed. May be due to cold-start instance cycling on Vercel — try again.');
  process.exit(1);
}
console.log('PASS rate limit engaged');
