/** Marca Tiger Labs: garras de tigre em neon (desenho original). */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <defs>
        <linearGradient id="tl-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgb(var(--neon))" />
          <stop offset="100%" stopColor="rgb(var(--lime))" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="11" fill="rgb(var(--bg))" stroke="url(#tl-g)" strokeWidth="2" />
      <path d="M11 29 L17 9" stroke="url(#tl-g)" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M17.5 31 L23.5 11" stroke="url(#tl-g)" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M24 30 L29 14" stroke="url(#tl-g)" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={small ? 30 : 38} />
      <span className="leading-none">
        <span className={`font-display font-bold tracking-tight ${small ? 'text-lg' : 'text-xl md:text-2xl'}`}>
          Tiger <span className="text-gradient">Labs</span>
        </span>
      </span>
    </span>
  );
}
