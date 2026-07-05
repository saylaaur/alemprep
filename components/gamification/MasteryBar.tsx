import { cn } from '@/lib/utils';

export type MasteryTone = 'primary' | 'warning' | 'destructive' | 'gold' | 'muted';

const FILL: Record<MasteryTone, string> = {
  primary: 'bg-gradient-to-r from-primary/80 to-primary',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  gold: 'bg-badge-gold',
  muted: 'bg-muted-foreground/60',
};

/**
 * Тонкая полоса прогресса с подписью и числом (моно). Серверный компонент —
 * используется для мастерства по темам/предметам и прогресса бейджей.
 */
export function MasteryBar({
  label,
  value,
  valueLabel,
  tone = 'primary',
  thickness = 'md',
  className,
}: {
  label?: React.ReactNode;
  /** Доля 0..1. */
  value: number;
  /** Текст справа (по умолчанию — проценты). */
  valueLabel?: string;
  tone?: MasteryTone;
  thickness?: 'sm' | 'md';
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const pct = Math.round(clamped * 100);

  return (
    <div className={className}>
      {label !== undefined ? (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0 truncate text-foreground">{label}</span>
          <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-muted-foreground">
            {valueLabel ?? `${pct}%`}
          </span>
        </div>
      ) : null}
      <div
        className={cn(
          'overflow-hidden rounded-full bg-muted',
          thickness === 'sm' ? 'h-1' : 'h-1.5'
        )}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-700 ease-smooth', FILL[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
