// Verifies /api/oauth/authorize parameter validation and login redirect.
// Full consent flow needs a real Supabase session; covered by handshake test.
// Run: node --env-file=.env.local scripts/test-oauth-authorize.mjs
const BASE = process.env.MCP_BASE_URL;
if (!BASE) { console.error('Set MCP_BASE_URL'); process.exit(2); }

// Pre-register a client to use for the tests.
const reg = await fetch(`${BASE}/api/oauth/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ client_name: 'authz-test', redirect_uris: ['https://claude.ai/oauth/callback'] }),
}).then((r) => r.json());
if (!reg.client_id) { console.error('FAIL setup register:', reg); process.exit(1); }

function authorizeUrl(params) {
  const u = new URL(`${BASE}/api/oauth/authorize`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}
async function get(params) {
  return fetch(authorizeUrl(params), { redirect: 'manual' });
}

const okParams = {
  response_type: 'code',
  client_id: reg.client_id,
  redirect_uri: 'https://claude.ai/oauth/callback',
  scope: 'mcp:read',
  state: 'abc123',
  code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  code_challenge_method: 'S256',
};

// 1. No session → 302 to /login?return_to=...
const r1 = await get(okParams);
if (r1.status !== 302 || !(r1.headers.get('location') || '').includes('/login?return_to=')) {
  console.error('FAIL no-session redirect:', r1.status, r1.headers.get('location')); process.exit(1);
}
console.log('PASS no-session → /login redirect');

// 2. response_type != 'code' → 302 to redirect_uri with error param (back-channel)
const r2 = await get({ ...okParams, response_type: 'token' });
const r2loc = r2.headers.get('location') || '';
if (r2.status !== 302 || !r2loc.includes('error=unsupported_response_type')) {
  console.error('FAIL response_type redirect:', r2.status, r2loc); process.exit(1);
}
console.log('PASS unsupported_response_type → redirect with error');

// 3. code_challenge_method != 'S256' → redirect with invalid_request
const r3 = await get({ ...okParams, code_challenge_method: 'plain' });
const r3loc = r3.headers.get('location') || '';
if (r3.status !== 302 || !r3loc.includes('error=invalid_request')) {
  console.error('FAIL plain rejected:', r3.status, r3loc); process.exit(1);
}
console.log('PASS code_challenge_method=plain rejected');

// 4. Unknown client_id → 400 (per RFC 6749 §4.1.2.1, must NOT redirect)
const r4 = await get({ ...okParams, client_id: 'client_does_not_exist' });
if (r4.status !== 400) {
  console.error('FAIL unknown client expected 400:', r4.status); process.exit(1);
}
console.log('PASS unknown-client → 400');

// 5. Mismatched redirect_uri → 400 (per RFC 6749 §4.1.2.1, must NOT redirect to attacker)
const r5 = await get({ ...okParams, redirect_uri: 'https://claude.ai/wrong' });
if (r5.status !== 400) {
  console.error('FAIL mismatched redirect_uri expected 400:', r5.status); process.exit(1);
}
console.log('PASS mismatched-redirect_uri → 400');
