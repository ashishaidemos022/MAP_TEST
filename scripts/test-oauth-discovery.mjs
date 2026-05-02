// Verifies /.well-known/oauth-authorization-server and /.well-known/oauth-protected-resource.
// Run: node --env-file=.env.local scripts/test-oauth-discovery.mjs
const BASE = process.env.MCP_BASE_URL;
if (!BASE) { console.error('Set MCP_BASE_URL'); process.exit(2); }

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  if (res.status !== 200) { console.error('FAIL', path, 'status', res.status); process.exit(1); }
  return res.json();
}

const as = await getJson('/.well-known/oauth-authorization-server');
const required = [
  'issuer', 'authorization_endpoint', 'token_endpoint', 'registration_endpoint',
  'response_types_supported', 'grant_types_supported',
  'token_endpoint_auth_methods_supported', 'code_challenge_methods_supported',
  'scopes_supported',
];
for (const k of required) {
  if (!(k in as)) { console.error('FAIL AS missing', k); process.exit(1); }
}
if (!as.code_challenge_methods_supported.includes('S256')) {
  console.error('FAIL AS missing S256'); process.exit(1);
}
if (as.code_challenge_methods_supported.includes('plain')) {
  console.error('FAIL AS advertises plain (must reject)'); process.exit(1);
}
if (!as.grant_types_supported.includes('authorization_code')) {
  console.error('FAIL AS missing authorization_code'); process.exit(1);
}
if (!as.grant_types_supported.includes('refresh_token')) {
  console.error('FAIL AS missing refresh_token'); process.exit(1);
}
console.log('PASS oauth-authorization-server');

const pr = await getJson('/.well-known/oauth-protected-resource');
if (!pr.resource || !pr.resource.endsWith('/api/mcp')) {
  console.error('FAIL PR resource', pr.resource); process.exit(1);
}
if (!Array.isArray(pr.authorization_servers) || pr.authorization_servers.length === 0) {
  console.error('FAIL PR authorization_servers'); process.exit(1);
}
console.log('PASS oauth-protected-resource');
