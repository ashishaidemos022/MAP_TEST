import type { McpContext } from './auth.js';
import { createHash } from 'node:crypto';

type AuditStatus = 'ok' | 'error' | 'unauthorized' | 'rate_limited';
type AuditMode = 'read' | 'write';

export type AuditInput = {
  ctx: McpContext;
  toolName: string;
  toolArgs: unknown;
  status: AuditStatus;
  errorMessage?: string;
  // Write tools log full args (with SVG fields hashed) per Custom_Questions_Brief.md
  // Amendment C. Defaults to 'read' to preserve the existing aggressive redaction.
  mode?: AuditMode;
};

// Whitelist for read tools: only these arg keys are persisted. Anything else
// is dropped at write time.
const READ_ARG_KEY_WHITELIST = new Set([
  'student_id', 'session_id', 'subject', 'limit', 'since_days', 'min_questions',
]);

const AUDIT_BODY_CAP = 50_000; // bytes — per Amendment B/C
const SVG_FIELD_RE = /_svg$/;

function redactRead(input: unknown): unknown {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'object' || Array.isArray(input)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!READ_ARG_KEY_WHITELIST.has(k)) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}

function hashSvg(value: string): { sha256: string; byte_length: number } {
  const hash = createHash('sha256').update(value, 'utf8').digest('hex');
  return { sha256: hash, byte_length: Buffer.byteLength(value, 'utf8') };
}

// Recursive walk: replace any *_svg field with a hash-and-size summary.
function hashSvgFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(hashSvgFields);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SVG_FIELD_RE.test(k) && typeof v === 'string' && v.length > 0) {
        out[k] = hashSvg(v);
      } else if (typeof v === 'object' && v !== null) {
        out[k] = hashSvgFields(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return value;
}

function redactWrite(input: unknown): unknown {
  if (input === null || input === undefined) return null;
  const hashed = hashSvgFields(input);
  // Cap the serialized size at 50KB; if exceeded, append a marker.
  const json = JSON.stringify(hashed);
  if (json.length <= AUDIT_BODY_CAP) return hashed;
  return {
    ...((typeof hashed === 'object' && hashed !== null && !Array.isArray(hashed))
      ? hashed
      : {}),
    __truncated: true,
    __byte_size: json.length,
  };
}

export async function logToolCall({ ctx, toolName, toolArgs, status, errorMessage, mode }: AuditInput): Promise<void> {
  // Awaited so the row is durable before we return to the client.
  // Failure is logged but does not fail the request.
  const redactedArgs = mode === 'write' ? redactWrite(toolArgs) : redactRead(toolArgs);
  const { error } = await ctx.supabase.from('map_mcp_audit').insert({
    token_id: ctx.token_id,
    family_id: ctx.family_id,
    auth_kind: ctx.auth_kind,
    grant_id: ctx.grant_id,
    tool_name: toolName,
    tool_args: redactedArgs,
    status,
    error_message: errorMessage ?? null,
  });
  if (error) console.warn('[mcp] audit insert failed:', error.message);
}
