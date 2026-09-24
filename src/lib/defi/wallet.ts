import 'server-only';
import { formatUnits, type Address } from 'viem';
import { ALIASES, getPrices } from '../market/binance';
import { CHAINS, CHAIN_KEYS, aavePoolAbi, client, erc20Abi, type ChainKey } from './chains';
import { getPositions, type V3Position } from './uniswap';

export type WalletChain = {
  chain: ChainKey;
  label: string;
  explorer: string;
  balances: { symbol: string; amount: number; usd: number | null }[];
  aave: { collateralUsd: number; debtUsd: number; availableUsd: number; healthFactor: number | null; ltv: number } | null;
  positions: V3Position[];
  totalUsd: number;
  error?: string;
};

const key = (s: string) => ALIASES[s.toUpperCase()] || s.toUpperCase();

async function scanChain(chain: ChainKey, address: Address): Promise<Omit<WalletChain, 'totalUsd'> & { raw: { symbol: string; amount: number }[] }> {
  const def = CHAINS[chain];
  const pc = client(chain);
  const [native, tokenRes, aaveRes, positions] = await Promise.all([
    pc.getBalance({ address }),
    pc.multicall({
      contracts: def.tokens.flatMap((t) => [
        { address: t.address, abi: erc20Abi, functionName: 'balanceOf' as const, args: [address] as const },
        { address: t.address, abi: erc20Abi, functionName: 'decimals' as const },
      ]),
    }),
    def.aavePool
      ? pc.readContract({ address: def.aavePool, abi: aavePoolAbi, functionName: 'getUserAccountData', args: [address] }).catch(() => null)
      : Promise.resolve(null),
    getPositions(chain, { owner: address }).catch(() => [] as V3Position[]),
  ]);
  const raw: { symbol: string; amount: number }[] = [];
  const n = +formatUnits(native, 18);
  if (n > 0) raw.push({ symbol: def.native, amount: n });
  def.tokens.forEach((t, i) => {
    const b = tokenRes[i * 2];
    const d = tokenRes[i * 2 + 1];
    if (b.status === 'success' && d.status === 'success' && (b.result as bigint) > 0n) {
      raw.push({ symbol: t.symbol, amount: +formatUnits(b.result as bigint, Number(d.result)) });
    }
  });
  let aave: WalletChain['aave'] = null;
  if (aaveRes) {
    const [col, debt, avail, , ltv, hf] = aaveRes as readonly bigint[];
    if (col > 0n || debt > 0n) {
      aave = {
        collateralUsd: +formatUnits(col, 8),
        debtUsd: +formatUnits(debt, 8),
        availableUsd: +formatUnits(avail, 8),
        healthFactor: debt > 0n ? +formatUnits(hf, 18) : null,
        ltv: Number(ltv) / 100,
      };
    }
  }
  return { chain, label: def.label, explorer: def.explorer, balances: [], aave, positions, raw };
}

export async function scanWallet(address: Address) {
  const settled = await Promise.allSettled(CHAIN_KEYS.map((c) => scanChain(c, address)));
  const symbols = new Set<string>();
  settled.forEach((s) => s.status === 'fulfilled' && s.value.raw.forEach((b) => symbols.add(key(b.symbol))));
  const prices = await getPrices(Array.from(symbols)).catch(() => ({} as Record<string, number>));
  const chains: WalletChain[] = settled.map((s, i) => {
    const c = CHAIN_KEYS[i];
    if (s.status === 'rejected') {
      return { chain: c, label: CHAINS[c].label, explorer: CHAINS[c].explorer, balances: [], aave: null, positions: [], totalUsd: 0, error: 'RPC indisponível no momento' };
    }
    const v = s.value;
    const balances = v.raw
      .map((b) => ({ symbol: b.symbol, amount: b.amount, usd: prices[key(b.symbol)] != null ? b.amount * prices[key(b.symbol)] : null }))
      .filter((b) => b.usd == null || b.usd >= 0.01)
      .sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0));
    const lp = v.positions.reduce((a, p) => a + (p.valueUsd ?? 0) + (p.fees.usd ?? 0), 0);
    const aaveNet = v.aave ? v.aave.collateralUsd - v.aave.debtUsd : 0;
    const totalUsd = balances.reduce((a, b) => a + (b.usd ?? 0), 0) + lp + aaveNet;
    return { chain: c, label: v.label, explorer: v.explorer, balances, aave: v.aave, positions: v.positions, totalUsd };
  });
  return {
    address,
    totalUsd: chains.reduce((a, c) => a + c.totalUsd, 0),
    chains: chains.sort((a, b) => b.totalUsd - a.totalUsd),
    updatedAt: new Date().toISOString(),
  };
}
