// Refresh-grant negative paths. Reuse detection + happy refresh covered by handshake.
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

const r1 = await postForm('/api/oauth/token', {
  grant_type: 'refresh_token',
  refresh_token: 'ort_does_not_exist',
  client_id: 'client_does_not_exist',
  client_secret: 'cs_does_not_exist',
});
if (r1.status !== 401 || r1.body.error !== 'invalid_client') {
  console.error('FAIL unknown-client:', r1); process.exit(1);
}
console.log('PASS unknown-client → invalid_client');

const r2 = await postForm('/api/oauth/token', { grant_type: 'refresh_token' });
if (r2.status !== 400) { console.error('FAIL missing refresh_token:', r2); process.exit(1); }
console.log('PASS missing refresh_token rejected');
