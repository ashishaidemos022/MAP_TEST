export const config = { runtime: 'nodejs' };

import type { IncomingMessage, ServerResponse } from 'node:http';
import { getAppUrl } from './_lib/oauth/env.js';

export default function handler(_req: IncomingMessage, res: ServerResponse): void {
  const issuer = getAppUrl();
  const body = {
    issuer,
    authorization_endpoint: `${issuer}/api/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    registration_endpoint: `${issuer}/api/oauth/register`,
    revocation_endpoint: `${issuer}/api/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['client_secret_post'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['mcp:read'],
  };
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.end(JSON.stringify(body));
}
