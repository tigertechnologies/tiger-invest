import 'server-only';
import type { User } from '@supabase/supabase-js';
import { supabaseServer } from './supabase/server';
import { isAdminUser } from './admin-check';

/** Hierarquia dos planos: START < PRO < ALPHA. */
export const PLAN_RANK: Record<string, number> = { start: 1, pro: 2, alpha: 3 };
export const PLAN_LABEL: Record<number, string> = { 1: 'START', 2: 'PRO', 3: 'ALPHA' };

export type Access = {
  user: User | null;
  isAdmin: boolean;
  enforce: boolean;
  plan: string | null;
  rank: number;
  periodEnd: string | null;
};

/**
 * Quem é o visitante e qual plano ele tem.
 * Com ENFORCE_PLANS=false (padrão) todo mundo logado tem acesso total (rank 3).
 * Admin (ADMIN_EMAILS ou profiles.role='admin') e assinante manual (profiles.is_subscriber) sempre têm acesso total.
 */
export async function getAccess(): Promise<Access> {
  const enforce = process.env.ENFORCE_PLANS === 'true';
  const sb = supabaseServer();
  const base: Access = { user: null, isAdmin: false, enforce, plan: null, rank: enforce ? 0 : 3, periodEnd: null };
  if (!sb) return { ...base, rank: 3 };
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user) return base;
  const isAdmin = await isAdminUser(user);
  let plan: string | null = null;
  let periodEnd: string | null = null;
  try {
    const { data: sub } = await sb.from('subscriptions').select('plan_id,status,current_period_end').eq('user_id', user.id).maybeSingle();
    if (sub && sub.status === 'active' && new Date(sub.current_period_end).getTime() > Date.now()) {
      plan = sub.plan_id;
      periodEnd = sub.current_period_end;
    }
  } catch {}
  let manual = false;
  try {
    const { data: prof } = await sb.from('profiles').select('is_subscriber').eq('id', user.id).maybeSingle();
    manual = !!prof?.is_subscriber;
  } catch {}
  const rank = !enforce || isAdmin || manual ? 3 : PLAN_RANK[plan ?? ''] ?? 0;
  return { user, isAdmin, enforce, plan, rank, periodEnd };
}
