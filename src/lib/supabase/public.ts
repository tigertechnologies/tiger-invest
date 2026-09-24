import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON, SUPABASE_URL, hasSupabase } from './env';

let pub: SupabaseClient | null = null;
/** Cliente anônimo sem cookies — para leituras públicas em Server Components (permite cache). */
export function supabasePublic(): SupabaseClient | null {
  if (!hasSupabase()) return null;
  if (!pub) pub = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
  return pub;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const sb = supabasePublic();
  if (!sb) return fallback;
  const { data } = await sb.from('site_settings').select('value').eq('key', key).maybeSingle();
  return (data?.value as T) ?? fallback;
}

export type FooterSettings = {
  company: string;
  legal_name: string;
  cnpj: string;
  email: string;
  instagram: string;
  youtube: string;
  telegram: string;
  whatsapp: string;
  course_url: string;
  mentorship_url: string;
};

export const FOOTER_DEFAULT: FooterSettings = {
  company: 'Tiger Labs',
  legal_name: '',
  cnpj: '',
  email: 'contato@tigerlabs.com.br',
  instagram: '',
  youtube: '',
  telegram: '',
  whatsapp: '',
  course_url: '',
  mentorship_url: '',
};
