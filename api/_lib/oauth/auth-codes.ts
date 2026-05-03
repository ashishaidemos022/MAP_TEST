import { getServiceClient } from '../mcp/env.js';
import { OAuthError } from './errors.js';
import { sha256ByteaHex } from './hashing.js';
import { generateAuthCode } from './tokens.js';

const CODE_TTL_SECONDS = 60;

export async function issueAuthCode(opts: {
  grant_id: string;
  code_challenge: string;
  code_challenge_method: 'S256';
  redirect_uri: string;
  scope: string;
}): Promise<string> {
  const code = generateAuthCode();
  const sb = getServiceClient();
  const { error } = await sb.from('map_oauth_authorization_codes').insert({
    code_hash: sha256ByteaHex(code),
    grant_id: opts.grant_id,
    code_challenge: opts.code_challenge,
    code_challenge_method: opts.code_challenge_method,
    redirect_uri: opts.redirect_uri,
    scope: opts.scope,
    expires_at: new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) {
    console.error('[oauth/auth-codes] insert failed:', error);
    throw new OAuthError('server_error', 'code insert failed', 500);
  }
  return code;
}

export type ConsumedCode = {
  grant_id: string;
  code_challenge: string;
  redirect_uri: string;
  scope: string;
};

// Atomic consume: marks used_at iff still unused/unexpired, returns row.
// Uses .update().select() to do it in one round trip.
export async function consumeAuthCode(plaintext: string): Promise<ConsumedCode> {
  const sb = getServiceClient();
  const hash = sha256ByteaHex(plaintext);
  const { data, error } = await sb.from('map_oauth_authorization_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('code_hash', hash)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('grant_id, code_challenge, redirect_uri, scope')
    .maybeSingle();
  if (error) {
    console.error('[oauth/auth-codes] consume failed:', error);
    throw new OAuthError('server_error', 'code consume failed', 500);
  }
  if (!data) throw new OAuthError('invalid_grant', 'code is invalid, used, or expired', 400);
  return data as ConsumedCode;
}
