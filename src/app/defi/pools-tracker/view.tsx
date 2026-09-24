'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Layers, Pin, Search } from 'lucide-react';
import type { V3Position } from '@/lib/defi/uniswap';
import { fmtPct, fmtPrice } from '@/lib/format';
import { BrainLoader, Breadcrumb, Empty, ErrorBox, Hero } from '@/components/ui';
import { useJson } from '@/components/use-json';
import { PinnedList, usePinned } from '@/components/pinned-wallets';
import { V3PositionCard } from '@/components/v3-position-card';

const CHAINS = [
  ['', 'Todas as redes'],
  ['ethereum', 'Ethereum'],
  ['base', 'Base'],
  ['arbitrum', 'Arbitrum'],
  ['optimism', 'Optimism'],
  ['polygon', 'Polygon'],
  ['bsc', 'BNB Chain'],
];

export function PoolsTrackerView() {
  const router = useRouter();
  const sp = useSearchParams();
  const q = sp.get('q') || '';
  const chain = sp.get('chain') || '';
  const entry = sp.get('entry') || '';
  const [input, setInput] = useState(q);
  const [ch, setCh] = useState(chain);
  const [en, setEn] = useState(entry);
  const url = q ? `/api/defi/positions?q=${encodeURIComponent(q)}${chain ? `&chain=${chain}` : ''}${entry ? `&entry=${entry}` : ''}` : null;
  const { data, error, loading, reload } = useJson<{ positions: V3Position[] }>(url);
  const { list, pin, unpin } = usePinned();
  const go = (value = input, c = ch, e = en) => {
    const p = new URLSearchParams({ q: value.trim() });
    if (c) p.set('chain', c);
    if (e) p.set('entry', e);
    router.replace(`/defi/pools-tracker?${p}`, { scroll: false });
  };
  const pos = data?.positions ?? [];
  const total = pos.reduce((a, p) => a + (p.valueUsd ?? 0), 0);
  const fees = pos.reduce((a, p) => a + (p.fees.usd ?? 0), 0);
  const inRange = pos.filter((p) => p.inRange && !p.closed).length;

  return (
    <>
      <Breadcrumb items={[{ label: 'DeFi' }, { href: '/defi/wallet-tracker', label: 'Rastreador de Carteiras' }, { label: 'Análise de Pools' }]} />
      <Hero badge={<><Layers className="h-3.5 w-3.5" /> Uniswap V3</>} title="Análise de Pools" subtitle="Informe um endereço ou o ID de uma posição Uniswap V3 para ver faixa, taxas a coletar, perda impermanente e resultado contra HODL.">
        <form onSubmit={(e) => { e.preventDefault(); if (input.trim()) go(); }} className="grid gap-2 md:grid-cols-[1fr_170px_170px_auto_auto]">
          <input className="input font-mono" placeholder="0x... ou ID da posição" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Endereço ou ID" />
          <select className="input" value={ch} onChange={(e) => setCh(e.target.value)} aria-label="Rede">{CHAINS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <input className="input" type="number" step="any" min="0" placeholder="Preço de entrada (opc.)" value={en} onChange={(e) => setEn(e.target.value)} aria-label="Preço de entrada" />
          <button type="button" className="btn-ghost" onClick={() => /^0x/i.test(input.trim()) && pin(input.trim())}><Pin className="h-4 w-4" /> Fixar</button>
          <button className="btn-neon"><Search className="h-4 w-4" /> Analisar</button>
        </form>
        <PinnedList list={list} onPick={(a) => { setInput(a); go(a); }} onUnpin={unpin} />
      </Hero>
      {!q ? (
        <Empty>Digite um endereço de carteira ou o número de uma posição (NFT) Uniswap V3. Sem o preço de entrada, a perda impermanente é estimada a partir do centro da faixa.</Empty>
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !data || loading ? (
        <BrainLoader title="Lendo posições on-chain" />
      ) : pos.length === 0 ? (
        <Empty>Nenhuma posição ativa encontrada{chain ? ' nesta rede' : ''}.</Empty>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="card p-4"><div className="text-xs text-muted">Posições</div><div className="font-display text-2xl font-bold">{pos.length}</div></div>
            <div className="card p-4"><div className="text-xs text-muted">Dentro da faixa</div><div className="font-display text-2xl font-bold text-up">{inRange}/{pos.length}</div></div>
            <div className="card p-4"><div className="text-xs text-muted">Valor total</div><div className="font-display text-2xl font-bold">{fmtPrice(total)}</div></div>
            <div className="card p-4"><div className="text-xs text-muted">Taxas a coletar</div><div className="font-display text-2xl font-bold text-up">{fmtPrice(fees)}</div><div className="text-xs text-muted">{total ? fmtPct((fees / total) * 100) : '—'} do valor</div></div>
          </div>
          <div className="space-y-4">{pos.map((p) => <V3PositionCard key={`${p.chain}-${p.tokenId}`} p={p} />)}</div>
        </>
      )}
      <p className="mt-4 text-xs text-muted">Leitura direta dos contratos (NonfungiblePositionManager e pools da Uniswap V3). As taxas a coletar são obtidas simulando a coleta. A perda impermanente compara o valor na pool com manter os mesmos tokens desde o preço de entrada.</p>
    </>
  );
}
