// End-to-end OAuth handshake. Requires:
//   MCP_BASE_URL          — base URL of the running app
//   SUPABASE_URL          — for issuing a test session
//   SUPABASE_SERVICE_ROLE_KEY — for creating a test user + family
// Optional: SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY) — for sign-in
// Run: node --env-file=.env.local scripts/test-mcp-oauth-handshake.mjs

import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';

const BASE = process.env.MCP_BASE_URL;
const SUPA_URL = process.env.SUPABASE_URL;
const SVC_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !SUPA_URL || !SVC_KEY) {
  console.error('Set MCP_BASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY'); process.exit(2);
}

const sb = createClient(SUPA_URL, SVC_KEY, { auth: { persistSession: false } });

// 1. Provision a temp parent + family.
const email = `oauth-test+${Date.now()}@example.com`;
const password = 'TempTest123!';
const { data: u, error: ue } = await sb.auth.admin.createUser({
  email, password, email_confirm: true,
});
if (ue) { console.error('FAIL createUser:', ue.message); process.exit(1); }
const userId = u.user.id;
const { error: fe } = await sb.from('map_families').insert({
  owner_user_id: userId, family_name: 'OAuth Test',
});
if (fe) {
  console.error('FAIL family insert:', fe.message);
  await sb.auth.admin.deleteUser(userId);
  process.exit(1);
}

// 2. Sign in to get a session cookie value.
const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
if (!anon) {
  console.error('Need SUPABASE_ANON_KEY for sign-in (or VITE_SUPABASE_ANON_KEY)');
  await sb.auth.admin.deleteUser(userId);
  process.exit(2);
}
const userClient = createClient(SUPA_URL, anon, { auth: { persistSession: false } });
const { data: sess, error: se } = await userClient.auth.signInWithPassword({ email, password });
if (se) {
  console.error('FAIL signIn:', se.message);
  await sb.auth.admin.deleteUser(userId);
  process.exit(1);
}
const accessToken = sess.session.access_token;
const projectRef = new URL(SUPA_URL).hostname.split('.')[0];
const cookieName = `sb-${projectRef}-auth-token`;
// session.ts parses: array form OR object with access_token. We use the array form.
const cookieValue = encodeURIComponent(JSON.stringify([accessToken, sess.session.refresh_token, null, null, null]));
const cookieHeader = `${cookieName}=${cookieValue}`;

let firstAccessToken;  // captured for the post-cascade probe at the end
let firstRefreshToken;
let regClientId; // for cleanup in finally
try {
  // 3. DCR
  const reg = await fetch(`${BASE}/api/oauth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'handshake-test',
      redirect_uris: ['https://claude.ai/oauth/callback'],
    }),
  }).then((r) => r.json());
  if (!reg.client_id || !reg.client_secret) throw new Error('FAIL DCR: ' + JSON.stringify(reg));
  regClientId = reg.client_id;
  console.log('PASS DCR');

  // 4. PKCE pair
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  // 5. GET /authorize (renders consent — captures CSRF cookie)
  const auzUrl = new URL(`${BASE}/api/oauth/authorize`);
  for (const [k, v] of Object.entries({
    response_type: 'code', client_id: reg.client_id,
    redirect_uri: 'https://claude.ai/oauth/callback',
    scope: 'mcp:read', state: 'xyz',
    code_challenge: challenge, code_challenge_method: 'S256',
  })) auzUrl.searchParams.set(k, v);
  const auzRes = await fetch(auzUrl, { headers: { Cookie: cookieHeader }, redirect: 'manual' });
  if (auzRes.status !== 200) {
    const body = await auzRes.text().catch(() => '');
    throw new Error('FAIL /authorize status: ' + auzRes.status + ' body: ' + body.slice(0, 200));
  }
  const setCookie = auzRes.headers.get('set-cookie') ?? '';
  const csrfMatch = /oauth_csrf=([^;]+)/.exec(setCookie);
  if (!csrfMatch) throw new Error('FAIL no oauth_csrf cookie in: ' + setCookie);
  const csrf = csrfMatch[1];
  console.log('PASS /authorize renders consent');

  // 6. POST /consent
  const conRes = await fetch(`${BASE}/api/oauth/consent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: `${cookieHeader}; oauth_csrf=${csrf}`,
    },
    redirect: 'manual',
    body: new URLSearchParams({
      client_id: reg.client_id,
      redirect_uri: 'https://claude.ai/oauth/callback',
      state: 'xyz', scope: 'mcp:read',
      code_challenge: challenge, code_challenge_method: 'S256',
      csrf_token: csrf, decision: 'allow',
    }).toString(),
  });
  if (conRes.status !== 302) {
    const body = await conRes.text().catch(() => '');
    throw new Error('FAIL /consent status: ' + conRes.status + ' body: ' + body.slice(0, 200));
  }
  const loc = new URL(conRes.headers.get('location'));
  const code = loc.searchParams.get('code');
  if (!code || !code.startsWith('oac_')) throw new Error('FAIL no code in redirect: ' + loc);
  console.log('PASS /consent → 302 with code');

  // 7. POST /token (code exchange)
  const tokRes = await fetch(`${BASE}/api/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code,
      redirect_uri: 'https://claude.ai/oauth/callback',
      code_verifier: verifier,
      client_id: reg.client_id, client_secret: reg.client_secret,
    }).toString(),
  });
  const tok = await tokRes.json();
  if (tokRes.status !== 200 || !tok.access_token?.startsWith('oat_')) {
    throw new Error('FAIL /token: ' + JSON.stringify(tok));
  }
  firstAccessToken = tok.access_token;
  firstRefreshToken = tok.refresh_token;
  console.log('PASS /token → access+refresh');

  // 8. Call /api/mcp with the OAuth access token
  const mcpRes = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tok.access_token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_kids', arguments: {} },
    }),
  });
  if (mcpRes.status !== 200) {
    const body = await mcpRes.text().catch(() => '');
    throw new Error('FAIL /api/mcp: ' + mcpRes.status + ' ' + body.slice(0, 200));
  }
  console.log('PASS /api/mcp call with OAuth access token');

  // 9. Refresh
  const r2 = await fetch(`${BASE}/api/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: tok.refresh_token,
      client_id: reg.client_id, client_secret: reg.client_secret,
    }).toString(),
  });
  const tok2 = await r2.json();
  if (r2.status !== 200 || !tok2.access_token || tok2.refresh_token === tok.refresh_token) {
    throw new Error('FAIL refresh rotation: ' + JSON.stringify(tok2));
  }
  console.log('PASS refresh rotation');

  // Sleep 6 seconds before refresh-reuse to clear the 5s duplicate-request guard
  // (the guard distinguishes legitimate client retries from real reuse attacks
  // by measuring time since the original token was consumed in step 9).
  await new Promise((r) => setTimeout(r, 6_000));

  // 10. Reuse old refresh → 400 + grant cascade
  const r3 = await fetch(`${BASE}/api/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: tok.refresh_token,
      client_id: reg.client_id, client_secret: reg.client_secret,
    }).toString(),
  });
  const r3body = await r3.json().catch(() => ({}));
  if (r3.status !== 400) throw new Error('FAIL reuse-detection status: ' + r3.status + ' body: ' + JSON.stringify(r3body));
  // Sanity: the 400 message should mention "reuse" — guards against the duplicate-request branch.
  if (!/reuse/i.test(r3body.error_description ?? '')) {
    console.warn('WARN reuse-detection error_description does not mention "reuse":', r3body.error_description);
  }
  console.log('PASS refresh-reuse detected (cascade revoke)');

  // 11. New access token (from r2) should now also be revoked → 401
  const mcpAfter = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok2.access_token}`, 'Content-Type': 'application/json',
               Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  if (mcpAfter.status !== 401) {
    const body = await mcpAfter.text().catch(() => '');
    throw new Error('FAIL post-cascade /api/mcp: ' + mcpAfter.status + ' ' + body.slice(0, 200));
  }
  console.log('PASS post-cascade /api/mcp → 401');
} finally {
  // Clean up the test user (cascades through families → grants → tokens).
  // Then explicitly delete the DCR client (no FK to families, so user-delete
  // doesn't cascade through it).
  await sb.auth.admin.deleteUser(userId);
  if (typeof regClientId === 'string') {
    await sb.from('map_oauth_clients').delete().eq('client_id', regClientId);
  }
}
