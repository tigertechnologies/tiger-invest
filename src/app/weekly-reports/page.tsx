import { FileText } from 'lucide-react';
import { supabasePublic } from '@/lib/supabase/public';
import { Breadcrumb, Empty, Hero } from '@/components/ui';
import { ReportCard } from './report-card';

export const metadata = { title: 'Relatórios Semanais' };
export const revalidate = 120;

type Report = { id: string; title: string; week_start: string; content_md: string; published_at: string | null; created_at: string };

export default async function Page() {
  const sb = supabasePublic();
  const { data } = sb
    ? await sb.from('weekly_reports').select('id, title, week_start, content_md, published_at, created_at').eq('published', true).order('week_start', { ascending: false }).limit(52)
    : { data: [] };
  const reports = (data ?? []) as Report[];
  return (
    <>
      <Breadcrumb items={[{ label: 'Relatórios Semanais' }]} />
      <Hero badge={<><FileText className="h-3.5 w-3.5" /> Leitura de mercado</>} title="Relatórios Semanais" subtitle="Resumo semanal do mercado, pontos de atenção e plano de ação da equipe Tiger Labs." />
      {reports.length === 0 ? (
        <Empty>{sb ? 'Nenhum relatório publicado ainda.' : 'Conecte o Supabase para publicar relatórios.'}</Empty>
      ) : (
        <div className="space-y-4">
          {reports.map((r, i) => <ReportCard key={r.id} r={r} latest={i === 0} />)}
        </div>
      )}
    </>
  );
}
