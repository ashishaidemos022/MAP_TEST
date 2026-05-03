import { createClient } from '@supabase/supabase-js';
import { OAuthError } from './errors.js';
import { getServiceClient } from '../mcp/env.js';

// Reads the Supabase auth cookie from a Node request and returns
// { user_id, family_id } or null if not signed in.
//
// Supabase JS sets a cookie named `sb-<project-ref>-auth-token` whose
// value is a JSON-encoded array [access_token, refresh_token, ...].
// We extract the access_token and use auth.getUser() to verify it.

export type SessionContext = {
  user_id: string;
  family_id: string;
};

const MAX_COOKIE_CHUNKS = 16; // Supabase chunks at ~4; 16 is a defensive cap.

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    let v: string;
    try { v = decodeURIComponent(part.slice(i + 1).trim()); }
    catch { continue; } // malformed % sequence — skip this cookie, don't 500 the request
    out[k] = v;
  }
  return out;
}

// Returns the expected cookie name for this Supabase project, derived from
// SUPABASE_URL. Pinning the project ref (rather than matching any sb-*
// cookie) defeats subdomain cookie-planting attacks on shared parent
// domains (e.g., a malicious *.vercel.app sibling).
function expectedAuthCookieName(): string {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  if (!url) throw new OAuthError('server_error', 'SUPABASE_URL not set', 500);
  let ref: string;
  try { ref = new URL(url).hostname.split('.')[0] ?? ''; }
  catch { ref = ''; }
  if (!ref) throw new OAuthError('server_error', 'malformed SUPABASE_URL', 500);
  return `sb-${ref}-auth-token`;
}

function findAuthTokenCookie(cookies: Record<string, string>, expectedName: string): string | null {
  // Single-cookie form takes precedence over chunked.
  if (cookies[expectedName]) return cookies[expectedName];
  const prefix = expectedName + '.';
  const chunks: Array<[number, string]> = [];
  for (const [k, v] of Object.entries(cookies)) {
    if (!k.startsWith(prefix)) continue;
    const idx = Number(k.slice(prefix.length));
    if (!Number.isInteger(idx) || idx < 0) continue;
    chunks.push([idx, v]);
  }
  if (chunks.length === 0 || chunks.length > MAX_COOKIE_CHUNKS) return null;
  chunks.sort((a, b) => a[0] - b[0]);
  return chunks.map(([, v]) => v).join('');
}

function extractAccessToken(cookieValue: string): string | null {
  // Supabase cookie can be base64-prefixed JSON or raw JSON; both forms seen in the wild.
  let raw = cookieValue;
  if (raw.startsWith('base64-')) {
    try { raw = Buffer.from(raw.slice('base64-'.length), 'base64').toString('utf8'); }
    catch { return null; }
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0];
    if (parsed && typeof parsed.access_token === 'string') return parsed.access_token;
  } catch { /* fall through */ }
  return null;
}

/**
 * Resolves the parent's session from cookies on a Node request.
 *
 * Returns:
 *   - SessionContext  → caller is signed in AND has a family row
 *   - null            → caller is not signed in, or signed in but has no family
 *                       (treated identically by callers — both should redirect to sign-in)
 *
 * Throws OAuthError('server_error', ..., 500):
 *   - SUPABASE_URL / SUPABASE_ANON_KEY missing
 *   - Family lookup DB error (operator problem, not user)
 *
 * Network: makes a ~80ms call to Supabase GoTrue's /auth/v1/user to validate
 * the JWT. Don't cache — consent flow is once per OAuth grant.
 */
export async function getSessionContextFromRequest(
  cookieHeader: string | undefined,
): Promise<SessionContext | null> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new OAuthError('server_error', 'supabase env not set', 500);

  const expectedName = expectedAuthCookieName();
  const cookies = parseCookies(cookieHeader);
  const cookieValue = findAuthTokenCookie(cookies, expectedName);
  if (!cookieValue) return null;
  const accessToken = extractAccessToken(cookieValue);
  if (!accessToken) return null;

  // Anon-key client. We pass the user's access token; auth.getUser validates it.
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getUser(accessToken);
  if (error || !data.user) return null;

  // Service-role for family lookup. Safe because the user identity is verified above.
  const svc = getServiceClient();
  const { data: fam, error: fe } = await svc
    .from('map_families')
    .select('id')
    .eq('owner_user_id', data.user.id)
    .maybeSingle();
  if (fe) {
    console.error('[oauth/session] family lookup failed:', fe);
    throw new OAuthError('server_error', 'family lookup failed', 500);
  }
  if (!fam) return null;

  return { user_id: data.user.id, family_id: fam.id };
}
