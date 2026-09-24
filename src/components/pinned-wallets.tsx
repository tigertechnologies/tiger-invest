'use client';
import { useCallback, useEffect, useState } from 'react';
import { Pin, X } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { shortAddr } from '@/lib/format';
import { useApp } from './providers';

type W = { id: string; address: string; label: string | null };

/** Carteiras fixadas do usuário (Supabase) — com fallback no navegador para visitantes. */
export function usePinned() {
  const { user } = useApp();
  const sb = supabaseBrowser();
  const [list, setList] = useState<W[]>([]);
  const load = useCallback(async () => {
    if (sb && user) {
      const { data } = await sb.from('pinned_wallets').select('id, address, label').order('created_at');
      setList((data as W[]) ?? []);
    } else {
      try {
        setList(JSON.parse(localStorage.getItem('tl-pins') || '[]'));
      } catch {
        setList([]);
      }
    }
  }, [sb, user]);
  useEffect(() => {
    load();
  }, [load]);
  const save = (l: W[]) => {
    setList(l);
    try {
      localStorage.setItem('tl-pins', JSON.stringify(l));
    } catch {
      /* ignore */
    }
  };
  const pin = async (address: string) => {
    if (list.some((w) => w.address.toLowerCase() === address.toLowerCase())) return;
    if (sb && user) {
      await sb.from('pinned_wallets').insert({ user_id: user.id, address });
      load();
    } else save([...list, { id: address, address, label: null }]);
  };
  const unpin = async (w: W) => {
    if (sb && user) {
      await sb.from('pinned_wallets').delete().eq('id', w.id);
      load();
    } else save(list.filter((x) => x.id !== w.id));
  };
  return { list, pin, unpin };
}

export function PinnedList({ list, onPick, onUnpin }: { list: W[]; onPick: (a: string) => void; onUnpin: (w: W) => void }) {
  if (!list.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {list.map((w) => (
        <span key={w.id} className="inline-flex items-center gap-1 rounded-full border border-neon/40 bg-bg/40 px-3 py-1 text-xs">
          <Pin className="h-3 w-3 text-neon" />
          <button onClick={() => onPick(w.address)} className="font-mono hover:text-neon">{w.label || shortAddr(w.address)}</button>
          <button onClick={() => onUnpin(w)} aria-label="Remover" className="text-muted hover:text-down"><X className="h-3 w-3" /></button>
        </span>
      ))}
    </div>
  );
}
