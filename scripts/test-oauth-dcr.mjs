// Verifies DCR allow-list, rate limit, happy path.
// Run: node --env-file=.env.local scripts/test-oauth-dcr.mjs
const BASE = process.env.MCP_BASE_URL;
if (!BASE) { console.error('Set MCP_BASE_URL'); process.exit(2); }

async function reg(body, headers = {}) {
  const res = await fetch(`${BASE}/api/oauth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// 1. Happy path: claude.ai
const ok = await reg({
  client_name: 'Claude.ai test',
  redirect_uris: ['https://claude.ai/oauth/callback'],
});
if (ok.status !== 201 || !ok.body.client_id || !ok.body.client_secret) {
  console.error('FAIL happy-path:', ok); process.exit(1);
}
if (!ok.body.client_id.startsWith('client_') || !ok.body.client_secret.startsWith('cs_')) {
  console.error('FAIL prefixes:', ok.body); process.exit(1);
}
console.log('PASS happy-path (claude.ai)');

// 2. ChatGPT subdomain
const ok2 = await reg({
  client_name: 'ChatGPT test',
  redirect_uris: ['https://oauth.chatgpt.com/callback'],
});
if (ok2.status !== 201) { console.error('FAIL chatgpt subdomain:', ok2); process.exit(1); }
console.log('PASS chatgpt subdomain');

// 3. Disallowed host
const bad = await reg({
  client_name: 'Evil',
  redirect_uris: ['https://evil.com/cb'],
});
if (bad.status !== 400 || bad.body.error !== 'invalid_redirect_uri') {
  console.error('FAIL disallowed:', bad); process.exit(1);
}
console.log('PASS disallowed-host rejected');

// 4. Missing fields
const miss = await reg({ client_name: 'X' });
if (miss.status !== 400 || miss.body.error !== 'invalid_client_metadata') {
  console.error('FAIL missing redirect_uris:', miss); process.exit(1);
}
console.log('PASS missing-fields rejected');

// 5. Rate limit (set ip header to a fixed value, hit 11 times quickly)
//
// `vercel dev` spawns a fresh PID per request — module-level Map state in
// rate-limit.ts can't persist locally, so the limiter only engages on a real
// (warm) Vercel function instance. Treat localhost as a NOTE; assert on
// non-localhost (preview/prod).
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)\b/.test(BASE);
const ip = `1.2.3.${Math.floor(Math.random() * 250) + 1}`;
let lastStatus = 0;
for (let i = 0; i < 11; i++) {
  const r = await reg(
    { client_name: `RL-${i}`, redirect_uris: ['https://claude.ai/oauth/callback'] },
    { 'x-forwarded-for': ip },
  );
  lastStatus = r.status;
}
if (isLocal) {
  if (lastStatus !== 429) {
    console.log(`NOTE rate-limit not enforced against vercel dev (last status ${lastStatus}); verify against a preview deploy.`);
  } else {
    console.log('PASS rate-limit fires after 10/min');
  }
} else {
  if (lastStatus !== 429) {
    console.error('FAIL rate-limit (last status):', lastStatus); process.exit(1);
  }
  console.log('PASS rate-limit fires after 10/min');
}
