'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { localDateStr } from '@/lib/streak';

const WEEKDAY_OFFSETS = [0, 1, 2, 3, 4, 5, 6]; // Monday-first

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Календарь-сетка для выбора даты ЕНТ. Чисто презентационный — валидация
 * остаётся на вызывающей стороне (validateExamDate).
 */
export function CalendarPicker({
  value,
  onChange,
  min,
}: {
  value: string;
  onChange: (date: string) => void;
  min?: string;
}) {
  const locale = useLocale();
  const today = localDateStr();
  const minDate = min ?? today;

  const initial = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const todayDate = new Date(`${today}T00:00:00`);
  const isPastMonth = viewYear === todayDate.getFullYear() && viewMonth === todayDate.getMonth();

  const goPrevMonth = () => {
    if (isPastMonth) return;
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const monthLabel = capitalize(
    new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
      new Date(viewYear, viewMonth, 1)
    )
  );

  const weekdayLabels = WEEKDAY_OFFSETS.map((offset) => {
    // 2024-01-01 — понедельник; сдвигаем на offset дней для нужного дня недели.
    const d = new Date(2024, 0, 1 + offset);
    return capitalize(new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d));
  });

  const firstWeekday = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Monday=0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={goPrevMonth}
          disabled={isPastMonth}
          aria-label="Previous month"
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">{monthLabel}</span>
        <button
          type="button"
          onClick={goNextMonth}
          aria-label="Next month"
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {weekdayLabels.map((label, i) => (
          <div key={i} className="py-1.5">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={`blank-${i}`} />;
          const dateStr = toDateStr(viewYear, viewMonth, day);
          const disabled = dateStr < minDate;
          const selected = dateStr === value;
          const isToday = dateStr === today;

          return (
            <button
              key={dateStr}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-current={isToday ? 'date' : undefined}
              aria-label={dateStr}
              onClick={() => onChange(dateStr)}
              className={cn(
                'grid aspect-square place-items-center rounded-lg text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25',
                selected
                  ? 'bg-primary text-primary-foreground'
                  : disabled
                    ? 'text-muted-foreground/30'
                    : isToday
                      ? 'text-primary hover:bg-accent'
                      : 'text-foreground hover:bg-accent'
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
