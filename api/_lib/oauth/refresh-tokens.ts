import { getServiceClient } from '../mcp/env.js';
import { OAuthError } from './errors.js';
import { sha256ByteaHex } from './hashing.js';
import { generateRefreshToken, last4 } from './tokens.js';

const REFRESH_TTL_DAYS = 90;

export async function issueRefreshToken(opts: {
  grant_id: string;
  family_id: string;
  parent_refresh_token_id?: string | null;
}): Promise<string> {
  const token = generateRefreshToken();
  const sb = getServiceClient();
  const { error } = await sb.from('map_oauth_refresh_tokens').insert({
    token_hash: sha256ByteaHex(token),
    token_last4: last4(token),
    grant_id: opts.grant_id,
    family_id: opts.family_id,
    parent_refresh_token_id: opts.parent_refresh_token_id ?? null,
    expires_at: new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000).toISOString(),
  });
  if (error) {
    console.error('[oauth/refresh-tokens] insert failed:', error);
    throw new OAuthError('server_error', 'refresh_token insert failed', 500);
  }
  return token;
}

// Atomically mark used_at on the presented refresh token. If the token is
// already used, this is a reuse — cascade-revoke the entire grant before throwing.
// Returns the row needed to mint replacements.
export async function consumeRefreshToken(plaintext: string): Promise<{
  refresh_token_id: string;
  grant_id: string;
  family_id: string;
}> {
  const sb = getServiceClient();
  const hash = sha256ByteaHex(plaintext);

  // Try to claim the token: only succeeds if used_at IS NULL and not revoked/expired.
  const { data: claimed, error: claimErr } = await sb.from('map_oauth_refresh_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', hash)
    .is('used_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('id, grant_id, family_id')
    .maybeSingle();
  if (claimErr) {
    console.error('[oauth/refresh-tokens] claim failed:', claimErr);
    throw new OAuthError('server_error', 'refresh_token claim failed', 500);
  }
  if (claimed) return { refresh_token_id: claimed.id, grant_id: claimed.grant_id, family_id: claimed.family_id };

  // Claim failed. Find out why.
  const { data: existing } = await sb.from('map_oauth_refresh_tokens')
    .select('id, grant_id, used_at, revoked_at, expires_at')
    .eq('token_hash', hash)
    .maybeSingle();
  if (existing && existing.used_at && !existing.revoked_at) {
    // Distinguish duplicate request (legitimate client retry on network
    // timeout, ~99%+ of cases) from actual reuse (attacker presenting a
    // token the legitimate client already consumed). Threshold is short
    // enough that an attacker can't realistically race within it, but long
    // enough to absorb common retry storms (cold starts, mobile flakiness).
    const usedMsAgo = Date.now() - new Date(existing.used_at).getTime();
    if (usedMsAgo < 5000) {
      throw new OAuthError('invalid_grant', 'refresh token already consumed', 400);
    }
    await cascadeRevokeGrant(existing.grant_id);
    throw new OAuthError('invalid_grant', 'refresh token reuse detected; grant revoked', 400);
  }
  throw new OAuthError('invalid_grant', 'refresh token invalid, revoked, or expired', 400);
}

async function cascadeRevokeGrant(grant_id: string): Promise<void> {
  // The three UPDATEs are intentionally NOT wrapped in a single transaction.
  // OAuth 2.1 §4.3.1 accepts the brief inconsistency window (~50ms in practice).
  // Order matters: revoke refresh tokens FIRST so an attacker cannot mint new
  // access tokens via /oauth/token between statements; then access tokens
  // (already-issued ones still have <=1h to live but can't be re-issued); then
  // the grant itself (which the parent UI uses to show "connected agents").
  // All three filter `revoked_at IS NULL` so the cascade is idempotent under retry.
  const sb = getServiceClient();
  const now = new Date().toISOString();
  await sb.from('map_oauth_refresh_tokens').update({ revoked_at: now }).eq('grant_id', grant_id).is('revoked_at', null);
  await sb.from('map_oauth_access_tokens').update({ revoked_at: now }).eq('grant_id', grant_id).is('revoked_at', null);
  await sb.from('map_oauth_grants').update({ revoked_at: now }).eq('id', grant_id).is('revoked_at', null);
}

// Used by /oauth/revoke (RFC 7009) for a single-token revoke.
export async function revokeRefreshTokenByPlaintext(plaintext: string): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.from('map_oauth_refresh_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_hash', sha256ByteaHex(plaintext))
    .is('revoked_at', null);
  if (error) console.error('[oauth/refresh-tokens] revoke refresh failed:', error);
  // RFC 7009 §2.2: caller still returns 200 regardless.
}

export async function revokeAccessTokenByPlaintext(plaintext: string): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.from('map_oauth_access_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_hash', sha256ByteaHex(plaintext))
    .is('revoked_at', null);
  if (error) console.error('[oauth/refresh-tokens] revoke access failed:', error);
  // RFC 7009 §2.2: caller still returns 200 regardless.
}
