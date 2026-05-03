import { randomBytes } from 'node:crypto';

const CLIENT_ID_PREFIX     = 'client_';
const CLIENT_SECRET_PREFIX = 'cs_';
const ACCESS_TOKEN_PREFIX  = 'oat_';
const REFRESH_TOKEN_PREFIX = 'ort_';
const AUTH_CODE_PREFIX     = 'oac_';

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeRandom(prefix: string, byteLen: number): string {
  return prefix + base64url(randomBytes(byteLen));
}

export const generateClientId       = () => makeRandom(CLIENT_ID_PREFIX,     16);
export const generateClientSecret   = () => makeRandom(CLIENT_SECRET_PREFIX, 32);
export const generateAccessToken    = () => makeRandom(ACCESS_TOKEN_PREFIX,  32);
export const generateRefreshToken   = () => makeRandom(REFRESH_TOKEN_PREFIX, 32);
export const generateAuthCode       = () => makeRandom(AUTH_CODE_PREFIX,     32);

export function isAccessToken(s: string): boolean  { return s.startsWith(ACCESS_TOKEN_PREFIX); }
export function isRefreshToken(s: string): boolean { return s.startsWith(REFRESH_TOKEN_PREFIX); }
export function isAuthCode(s: string): boolean     { return s.startsWith(AUTH_CODE_PREFIX); }

export function last4(s: string): string {
  return s.length <= 4 ? s : s.slice(-4);
}

// Re-export for the auth.ts dispatch in /api/mcp.
export { ACCESS_TOKEN_PREFIX };
