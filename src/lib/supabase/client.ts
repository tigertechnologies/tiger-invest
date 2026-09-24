'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON, SUPABASE_URL, hasSupabase } from './env';

let client: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient | null {
  if (!hasSupabase()) return null;
  if (!client) client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON);
  return client;
}

/** Compatibilidade: arquivos antigos do Tiger Invest importam `createClient` daqui. */
export function createClient(): SupabaseClient {
  const c = supabaseBrowser();
  if (!c) throw new Error('Supabase não configurado (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).');
  return c;
}
