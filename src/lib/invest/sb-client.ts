'use client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/supabase/client';

const MSG = 'Supabase não configurado (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).';

// Cliente "vazio": só falha quando alguém realmente tenta usar o banco.
// Assim a página renderiza (pré-render/build) mesmo sem as variáveis.
const missing = new Proxy({} as SupabaseClient, {
  get() {
    throw new Error(MSG);
  },
});

/** Compatibilidade com o código do Tiger Invest: mesmo cliente do Tiger Labs. */
export function createClient(): SupabaseClient {
  return supabaseBrowser() ?? missing;
}
