import { createHash } from 'node:crypto';
import { getServiceClient } from '../mcp/env.js';
import { OAuthError } from './errors.js';
import { getAllowedDcrHosts } from './env.js';

export type OAuthClientRow = {
  id: string;
  client_id: string;
  client_secret_hash: string | null;  // bytea hex from PostgREST
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  token_endpoint_auth_method: string;
};

// Suffix-match: 'claude.ai' allows 'claude.ai' and any '*.claude.ai'.
export function isRedirectUriAllowed(uri: string): boolean {
  let url: URL;
  try { url = new URL(uri); } catch { return false; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  // http only allowed for localhost dev
  if (url.protocol === 'http:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    return false;
  }
  const allowed = getAllowedDcrHosts();
  for (const host of allowed) {
    if (url.hostname === host) return true;
    if (url.hostname.endsWith('.' + host)) return true;
  }
  return false;
}

export async function getClientById(client_id: string): Promise<OAuthClientRow> {
  const sb = getServiceClient();
  const { data, error } = await sb.from('map_oauth_clients')
    .select('id, client_id, client_secret_hash, client_name, redirect_uris, grant_types, token_endpoint_auth_method')
    .eq('client_id', client_id)
    .maybeSingle();
  if (error) throw new OAuthError('server_error', `client lookup failed: ${error.message}`, 500);
  if (!data) throw new OAuthError('invalid_client', 'unknown client_id', 401);
  return data as OAuthClientRow;
}

export async function authenticateClient(client_id: string, client_secret: string | null): Promise<OAuthClientRow> {
  const c = await getClientById(client_id);
  if (!c.client_secret_hash) {
    // Public client (no secret) — only valid if registered as such (PKCE-only).
    if (client_secret) throw new OAuthError('invalid_client', 'client_secret not expected', 401);
    return c;
  }
  if (!client_secret) throw new OAuthError('invalid_client', 'client_secret required', 401);
  const presented = '\\x' + createHash('sha256').update(client_secret, 'utf8').digest('hex');
  if (presented !== c.client_secret_hash) {
    throw new OAuthError('invalid_client', 'client_secret mismatch', 401);
  }
  return c;
}

export function assertRedirectUriRegistered(c: OAuthClientRow, redirect_uri: string): void {
  if (!c.redirect_uris.includes(redirect_uri)) {
    throw new OAuthError('invalid_grant', 'redirect_uri does not match registration', 400);
  }
}
