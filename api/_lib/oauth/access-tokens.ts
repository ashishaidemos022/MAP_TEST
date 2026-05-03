import { getServiceClient } from '../mcp/env.js';
import { OAuthError } from './errors.js';
import { sha256ByteaHex } from './hashing.js';
import { generateAccessToken, last4 } from './tokens.js';

const ACCESS_TTL_SECONDS = 3600; // 1 hour

export async function issueAccessToken(opts: {
  grant_id: string;
  family_id: string;
  scope: string;
}): Promise<{ token: string; expires_in: number }> {
  const token = generateAccessToken();
  const sb = getServiceClient();
  const { error } = await sb.from('map_oauth_access_tokens').insert({
    token_hash: sha256ByteaHex(token),
    token_last4: last4(token),
    grant_id: opts.grant_id,
    family_id: opts.family_id,
    scope: opts.scope,
    expires_at: new Date(Date.now() + ACCESS_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) {
    console.error('[oauth/access-tokens] insert failed:', error);
    throw new OAuthError('server_error', 'access_token insert failed', 500);
  }
  return { token, expires_in: ACCESS_TTL_SECONDS };
}

export type AccessTokenLookup = {
  token_id: string;
  family_id: string;
  grant_id: string;
  scope: string;
  // owner_user_id is loaded via a join into map_oauth_grants.
  owner_user_id: string;
};

// Used by api/_lib/mcp/auth.ts at request time.
export async function lookupAccessToken(plaintext: string): Promise<AccessTokenLookup> {
  const sb = getServiceClient();
  const { data, error } = await sb.from('map_oauth_access_tokens')
    .select(`
      id, family_id, grant_id, scope, expires_at, revoked_at,
      grant:map_oauth_grants!inner(owner_user_id, revoked_at)
    `)
    .eq('token_hash', sha256ByteaHex(plaintext))
    .maybeSingle();
  if (error) {
    console.error('[oauth/access-tokens] lookup failed:', error);
    throw new OAuthError('server_error', 'access_token lookup failed', 500);
  }
  if (!data) throw new OAuthError('invalid_grant', 'token not found', 401);
  if (data.revoked_at) throw new OAuthError('invalid_grant', 'token revoked', 401);
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    throw new OAuthError('invalid_grant', 'token expired', 401);
  }
  // grant is { owner_user_id, revoked_at } per !inner join (single object even though PostgREST may type as array).
  const grant = Array.isArray(data.grant) ? data.grant[0] : data.grant;
  if (!grant) throw new OAuthError('invalid_grant', 'orphan token', 401);
  if (grant.revoked_at) throw new OAuthError('invalid_grant', 'grant revoked', 401);
  return {
    token_id: data.id,
    family_id: data.family_id,
    grant_id: data.grant_id,
    scope: data.scope,
    owner_user_id: grant.owner_user_id,
  };
}
