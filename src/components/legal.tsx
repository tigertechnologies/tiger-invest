export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="card mx-auto max-w-3xl p-8">
      <h1 className="font-display text-3xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-muted">Última atualização: {updated}</p>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-fg/85 [&_h2]:mt-6 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-neon [&_li]:ml-5 [&_ul]:list-disc">{children}</div>
    </article>
  );
}
