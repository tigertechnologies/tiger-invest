import { NextRequest } from 'next/server';
import { isAddress, getAddress } from 'viem';
import { scanWallet } from '@/lib/defi/wallet';
import { fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

export async function GET(req: NextRequest) {
  const a = (req.nextUrl.searchParams.get('address') || '').trim();
  if (!isAddress(a)) return fail(new Error('Endereço inválido. Use um endereço EVM (0x...).'), 400);
  try {
    return ok(await scanWallet(getAddress(a)), 60);
  } catch (e) {
    return fail(e);
  }
}
