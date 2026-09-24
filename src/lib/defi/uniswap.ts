import 'server-only';
import type { Address } from 'viem';
import { ALIASES, STABLES, getPrices } from '../market/binance';
import { CHAINS, client, erc20Abi, factoryAbi, npmAbi, poolAbi, type ChainKey } from './chains';

const MAX128 = (1n << 128n) - 1n;
const Q96 = 2 ** 96;

export type V3Position = {
  chain: ChainKey;
  chainLabel: string;
  tokenId: string;
  owner: string;
  pair: string;
  base: string; // token exibido como "base" (o volátil)
  quote: string;
  fee: number; // em %
  inRange: boolean;
  closed: boolean;
  price: number; // quote por base
  rangeMin: number;
  rangeMax: number;
  rangePosition: number; // 0-100 dentro da faixa (pode passar)
  amounts: { base: number; quote: number };
  valueUsd: number | null;
  fees: { base: number; quote: number; usd: number | null };
  il: { entryPrice: number; pct: number; hodlUsd: number | null; lpUsd: number | null };
  resultVsHodlUsd: number | null;
  link: string;
};

type Raw = {
  tokenId: bigint;
  token0: Address;
  token1: Address;
  fee: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
};

/** Quantidades (em unidades cruas) para liquidez L no preço sqrtP dentro de [sqrtA, sqrtB]. */
function amountsFor(L: number, sp: number, sa: number, sb: number) {
  if (sp <= sa) return { a0: L * (1 / sa - 1 / sb), a1: 0 };
  if (sp >= sb) return { a0: 0, a1: L * (sb - sa) };
  return { a0: L * (1 / sp - 1 / sb), a1: L * (sp - sa) };
}

const symbolKey = (s: string) => {
  const u = s.toUpperCase();
  return ALIASES[u] || u;
};

export async function getPositions(chain: ChainKey, opts: { owner?: Address; tokenId?: bigint; entryPrice?: number }) {
  const def = CHAINS[chain];
  const pc = client(chain);
  let ids: bigint[] = [];
  let owner = opts.owner;

  if (opts.tokenId != null) {
    ids = [opts.tokenId];
    owner = (await pc.readContract({ address: def.npm, abi: npmAbi, functionName: 'ownerOf', args: [opts.tokenId] })) as Address;
  } else if (owner) {
    const n = Number(await pc.readContract({ address: def.npm, abi: npmAbi, functionName: 'balanceOf', args: [owner] }));
    const count = Math.min(n, 40);
    const res = await pc.multicall({
      contracts: Array.from({ length: count }, (_, i) => ({
        address: def.npm,
        abi: npmAbi,
        functionName: 'tokenOfOwnerByIndex' as const,
        args: [owner!, BigInt(i)] as const,
      })),
    });
    ids = res.filter((r) => r.status === 'success').map((r) => r.result as bigint);
  }
  if (!ids.length || !owner) return [];

  const posRes = await pc.multicall({
    contracts: ids.map((id) => ({ address: def.npm, abi: npmAbi, functionName: 'positions' as const, args: [id] as const })),
  });
  const raws: Raw[] = [];
  posRes.forEach((r, i) => {
    if (r.status !== 'success') return;
    const p = r.result as readonly [bigint, Address, Address, Address, number, number, number, bigint, bigint, bigint, bigint, bigint];
    raws.push({ tokenId: ids[i], token0: p[2], token1: p[3], fee: p[4], tickLower: p[5], tickUpper: p[6], liquidity: p[7] });
  });
  // posições zeradas só aparecem quando consultadas por ID
  const active = opts.tokenId != null ? raws : raws.filter((r) => r.liquidity > 0n);
  if (!active.length) return [];

  const tokens = Array.from(new Set(active.flatMap((r) => [r.token0, r.token1])));
  const meta = await pc.multicall({
    contracts: tokens.flatMap((t) => [
      { address: t, abi: erc20Abi, functionName: 'symbol' as const },
      { address: t, abi: erc20Abi, functionName: 'decimals' as const },
    ]),
  });
  const info = new Map<string, { symbol: string; decimals: number }>();
  tokens.forEach((t, i) => {
    info.set(t, {
      symbol: meta[i * 2].status === 'success' ? String(meta[i * 2].result) : t.slice(0, 6),
      decimals: meta[i * 2 + 1].status === 'success' ? Number(meta[i * 2 + 1].result) : 18,
    });
  });

  const poolAddrs = await pc.multicall({
    contracts: active.map((r) => ({ address: def.factory, abi: factoryAbi, functionName: 'getPool' as const, args: [r.token0, r.token1, r.fee] as const })),
  });
  const slots = await pc.multicall({
    contracts: poolAddrs.map((p) => ({ address: (p.result as Address) ?? def.factory, abi: poolAbi, functionName: 'slot0' as const })),
  });

  // taxas não coletadas: simulação de collect() como o dono
  const fees = await Promise.all(
    active.map(async (r) => {
      try {
        const { result } = await pc.simulateContract({
          address: def.npm,
          abi: npmAbi,
          functionName: 'collect',
          args: [{ tokenId: r.tokenId, recipient: owner!, amount0Max: MAX128, amount1Max: MAX128 }],
          account: owner!,
        });
        return result as readonly [bigint, bigint];
      } catch {
        return [0n, 0n] as const;
      }
    }),
  );

  const prices = await getPrices(tokens.map((t) => symbolKey(info.get(t)!.symbol))).catch(() => ({} as Record<string, number>));
  const usd = (sym: string) => prices[symbolKey(sym)] ?? (STABLES.has(symbolKey(sym)) ? 1 : undefined);

  const out: V3Position[] = [];
  active.forEach((r, i) => {
    const s = slots[i];
    if (s.status !== 'success') return;
    const slot = s.result as readonly [bigint, number, ...unknown[]];
    const t0 = info.get(r.token0)!;
    const t1 = info.get(r.token1)!;
    const sp = Number(slot[0]) / Q96;
    const sa = Math.sqrt(1.0001 ** r.tickLower);
    const sb = Math.sqrt(1.0001 ** r.tickUpper);
    const L = Number(r.liquidity);
    const scale = 10 ** (t0.decimals - t1.decimals);
    const rawP = sp * sp;
    // preço humano token1 por token0
    const p10 = rawP * scale;
    const lo10 = sa * sa * scale;
    const hi10 = sb * sb * scale;
    // orientação: base = token volátil (se token0 for stable, inverte)
    const invert = STABLES.has(symbolKey(t0.symbol)) && !STABLES.has(symbolKey(t1.symbol));
    const base = invert ? t1 : t0;
    const quote = invert ? t0 : t1;
    const price = invert ? 1 / p10 : p10;
    const rangeMin = invert ? 1 / hi10 : lo10;
    const rangeMax = invert ? 1 / lo10 : hi10;

    const am = amountsFor(L, sp, sa, sb);
    const a0 = am.a0 / 10 ** t0.decimals;
    const a1 = am.a1 / 10 ** t1.decimals;
    const f0 = Number(fees[i][0]) / 10 ** t0.decimals;
    const f1 = Number(fees[i][1]) / 10 ** t1.decimals;

    // perda impermanente vs HODL a partir do preço de entrada (padrão: centro geométrico da faixa)
    const entryHuman = opts.entryPrice && opts.entryPrice > 0 ? opts.entryPrice : Math.sqrt(rangeMin * rangeMax);
    const entry10 = invert ? 1 / entryHuman : entryHuman;
    const sEntry = Math.sqrt(entry10 / scale);
    const e = amountsFor(L, sEntry, sa, sb);
    const e0 = e.a0 / 10 ** t0.decimals;
    const e1 = e.a1 / 10 ** t1.decimals;
    const lpIn1 = a0 * p10 + a1;
    const hodlIn1 = e0 * p10 + e1;
    const ilPct = hodlIn1 > 0 ? (lpIn1 / hodlIn1 - 1) * 100 : 0;

    const u0 = usd(t0.symbol);
    const u1 = usd(t1.symbol);
    const valueUsd = u0 != null && u1 != null ? a0 * u0 + a1 * u1 : null;
    const feesUsd = u0 != null && u1 != null ? f0 * u0 + f1 * u1 : null;
    const hodlUsd = u0 != null && u1 != null ? e0 * u0 + e1 * u1 : null;

    out.push({
      chain,
      chainLabel: def.label,
      tokenId: r.tokenId.toString(),
      owner: owner!,
      pair: `${base.symbol}/${quote.symbol}`,
      base: base.symbol,
      quote: quote.symbol,
      fee: r.fee / 10000,
      inRange: sp >= sa && sp < sb,
      closed: r.liquidity === 0n,
      price,
      rangeMin,
      rangeMax,
      rangePosition: rangeMax > rangeMin ? ((price - rangeMin) / (rangeMax - rangeMin)) * 100 : 0,
      amounts: invert ? { base: a1, quote: a0 } : { base: a0, quote: a1 },
      valueUsd,
      fees: { ...(invert ? { base: f1, quote: f0 } : { base: f0, quote: f1 }), usd: feesUsd },
      il: { entryPrice: entryHuman, pct: ilPct, hodlUsd, lpUsd: valueUsd },
      resultVsHodlUsd: valueUsd != null && hodlUsd != null && feesUsd != null ? valueUsd + feesUsd - hodlUsd : null,
      link: chain === 'bsc' ? `https://app.uniswap.org/positions/v3/bnb/${r.tokenId}` : `https://app.uniswap.org/positions/v3/${chain === 'ethereum' ? 'ethereum' : chain}/${r.tokenId}`,
    });
  });
  return out;
}
