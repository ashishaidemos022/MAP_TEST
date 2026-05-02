import { createHash } from 'node:crypto';

// Returns PostgREST bytea input format ("\xHEX") so .eq('token_hash', hex) works.
// Mirrors api/_lib/mcp/auth.ts:sha256ByteaHex.
export function sha256ByteaHex(input: string): string {
  return '\\x' + createHash('sha256').update(input, 'utf8').digest('hex');
}
