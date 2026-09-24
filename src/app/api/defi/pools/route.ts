import { NextRequest } from 'next/server';
import { getPools } from '@/lib/defi/llama';
import { fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get('kind') === 'token' ? 'token' : 'stable';
  try {
    const rows = await getPools(kind);
    return ok({ rows, updatedAt: new Date().toISOString() }, 300);
  } catch (e) {
    return fail(e);
  }
}
