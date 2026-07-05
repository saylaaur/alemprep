import { cn } from '@/lib/utils';

/**
 * Круговой индикатор прогресса (SVG). Чистый серверный компонент — без состояния.
 * `value` — доля 0..1; центр можно заполнить через `children`.
 */
export function ProgressRing({
  value,
  size = 96,
  strokeWidth = 8,
  className,
  trackClassName,
  glow = false,
  children,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  /** Класс цвета дуги, напр. 'stroke-primary' | 'stroke-streak'. */
  className?: string;
  trackClassName?: string;
  /** Эмеральдовое свечение под дугой. */
  glow?: boolean;
  children?: React.ReactNode;
}) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          className={cn('stroke-muted', trackClassName)}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className={cn(
            'stroke-primary transition-[stroke-dashoffset] duration-700 ease-smooth',
            className
          )}
          style={{
            strokeDasharray: c,
            strokeDashoffset: offset,
            filter: glow ? 'drop-shadow(0 0 6px hsl(var(--primary) / 0.5))' : undefined,
          }}
        />
      </svg>
      {children ? (
        <div className="absolute inset-0 grid place-items-center text-center">
          {children}
        </div>
      ) : null}
    </div>
  );
}
