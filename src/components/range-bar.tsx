import { cx } from '@/lib/cx';

/** Barra de faixa: mostra onde o preço está em relação ao mínimo/máximo. */
export function RangeBar({ position, status }: { position: number | null; status: 'dentro' | 'acima' | 'abaixo' | null }) {
  const pos = position == null ? null : Math.max(-8, Math.min(108, position));
  return (
    <div className="relative mx-2 h-2 w-40 rounded-full bg-card-2">
      <div className={cx('absolute inset-y-0 left-0 right-0 rounded-full', status === 'dentro' ? 'bg-up/40' : 'bg-down/30')} />
      {pos != null && (
        <span
          className={cx('absolute -top-1 h-4 w-1.5 rounded', status === 'dentro' ? 'bg-neon shadow-neon-sm' : 'bg-down')}
          style={{ left: `calc(${(pos + 8) / 1.16}% - 3px)` }}
        />
      )}
    </div>
  );
}
