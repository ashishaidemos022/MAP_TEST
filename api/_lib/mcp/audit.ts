import type { McpContext } from './auth.js';

type AuditStatus = 'ok' | 'error' | 'unauthorized' | 'rate_limited';

export type AuditInput = {
  ctx: McpContext;
  toolName: string;
  toolArgs: unknown;
  status: AuditStatus;
  errorMessage?: string;
};

// Whitelist: only these arg keys are persisted. Add to this list when a new
// tool introduces a new arg name. Anything else is dropped at write time.
const ARG_KEY_WHITELIST = new Set([
  'student_id',
  'session_id',
  'subject',
  'limit',
  'since_days',
  'min_questions',
]);

function redact(input: unknown): unknown {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'object') return null;
  if (Array.isArray(input)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!ARG_KEY_WHITELIST.has(k)) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    }
  }
  return out;
}

export async function logToolCall({ ctx, toolName, toolArgs, status, errorMessage }: AuditInput): Promise<void> {
  // Awaited so the row is durable before we return to the client.
  // Failure is logged but does not fail the request.
  const { error } = await ctx.supabase.from('map_mcp_audit').insert({
    token_id: ctx.token_id,
    family_id: ctx.family_id,
    tool_name: toolName,
    tool_args: redact(toolArgs),
    status,
    error_message: errorMessage ?? null,
  });
  if (error) console.warn('[mcp] audit insert failed:', error.message);
}
