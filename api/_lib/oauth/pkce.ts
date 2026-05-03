import { createHash, timingSafeEqual } from 'node:crypto';
import { OAuthError } from './errors.js';

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// RFC 7636 §4.1: code_verifier charset is [A-Za-z0-9-._~].
const VERIFIER_CHARSET = /^[A-Za-z0-9\-._~]+$/;

// RFC 7636 §4.6: code_challenge == BASE64URL(SHA256(code_verifier)).
export function verifyPkceS256(code_verifier: string, code_challenge: string): void {
  if (!code_verifier || code_verifier.length < 43 || code_verifier.length > 128) {
    throw new OAuthError('invalid_grant', 'code_verifier length out of range', 400);
  }
  if (!VERIFIER_CHARSET.test(code_verifier)) {
    throw new OAuthError('invalid_grant', 'code_verifier contains invalid characters', 400);
  }
  const computed = base64url(createHash('sha256').update(code_verifier, 'utf8').digest());
  // Constant-time compare to defend against the (academic) timing oracle.
  // SHA-256 base64url is fixed-length 43 chars, so length must match for a valid pair.
  const a = Buffer.from(computed, 'utf8');
  const b = Buffer.from(code_challenge, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new OAuthError('invalid_grant', 'code_verifier does not match code_challenge', 400);
  }
}
