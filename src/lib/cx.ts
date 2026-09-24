/** Junta classes CSS ignorando valores falsos. Módulo comum (serve para server e client components). */
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
