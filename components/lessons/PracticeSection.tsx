'use client';

import { useEffect, useEffectEvent, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ResolvedQuestion } from '@/lib/lessons/catalog';
import { answeredCount, correctCount, fill, type LessonProgress } from '@/lib/lessons/progress';
import { playSound } from '@/lib/sound/ui-sounds';
import { QuestionCard } from './QuestionCard';
import type { LessonLabels } from './labels';

export function PracticeSection({
  problems,
  progress,
  ready,
  onAnswer,
  labels,
  completionAction,
}: {
  problems: ResolvedQuestion[];
  progress: LessonProgress;
  ready: boolean;
  onAnswer: (id: string, index: number) => void;
  labels: LessonLabels['practice'];
  completionAction?: ReactNode;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const focusTarget = useRef<'question' | 'feedback' | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const [draft, setDraft] = useState<number>();
  const done = answeredCount(problems, progress);
  const right = correctCount(problems, progress);
  const firstUnanswered = problems.findIndex((problem) => progress.answers[problem.id] === undefined);
  const closed = ready && firstUnanswered === -1 && problems.length > 0;
  const active = position ?? Math.max(0, firstUnanswered);
  const q = problems[active];
  const selected = q ? progress.answers[q.id] : undefined;
  const canCheck = ready && draft !== undefined && (!q?.multi || draft !== 0);

  const move = (index: number) => {
    if (index === active) return;
    setDraft(undefined);
    setPosition(index);
  };

  const next = () => {
    if (closed) return;
    const after = problems.findIndex((problem, index) => index > active && progress.answers[problem.id] === undefined);
    focusTarget.current = 'question';
    move(after === -1 ? firstUnanswered : after);
  };

  const choose = (index: number) => {
    if (!ready || !q || selected !== undefined || index >= q.options.length) return;
    setDraft((value) => q.multi ? (value ?? 0) ^ (1 << index) : index);
  };

  const check = () => {
    if (!canCheck || draft === undefined || !q || selected !== undefined || focusTarget.current === 'feedback') return;
    const ok = draft === q.correct;
    focusTarget.current = 'feedback';
    setPosition(active);
    playSound(ok ? 'correct' : 'wrong');
    onAnswer(q.id, draft);
    if (done + 1 === problems.length) window.setTimeout(() => playSound('complete'), 420);
  };

  useEffect(() => {
    if (focusTarget.current === 'feedback' && selected !== undefined) {
      feedback.current?.focus();
      focusTarget.current = null;
    } else if (focusTarget.current === 'question') {
      panel.current?.focus();
      focusTarget.current = null;
    }
  }, [q?.id, selected]);

  const onPracticeKey = useEffectEvent((event: KeyboardEvent) => {
    if (!ready || !q || event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    const focusedOption = target instanceof HTMLElement
      && panel.current?.contains(target)
      && target.hasAttribute('data-practice-option') ? target : null;
    if (target !== document.body && target !== document.documentElement
      && target !== panel.current && target !== feedback.current && !focusedOption) return;

    if (event.key === 'Enter' && (selected === undefined ? canCheck : !closed)) {
      if (focusedOption?.getAttribute('aria-pressed') === 'false') return;
      event.preventDefault();
      if (!event.repeat) {
        if (selected === undefined) check();
        else next();
      }
    } else if (selected === undefined && /^[1-6]$/.test(event.key)) {
      const index = Number(event.key) - 1;
      if (index >= q.options.length) return;
      event.preventDefault();
      if (!event.repeat) {
        choose(index);
        panel.current?.focus({ preventScroll: true });
      }
    }
  });

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => onPracticeKey(event);
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const onTabKey = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const count = problems.length;
    const nextIndex = {
      ArrowLeft: (index + count - 1) % count,
      ArrowRight: (index + 1) % count,
      Home: 0,
      End: count - 1,
    }[event.key];
    if (nextIndex === undefined) return;
    event.preventDefault();
    move(nextIndex);
    document.getElementById(`${id}-question-${nextIndex}`)?.focus();
  };

  if (!q) return null;

  return (
    <section aria-labelledby={`${id}-title`} aria-busy={!ready} className="glass rounded-3xl p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id={`${id}-title`} className="text-xl font-bold tracking-tight">{labels.title}</h2>
        <div className="text-sm text-muted-foreground">
          {fill(labels.progress, { done, total: problems.length })}
          {done > 0 && <> · {fill(labels.correct, { n: right })}</>}
        </div>
      </div>

      <div aria-hidden className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-apple" style={{ width: `${(done / problems.length) * 100}%` }} />
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5" role="tablist" aria-labelledby={`${id}-title`}>
        {problems.map((problem, index) => {
          const answer = progress.answers[problem.id];
          const state = answer === undefined ? 'todo' : answer === problem.correct ? 'ok' : 'bad';
          return (
            <button
              key={problem.id}
              id={`${id}-question-${index}`}
              type="button"
              role="tab"
              aria-controls={`${id}-panel`}
              aria-selected={index === active}
              aria-label={fill(labels.question, { n: index + 1 })}
              tabIndex={index === active ? 0 : -1}
              disabled={!ready}
              onClick={() => move(index)}
              onKeyDown={(event) => onTabKey(event, index)}
              className={cn(
                'size-9 rounded-full text-[13px] font-semibold tabular-nums transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30',
                state === 'todo' && 'bg-muted text-muted-foreground hover:bg-accent',
                state === 'ok' && 'bg-success/15 text-success',
                state === 'bad' && 'bg-destructive/15 text-destructive',
                index === active && 'ring-2 ring-primary ring-offset-2 ring-offset-card',
              )}
            >
              {index + 1}
            </button>
          );
        })}
      </div>

      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-question-${active}`}
        ref={panel}
        tabIndex={0}
        className="mt-5 scroll-mt-24 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <QuestionCard
          key={q.id}
          q={q}
          selected={selected}
          revealed
          disabled={!ready}
          optionDraft={{ value: draft, onChoose: choose }}
          feedbackRef={feedback}
          levelLabels={labels.levels}
          heading={fill(labels.question, { n: active + 1 })}
          solutionLabel={labels.solution}
          rightLabel={labels.right}
          wrongLabel={labels.wrong}
          multiHint={labels.multiHint}
        />
      </div>

      {!closed && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="hidden text-xs text-muted-foreground sm:block">{fill(labels.hint, { count: q.options.length })}</p>
          {selected === undefined ? (
            <Button onClick={check} disabled={!canCheck} className="ml-auto min-h-11">{labels.check}</Button>
          ) : (
            <Button onClick={next} className="ml-auto min-h-11">
              {labels.next}
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          )}
        </div>
      )}

      {closed && (
        <div className="mt-5 flex flex-col items-start gap-4 rounded-2xl border border-primary/20 bg-primary/10 p-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <div>
              <h3 className="font-semibold">{labels.closedTitle}</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">{fill(labels.closedText, { correct: right, total: problems.length })}</p>
            </div>
          </div>
          {completionAction}
        </div>
      )}
    </section>
  );
}
