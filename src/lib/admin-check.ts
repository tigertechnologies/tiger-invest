import 'server-only';
import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabase/admin';

const envAdmins = () =>
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/** Admin = e-mail em ADMIN_EMAILS **ou** profiles.role = 'admin'. */
export async function isAdminUser(user: Pick<User, 'id' | 'email'> | null | undefined): Promise<boolean> {
  if (!user) return false;
  if (envAdmins().includes((user.email || '').toLowerCase())) return true;
  const sb = supabaseAdmin();
  if (!sb) return false;
  const { data } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return data?.role === 'admin';
}
