'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, CheckCircle2, Clock, GraduationCap, Lock, PlayCircle, Target, Timer, X } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useApp } from '@/components/providers';
import { Breadcrumb, Empty, Hero, Spinner, cx } from '@/components/ui';

type Tut = { id: string; title: string; description: string | null; category: string; difficulty: string; duration_min: number; thumbnail_url: string | null; premium: boolean; video_url: string | null };
type Prog = { tutorial_id: string; completed: boolean; watched_minutes: number };

const diffChip: Record<string, string> = { Iniciante: 'chip-up', Intermediário: 'chip-warn', Avançado: 'chip-down' };

export function embedUrl(url: string) {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return { kind: 'iframe' as const, src: `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0` };
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return { kind: 'iframe' as const, src: `https://player.vimeo.com/video/${vm[1]}` };
  return { kind: 'video' as const, src: url };
}

export function TutorialsView() {
  const { user } = useApp();
  const sb = supabaseBrowser();
  const [tuts, setTuts] = useState<Tut[] | null>(null);
  const [prog, setProg] = useState<Record<string, Prog>>({});
  const [cat, setCat] = useState('Todas');
  const [diff, setDiff] = useState('Todas');
  const [open, setOpen] = useState<Tut | null>(null);

  const load = useCallback(async () => {
    if (!sb) return setTuts([]);
    const { data } = await sb.from('tutorials_public').select('*').order('sort');
    setTuts((data as Tut[]) ?? []);
    if (user) {
      const { data: p } = await sb.from('tutorial_progress').select('tutorial_id, completed, watched_minutes').eq('user_id', user.id);
      setProg(Object.fromEntries(((p as Prog[]) ?? []).map((x) => [x.tutorial_id, x])));
    }
  }, [sb, user]);
  useEffect(() => {
    load();
  }, [load]);

  const cats = useMemo(() => ['Todas', ...Array.from(new Set((tuts ?? []).map((t) => t.category)))], [tuts]);
  const shown = (tuts ?? []).filter((t) => (cat === 'Todas' || t.category === cat) && (diff === 'Todas' || t.difficulty === diff));
  const done = Object.values(prog).filter((p) => p.completed).length;
  const minutes = Object.values(prog).reduce((a, p) => a + p.watched_minutes, 0);
  const rate = tuts?.length ? Math.round((done / tuts.length) * 100) : 0;

  const complete = async (t: Tut) => {
    if (!sb || !user) return;
    const row = { user_id: user.id, tutorial_id: t.id, completed: true, watched_minutes: t.duration_min, updated_at: new Date().toISOString() };
    await sb.from('tutorial_progress').upsert(row);
    setProg((p) => ({ ...p, [t.id]: row }));
  };

  return (
    <>
      <Breadcrumb items={[{ label: 'Tutoriais' }]} />
      <Hero
        badge={<><GraduationCap className="h-3.5 w-3.5" /> Central de aprendizado</>}
        title="Aprenda a usar o Tiger Labs"
        subtitle="Vídeos curtos sobre a plataforma, análise técnica, estratégias e DeFi."
        kpis={[
          { icon: <CheckCircle2 className="h-5 w-5" />, value: done, label: 'Concluídos' },
          { icon: <Target className="h-5 w-5" />, value: `${rate}%`, label: 'Taxa de conclusão' },
          { icon: <Timer className="h-5 w-5" />, value: minutes, label: 'Minutos assistidos' },
          { icon: <BookOpen className="h-5 w-5" />, value: tuts?.length ?? '—', label: 'Tutoriais disponíveis' },
        ]}
      >
        <Link href="/indicators" className="btn-neon"><BookOpen className="h-4 w-4" /> Guia de indicadores técnicos</Link>
      </Hero>
      {!user && sb && <p className="mb-4 text-sm text-muted"><Link href="/login?next=/tutorials" className="text-neon underline">Entre</Link> para salvar seu progresso.</p>}
      <div className="mb-5 flex flex-wrap gap-3">
        <select className="input w-48" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoria">{cats.map((c) => <option key={c}>{c}</option>)}</select>
        <select className="input w-48" value={diff} onChange={(e) => setDiff(e.target.value)} aria-label="Dificuldade">{['Todas', 'Iniciante', 'Intermediário', 'Avançado'].map((c) => <option key={c}>{c}</option>)}</select>
      </div>
      {tuts == null ? (
        <div className="grid h-40 place-items-center"><Spinner /></div>
      ) : shown.length === 0 ? (
        <Empty>{sb ? 'Nenhum tutorial neste filtro.' : 'Conecte o Supabase para cadastrar tutoriais.'}</Empty>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((t) => {
            const locked = t.premium && !t.video_url;
            const completed = prog[t.id]?.completed;
            return (
              <button key={t.id} onClick={() => setOpen(t)} className="card group overflow-hidden text-left transition hover:border-neon/60">
                <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-neon/25 via-card-2 to-bg">
                  {t.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.thumbnail_url} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                  ) : (
                    <div className="grid h-full place-items-center p-6 text-center font-display text-xl font-bold text-fg/90">{t.title}</div>
                  )}
                  <div className="absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/30">
                    <PlayCircle className="h-12 w-12 text-white opacity-0 drop-shadow transition group-hover:opacity-100" />
                  </div>
                  {locked && <span className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-xl bg-warn text-black"><Lock className="h-4 w-4" /></span>}
                  {completed && <span className="absolute left-3 top-3 chip-up bg-bg/80">Concluído</span>}
                </div>
                <div className="p-5">
                  <h3 className="font-display text-lg font-semibold">{t.title}</h3>
                  {t.description && <p className="mt-1 text-sm text-muted">{t.description}</p>}
                  <div className="mt-3 flex items-center gap-3 text-xs"><span className={diffChip[t.difficulty] ?? 'chip-muted'}>{t.difficulty}</span><span className="flex items-center gap-1 text-muted"><Clock className="h-3.5 w-3.5" /> {t.duration_min} min</span><span className="text-muted">{t.category}</span></div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="tut-t">
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-line bg-card">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h2 id="tut-t" className="font-display font-semibold">{open.title}</h2>
              <button onClick={() => setOpen(null)} className="rounded-full border border-neon/40 p-1.5 text-neon" aria-label="Fechar"><X className="h-4 w-4" /></button>
            </div>
            {open.video_url ? (
              (() => {
                const e = embedUrl(open.video_url);
                return e.kind === 'iframe' ? (
                  <iframe src={e.src} className="aspect-video w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowFullScreen title={open.title} />
                ) : (
                  <video src={e.src} controls className="aspect-video w-full bg-black" />
                );
              })()
            ) : (
              <div className="grid aspect-video place-items-center p-8 text-center">
                <div>
                  <Lock className="mx-auto h-10 w-10 text-warn" />
                  <p className="mt-3 font-semibold">{open.premium ? 'Conteúdo exclusivo para assinantes' : 'Vídeo em breve'}</p>
                  {open.premium && <Link href="/join" className="btn-neon mt-4">Quero ser assinante</Link>}
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <p className="text-sm text-muted">{open.description}</p>
              {open.video_url && user && (
                <button onClick={() => complete(open)} disabled={prog[open.id]?.completed} className={cx('btn-neon', prog[open.id]?.completed && 'opacity-60')}>
                  <CheckCircle2 className="h-4 w-4" /> {prog[open.id]?.completed ? 'Concluído' : 'Marcar como concluído'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
