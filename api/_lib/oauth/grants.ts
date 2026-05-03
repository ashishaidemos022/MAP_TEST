import { getServiceClient } from '../mcp/env.js';
import { OAuthError } from './errors.js';

export async function upsertActiveGrant(opts: {
  family_id: string;
  owner_user_id: string;
  client_id: string;
  scope: string;
}): Promise<{ id: string }> {
  const sb = getServiceClient();
  // Try to find an active grant first (the unique partial index would
  // collide on a naive insert; conflict-on-partial-index isn't supported
  // by upsert in a clean way, so we do select-then-insert in one txn-shape).
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
  if (e2) {
    console.error('[oauth/grants] insert failed:', e2);
    throw new OAuthError('server_error', 'grant insert failed', 500);
  }
  return { id: ins.id };
}

export async function bumpGrantLastUsed(grant_id: string): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.from('map_oauth_grants')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', grant_id);
  if (error) console.warn('[oauth/grants] last_used_at update failed:', error.message);
}
