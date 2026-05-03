import { createHash } from 'node:crypto';
import { OAuthError } from './errors.js';

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// RFC 7636 §4.6: code_challenge == BASE64URL(SHA256(code_verifier)).
export function verifyPkceS256(code_verifier: string, code_challenge: string): void {
  if (!code_verifier || code_verifier.length < 43 || code_verifier.length > 128) {
    throw new OAuthError('invalid_grant', 'code_verifier length out of range', 400);
  }
  const computed = base64url(createHash('sha256').update(code_verifier, 'utf8').digest());
  if (computed !== code_challenge) {
    throw new OAuthError('invalid_grant', 'code_verifier does not match code_challenge', 400);
  }
}
