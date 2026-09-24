import { createServerClient, type CookieOptions } from '@supabase/ssr';

type CookieList = { name: string; value: string; options: CookieOptions }[];
import { cookies } from 'next/headers';
import { SUPABASE_ANON, SUPABASE_URL, hasSupabase } from './env';

export function supabaseServer() {
  if (!hasSupabase()) return null;
  const store = cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: CookieList) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* chamado de Server Component — ignorado */
        }
      },
    },
  });
}

export async function getSessionUser() {
  const sb = supabaseServer();
  if (!sb) return { user: null, profile: null };
  const { data } = await sb.auth.getUser();
  if (!data.user) return { user: null, profile: null };
  const { data: profile } = await sb.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
  return { user: data.user, profile };
}

/** Compatibilidade: arquivos antigos do Tiger Invest importam `createClient` daqui. */
export function createClient() {
  const c = supabaseServer();
  if (!c) throw new Error('Supabase não configurado (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).');
  return c;
}
