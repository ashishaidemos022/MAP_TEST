import { createHash } from 'node:crypto';
import { getServiceClient } from './env.js';
import { McpError } from './errors.js';
import type { SupabaseClient } from '@supabase/supabase-js';

export type McpContext = {
  family_id: string;
  token_id: string;
  owner_user_id: string;
  supabase: SupabaseClient;
};

const TOKEN_PREFIX = 'mcp_';

function sha256Hex(input: string): Buffer {
  return createHash('sha256').update(input, 'utf8').digest();
}

function parseBearer(req: Request): string {
  const h = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!h) throw new McpError('unauthorized', 'missing Authorization header', 401);
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  if (!m) throw new McpError('unauthorized', 'malformed Authorization header', 401);
  const token = m[1];
  if (!token.startsWith(TOKEN_PREFIX)) {
    throw new McpError('unauthorized', 'token format invalid', 401);
  }
  return token;
}

export async function resolveContextOrThrow(req: Request): Promise<McpContext> {
  const token = parseBearer(req);
  const hash = sha256Hex(token);

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('map_mcp_tokens')
    .select('id, family_id, owner_user_id, expires_at, revoked_at')
    .eq('token_hash', hash)
    .maybeSingle();

  if (error) throw new McpError('internal', `token lookup failed: ${error.message}`, 500);
  if (!data) throw new McpError('unauthorized', 'token not found', 401);
  if (data.revoked_at) throw new McpError('unauthorized', 'token revoked', 401);
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    throw new McpError('unauthorized', 'token expired', 401);
  }

  return {
    family_id: data.family_id,
    token_id: data.id,
    owner_user_id: data.owner_user_id,
    supabase,
  };
}

export async function bumpLastUsedAt(ctx: McpContext): Promise<void> {
  // Awaited (not fire-and-forget) so Vercel doesn't freeze the function mid-write.
  // ~20-50ms cost, deterministic. Future optimization: @vercel/functions waitUntil.
  const { error } = await ctx.supabase
    .from('map_mcp_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', ctx.token_id);
  if (error) {
    console.warn('[mcp] last_used_at update failed:', error.message);
  }
}

export function buildUnauthorizedResponse(message: string, code: 'invalid_request' | 'invalid_token'): Response {
  return new Response(JSON.stringify({ error: 'unauthorized', message }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer error="${code}"`,
    },
  });
}
