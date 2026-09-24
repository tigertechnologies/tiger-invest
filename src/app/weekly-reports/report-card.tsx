'use client';
import { useState } from 'react';
import { Calendar, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { fmtDate } from '@/lib/format';
import { Markdown, plainText } from '@/components/markdown';
import { cx } from '@/components/ui';

export function ReportCard({ r, latest }: { r: { title: string; content_md: string; published_at: string | null; created_at: string }; latest: boolean }) {
  const [open, setOpen] = useState(latest);
  return (
    <article className={cx('card p-6', latest && 'border-neon/60 shadow-neon')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">{r.title}</h2>
          <div className="mt-1 flex items-center gap-1 text-xs text-muted"><Calendar className="h-3.5 w-3.5" /> Publicado em {fmtDate(r.published_at || r.created_at, true)}</div>
        </div>
        {latest && <span className="chip-up"><Sparkles className="h-3 w-3" /> Mais recente</span>}
      </div>
      <div className="mt-4">{open ? <Markdown>{r.content_md}</Markdown> : <p className="text-sm text-fg/80">{plainText(r.content_md)}</p>}</div>
      <button onClick={() => setOpen(!open)} className="btn-ghost mt-4">
        {open ? <>Mostrar menos <ChevronUp className="h-4 w-4" /></> : <>Ler mais <ChevronDown className="h-4 w-4" /></>}
      </button>
    </article>
  );
}
