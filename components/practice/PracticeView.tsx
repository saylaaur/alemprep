'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { MathText } from '@/components/math/MathText';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Check,
  X,
  ArrowRight,
  ArrowLeft,
  Keyboard,
  Maximize2,
  Minimize2,
  Trophy,
} from 'lucide-react';
import type { Question, Explanation, ContextContent } from '@/types/db';
import { recordAttempt } from '@/lib/supabase/practice-actions';
import { checkAnswer, isAnswerComplete, type AnswerState } from '@/lib/practice';

type Props = {
  questions: Question[];
  contexts: Map<string, { id: string; title: string | null; content: ContextContent }>;
  topicName: string;
};

export function PracticeView({ questions, contexts, topicName }: Props) {
  const t = useTranslations('practice');
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [focus, setFocus] = useState(false);
  const questionShownAt = useRef<Record<string, number>>({});
  const recordedRef = useRef<Set<string>>(new Set());

  const total = questions.length;
  const current = questions[idx];

  // Засекаем время показа вопроса
  useEffect(() => {
    if (current && !questionShownAt.current[current.id]) {
      questionShownAt.current[current.id] = Date.now();
    }
  }, [current]);

  // Focus mode — скрываем sidebar и второстепенные элементы
  useEffect(() => {
    document.body.classList.toggle('focus-mode', focus);
    return () => document.body.classList.remove('focus-mode');
  }, [focus]);

  const stats = useMemo(() => {
    let correct = 0;
    for (const q of questions) {
      if (revealed[q.id] && checkAnswer(q.type, answers[q.id] ?? null, q.body)) correct++;
    }
    return { correct, answered: Object.keys(revealed).length };
  }, [questions, answers, revealed]);

  const answer = current ? (answers[current.id] ?? null) : null;
  const isRevealed = current ? !!revealed[current.id] : false;
  const isCorrect = isRevealed && current != null && checkAnswer(current.type, answer, current.body);
  const ctx = current?.context_id ? contexts.get(current.context_id) : null;

  const setAnswer = (next: AnswerState) => {
    if (!current || isRevealed) return;
    setAnswers((prev) => ({ ...prev, [current.id]: next }));
  };

  const check = () => {
    if (!current) return;
    if (!isAnswerComplete(current.type, answer, current.body)) return;
    if (recordedRef.current.has(current.id)) return;
    recordedRef.current.add(current.id);

    setRevealed((prev) => ({ ...prev, [current.id]: true }));

    // Сохраняем попытку в БД (fire-and-forget — не блокируем UI)
    const shownAt = questionShownAt.current[current.id] ?? Date.now();
    const timeSpent = Date.now() - shownAt;
    const correct = checkAnswer(current.type, answer, current.body);
    void recordAttempt({
      questionId: current.id,
      givenAnswer: answer,
      isCorrect: correct,
      timeSpentMs: timeSpent,
    });
  };

  const goNext = () => {
    if (idx < total - 1) setIdx(idx + 1);
  };
  const goPrev = () => {
    if (idx > 0) setIdx(idx - 1);
  };

  const isLast = idx === total - 1;
  const allDone = stats.answered === total;

  // Клавиатурные шорткаты (хук должен быть до раннего return)
  useEffect(() => {
    if (!current) return;
    const handler = (e: KeyboardEvent) => {
      // Не перехватываем, если фокус на input/select/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      ) return;

      // 1-9 — выбор варианта
      if (!isRevealed && current.type !== 'matching') {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 9) {
          const body = current.body as { options?: { id: string }[] };
          const opt = body.options?.[num - 1];
          if (opt) {
            e.preventDefault();
            if (current.type === 'single') {
              setAnswer(opt.id);
            } else {
              const arr = Array.isArray(answer) ? answer : [];
              setAnswer(arr.includes(opt.id) ? arr.filter((x) => x !== opt.id) : [...arr, opt.id]);
            }
          }
          return;
        }
      }

      // Enter — проверить или дальше
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!isRevealed) {
          check();
        } else if (!isLast) {
          goNext();
        }
        return;
      }

      // Стрелки — навигация
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  if (total === 0) {
    return (
      <div className="mx-auto grid max-w-md place-items-center p-16 text-center">
        <div className="rounded-2xl border bg-card p-10 shadow-sm">
          <p className="text-muted-foreground">{t('noQuestions')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="min-w-0 text-sm text-muted-foreground">
          <span className="truncate">{topicName}</span> ·{' '}
          <span className="font-medium text-foreground">
            {idx + 1} / {total}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div
            data-hide-in-focus
            className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex"
          >
            <Keyboard className="h-3.5 w-3.5" />
            <span className="flex items-center gap-1">
              <kbd>1</kbd>–<kbd>4</kbd> {t('shortcutSelect')} · <kbd>↵</kbd> {t('shortcutVerify')}
            </span>
          </div>
          <div data-hide-in-focus className="text-sm text-muted-foreground">
            <span className="font-medium text-success">{stats.correct}</span>
            <span className="text-muted-foreground/60">/{stats.answered}</span>
          </div>
          <button
            type="button"
            onClick={() => setFocus((f) => !f)}
            aria-label={focus ? t('exitFocusMode') : t('focusMode')}
            title={focus ? t('exitFocusMode') : t('focusMode')}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {focus ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-7 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-all duration-500 ease-smooth"
          style={{ width: `${((idx + 1) / total) * 100}%` }}
        />
      </div>

      {/* Question navigator */}
      <div data-hide-in-focus className="mb-8 flex flex-wrap gap-1.5">
        {questions.map((q, i) => {
          const wasRevealed = !!revealed[q.id];
          const wasCorrect = wasRevealed && checkAnswer(q.type, answers[q.id] ?? null, q.body);
          return (
            <button
              key={q.id}
              onClick={() => setIdx(i)}
              className={cn(
                'h-8 w-8 rounded-lg text-xs font-medium transition-all duration-200 ease-smooth',
                i === idx && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                !wasRevealed && i !== idx && 'bg-muted text-muted-foreground hover:bg-muted/70',
                !wasRevealed && i === idx && 'bg-muted text-foreground',
                wasRevealed && wasCorrect && 'bg-success/15 text-success hover:bg-success/25',
                wasRevealed && !wasCorrect && 'bg-destructive/15 text-destructive hover:bg-destructive/25'
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* Anim wrapper — fades on question change */}
      <div key={current.id} className="animate-fade-in">
        {/* Context (для контекстных блоков) */}
        {ctx ? <ContextBlock ctx={ctx} /> : null}

        {/* Question */}
        <div className="mb-6">
          <div className="text-lg leading-relaxed">
            <MathText text={(current.body as { stem: string }).stem} />
          </div>
        </div>

        {/* Answer area */}
        <div className="mb-8">
          {current.type === 'single' && (
            <SingleAnswer
              body={current.body as { options: { id: string; content: string }[]; correct: string }}
              answer={typeof answer === 'string' ? answer : null}
              isRevealed={isRevealed}
              onChange={setAnswer}
            />
          )}
          {current.type === 'multi' && (
            <MultiAnswer
              body={current.body as { options: { id: string; content: string }[]; correct: string[] }}
              answer={Array.isArray(answer) ? answer : []}
              isRevealed={isRevealed}
              onChange={setAnswer}
            />
          )}
          {current.type === 'matching' && (
            <MatchingAnswer
              body={
                current.body as {
                  left: { id: string; content: string }[];
                  right: string[];
                  correct: Record<string, string>;
                }
              }
              answer={
                answer && typeof answer === 'object' && !Array.isArray(answer)
                  ? (answer as Record<string, string>)
                  : {}
              }
              isRevealed={isRevealed}
              onChange={setAnswer}
            />
          )}
        </div>

        {/* Verdict + explanation */}
        {isRevealed ? (
          <div className="mb-6 space-y-3">
            <div
              className={cn(
                'flex animate-scale-in items-center gap-2 rounded-xl p-3.5 text-sm font-medium',
                isCorrect
                  ? 'bg-success/10 text-success'
                  : 'bg-destructive/10 text-destructive'
              )}
            >
              <span
                className={cn(
                  'grid h-6 w-6 place-items-center rounded-full',
                  isCorrect ? 'bg-success/15' : 'bg-destructive/15'
                )}
              >
                {isCorrect ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
              </span>
              {isCorrect ? t('correct') : t('incorrect')}
            </div>
            {current.explanation ? (
              <div className="animate-slide-up space-y-2 rounded-xl border bg-card p-5 text-sm leading-relaxed text-muted-foreground shadow-xs">
                <div className="font-medium text-foreground">{t('explanation')}</div>
                {((current.explanation as Explanation).blocks ?? []).map((b, i) => (
                  <div key={i}>
                    <MathText text={b.value} display={b.type === 'latex'} />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={goPrev} disabled={idx === 0}>
          <ArrowLeft className="h-4 w-4" />
          {t('previousQuestion')}
        </Button>
        {!isRevealed ? (
          <Button
            onClick={check}
            disabled={!isAnswerComplete(current.type, answer, current.body)}
          >
            {t('checkAnswer')}
          </Button>
        ) : isLast && allDone ? (
          <div className="inline-flex items-center gap-2 rounded-lg bg-success/10 px-4 py-2 text-sm font-medium text-success">
            <Trophy className="h-4 w-4" />
            {t('allDone', { correct: stats.correct, total })}
          </div>
        ) : (
          <Button onClick={goNext} disabled={isLast}>
            {t('nextQuestion')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function ContextBlock({
  ctx,
}: {
  ctx: { id: string; title: string | null; content: ContextContent };
}) {
  return (
    <div className="mb-6 rounded-xl border bg-muted/40 p-4">
      {ctx.title ? <div className="mb-2 text-sm font-semibold">{ctx.title}</div> : null}
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
        {(ctx.content.blocks ?? []).map((b, i) => (
          <div key={i}>
            <MathText text={b.value} display={b.type === 'latex'} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SingleAnswer({
  body,
  answer,
  isRevealed,
  onChange,
}: {
  body: { options: { id: string; content: string }[]; correct: string };
  answer: string | null;
  isRevealed: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2.5">
      {body.options.map((opt, i) => {
        const isSelected = answer === opt.id;
        const isCorrect = opt.id === body.correct;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            disabled={isRevealed}
            className={cn(
              'group flex w-full items-center gap-3.5 rounded-xl border p-4 text-left transition-all duration-200 ease-smooth',
              !isRevealed && 'cursor-pointer hover:border-primary/50 hover:bg-accent/40 active:scale-[0.995]',
              !isRevealed && isSelected && 'border-primary bg-primary/5 ring-1 ring-primary/30',
              !isRevealed && !isSelected && 'border-border',
              isRevealed && isCorrect && 'border-success/60 bg-success/10',
              isRevealed && !isCorrect && isSelected && 'border-destructive/60 bg-destructive/10',
              isRevealed && !isCorrect && !isSelected && 'opacity-50'
            )}
          >
            <div
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-semibold uppercase transition-colors',
                !isRevealed && isSelected && 'border-primary bg-primary text-primary-foreground',
                !isRevealed && !isSelected && 'border-muted-foreground/30 text-muted-foreground group-hover:border-primary/50',
                isRevealed && isCorrect && 'border-success bg-success text-success-foreground',
                isRevealed && !isCorrect && isSelected && 'border-destructive bg-destructive text-destructive-foreground',
                isRevealed && !isCorrect && !isSelected && 'border-muted-foreground/30 text-muted-foreground'
              )}
            >
              {opt.id}
            </div>
            <div className="flex-1">
              <MathText text={opt.content} />
            </div>
            {!isRevealed ? (
              <kbd className="hidden sm:inline-flex">{i + 1}</kbd>
            ) : isCorrect ? (
              <Check className="h-5 w-5 text-success" />
            ) : isSelected ? (
              <X className="h-5 w-5 text-destructive" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function MultiAnswer({
  body,
  answer,
  isRevealed,
  onChange,
}: {
  body: { options: { id: string; content: string }[]; correct: string[] };
  answer: string[];
  isRevealed: boolean;
  onChange: (v: string[]) => void;
}) {
  const t = useTranslations('practice');
  const toggle = (id: string) => {
    if (answer.includes(id)) onChange(answer.filter((x) => x !== id));
    else onChange([...answer, id]);
  };

  return (
    <div className="space-y-2.5">
      <div className="text-sm text-muted-foreground">{t('multiHint')}</div>
      {body.options.map((opt, i) => {
        const isSelected = answer.includes(opt.id);
        const isCorrect = body.correct.includes(opt.id);
        return (
          <button
            key={opt.id}
            onClick={() => toggle(opt.id)}
            disabled={isRevealed}
            className={cn(
              'group flex w-full items-center gap-3.5 rounded-xl border p-4 text-left transition-all duration-200 ease-smooth',
              !isRevealed && 'cursor-pointer hover:border-primary/50 hover:bg-accent/40 active:scale-[0.995]',
              !isRevealed && isSelected && 'border-primary bg-primary/5 ring-1 ring-primary/30',
              !isRevealed && !isSelected && 'border-border',
              isRevealed && isCorrect && 'border-success/60 bg-success/10',
              isRevealed && !isCorrect && isSelected && 'border-destructive/60 bg-destructive/10',
              isRevealed && !isCorrect && !isSelected && 'opacity-50'
            )}
          >
            <div
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-md border text-xs font-semibold uppercase transition-colors',
                !isRevealed && isSelected && 'border-primary bg-primary text-primary-foreground',
                !isRevealed && !isSelected && 'border-muted-foreground/30 text-muted-foreground group-hover:border-primary/50',
                isRevealed && isCorrect && 'border-success bg-success text-success-foreground',
                isRevealed && !isCorrect && isSelected && 'border-destructive bg-destructive text-destructive-foreground',
                isRevealed && !isCorrect && !isSelected && 'border-muted-foreground/30 text-muted-foreground'
              )}
            >
              {opt.id}
            </div>
            <div className="flex-1">
              <MathText text={opt.content} />
            </div>
            {!isRevealed ? (
              <kbd className="hidden sm:inline-flex">{i + 1}</kbd>
            ) : isCorrect ? (
              <Check className="h-5 w-5 text-success" />
            ) : isSelected ? (
              <X className="h-5 w-5 text-destructive" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function MatchingAnswer({
  body,
  answer,
  isRevealed,
  onChange,
}: {
  body: {
    left: { id: string; content: string }[];
    right: string[];
    correct: Record<string, string>;
  };
  answer: Record<string, string>;
  isRevealed: boolean;
  onChange: (v: Record<string, string>) => void;
}) {
  const t = useTranslations('practice');
  return (
    <div className="space-y-2.5">
      {body.left.map((item) => {
        const selected = answer[item.id];
        const correct = body.correct[item.id];
        const wasCorrect = isRevealed && selected === correct;
        return (
          <div
            key={item.id}
            className={cn(
              'flex items-center gap-3.5 rounded-xl border p-3.5 transition-colors',
              !isRevealed && 'border-border',
              isRevealed && wasCorrect && 'border-success/60 bg-success/10',
              isRevealed && !wasCorrect && 'border-destructive/60 bg-destructive/10'
            )}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-muted-foreground/30 text-xs font-semibold uppercase text-muted-foreground">
              {item.id}
            </span>
            <div className="flex-1">
              <MathText text={item.content} />
            </div>
            <select
              value={selected ?? ''}
              onChange={(e) => onChange({ ...answer, [item.id]: e.target.value })}
              disabled={isRevealed}
              className="rounded-lg border bg-background px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25 disabled:opacity-60"
            >
              <option value="" disabled>
                {t('matchingPlaceholder')}
              </option>
              {body.right.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {isRevealed && !wasCorrect ? (
              <span className="shrink-0 text-sm text-muted-foreground">{t('correctAnswer', { answer: correct })}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
