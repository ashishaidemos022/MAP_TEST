// Static check: api/oauth/* and api/_lib/oauth/* contain no writes outside the allow-list.
// Run: node scripts/audit-oauth-readonly.mjs
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['api/oauth', 'api/_lib/oauth', 'api/_lib/mcp/auth.ts', 'api/_lib/mcp/audit.ts'];
const ALLOWED_TABLES = new Set([
  'map_oauth_clients',
  'map_oauth_grants',
  'map_oauth_authorization_codes',
  'map_oauth_access_tokens',
  'map_oauth_refresh_tokens',
  'map_mcp_tokens',
  'map_mcp_audit',
]);

function walk(p, out) {
  if (!existsSync(p)) return;
  if (statSync(p).isFile()) { out.push(p); return; }
  for (const ent of readdirSync(p)) walk(join(p, ent), out);
}

const files = [];
for (const r of ROOTS) walk(r, files);

let ok = true;
const writeRe = /\.from\(\s*['"`]([a-zA-Z_]+)['"`]\s*\)\.(insert|update|delete|upsert)/g;
for (const f of files) {
  if (!f.endsWith('.ts') && !f.endsWith('.tsx')) continue;
  const src = readFileSync(f, 'utf8');
  let m;
  while ((m = writeRe.exec(src))) {
    const table = m[1];
    if (!ALLOWED_TABLES.has(table)) {
      console.error(`FAIL ${f}: writes to non-allow-listed table ${table}.${m[2]}`);
      ok = false;
    }
  }
}
if (ok) console.log(`PASS audit-oauth-readonly across ${files.length} files`);
else process.exit(1);
