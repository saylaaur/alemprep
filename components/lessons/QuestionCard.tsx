'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MathText } from '@/components/math/MathText';
import { cn } from '@/lib/utils';
import type { ResolvedQuestion } from '@/lib/lessons/catalog';
import type { LessonLabels } from './labels';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const LEVEL_STYLE = {
  easy: 'bg-success/15 text-success',
  medium: 'bg-warning/15 text-warning',
  hard: 'bg-destructive/15 text-destructive',
} as const;

/**
 * Один вопрос. revealed=true — показываем верный ответ и разбор (тренировка);
 * в пробнике revealed=false до самого конца, виден только выбранный вариант.
 * q.multi — несколько верных: ученик отмечает варианты и жмёт «Проверить»; ответ и q.correct — битовые маски.
 * q.context — общее условие контекстного блока, показывается над вопросом.
 */
export function QuestionCard({
  q,
  selected,
  revealed,
  onSelect,
  levelLabels,
  heading,
  solutionLabel,
  rightLabel,
  wrongLabel,
  disabled,
  checkLabel = 'OK',
  multiHint,
}: {
  q: ResolvedQuestion;
  selected: number | undefined;
  revealed: boolean;
  onSelect?: (index: number) => void;
  levelLabels?: LessonLabels['practice']['levels'];
  heading: string;
  solutionLabel: string;
  rightLabel: string;
  wrongLabel: string;
  disabled?: boolean;
  checkLabel?: string;
  multiHint?: string;
}) {
  const [draft, setDraft] = useState(0);
  const answered = selected !== undefined;
  const isRight = answered && selected === q.correct;
  const multi = q.multi === true;
  const bit = (i: number) => 1 << i;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-muted-foreground">
        <span>{heading}</span>
        {levelLabels && <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', LEVEL_STYLE[q.level])}>{levelLabels[q.level]}</span>}
      </div>
      {q.context && (
        <div className="mt-2 rounded-2xl bg-muted/60 p-3.5 text-[15px] leading-relaxed">
          <MathText text={q.context} />
        </div>
      )}
      <p className="mt-2 text-balance text-[17px] font-medium leading-snug sm:text-lg">
        <MathText text={q.question} />
      </p>
      {multi && multiHint && !answered && <p className="mt-1 text-sm text-muted-foreground">{multiHint}</p>}

      <div className="mt-4 grid gap-2" role="group">
        {q.options.map((opt, i) => {
          const isCorrect = multi ? (q.correct & bit(i)) !== 0 : i === q.correct;
          const chosen = multi ? ((answered ? selected : draft) & bit(i)) !== 0 : selected === i;
          const right = revealed && answered && isCorrect;
          const bad = revealed && answered && chosen && !isCorrect;
          return (
            <button
              key={i}
              type="button"
              data-sound="off"
              disabled={disabled || (revealed && answered)}
              onClick={() => (multi ? !answered && setDraft((d) => d ^ bit(i)) : onSelect?.(i))}
              aria-pressed={chosen}
              className={cn(
                'flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left text-[15px] transition-[transform,background-color,border-color,opacity] duration-150 ease-apple active:scale-[0.985] disabled:pointer-events-none',
                'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25',
                !answered && !(multi && chosen) && 'border-border bg-card/70 backdrop-blur-xl hover:border-primary/50 hover:bg-accent',
                !answered && multi && chosen && 'border-primary bg-primary/10',
                !revealed && chosen && 'border-primary bg-primary/10',
                !revealed && answered && !chosen && 'border-border bg-card/70 backdrop-blur-xl hover:border-primary/50 hover:bg-accent',
                right && 'border-success bg-success/10',
                bad && 'border-destructive bg-destructive/10',
                revealed && answered && !right && !bad && 'border-border bg-card/70 backdrop-blur-xl opacity-55'
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center text-xs font-bold',
                  multi ? 'rounded-lg' : 'rounded-full',
                  right ? 'bg-success text-success-foreground' : bad ? 'bg-destructive text-destructive-foreground' : chosen ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}
              >
                {right ? <Check className="h-4 w-4" /> : bad ? <X className="h-4 w-4" /> : LETTERS[i]}
              </span>
              <span className="min-w-0 flex-1">
                <MathText text={opt} />
              </span>
            </button>
          );
        })}
      </div>

      {multi && !answered && (
        <Button className="mt-3" onClick={() => onSelect?.(draft)} disabled={disabled || draft === 0}>
          {checkLabel}
        </Button>
      )}

      {revealed && answered && (
        <div
          role="status"
          className={cn('mt-4 animate-fade-in rounded-2xl p-4 text-[15px] leading-relaxed', isRight ? 'bg-success/10' : 'bg-destructive/10')}
        >
          <div className={cn('mb-1 text-sm font-semibold', isRight ? 'text-success' : 'text-destructive')}>{isRight ? rightLabel : wrongLabel}</div>
          <div className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{solutionLabel}</div>
          <p className="mt-1">
            <MathText text={q.solution} />
          </p>
        </div>
      )}
    </div>
  );
}
