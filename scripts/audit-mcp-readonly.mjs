// Acceptance §11.8 + Custom_Questions_Brief.md §12.10 — verifies the MCP tool
// surface only writes to the allow-listed tables. Phase 4 expanded the list to
// include the custom-question bank tables.
// Run: node scripts/audit-mcp-readonly.mjs

import { execSync } from 'node:child_process';

// Cover api/_lib/mcp/ + api/_lib/custom/ + api/mcp.ts. Custom-question writes
// live in api/_lib/custom/writes.ts (called from MCP tools), so include both.
const grep = execSync(
  "grep -RnEB 3 '\\.(insert|update|delete|upsert|rpc)\\(' api/_lib/mcp/ api/_lib/custom/ api/mcp.ts || true",
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
  // Phase 4 — custom question bank writes are explicitly allowed by §12.10.
  if (/map_custom_questions(?!_resolved|_table)/.test(block)) continue;
  if (/map_custom_question_versions/.test(block)) continue;
  if (/map_custom_question_choices/.test(block)) continue;
  if (/map_custom_passages/.test(block)) continue;
  if (/map_custom_passage_versions/.test(block)) continue;
  // Phase 4.1 — bank-first authoring writes (RPC-mediated, family-scoped).
  // map_create_or_find_custom_bank → map_question_banks
  // map_add_items_to_bank          → map_question_bank_items
  if (/map_create_or_find_custom_bank|map_question_banks/.test(block)) continue;
  if (/map_add_items_to_bank|map_question_bank_items/.test(block)) continue;

  offenders.push(triggerLine);
}

if (offenders.length > 0) {
  console.error('FAIL: write operations found against tables outside the allow-list:');
  for (const o of offenders) console.error('  ' + o);
  process.exit(1);
}

console.log('PASS read-only audit');
console.log('  Allowed writes: map_mcp_audit, map_mcp_tokens, map_oauth_*,');
console.log('                  map_custom_questions[_versions, _choices],');
console.log('                  map_custom_passages[_versions]');
console.log('  (filter excludes Node crypto Hash#update on createHash chains)');
