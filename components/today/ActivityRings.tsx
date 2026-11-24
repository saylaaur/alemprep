/**
 * Три кольца как в Apple «Здоровье»: снаружи задачи, в середине уроки,
 * в центре наборы карточек. `null` — раздел ещё не запущен (кольцо пустое,
 * подпись «скоро»). Чистый серверный SVG. Цвета подстраиваются под тему.
 */
export type RingValue = { done: number; total: number } | null;

const RINGS = [
  { r: 44, stroke: 'stroke-[#1fa974] dark:stroke-[#2bc98f]', text: 'text-[#13805a] dark:text-[#2bc98f]' },
  { r: 32, stroke: 'stroke-[#5fcfa4] dark:stroke-[#a6f4d0]', text: 'text-[#2f9d77] dark:text-[#a6f4d0]' },
  { r: 20, stroke: 'stroke-foreground', text: 'text-foreground' },
] as const;

function fraction(v: RingValue): number {
  if (!v || v.total <= 0) return 0;
  return Math.max(0, Math.min(1, v.done / v.total));
}

export function ActivityRings({
  values,
  labels,
  soon,
  ariaLabel,
}: {
  values: [RingValue, RingValue, RingValue];
  labels: [string, string, string];
  soon: string;
  ariaLabel: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-[132px] w-[132px] shrink-0" role="img" aria-label={ariaLabel}>
        <g transform="rotate(-90 50 50)" fill="none" strokeLinecap="round" strokeWidth={10}>
          {RINGS.map((ring, i) => {
            const c = 2 * Math.PI * ring.r;
            return (
              <g key={ring.r}>
                <circle cx={50} cy={50} r={ring.r} className={ring.stroke} strokeOpacity={0.2} />
                <circle
                  cx={50}
                  cy={50}
                  r={ring.r}
                  className={`${ring.stroke} transition-[stroke-dashoffset] duration-1000 ease-apple`}
                  strokeDasharray={c}
                  strokeDashoffset={c * (1 - fraction(values[i]))}
                />
              </g>
            );
          })}
        </g>
      </svg>
      <div className="grid min-w-0 gap-2 leading-none">
        {RINGS.map((ring, i) => {
          const v = values[i];
          return (
            <div key={ring.r} className={ring.text}>
              <div className="truncate text-[10px] font-bold uppercase tracking-[0.06em] opacity-80">{labels[i]}</div>
              <div className="font-mono text-lg font-bold tabular-nums">
                {v ? `${v.done}/${v.total}` : <span className="font-sans text-xs font-semibold opacity-70">{soon}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
