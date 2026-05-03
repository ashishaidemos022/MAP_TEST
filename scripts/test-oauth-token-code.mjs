// Negative-path tests for code grant.
// Run: node --env-file=.env.local scripts/test-oauth-token-code.mjs
const BASE = process.env.MCP_BASE_URL;
if (!BASE) { console.error('Set MCP_BASE_URL'); process.exit(2); }

async function postForm(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const fake = await postForm('/api/oauth/token', {
  grant_type: 'authorization_code',
  code: 'oac_does_not_exist',
  redirect_uri: 'https://claude.ai/oauth/callback',
  code_verifier: 'a'.repeat(43),
  client_id: 'client_does_not_exist',
  client_secret: 'cs_does_not_exist',
});
if (fake.status !== 401 || fake.body.error !== 'invalid_client') {
  console.error('FAIL unknown-client:', fake); process.exit(1);
}
console.log('PASS unknown-client → invalid_client');

const ug = await postForm('/api/oauth/token', { grant_type: 'password' });
if (ug.status !== 400 || ug.body.error !== 'unsupported_grant_type') {
  console.error('FAIL unsupported_grant_type:', ug); process.exit(1);
}
console.log('PASS unsupported_grant_type rejected');

const noargs = await postForm('/api/oauth/token', { grant_type: 'authorization_code' });
if (noargs.status !== 400 || noargs.body.error !== 'invalid_request') {
  console.error('FAIL missing fields:', noargs); process.exit(1);
}
console.log('PASS missing-fields → invalid_request');
