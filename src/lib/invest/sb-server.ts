import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase/server';

/** Compatibilidade com o código do Tiger Invest: mesmo cliente de servidor do Tiger Labs. */
export function createClient(): SupabaseClient {
  const c = supabaseServer();
  if (!c) throw new Error('Supabase não configurado (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).');
  return c as unknown as SupabaseClient;
}
