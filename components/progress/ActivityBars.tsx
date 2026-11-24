import { cn } from '@/lib/utils';

export type BarDay = { date: string; count: number; isToday: boolean };

/** Столбики активности по дням: высота — число действий за день, сегодня выделено оранжевым. */
export function ActivityBars({
  days,
  label,
  firstLabel,
  lastLabel,
}: {
  days: readonly BarDay[];
  label: (date: string, count: number) => string;
  firstLabel: string;
  lastLabel: string;
}) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div>
      <div className="flex h-28 items-end gap-[3px] sm:h-36 sm:gap-1.5" role="img" aria-label={`${firstLabel} – ${lastLabel}`}>
        {days.map((d) => (
          <div key={d.date} title={label(d.date, d.count)} className="flex h-full flex-1 items-end">
            <div
              className={cn(
                'w-full rounded-t-[4px] transition-[height] duration-300 ease-apple',
                d.count === 0 ? 'h-[3px] rounded-[2px] bg-muted' : d.isToday ? 'bg-streak' : 'bg-success/80'
              )}
              style={d.count > 0 ? { height: `${Math.max(8, Math.round((d.count / max) * 100))}%` } : undefined}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>{firstLabel}</span>
        <span>{lastLabel}</span>
      </div>
    </div>
  );
}
