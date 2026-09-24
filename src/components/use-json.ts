'use client';
import { useCallback, useEffect, useState } from 'react';

export function useJson<T>(url: string | null, refreshMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(url);
      const j = await r.json().catch(() => ({ error: 'Resposta inválida do servidor' }));
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
      setData(j as T);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    load();
    if (!refreshMs) return;
    const id = setInterval(load, refreshMs);
    return () => clearInterval(id);
  }, [load, refreshMs]);
  return { data, error, loading, reload: load };
}
