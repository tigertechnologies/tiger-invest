import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';

/** Cliente service_role (ignora RLS). Só no servidor. */
export function createAdminClient(): SupabaseClient {
  const c = supabaseAdmin();
  if (!c) throw new Error('Supabase admin: faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  return c;
}
