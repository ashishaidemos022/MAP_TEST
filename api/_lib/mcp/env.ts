import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL (or VITE_SUPABASE_URL) is not set');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  if (key.startsWith('sb_publishable_') || key.includes('"role":"anon"')) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY looks like an anon/publishable key — refusing to start');
  }
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}
