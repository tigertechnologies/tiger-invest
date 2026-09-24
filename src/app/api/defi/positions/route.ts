import { NextRequest } from 'next/server';
import { getAddress, isAddress } from 'viem';
import { CHAIN_KEYS, type ChainKey } from '@/lib/defi/chains';
import { getPositions } from '@/lib/defi/uniswap';
import { fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const query = (q.get('q') || '').trim();
  const chainParam = q.get('chain') as ChainKey | null;
  const entry = q.get('entry') ? Number(q.get('entry')) : undefined;
  try {
    if (/^\d+$/.test(query)) {
      const chains = chainParam && CHAIN_KEYS.includes(chainParam) ? [chainParam] : (['ethereum', 'base', 'arbitrum'] as ChainKey[]);
      const found = await Promise.all(chains.map((c) => getPositions(c, { tokenId: BigInt(query), entryPrice: entry }).catch(() => [])));
      return ok({ positions: found.flat() });
    }
    if (!isAddress(query)) return fail(new Error('Informe um endereço 0x... ou o ID numérico da posição.'), 400);
    const chains = chainParam && CHAIN_KEYS.includes(chainParam) ? [chainParam] : CHAIN_KEYS;
    const all = await Promise.all(chains.map((c) => getPositions(c, { owner: getAddress(query), entryPrice: entry }).catch(() => [])));
    return ok({ positions: all.flat() });
  } catch (e) {
    return fail(e);
  }
}
