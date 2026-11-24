import { Flame, Snowflake } from 'lucide-react';
import { cn } from '@/lib/utils';

export type WeekDot = { letter: string; active: boolean; today: boolean };

/**
 * Серия дней: большая оранжевая цифра, огонёк и семь кружков недели (пн → вс).
 * Оранжевый — цвет огня из утверждённой палитры (токен `streak`). Чистый серверный компонент.
 */
export function StreakWidget({
  title,
  days,
  unit,
  week,
  weekLabel,
  startText,
  freezes,
  record,
}: {
  title: string;
  days: number;
  unit: string;
  week: WeekDot[];
  weekLabel: string;
  /** Подсказка вместо заморозок и рекорда, пока серии нет. */
  startText: string;
  freezes: string | null;
  record: string | null;
}) {
  const running = days > 0;
  return (
    <div className="glass flex min-h-[170px] min-w-0 flex-col overflow-hidden rounded-3xl p-5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Flame className="h-3.5 w-3.5 fill-streak text-streak" aria-hidden />
        {title}
      </div>

      <div className="mt-auto flex items-baseline gap-1.5">
        <span className={cn('font-mono text-[56px] font-bold leading-none tabular-nums', running ? 'text-streak' : 'text-muted-foreground/60')}>
          {days}
        </span>
        <span className="text-sm font-semibold text-muted-foreground">{unit}</span>
      </div>

      <ul className="mt-3 flex justify-between" aria-label={weekLabel}>
        {week.map((d, i) => (
          <li
            key={i}
            aria-current={d.today ? 'date' : undefined}
            className={cn(
              'grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold',
              d.active ? 'bg-streak text-[#2b1100] shadow-[0_0_12px_hsl(var(--streak)/0.45)]' : 'bg-foreground/10 text-muted-foreground',
              d.today && !d.active && 'ring-2 ring-streak/55'
            )}
          >
            {d.letter}
          </li>
        ))}
      </ul>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {running ? (
          <>
            {freezes ? (
              <span className="inline-flex items-center gap-1">
                <Snowflake className="h-3 w-3" aria-hidden />
                {freezes}
              </span>
            ) : null}
            {record ? <span>{record}</span> : null}
          </>
        ) : (
          <span>{startText}</span>
        )}
      </div>
    </div>
  );
}
