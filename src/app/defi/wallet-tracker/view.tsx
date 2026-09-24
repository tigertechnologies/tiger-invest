'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Activity, Coins, ExternalLink, Landmark, Layers, Pin, Search, Wallet } from 'lucide-react';
import type { WalletChain } from '@/lib/defi/wallet';
import { fmtNum, fmtPrice, fmtTime, shortAddr } from '@/lib/format';
import { BrainLoader, Breadcrumb, Empty, ErrorBox, Hero, TokenIcon, cx } from '@/components/ui';
import { useJson } from '@/components/use-json';
import { PinnedList, usePinned } from '@/components/pinned-wallets';
import { V3PositionCard } from '@/components/v3-position-card';

type Resp = { address: string; totalUsd: number; chains: WalletChain[]; updatedAt: string };

export function WalletView() {
  const router = useRouter();
  const addr = useSearchParams().get('address') || '';
  const [input, setInput] = useState(addr);
  const { data, error, loading, reload } = useJson<Resp>(addr ? `/api/defi/wallet?address=${addr}` : null);
  const { list, pin, unpin } = usePinned();
  const go = (a: string) => {
    setInput(a);
    router.replace(`/defi/wallet-tracker?address=${a.trim()}`, { scroll: false });
  };

  const chains = data?.chains.filter((c) => c.totalUsd > 0.01 || c.aave || c.positions.length) ?? [];
  const lpCount = chains.reduce((a, c) => a + c.positions.length, 0);
  const aaveDebt = chains.reduce((a, c) => a + (c.aave?.debtUsd ?? 0), 0);

  return (
    <>
      <Breadcrumb items={[{ label: 'DeFi' }, { label: 'Rastreador de Carteiras' }]} />
      <Hero badge={<><Wallet className="h-3.5 w-3.5" /> Multichain</>} title="Rastreador de Carteiras" subtitle="Saldos, empréstimos na Aave e posições Uniswap V3 em Ethereum, Base, Arbitrum, Optimism, Polygon e BNB Chain, lidos direto da blockchain.">
        <form onSubmit={(e) => { e.preventDefault(); if (input.trim()) go(input.trim()); }} className="flex flex-col gap-2 sm:flex-row">
          <input className="input font-mono" placeholder="0x..." value={input} onChange={(e) => setInput(e.target.value)} aria-label="Endereço da carteira" />
          <button type="button" className="btn-ghost" onClick={() => input.trim() && pin(input.trim())} title="Fixar carteira"><Pin className="h-4 w-4" /> Fixar</button>
          <button className="btn-neon"><Search className="h-4 w-4" /> Rastrear</button>
        </form>
        <PinnedList list={list} onPick={go} onUnpin={unpin} />
      </Hero>

      {!addr ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { href: '/defi/pools-tracker', icon: <Layers className="h-5 w-5" />, t: 'Análise de Pools', d: 'Faixa, taxas e perda impermanente de posições Uniswap V3.' },
            { href: '/defi/stablecoin-pools', icon: <Coins className="h-5 w-5" />, t: 'Pools de Stablecoins', d: 'Os melhores rendimentos em dólar.' },
            { href: '/defi/dashboard', icon: <Activity className="h-5 w-5" />, t: 'Dashboard DeFi', d: 'Estratégia 1% e alocações sugeridas.' },
          ].map((c) => (
            <Link key={c.href} href={c.href} className="card p-5 hover:border-neon/60">
              <div className="mb-2 text-neon">{c.icon}</div>
              <div className="font-display font-semibold">{c.t}</div>
              <p className="text-sm text-muted">{c.d}</p>
            </Link>
          ))}
        </div>
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !data || loading ? (
        <BrainLoader title="Lendo a carteira em 6 redes" />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="card p-4"><div className="text-xs text-muted">Patrimônio líquido</div><div className="font-display text-2xl font-bold text-neon">{fmtPrice(data.totalUsd)}</div></div>
            <div className="card p-4"><div className="text-xs text-muted">Redes com saldo</div><div className="font-display text-2xl font-bold">{chains.length}</div></div>
            <div className="card p-4"><div className="text-xs text-muted">Posições de liquidez</div><div className="font-display text-2xl font-bold">{lpCount}</div></div>
            <div className="card p-4"><div className="text-xs text-muted">Dívida na Aave</div><div className="font-display text-2xl font-bold text-down">{fmtPrice(aaveDebt)}</div></div>
          </div>
          <p className="mb-4 text-xs text-muted">Carteira <span className="font-mono text-fg">{shortAddr(data.address)}</span> · atualizado {fmtTime(data.updatedAt)}</p>
          {chains.length === 0 ? (
            <Empty>Nenhum saldo encontrado nas redes e tokens monitorados.</Empty>
          ) : (
            <div className="space-y-6">
              {chains.map((c) => (
                <section key={c.chain} className="card p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-display text-lg font-semibold">{c.label}</h2>
                    <div className="flex items-center gap-3"><b>{fmtPrice(c.totalUsd)}</b><a href={`${c.explorer}/address/${data.address}`} target="_blank" rel="noreferrer" className="text-muted hover:text-neon" aria-label="Explorer"><ExternalLink className="h-4 w-4" /></a></div>
                  </div>
                  {c.balances.length > 0 && (
                    <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {c.balances.map((b) => (
                        <div key={b.symbol} className="card-2 flex items-center gap-3 px-3 py-2">
                          <TokenIcon symbol={b.symbol} size={24} />
                          <div className="flex-1"><div className="text-sm font-semibold">{b.symbol}</div><div className="text-xs text-muted">{fmtNum(b.amount, 6)}</div></div>
                          <b className="text-sm">{fmtPrice(b.usd)}</b>
                        </div>
                      ))}
                    </div>
                  )}
                  {c.aave && (
                    <div className="mb-4 rounded-xl border border-violet/40 bg-violet/5 p-4">
                      <div className="mb-2 flex items-center gap-2 font-semibold"><Landmark className="h-4 w-4 text-violet" /> Aave V3</div>
                      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                        <div><div className="text-xs text-muted">Garantia</div><b>{fmtPrice(c.aave.collateralUsd)}</b></div>
                        <div><div className="text-xs text-muted">Dívida</div><b className="text-down">{fmtPrice(c.aave.debtUsd)}</b></div>
                        <div><div className="text-xs text-muted">Disponível p/ empréstimo</div><b>{fmtPrice(c.aave.availableUsd)}</b></div>
                        <div>
                          <div className="text-xs text-muted">Health Factor</div>
                          <b className={cx(c.aave.healthFactor == null ? 'text-up' : c.aave.healthFactor < 1.5 ? 'text-down' : c.aave.healthFactor < 2 ? 'text-warn' : 'text-up')}>
                            {c.aave.healthFactor == null ? '∞' : fmtNum(c.aave.healthFactor, 2)}
                          </b>
                          {c.aave.healthFactor != null && c.aave.healthFactor < 1.5 && <div className="text-xs text-down">Abaixo de 1,5: risco de liquidação</div>}
                        </div>
                      </div>
                    </div>
                  )}
                  {c.positions.length > 0 && <div className="space-y-3">{c.positions.map((p) => <V3PositionCard key={p.tokenId} p={p} />)}</div>}
                  {c.error && <p className="text-sm text-warn">{c.error}</p>}
                </section>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-muted">Tokens monitorados por rede: nativo, stablecoins principais, WETH, WBTC/cbBTC e alguns tokens de governança. Posições em outros protocolos (Morpho, Aerodrome, etc.) ainda não aparecem.</p>
        </>
      )}
    </>
  );
}
