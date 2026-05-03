import type { McpContext } from './auth.js';

type AuditStatus = 'ok' | 'error' | 'unauthorized' | 'rate_limited';

export type AuditInput = {
  ctx: McpContext;
  toolName: string;
  toolArgs: unknown;
  status: AuditStatus;
  errorMessage?: string;
};

const ARG_KEY_WHITELIST = new Set([
  'student_id', 'session_id', 'subject', 'limit', 'since_days', 'min_questions',
]);

function redact(input: unknown): unknown {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'object') return null;
  if (Array.isArray(input)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!ARG_KEY_WHITELIST.has(k)) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}

export async function logToolCall({ ctx, toolName, toolArgs, status, errorMessage }: AuditInput): Promise<void> {
  const { error } = await ctx.supabase.from('map_mcp_audit').insert({
    token_id: ctx.token_id,
    family_id: ctx.family_id,
    auth_kind: ctx.auth_kind,
    grant_id: ctx.grant_id,
    tool_name: toolName,
    tool_args: redact(toolArgs),
    status,
    error_message: errorMessage ?? null,
  });
  if (error) console.warn('[mcp] audit insert failed:', error.message);
}
