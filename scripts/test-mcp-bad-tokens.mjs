// Acceptance §11.5: missing/garbage/revoked/expired tokens all 401.
// Run: node --env-file=.env.local scripts/test-mcp-bad-tokens.mjs
// Required env: MCP_BASE_URL. Optional: MCP_BYPASS, MCP_REVOKED_TOKEN, MCP_EXPIRED_TOKEN.

const BASE = process.env.MCP_BASE_URL;
const BYPASS = process.env.MCP_BYPASS;
if (!BASE) { console.error('Set MCP_BASE_URL'); process.exit(2); }

async function call(extraHeaders = {}) {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  return { status: res.status, www: res.headers.get('www-authenticate') };
}

let r;

r = await call({});
if (r.status !== 401 || !/invalid_request/.test(r.www ?? '')) { console.error('FAIL no-header:', r); process.exit(1); }
console.log('PASS no-header → 401 invalid_request');

r = await call({ Authorization: 'Bearer garbage' });
if (r.status !== 401 || !/invalid_token/.test(r.www ?? '')) { console.error('FAIL garbage:', r); process.exit(1); }
console.log('PASS garbage → 401 invalid_token');

if (process.env.MCP_REVOKED_TOKEN) {
  r = await call({ Authorization: `Bearer ${process.env.MCP_REVOKED_TOKEN}` });
  if (r.status !== 401 || !/invalid_token/.test(r.www ?? '')) { console.error('FAIL revoked:', r); process.exit(1); }
  console.log('PASS revoked → 401 invalid_token');
} else {
  console.log('SKIP revoked check (set MCP_REVOKED_TOKEN to enable)');
}

if (process.env.MCP_EXPIRED_TOKEN) {
  r = await call({ Authorization: `Bearer ${process.env.MCP_EXPIRED_TOKEN}` });
  if (r.status !== 401 || !/invalid_token/.test(r.www ?? '')) { console.error('FAIL expired:', r); process.exit(1); }
  console.log('PASS expired → 401 invalid_token');
} else {
  console.log('SKIP expired check (set MCP_EXPIRED_TOKEN to enable)');
}
