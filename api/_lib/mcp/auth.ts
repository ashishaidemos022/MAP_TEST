import { createHash } from 'node:crypto';
import { getServiceClient } from './env.js';
import { McpError } from './errors.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { lookupAccessToken } from '../oauth/access-tokens.js';
import { bumpGrantLastUsed } from '../oauth/grants.js';
import { getAppUrl } from '../oauth/env.js';

export type McpContext = {
  family_id: string;
  token_id: string;
  owner_user_id: string;
  supabase: SupabaseClient;
  auth_kind: 'pat' | 'oauth_access';
  grant_id: string | null;
};

const PAT_PREFIX = 'mcp_';
const OAT_PREFIX = 'oat_';

function sha256ByteaHex(input: string): string {
  return '\\x' + createHash('sha256').update(input, 'utf8').digest('hex');
}

function parseBearer(req: Request): { token: string; kind: 'pat' | 'oauth_access' } {
  const h = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!h) throw new McpError('unauthorized', 'missing Authorization header', 401);
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  if (!m) throw new McpError('unauthorized', 'malformed Authorization header', 401);
  const token = m[1];
  if (token.startsWith(PAT_PREFIX)) return { token, kind: 'pat' };
  if (token.startsWith(OAT_PREFIX)) return { token, kind: 'oauth_access' };
  throw new McpError('unauthorized', 'token format invalid', 401);
}

async function resolvePatContext(token: string): Promise<McpContext> {
  const hash = sha256ByteaHex(token);
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
    auth_kind: 'pat',
    grant_id: null,
  };
}

async function resolveOAuthAccessContext(token: string): Promise<McpContext> {
  try {
    const lk = await lookupAccessToken(token);
    return {
      family_id: lk.family_id,
      token_id: lk.token_id,
      owner_user_id: lk.owner_user_id,
      supabase: getServiceClient(),
      auth_kind: 'oauth_access',
      grant_id: lk.grant_id,
    };
  } catch (e) {
    // OAuthError → McpError so the dispatch and 401 shape stay uniform.
    const msg = e instanceof Error ? e.message : 'access token invalid';
    throw new McpError('unauthorized', msg, 401);
  }
}

export async function resolveContextOrThrow(req: Request): Promise<McpContext> {
  const { token, kind } = parseBearer(req);
  return kind === 'pat' ? await resolvePatContext(token) : await resolveOAuthAccessContext(token);
}

export async function bumpLastUsedAt(ctx: McpContext): Promise<void> {
  if (ctx.auth_kind === 'pat') {
    // Awaited (not fire-and-forget) so Vercel doesn't freeze the function mid-write.
    // ~20-50ms cost, deterministic. Future optimization: @vercel/functions waitUntil.
    const { error } = await ctx.supabase
      .from('map_mcp_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', ctx.token_id);
    if (error) console.warn('[mcp] last_used_at update failed:', error.message);
    return;
  }
  // OAuth: bump the GRANT's last_used_at, not the rotating access token.
  if (ctx.grant_id) await bumpGrantLastUsed(ctx.grant_id);
}

export function buildUnauthorizedResponse(message: string, code: 'invalid_request' | 'invalid_token'): Response {
  let resourceMetadata = '';
  try {
    resourceMetadata = `, resource_metadata="${getAppUrl()}/.well-known/oauth-protected-resource"`;
  } catch {
    // PUBLIC_APP_URL not set — degrade gracefully; existing PAT clients still work.
  }
  return new Response(JSON.stringify({ error: 'unauthorized', message }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer error="${code}"${resourceMetadata}`,
    },
  });
}
