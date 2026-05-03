export const config = { runtime: 'nodejs', maxDuration: 30 } as const;

import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { OAuthError, buildOAuthErrorResponse } from '../_lib/oauth/errors.js';
import { getClientById, assertRedirectUriRegistered } from '../_lib/oauth/clients.js';
import { getSessionContextFromRequest } from '../_lib/oauth/session.js';
import { renderConsentHtml } from '../_lib/oauth/consent-template.js';
import { getAppUrl } from '../_lib/oauth/env.js';

function paramsFromUrl(req: IncomingMessage): URLSearchParams {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = req.headers.host ?? 'localhost';
  const u = new URL(`${proto}://${host}${req.url ?? '/'}`);
  return u.searchParams;
}

function redirectWithError(redirect_uri: string, state: string | null, code: string, desc: string): string {
  const u = new URL(redirect_uri);
  u.searchParams.set('error', code);
  u.searchParams.set('error_description', desc);
  if (state) u.searchParams.set('state', state);
  return u.toString();
}

// RFC 6749 §4.1.2.1: /authorize must return 400 (not 401) for unknown
// client. getClientById throws invalid_client/401 by default; convert.
async function getClientForAuthorize(client_id: string) {
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
  if (req.method !== 'GET') {
    res.statusCode = 405; res.setHeader('Allow', 'GET'); res.end('method not allowed'); return;
  }
  try {
    const q = paramsFromUrl(req);
    const response_type        = q.get('response_type');
    const client_id            = q.get('client_id');
    const redirect_uri         = q.get('redirect_uri');
    const scope                = q.get('scope') ?? 'mcp:read';
    const state                = q.get('state') ?? '';
    const code_challenge       = q.get('code_challenge');
    const code_challenge_method= q.get('code_challenge_method');

    if (!client_id || !redirect_uri) throw new OAuthError('invalid_request', 'client_id and redirect_uri required', 400);
    const client = await getClientForAuthorize(client_id);
    assertRedirectUriRegistered(client, redirect_uri);

    if (response_type !== 'code') {
      const u = redirectWithError(redirect_uri, state, 'unsupported_response_type', 'response_type must be code');
      res.statusCode = 302; res.setHeader('Location', u); res.end(); return;
    }
    if (code_challenge_method !== 'S256' || !code_challenge) {
      const u = redirectWithError(redirect_uri, state, 'invalid_request', 'PKCE S256 required');
      res.statusCode = 302; res.setHeader('Location', u); res.end(); return;
    }
    if (scope !== 'mcp:read') {
      const u = redirectWithError(redirect_uri, state, 'invalid_scope', 'only mcp:read supported');
      res.statusCode = 302; res.setHeader('Location', u); res.end(); return;
    }

    const session = await getSessionContextFromRequest(req.headers.cookie);
    if (!session) {
      const fullUrl = `${getAppUrl()}${req.url ?? '/api/oauth/authorize'}`;
      res.statusCode = 302;
      res.setHeader('Location', `/login?return_to=${encodeURIComponent(fullUrl)}`);
      res.end(); return;
    }

    // Issue a CSRF token tied to this consent rendering. Stored in an
    // HttpOnly cookie; verified server-side at /api/oauth/consent.
    const csrf = randomBytes(16).toString('hex');
    res.setHeader('Set-Cookie', `oauth_csrf=${csrf}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`);
    const html = renderConsentHtml({
      client_id, client_name: client.client_name, redirect_uri, state, scope,
      code_challenge, code_challenge_method, csrf_token: csrf,
    });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  } catch (err) {
    if (err instanceof OAuthError) {
      const r = buildOAuthErrorResponse(err);
      res.statusCode = r.status;
      r.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await r.text());
      return;
    }
    console.error('[oauth/authorize] unhandled', err);
    res.statusCode = 500;
    res.end('server error');
  }
}
