export const config = { runtime: 'nodejs' };

import type { IncomingMessage, ServerResponse } from 'node:http';
import { getAppUrl } from './_lib/oauth/env.js';

export default function handler(_req: IncomingMessage, res: ServerResponse): void {
  const issuer = getAppUrl();
  const body = {
    resource: `${issuer}/api/mcp`,
    authorization_servers: [issuer],
    bearer_methods_supported: ['header'],
    scopes_supported: ['mcp:read'],
  };
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.end(JSON.stringify(body));
}
