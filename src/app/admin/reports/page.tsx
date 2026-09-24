'use client';
import { Crud } from '../crud';

export default function Page() {
  return (
    <Crud
      title="Relatórios semanais"
      table="weekly_reports"
      order={{ col: 'week_start', asc: false }}
      onBeforeSave={(r) => ({ ...r, published_at: r.published ? (r.published_at as string) || new Date().toISOString() : null })}
      fields={[
        { key: 'title', label: 'Título', type: 'text', required: true, list: true, help: 'Ex.: Semana de 21 de setembro de 2026' },
        { key: 'week_start', label: 'Início da semana', type: 'date', required: true, list: true },
        { key: 'published', label: 'Publicado', type: 'bool', list: true },
        { key: 'content_md', label: 'Conteúdo (Markdown)', type: 'markdown', required: true },
      ]}
    />
  );
}
