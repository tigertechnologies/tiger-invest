import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Markdown com tamanhos contidos (títulos não "explodem" dentro de cards). */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-fg/85 [&_a]:text-neon [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-neon/60 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-card-2 [&_code]:px-1 [&_h1]:font-display [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-fg [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-neon [&_h3]:font-semibold [&_h3]:text-fg [&_li]:ml-5 [&_ol]:list-decimal [&_strong]:text-fg [&_table]:w-full [&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-line [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

/** Texto limpo para prévias (remove sintaxe Markdown). */
export function plainText(md: string, max = 260) {
  const t = md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_`>~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? t.slice(0, max).replace(/\s\S*$/, '') + '…' : t;
}
