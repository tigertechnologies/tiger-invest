import { supabaseServer } from '@/lib/supabase/server';
import { PLANS, rowToPlan, type Plan } from '@/lib/invest/plans';
import { getAccess } from '@/lib/access';
import { PlanosView } from './view';

export const metadata = { title: 'Planos' };
export const dynamic = 'force-dynamic';

async function loadPlans(): Promise<Plan[]> {
  try {
    const sb = supabaseServer();
    if (!sb) return PLANS;
    const { data, error } = await sb.from('plans').select('*').eq('active', true).order('sort', { ascending: true });
    if (error || !data?.length) return PLANS;
    return data.map(rowToPlan);
  } catch {
    return PLANS;
  }
}

export default async function Page() {
  const [plans, access] = await Promise.all([loadPlans(), getAccess()]);
  return <PlanosView plans={plans} current={access.plan} periodEnd={access.periodEnd} logged={!!access.user} />;
}
