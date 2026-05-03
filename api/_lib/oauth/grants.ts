import { getServiceClient } from '../mcp/env.js';
import { OAuthError } from './errors.js';

export async function upsertActiveGrant(opts: {
  family_id: string;
  owner_user_id: string;
  client_id: string;
  scope: string;
}): Promise<{ id: string }> {
  const sb = getServiceClient();
  // Try to find an active grant first.
  const { data: existing, error: e1 } = await sb
    .from('map_oauth_grants')
    .select('id')
    .eq('family_id', opts.family_id)
    .eq('client_id', opts.client_id)
    .is('revoked_at', null)
    .maybeSingle();
  if (e1) {
    console.error('[oauth/grants] lookup failed:', e1);
    throw new OAuthError('server_error', 'grant lookup failed', 500);
  }
  if (existing) return { id: existing.id };

  // Race: between the SELECT above and our INSERT, a concurrent /consent
  // for the same (family, client) could create the grant. The partial
  // unique index `uniq_active_grant ... WHERE revoked_at IS NULL` will
  // catch it (PG 23505); we re-SELECT and use the row that won.
  const { data: ins, error: e2 } = await sb
    .from('map_oauth_grants')
    .insert({
      family_id: opts.family_id,
      owner_user_id: opts.owner_user_id,
      client_id: opts.client_id,
      scope: opts.scope,
    })
    .select('id')
    .single();
  if (ins) return { id: ins.id };
  if (e2 && (e2 as { code?: string }).code === '23505') {
    const { data: again, error: e3 } = await sb
      .from('map_oauth_grants')
      .select('id')
      .eq('family_id', opts.family_id)
      .eq('client_id', opts.client_id)
      .is('revoked_at', null)
      .maybeSingle();
    if (e3) {
      console.error('[oauth/grants] re-lookup after conflict failed:', e3);
      throw new OAuthError('server_error', 'grant lookup failed', 500);
    }
    if (again) return { id: again.id };
  }
  console.error('[oauth/grants] insert failed:', e2);
  throw new OAuthError('server_error', 'grant insert failed', 500);
}

export async function bumpGrantLastUsed(grant_id: string): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.from('map_oauth_grants')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', grant_id);
  if (error) console.warn('[oauth/grants] last_used_at update failed:', error.message);
}
