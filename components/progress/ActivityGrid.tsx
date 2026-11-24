import { activityLevel, activitySummary, type ActivityWeek } from '@/lib/activity-grid';
import { cn } from '@/lib/utils';

const LEVEL_CLASS = ['bg-muted', 'bg-success/25', 'bg-success/50', 'bg-success/80', 'bg-success'] as const;

/** Сетка активности как на GitHub: недели — колонки, дни недели — строки. */
export function ActivityGrid({
  weeks,
  months,
  weekdays,
  cellLabel,
  summary,
  less,
  more,
}: {
  weeks: ActivityWeek[];
  months: readonly string[];
  weekdays: readonly string[];
  cellLabel: (date: string, count: number) => string;
  summary: (s: ReturnType<typeof activitySummary>) => string;
  less: string;
  more: string;
}) {
  const stats = activitySummary(weeks);
  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="grid w-max grid-flow-col grid-rows-[16px_repeat(7,auto)] gap-[5px]">
          <span />
          {weekdays.map((d, i) => (
            <span key={i} className="flex items-center pr-1 text-[10px] text-muted-foreground">
              {d}
            </span>
          ))}
          {weeks.map((w, wi) => (
            <div key={wi} className="contents">
              <span className="h-4 whitespace-nowrap text-[11px] text-muted-foreground">
                {w.monthStart !== null ? months[w.monthStart] : ''}
              </span>
              {w.days.map((c) => (
                <span
                  key={c.date}
                  title={c.outside ? undefined : cellLabel(c.date, c.count)}
                  className={cn(
                    'aspect-square w-[clamp(16px,3.2vw,30px)] rounded-[5px]',
                    c.outside ? 'ring-1 ring-inset ring-border/60' : LEVEL_CLASS[activityLevel(c.count)],
                    c.isToday && 'ring-2 ring-foreground ring-offset-1 ring-offset-card'
                  )}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{summary(stats)}</span>
        <span className="flex items-center gap-1.5">
          {less}
          {LEVEL_CLASS.map((cls) => (
            <span key={cls} className={cn('h-3 w-3 rounded-sm', cls)} />
          ))}
          {more}
        </span>
      </div>
    </div>
  );
}
