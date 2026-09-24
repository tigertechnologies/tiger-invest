'use client';
import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { DEFI_DEFAULT, type DefiDashboard } from '@/lib/defi/dashboard';
import { FOOTER_DEFAULT, type FooterSettings } from '@/lib/supabase/public';
import { Spinner } from '@/components/ui';

const pctToText = (l: { name: string; pct: number }[]) => l.map((x) => `${x.name}: ${x.pct}`).join('\n');
const textToPct = (t: string) =>
  t.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, pct] = l.split(':');
    return { name: name.trim(), pct: Number(pct) || 0 };
  });
const lines = (t: string) => t.split('\n').map((l) => l.trim()).filter(Boolean);

export default function Page() {
  const sb = supabaseBrowser();
  const [defi, setDefi] = useState<DefiDashboard | null>(null);
  const [footer, setFooter] = useState<FooterSettings | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [text, setText] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!sb) return;
    sb.from('site_settings').select('key, value').then(({ data }) => {
      const m = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
      const d = { ...DEFI_DEFAULT, ...(m.defi_dashboard ?? {}) } as DefiDashboard;
      setDefi(d);
      setFooter({ ...FOOTER_DEFAULT, ...(m.footer ?? {}) });
      setText({
        platforms: pctToText(d.platforms),
        collateral_allocation: pctToText(d.collateral_allocation),
        profiles: pctToText(d.profiles),
        collateral_assets: d.collateral_assets.join('\n'),
        borrow_assets: d.borrow_assets.join('\n'),
        benefits: d.benefits.join('\n'),
        rules: d.rules.join('\n'),
        monitored: d.monitored.join('\n'),
      });
    });
  }, [sb]);

  const save = async (key: string, value: unknown) => {
    if (!sb) return;
    const { error } = await sb.from('site_settings').upsert({ key, value, updated_at: new Date().toISOString() });
    setMsg(error ? `Erro: ${error.message}` : 'Salvo! As páginas públicas atualizam em até 2 minutos.');
  };

  if (!defi || !footer) return <Spinner />;
  const T = (k: string, label: string, help: string) => (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>
      <textarea className="input min-h-[96px] font-mono" value={text[k]} onChange={(e) => setText({ ...text, [k]: e.target.value })} />
      <span className="text-xs text-muted">{help}</span>
    </label>
  );

  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl font-bold">DeFi e rodapé</h1>
      {msg && <p className="rounded-xl border border-neon/40 bg-neon/10 px-3 py-2 text-sm">{msg}</p>}
      <section className="card space-y-4 p-5">
        <h2 className="font-display text-lg font-semibold">Dashboard DeFi (Estratégia 1%)</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs font-semibold text-muted">Data de atualização</span><input type="date" className="input" value={defi.updated_at} onChange={(e) => setDefi({ ...defi, updated_at: e.target.value })} /></label>
          <div />
          {T('platforms', 'Divisão entre plataformas', 'Uma por linha: Nome: percentual')}
          {T('collateral_allocation', 'Alocação das garantias', 'Uma por linha: Ativo: percentual')}
          {T('profiles', 'Pools por perfil', 'Uma por linha: Perfil: percentual')}
          {T('collateral_assets', 'Ativos de garantia', 'Um por linha')}
          {T('borrow_assets', 'Ativos para empréstimo', 'Um por linha')}
          {T('monitored', 'Ativos monitorados', 'Um por linha')}
          {T('benefits', 'Benefícios', 'Um por linha')}
          {T('rules', 'Regras (bloco Importante)', 'Uma por linha')}
        </div>
        <label className="block"><span className="mb-1 block text-xs font-semibold text-muted">Visão geral</span><textarea className="input min-h-[100px]" value={defi.overview} onChange={(e) => setDefi({ ...defi, overview: e.target.value })} /></label>
        <button
          className="btn-neon"
          onClick={() =>
            save('defi_dashboard', {
              ...defi,
              platforms: textToPct(text.platforms),
              collateral_allocation: textToPct(text.collateral_allocation),
              profiles: textToPct(text.profiles),
              collateral_assets: lines(text.collateral_assets),
              borrow_assets: lines(text.borrow_assets),
              benefits: lines(text.benefits),
              rules: lines(text.rules),
              monitored: lines(text.monitored),
            })
          }
        >
          <Save className="h-4 w-4" /> Salvar dashboard
        </button>
      </section>
      <section className="card space-y-4 p-5">
        <h2 className="font-display text-lg font-semibold">Rodapé, empresa e redes sociais</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {(Object.keys(FOOTER_DEFAULT) as (keyof FooterSettings)[]).map((k) => (
            <label key={k} className="block">
              <span className="mb-1 block text-xs font-semibold text-muted">{{ company: 'Nome da marca', legal_name: 'Razão social', cnpj: 'CNPJ', email: 'E-mail de contato', instagram: 'Instagram (URL)', youtube: 'YouTube (URL)', telegram: 'Telegram (URL)', whatsapp: 'WhatsApp (URL wa.me)', course_url: 'Link do curso', mentorship_url: 'Link da mentoria' }[k]}</span>
              <input className="input" value={footer[k]} onChange={(e) => setFooter({ ...footer, [k]: e.target.value })} />
            </label>
          ))}
        </div>
        <button className="btn-neon" onClick={() => save('footer', footer)}><Save className="h-4 w-4" /> Salvar rodapé</button>
      </section>
    </div>
  );
}
