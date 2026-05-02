import { createClient } from '@supabase/supabase-js';
import { OAuthError } from './errors.js';

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

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = decodeURIComponent(part.slice(i + 1).trim());
    out[k] = v;
  }
  return out;
}

function findAuthTokenCookie(cookies: Record<string, string>): string | null {
  // Supabase split-cookies (newer SDKs) name them sb-<ref>-auth-token.0, .1
  // We try the single-cookie form first, then concatenate the chunked form.
  const single = Object.entries(cookies).find(([k]) => /^sb-.*-auth-token$/.test(k));
  if (single) return single[1];
  const chunks: Array<[number, string]> = [];
  for (const [k, v] of Object.entries(cookies)) {
    const m = /^sb-.*-auth-token\.(\d+)$/.exec(k);
    if (m) chunks.push([Number(m[1]), v]);
  }
  if (chunks.length === 0) return null;
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

export async function getSessionContextFromRequest(
  cookieHeader: string | undefined,
): Promise<SessionContext | null> {
  const cookies = parseCookies(cookieHeader);
  const cookieValue = findAuthTokenCookie(cookies);
  if (!cookieValue) return null;
  const accessToken = extractAccessToken(cookieValue);
  if (!accessToken) return null;

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new OAuthError('server_error', 'supabase env not set', 500);

  // Anon-key client. We pass the user's access token; auth.getUser validates it.
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getUser(accessToken);
  if (error || !data.user) return null;

  // Now use service-role to look up the family (RLS would require us to use
  // the user's session, but we already verified the user via getUser).
  const { getServiceClient } = await import('../mcp/env.js');
  const svc = getServiceClient();
  const { data: fam, error: fe } = await svc
    .from('map_families')
    .select('id')
    .eq('owner_user_id', data.user.id)
    .maybeSingle();
  if (fe) throw new OAuthError('server_error', `family lookup failed: ${fe.message}`, 500);
  if (!fam) return null;

  return { user_id: data.user.id, family_id: fam.id };
}
