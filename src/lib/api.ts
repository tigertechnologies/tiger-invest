import { NextResponse } from 'next/server';

export const ok = (data: unknown, maxAge = 0) =>
  NextResponse.json(data, {
    headers: maxAge ? { 'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 4}` } : {},
  });

export const fail = (e: unknown, status = 500) =>
  NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });

export const cleanSymbol = (s: string | null) =>
  (s || 'BTC').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/USDT$/, '').slice(0, 15) || 'BTC';
