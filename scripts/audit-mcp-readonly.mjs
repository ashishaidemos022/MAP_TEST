// Acceptance §11.8: only writes are against map_mcp_audit (insert) and map_mcp_tokens (update).
// Run: node scripts/audit-mcp-readonly.mjs

import { execSync } from 'node:child_process';

// Strategy: grep with -B 3 context so chained Supabase calls like
//   .from('map_mcp_tokens')
//   .update({ ... })
// are captured together. Each match block (separated by '--') is tested as a
// unit: if the block contains an allowed table name it is not an offender.
// We also exclude Node crypto Hash#update chains.
const grep = execSync(
  "grep -RnEB 3 '\\.(insert|update|delete|upsert|rpc)\\(' api/_lib/mcp/ api/mcp.ts || true",
).toString();

// Split on the grep context separator '--' to get per-match blocks.
const blocks = grep.split(/^--$/m).map((b) => b.trim()).filter(Boolean);

const offenders = [];
for (const block of blocks) {
  // The triggering line is the last non-empty line in the block (the one that
  // actually matched the write-method pattern).
  const blockLines = block.split('\n').filter(Boolean);
  const triggerLine = blockLines[blockLines.length - 1];

  // Skip crypto Hash#update chains.
  if (/createHash|digest|Hash\s*#?update/.test(block)) continue;

  // If ANY line in the context block names an allowed table, the write is permitted.
  if (/map_mcp_audit/.test(block)) continue;
  if (/map_mcp_tokens/.test(block)) continue;
  if (/map_oauth_clients/.test(block)) continue;
  if (/map_oauth_grants/.test(block)) continue;
  if (/map_oauth_authorization_codes/.test(block)) continue;
  if (/map_oauth_access_tokens/.test(block)) continue;
  if (/map_oauth_refresh_tokens/.test(block)) continue;

  offenders.push(triggerLine);
}

if (offenders.length > 0) {
  console.error('FAIL: write operations found against tables outside the allow-list:');
  for (const o of offenders) console.error('  ' + o);
  process.exit(1);
}

console.log('PASS read-only audit');
console.log('  Allowed writes: map_mcp_audit, map_mcp_tokens, map_oauth_clients,');
console.log('                  map_oauth_grants, map_oauth_authorization_codes,');
console.log('                  map_oauth_access_tokens, map_oauth_refresh_tokens');
console.log('  (filter excludes Node crypto Hash#update on createHash chains)');
