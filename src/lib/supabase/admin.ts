import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from './env';

let admin: SupabaseClient | null = null;

/** Cliente com service role — usar SOMENTE no servidor (cache dos scanners, cron). */
export function supabaseAdmin(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) return null;
  if (!admin) admin = createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
  return admin;
}

/** Compatibilidade: arquivos antigos do Tiger Invest importam `createAdminClient` daqui. */
export function createAdminClient(): SupabaseClient {
  const c = supabaseAdmin();
  if (!c) throw new Error('Supabase admin: faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  return c;
}
