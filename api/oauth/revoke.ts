export const config = { runtime: 'nodejs', maxDuration: 30 } as const;

import type { IncomingMessage, ServerResponse } from 'node:http';
import { OAuthError, buildOAuthErrorResponse } from '../_lib/oauth/errors.js';
import { authenticateClient } from '../_lib/oauth/clients.js';
import { isAccessToken, isRefreshToken } from '../_lib/oauth/tokens.js';
import { revokeAccessTokenByPlaintext, revokeRefreshTokenByPlaintext } from '../_lib/oauth/refresh-tokens.js';
import { readUrlEncodedForm } from '../_lib/oauth/form.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.statusCode = 405; res.setHeader('Allow', 'POST'); res.end('method not allowed'); return;
  }
  try {
    const form = await readUrlEncodedForm(req);
    const token         = form.get('token') ?? '';
    const client_id     = form.get('client_id') ?? '';
    const client_secret = form.get('client_secret');

    if (!token || !client_id) throw new OAuthError('invalid_request', 'token and client_id required', 400);
    await authenticateClient(client_id, client_secret); // throws if bad

    if (isAccessToken(token))      await revokeAccessTokenByPlaintext(token);
    else if (isRefreshToken(token)) await revokeRefreshTokenByPlaintext(token);
    // Per RFC 7009: unknown token format also returns 200. We just no-op.

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.end('{}');
  } catch (err) {
    if (err instanceof OAuthError) {
      const r = buildOAuthErrorResponse(err);
      res.statusCode = r.status;
      r.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await r.text());
      return;
    }
    console.error('[oauth/revoke] unhandled', err);
    res.statusCode = 500; res.end('server error');
  }
}
