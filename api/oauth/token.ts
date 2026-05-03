export const config = { runtime: 'nodejs', maxDuration: 30 } as const;

import type { IncomingMessage, ServerResponse } from 'node:http';
import { OAuthError, buildOAuthErrorResponse } from '../_lib/oauth/errors.js';
import { authenticateClient, assertRedirectUriRegistered } from '../_lib/oauth/clients.js';
import { consumeAuthCode } from '../_lib/oauth/auth-codes.js';
import { verifyPkceS256 } from '../_lib/oauth/pkce.js';
import { issueAccessToken } from '../_lib/oauth/access-tokens.js';
import { issueRefreshToken, consumeRefreshToken } from '../_lib/oauth/refresh-tokens.js';
import { getServiceClient } from '../_lib/mcp/env.js';

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  // @vercel/node may pre-parse application/x-www-form-urlencoded onto req.body.
  const pre = (req as IncomingMessage & { body?: unknown }).body;
  if (pre && typeof pre === 'object' && !Array.isArray(pre) && !(pre instanceof Buffer)) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(pre as Record<string, unknown>)) {
      if (typeof v === 'string') params.set(k, v);
    }
    return params;
  }
  if (typeof pre === 'string' && pre.length > 0) return new URLSearchParams(pre);
  if (Buffer.isBuffer(pre)) return new URLSearchParams(pre.toString('utf8'));
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.end(JSON.stringify(body));
}

async function handleCodeGrant(form: URLSearchParams, res: ServerResponse): Promise<void> {
  const client_id     = form.get('client_id') ?? '';
  const client_secret = form.get('client_secret');
  const code          = form.get('code') ?? '';
  const redirect_uri  = form.get('redirect_uri') ?? '';
  const code_verifier = form.get('code_verifier') ?? '';
  if (!client_id || !code || !redirect_uri || !code_verifier) {
    throw new OAuthError('invalid_request', 'missing required field for authorization_code grant', 400);
  }

  const client = await authenticateClient(client_id, client_secret);
  assertRedirectUriRegistered(client, redirect_uri);

  const consumed = await consumeAuthCode(code);
  if (consumed.redirect_uri !== redirect_uri) {
    throw new OAuthError('invalid_grant', 'redirect_uri mismatch with code', 400);
  }
  verifyPkceS256(code_verifier, consumed.code_challenge);

  // Look up the grant to load family_id (denormalize-on-issue).
  const sb = getServiceClient();
  const { data: g, error: ge } = await sb.from('map_oauth_grants')
    .select('family_id').eq('id', consumed.grant_id).maybeSingle();
  if (ge) {
    console.error('[oauth/token] grant lookup failed:', ge);
    throw new OAuthError('server_error', 'grant lookup failed', 500);
  }
  if (!g) throw new OAuthError('invalid_grant', 'grant gone', 400);

  const access = await issueAccessToken({ grant_id: consumed.grant_id, family_id: g.family_id, scope: consumed.scope });
  const refresh = await issueRefreshToken({ grant_id: consumed.grant_id, family_id: g.family_id });

  jsonResponse(res, 200, {
    access_token: access.token,
    token_type: 'Bearer',
    expires_in: access.expires_in,
    refresh_token: refresh,
    scope: consumed.scope,
  });
}

async function handleRefreshGrant(form: URLSearchParams, res: ServerResponse): Promise<void> {
  const client_id     = form.get('client_id') ?? '';
  const client_secret = form.get('client_secret');
  const refresh_token = form.get('refresh_token') ?? '';
  if (!client_id || !refresh_token) {
    throw new OAuthError('invalid_request', 'missing required field for refresh_token grant', 400);
  }
  await authenticateClient(client_id, client_secret); // throws if bad

  const consumed = await consumeRefreshToken(refresh_token);

  const access = await issueAccessToken({
    grant_id: consumed.grant_id, family_id: consumed.family_id, scope: 'mcp:read',
  });
  const newRefresh = await issueRefreshToken({
    grant_id: consumed.grant_id,
    family_id: consumed.family_id,
    parent_refresh_token_id: consumed.refresh_token_id,
  });

  jsonResponse(res, 200, {
    access_token: access.token,
    token_type: 'Bearer',
    expires_in: access.expires_in,
    refresh_token: newRefresh,
    scope: 'mcp:read',
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.statusCode = 405; res.setHeader('Allow', 'POST'); res.end('method not allowed'); return;
  }
  try {
    const form = await readForm(req);
    const grant_type = form.get('grant_type');
    if (grant_type === 'authorization_code')        await handleCodeGrant(form, res);
    else if (grant_type === 'refresh_token')        await handleRefreshGrant(form, res);
    else throw new OAuthError('unsupported_grant_type', `unsupported grant_type: ${grant_type ?? '(missing)'}`, 400);
  } catch (err) {
    if (err instanceof OAuthError) {
      const r = buildOAuthErrorResponse(err);
      res.statusCode = r.status;
      r.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await r.text());
      return;
    }
    console.error('[oauth/token] unhandled', err);
    jsonResponse(res, 500, { error: 'server_error' });
  }
}
