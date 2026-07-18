import type { TrajectoryPoint } from '@/lib/progress';

const WIDTH = 600;
const HEIGHT = 200;
const PADDING_X = 24;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 36;

function clampPercent(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

/**
 * График траектории (SVG, линия + заливка) — чистый серверный компонент,
 * без стороннего чарт-инструментария, тот же приём, что у ProgressRing:
 * классы Tailwind (`stroke-success`, `fill-success/10`) применяются к SVG
 * напрямую. Предполагает `points.length > 0` — пустое состояние строит
 * вызывающая страница.
 */
export function TrajectoryChart({
  points,
  targetPercent,
  labels,
}: {
  points: TrajectoryPoint[];
  /** Доля 0..1 — если задана, рисуется пунктирная целевая линия. */
  targetPercent?: number;
  labels: {
    diagnostic: string;
    week: (n: number) => string;
    target: string;
  };
}) {
  const innerWidth = WIDTH - PADDING_X * 2;
  const innerHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const baselineY = PADDING_TOP + innerHeight;
  const stepX = points.length > 1 ? innerWidth / (points.length - 1) : 0;

  const coords = points.map((p, i) => {
    const x = PADDING_X + (points.length > 1 ? i * stepX : innerWidth / 2);
    const y = PADDING_TOP + innerHeight * (1 - clampPercent(p.percent));
    return { x, y, p };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1].x} ${baselineY} L ${coords[0].x} ${baselineY} Z`
      : '';

  const targetY = targetPercent != null ? PADDING_TOP + innerHeight * (1 - clampPercent(targetPercent)) : null;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label={labels.diagnostic}>
        {targetY != null && (
          <>
            <line
              x1={PADDING_X}
              y1={targetY}
              x2={WIDTH - PADDING_X}
              y2={targetY}
              className="stroke-muted-foreground/40"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <text x={WIDTH - PADDING_X} y={targetY - 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
              {labels.target}
            </text>
          </>
        )}

        {areaPath && <path d={areaPath} className="fill-success/10" />}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            className="stroke-success"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {coords.map(({ x, y, p }, i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={4} className="fill-success stroke-card" strokeWidth={2} />
            <text
              x={x}
              y={y - 10}
              textAnchor="middle"
              className="fill-foreground font-mono text-[11px] font-medium tabular-nums"
            >
              {Math.round(p.percent * 100)}%
            </text>
            <text x={x} y={HEIGHT - PADDING_BOTTOM + 16} textAnchor="middle" className="fill-muted-foreground text-[10px]">
              {p.kind === 'diagnostic' ? labels.diagnostic : labels.week(p.weekIndex)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
