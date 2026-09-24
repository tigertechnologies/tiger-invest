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
