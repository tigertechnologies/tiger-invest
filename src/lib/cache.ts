import 'server-only';
import { supabaseAdmin } from './supabase/admin';

type Entry = { data: unknown; at: number };
const mem = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

/**
 * Cache em 2 camadas: memória da função + tabela `scanner_cache` no Supabase.
 * Sem Supabase configurado, funciona só com a memória (e recalcula quando expira).
 */
export async function cached<T>(key: string, ttlMs: number, compute: () => Promise<T>, force = false) {
  const now = Date.now();
  const m = mem.get(key);
  if (!force && m && now - m.at < ttlMs) return { data: m.data as T, updatedAt: new Date(m.at).toISOString(), source: 'memory' };

  const sb = supabaseAdmin();
  if (!force && sb) {
    const { data } = await sb.from('scanner_cache').select('data, updated_at').eq('key', key).maybeSingle();
    if (data && now - new Date(data.updated_at).getTime() < ttlMs) {
      mem.set(key, { data: data.data, at: new Date(data.updated_at).getTime() });
      return { data: data.data as T, updatedAt: data.updated_at as string, source: 'supabase' };
    }
  }

  // evita recomputar o mesmo scanner em paralelo
  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = compute().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  const data = await p;
  const at = Date.now();
  mem.set(key, { data, at });
  if (sb) await sb.from('scanner_cache').upsert({ key, data, updated_at: new Date(at).toISOString() });
  return { data, updatedAt: new Date(at).toISOString(), source: 'fresh' };
}
