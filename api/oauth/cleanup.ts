export const config = { runtime: 'nodejs', maxDuration: 30 } as const;

import type { IncomingMessage, ServerResponse } from 'node:http';
import { getServiceClient } from '../_lib/mcp/env.js';

// Vercel Cron calls this with header `x-vercel-cron`. Optional secret check via CRON_SECRET.
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const isCron = req.headers['x-vercel-cron'] !== undefined;
  const secret = process.env.CRON_SECRET;
  if (!isCron && (!secret || req.headers.authorization !== `Bearer ${secret}`)) {
    res.statusCode = 401; res.end('unauthorized'); return;
  }

  const sb = getServiceClient();
  const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString();

  const a = await sb.from('map_oauth_authorization_codes').delete().lt('expires_at', cutoff).select('id');
  const b = await sb.from('map_oauth_access_tokens')      .delete().lt('expires_at', cutoff).select('id');
  const c = await sb.from('map_oauth_refresh_tokens')     .delete().lt('expires_at', cutoff).select('id');

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    deleted_auth_codes: a.data?.length ?? 0,
    deleted_access_tokens: b.data?.length ?? 0,
    deleted_refresh_tokens: c.data?.length ?? 0,
  }));
}
