// Verifies RFC 7009 client-initiated revoke. Per spec: always 200, even for unknown tokens.
// Run: node --env-file=.env.local scripts/test-oauth-revocation.mjs
const BASE = process.env.MCP_BASE_URL;
if (!BASE) { console.error('Set MCP_BASE_URL'); process.exit(2); }

const reg = await fetch(`${BASE}/api/oauth/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ client_name: 'revoke-test', redirect_uris: ['https://claude.ai/oauth/callback'] }),
}).then((r) => r.json());

async function postForm(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  return { status: res.status, body: await res.text() };
}

// 1. Unknown token — RFC 7009: still 200.
const r1 = await postForm('/api/oauth/revoke', {
  token: 'ort_does_not_exist',
  client_id: reg.client_id,
  client_secret: reg.client_secret,
});
if (r1.status !== 200) { console.error('FAIL unknown-token:', r1); process.exit(1); }
console.log('PASS unknown-token returns 200');

// 2. Wrong client_secret — invalid_client.
const r2 = await postForm('/api/oauth/revoke', {
  token: 'ort_anything',
  client_id: reg.client_id,
  client_secret: 'cs_wrong',
});
if (r2.status !== 401) { console.error('FAIL wrong-secret:', r2); process.exit(1); }
console.log('PASS wrong-secret → 401');
