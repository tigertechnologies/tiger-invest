'use client';
import { ExternalLink } from 'lucide-react';
import type { V3Position } from '@/lib/defi/uniswap';
import { fmtNum, fmtPct, fmtPrice } from '@/lib/format';
import { RangeBar } from './range-bar';
import { TokenIcon, cx } from './ui';

const usd = (x: number | null | undefined) => fmtPrice(x ?? null);

export function V3PositionCard({ p }: { p: V3Position }) {
  const status = p.closed ? null : p.inRange ? 'dentro' : p.price < p.rangeMin ? 'abaixo' : 'acima';
  return (
    <div className={cx('card p-5', p.inRange && !p.closed ? 'border-up/40' : 'border-down/40')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2"><TokenIcon symbol={p.base} size={26} /><TokenIcon symbol={p.quote} size={26} /></div>
          <div>
            <div className="font-display font-bold">{p.pair} <span className="text-xs font-normal text-muted">{fmtNum(p.fee, 2)}%</span></div>
            <div className="text-xs text-muted">{p.chainLabel} · ID #{p.tokenId}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {p.closed ? <span className="chip-muted">Encerrada</span> : p.inRange ? <span className="chip-up">Dentro da faixa</span> : <span className="chip-down">Fora da faixa</span>}
          <a href={p.link} target="_blank" rel="noreferrer" className="text-muted hover:text-neon" aria-label="Abrir na Uniswap"><ExternalLink className="h-4 w-4" /></a>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 font-mono text-xs">
        {fmtPrice(p.rangeMin, '')}<RangeBar position={p.rangePosition} status={status} />{fmtPrice(p.rangeMax, '')}
      </div>
      <div className="mt-1 text-xs text-muted">Preço atual: <b className="text-fg">{fmtPrice(p.price, '')}</b> {p.quote} por {p.base}</div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div className="card-2 p-3"><div className="text-xs text-muted">Valor na pool</div><b>{usd(p.valueUsd)}</b><div className="text-xs text-muted">{fmtNum(p.amounts.base, 4)} {p.base} + {fmtNum(p.amounts.quote, 2)} {p.quote}</div></div>
        <div className="card-2 p-3"><div className="text-xs text-muted">Taxas a coletar</div><b className="text-up">{usd(p.fees.usd)}</b><div className="text-xs text-muted">{fmtNum(p.fees.base, 5)} {p.base} + {fmtNum(p.fees.quote, 4)} {p.quote}</div></div>
        <div className="card-2 p-3"><div className="text-xs text-muted">Perda impermanente</div><b className={p.il.pct < 0 ? 'text-down' : 'text-up'}>{fmtPct(p.il.pct)}</b><div className="text-xs text-muted">vs. HODL desde {fmtPrice(p.il.entryPrice, '')}</div></div>
        <div className="card-2 p-3"><div className="text-xs text-muted">Resultado vs. HODL</div><b className={(p.resultVsHodlUsd ?? 0) >= 0 ? 'text-up' : 'text-down'}>{usd(p.resultVsHodlUsd)}</b><div className="text-xs text-muted">taxas + IL</div></div>
      </div>
    </div>
  );
}
