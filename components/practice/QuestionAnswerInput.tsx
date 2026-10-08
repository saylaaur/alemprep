'use client';

import { MathText } from '@/components/math/MathText';
import { cn } from '@/lib/utils';
import type { PublicQuestion } from '@/lib/content/public-question';
import type { AnswerState } from '@/lib/practice';

export type QuestionAnswerLabels = {
  matchingPlaceholder: string;
  matchingSelectFor: (item: string) => string;
  multiGroup: string;
};

type Props = {
  question: Pick<PublicQuestion, 'type' | 'body'>;
  answer: AnswerState;
  onChange: (next: AnswerState) => void;
  labels: QuestionAnswerLabels;
  /** After a submit only: the server key, so right and wrong picks get marked. */
  review?: {
    correct: string | string[];
    correctLabel: string;
    incorrectLabel: string;
  };
};

function optionTone(id: string, selected: boolean, correct: string | string[] | undefined): string | null {
  if (correct === undefined) return null;
  const isCorrect = Array.isArray(correct) ? correct.includes(id) : correct === id;
  if (isCorrect) return 'border-success bg-success/10 text-foreground';
  return selected ? 'border-destructive bg-destructive/10 text-foreground' : null;
}

function optionMark(id: string, selected: boolean, correct: string | string[] | undefined): string | null {
  if (correct === undefined) return null;
  const isCorrect = Array.isArray(correct) ? correct.includes(id) : correct === id;
  return isCorrect ? '✓' : selected ? '✗' : null;
}

/**
 * Презентационный ввод ответа (single/multi/matching) — без состояния и без
 * знания об экзамене/диагностике/тренажёре. Извлечён из MockExamView, чтобы
 * переиспользовать в DiagnosticView без дублирования разметки.
 */
export function QuestionAnswerInput({ question, answer, onChange, labels, review }: Props) {
  const body = question.body;
  const correct = review?.correct;

  if (question.type === 'single' && 'options' in body) {
    return (
      <div role="radiogroup" className="space-y-2.5">
        {body.options.map((opt) => {
          const selected = answer === opt.id;
          const mark = optionMark(opt.id, selected, correct);
          return (
            <button
              key={opt.id}
              onClick={() => onChange(opt.id)}
              role="radio"
              aria-checked={selected}
              className={cn(
                'flex w-full items-center gap-3.5 rounded-xl border px-4 py-3.5 text-sm font-medium text-left transition-all duration-150 focus-visible:ring-4 focus-visible:ring-ring/25',
                optionTone(opt.id, selected, correct)
                  ?? (selected ? 'border-primary bg-primary/8 text-foreground' : 'border-border bg-card hover:border-primary/30 hover:bg-accent')
              )}
            >
              <span className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
                selected ? 'bg-primary text-primary-foreground' : 'border border-muted-foreground/30 text-muted-foreground'
              )}>
                {opt.id}
              </span>
              <MathText text={opt.content} />
              {mark && (
                <span className="ml-auto shrink-0 text-base font-semibold">
                  <span aria-hidden>{mark}</span>
                  <span className="sr-only">{mark === '✓' ? review?.correctLabel : review?.incorrectLabel}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  if (question.type === 'multi' && 'options' in body) {
    return (
      <div role="group" aria-label={labels.multiGroup} className="space-y-2.5">
        {body.options.map((opt) => {
          const selected = Array.isArray(answer) && answer.includes(opt.id);
          const mark = optionMark(opt.id, selected, correct);
          return (
            <button
              key={opt.id}
              onClick={() => {
                const arr = Array.isArray(answer) ? answer : [];
                onChange(selected ? arr.filter((x) => x !== opt.id) : [...arr, opt.id]);
              }}
              role="checkbox"
              aria-checked={selected}
              className={cn(
                'flex w-full items-center gap-3.5 rounded-xl border px-4 py-3.5 text-sm font-medium text-left transition-all duration-150 focus-visible:ring-4 focus-visible:ring-ring/25',
                optionTone(opt.id, selected, correct)
                  ?? (selected ? 'border-primary bg-primary/8 text-foreground' : 'border-border bg-card hover:border-primary/30 hover:bg-accent')
              )}
            >
              <span className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
                selected ? 'bg-primary text-primary-foreground' : 'border border-muted-foreground/30 text-muted-foreground'
              )}>
                {opt.id}
              </span>
              <MathText text={opt.content} />
              {mark && (
                <span className="ml-auto shrink-0 text-base font-semibold">
                  <span aria-hidden>{mark}</span>
                  <span className="sr-only">{mark === '✓' ? review?.correctLabel : review?.incorrectLabel}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  if (question.type === 'matching' && 'left' in body) {
    return (
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          {body.left.map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded-xl border bg-card px-3 py-3 text-sm">
              <span className="font-mono text-xs text-muted-foreground">{item.id}.</span>
              <MathText text={item.content} />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {body.left.map((item) => {
            const val = (answer as Record<string, string> | null)?.[item.id] ?? '';
            return (
              <select
                key={item.id}
                value={val}
                onChange={(e) => onChange({ ...((answer as Record<string, string> | null) ?? {}), [item.id]: e.target.value })}
                aria-label={labels.matchingSelectFor(item.id)}
                className="w-full rounded-xl border bg-card px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">{labels.matchingPlaceholder}</option>
                {body.right.map((o, i) => <option key={i} value={o}>{o}</option>)}
              </select>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}
