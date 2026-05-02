export const config = { runtime: 'nodejs', maxDuration: 30 } as const;

import type { IncomingMessage, ServerResponse } from 'node:http';
import { getServiceClient } from '../_lib/mcp/env.js';
import { OAuthError, buildOAuthErrorResponse } from '../_lib/oauth/errors.js';
import { generateClientId, generateClientSecret, last4 } from '../_lib/oauth/tokens.js';
import { isRedirectUriAllowed } from '../_lib/oauth/clients.js';
import { enforceDcrRateLimit, clientIp } from '../_lib/oauth/rate-limit.js';
import { sha256ByteaHex } from '../_lib/oauth/hashing.js';

type RegisterBody = {
  client_name?: unknown;
  redirect_uris?: unknown;
  grant_types?: unknown;
  token_endpoint_auth_method?: unknown;
};

function assertObject(parsed: unknown): RegisterBody {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new OAuthError('invalid_request', 'body must be a JSON object', 400);
  }
  return parsed as RegisterBody;
}

async function readJson(req: IncomingMessage): Promise<RegisterBody> {
  // @vercel/node may pre-parse JSON bodies onto req.body. Honor that first.
  // If `body` is present (even as null/string/number/array/etc.), trust the parser
  // and validate the result rather than re-reading the stream (which is empty by then).
  const reqWithBody = req as IncomingMessage & { body?: unknown };
  if ('body' in reqWithBody && reqWithBody.body !== undefined) {
    return assertObject(reqWithBody.body);
  }
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return {};
  try { return assertObject(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
  catch (e) {
    if (e instanceof OAuthError) throw e;
    throw new OAuthError('invalid_request', 'malformed JSON body', 400);
  }
}

function validate(body: RegisterBody): {
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  token_endpoint_auth_method: string;
} {
  if (typeof body.client_name !== 'string' || body.client_name.length === 0 || body.client_name.length > 100) {
    throw new OAuthError('invalid_client_metadata', 'client_name must be a string of 1-100 chars', 400);
  }
  if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0) {
    throw new OAuthError('invalid_client_metadata', 'redirect_uris must be a non-empty array', 400);
  }
  for (const u of body.redirect_uris) {
    if (typeof u !== 'string') throw new OAuthError('invalid_client_metadata', 'redirect_uris must be strings', 400);
    if (!isRedirectUriAllowed(u)) throw new OAuthError('invalid_redirect_uri', `redirect_uri not allowed: ${u}`, 400);
  }
  const grant_types = Array.isArray(body.grant_types) && body.grant_types.length > 0
    ? body.grant_types.filter((g): g is string => typeof g === 'string')
    : ['authorization_code', 'refresh_token'];
  for (const g of grant_types) {
    if (g !== 'authorization_code' && g !== 'refresh_token') {
      throw new OAuthError('invalid_client_metadata', `unsupported grant_type: ${g}`, 400);
    }
  }
  const auth_method = typeof body.token_endpoint_auth_method === 'string'
    ? body.token_endpoint_auth_method
    : 'client_secret_post';
  if (auth_method !== 'client_secret_post' && auth_method !== 'none') {
    throw new OAuthError('invalid_client_metadata', `unsupported token_endpoint_auth_method: ${auth_method}`, 400);
  }
  return {
    client_name: body.client_name,
    redirect_uris: body.redirect_uris as string[],
    grant_types,
    token_endpoint_auth_method: auth_method,
  };
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.statusCode = 405; res.setHeader('Allow', 'POST'); res.end('method not allowed'); return;
  }
  try {
    enforceDcrRateLimit(clientIp(req as unknown as { headers: Record<string, string | string[] | undefined> }));

    const raw = await readJson(req);
    const meta = validate(raw);

    const client_id = generateClientId();
    let client_secret: string | null = null;
    let client_secret_hash: string | null = null;
    if (meta.token_endpoint_auth_method === 'client_secret_post') {
      client_secret = generateClientSecret();
      client_secret_hash = sha256ByteaHex(client_secret);
    }

    const sb = getServiceClient();
    const { error } = await sb.from('map_oauth_clients').insert({
      client_id,
      client_secret_hash,
      client_name: meta.client_name,
      redirect_uris: meta.redirect_uris,
      grant_types: meta.grant_types,
      token_endpoint_auth_method: meta.token_endpoint_auth_method,
      created_via: 'dcr',
    });
    if (error) throw new OAuthError('server_error', `insert failed: ${error.message}`, 500);

    res.statusCode = 201;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.end(JSON.stringify({
      client_id,
      ...(client_secret ? { client_secret, client_secret_last4: last4(client_secret) } : {}),
      client_name: meta.client_name,
      redirect_uris: meta.redirect_uris,
      grant_types: meta.grant_types,
      token_endpoint_auth_method: meta.token_endpoint_auth_method,
    }));
  } catch (err) {
    if (err instanceof OAuthError) {
      const r = buildOAuthErrorResponse(err);
      res.statusCode = r.status;
      r.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await r.text());
      return;
    }
    console.error('[oauth/register] unhandled', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'server_error' }));
  }
}
