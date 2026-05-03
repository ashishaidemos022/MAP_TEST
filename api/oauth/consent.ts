export const config = { runtime: 'nodejs', maxDuration: 30 } as const;

import type { IncomingMessage, ServerResponse } from 'node:http';
import { OAuthError, buildOAuthErrorResponse } from '../_lib/oauth/errors.js';
import { getClientById, assertRedirectUriRegistered } from '../_lib/oauth/clients.js';
import { getSessionContextFromRequest } from '../_lib/oauth/session.js';
import { upsertActiveGrant } from '../_lib/oauth/grants.js';
import { issueAuthCode } from '../_lib/oauth/auth-codes.js';
import { readUrlEncodedForm } from '../_lib/oauth/form.js';

function getCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function redirectBack(redirect_uri: string, state: string, params: Record<string, string>): string {
  const u = new URL(redirect_uri);
  if (state) u.searchParams.set('state', state);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

// Same RFC 6749 §4.1.2.1 fix as in authorize.ts — unknown client_id at the
// front-channel boundary should be 400, not 401.
async function getClientForConsent(client_id: string) {
  try {
    return await getClientById(client_id);
  } catch (e) {
    if (e instanceof OAuthError && e.code === 'invalid_client') {
      throw new OAuthError('invalid_request', 'unknown client_id', 400);
    }
    throw e;
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.statusCode = 405; res.setHeader('Allow', 'POST'); res.end('method not allowed'); return;
  }
  try {
    const form = await readUrlEncodedForm(req);
    const client_id    = form.get('client_id') ?? '';
    const redirect_uri = form.get('redirect_uri') ?? '';
    const state        = form.get('state') ?? '';
    const scope        = form.get('scope') ?? 'mcp:read';
    const challenge    = form.get('code_challenge') ?? '';
    const challenge_m  = form.get('code_challenge_method') ?? '';
    const csrf_form    = form.get('csrf_token') ?? '';
    const decision     = form.get('decision') ?? '';

    const csrf_cookie = getCookie(req.headers.cookie, 'oauth_csrf');
    if (!csrf_cookie || csrf_cookie !== csrf_form) {
      throw new OAuthError('invalid_request', 'CSRF token mismatch', 400);
    }

    const session = await getSessionContextFromRequest(req.headers.cookie);
    if (!session) throw new OAuthError('access_denied', 'not signed in', 401);

    const client = await getClientForConsent(client_id);
    assertRedirectUriRegistered(client, redirect_uri);
    if (challenge_m !== 'S256' || !challenge) throw new OAuthError('invalid_request', 'PKCE S256 required', 400);
    if (scope !== 'mcp:read') throw new OAuthError('invalid_scope', 'only mcp:read supported', 400);

    if (decision !== 'allow') {
      const u = redirectBack(redirect_uri, state, { error: 'access_denied', error_description: 'user denied' });
      res.statusCode = 302; res.setHeader('Location', u); res.end(); return;
    }

    const grant = await upsertActiveGrant({
      family_id: session.family_id,
      owner_user_id: session.user_id,
      client_id: client.client_id,
      scope,
    });
    const code = await issueAuthCode({
      grant_id: grant.id,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      redirect_uri,
      scope,
    });

    const u = redirectBack(redirect_uri, state, { code });
    res.statusCode = 302;
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `oauth_csrf=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`);  // clear CSRF cookie
    res.setHeader('Location', u);
    res.end();
  } catch (err) {
    if (err instanceof OAuthError) {
      const r = buildOAuthErrorResponse(err);
      res.statusCode = r.status;
      r.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await r.text());
      return;
    }
    console.error('[oauth/consent] unhandled', err);
    res.statusCode = 500;
    res.end('server error');
  }
}
