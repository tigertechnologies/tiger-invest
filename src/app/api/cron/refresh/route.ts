import { NextRequest } from 'next/server';
import { cached } from '@/lib/cache';
import { scanMarket, scanPositions } from '@/lib/market/scanners';
import { fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Chamado pela Vercel Cron (diário) e/ou pelo pg_cron do Supabase (a cada 15 min). */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const qs = req.nextUrl.searchParams.get('secret');
  if (secret && auth !== `Bearer ${secret}` && qs !== secret) return fail(new Error('Não autorizado'), 401);
  const job = req.nextUrl.searchParams.get('job') || 'market';
  try {
    const t = Date.now();
    if (job === 'positions') {
      const r = await cached('scan:positions', 0, scanPositions, true);
      return ok({ job, rows: (r.data as unknown[]).length, ms: Date.now() - t });
    }
    const r = await cached('scan:market', 0, scanMarket, true);
    return ok({ job, rows: (r.data as unknown[]).length, ms: Date.now() - t });
  } catch (e) {
    return fail(e);
  }
}
