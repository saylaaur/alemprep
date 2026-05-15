'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { MathText } from '@/components/math/MathText';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check, X, ArrowRight, CircleDot, Square, CheckSquare, Keyboard } from 'lucide-react';
import type { Question, QuestionBody, Explanation, ContextContent } from '@/types/db';
import { recordAttempt } from '@/lib/supabase/practice-actions';

type Props = {
  questions: Question[];
  contexts: Map<string, { id: string; title: string | null; content: ContextContent }>;
  topicName: string;
};

type AnswerState = string | string[] | Record<string, string> | null;

function isAnswerComplete(type: Question['type'], answer: AnswerState, body: QuestionBody): boolean {
  if (answer === null) return false;
  if (type === 'single') return typeof answer === 'string' && answer.length > 0;
  if (type === 'multi') return Array.isArray(answer) && answer.length > 0;
  if (type === 'matching' && 'left' in body) {
    const obj = answer as Record<string, string>;
    return body.left.every((l) => obj[l.id]);
  }
  return false;
}

function checkAnswer(type: Question['type'], answer: AnswerState, body: QuestionBody): boolean {
  if (answer === null) return false;
  if (type === 'single' && 'correct' in body && typeof body.correct === 'string') {
    return answer === body.correct;
  }
  if (type === 'multi' && 'correct' in body && Array.isArray(body.correct)) {
    const a = answer as string[];
    if (a.length !== body.correct.length) return false;
    return body.correct.every((c) => a.includes(c));
  }
  if (type === 'matching' && 'correct' in body && typeof body.correct === 'object' && !Array.isArray(body.correct)) {
    const a = answer as Record<string, string>;
    const c = body.correct as Record<string, string>;
    return Object.keys(c).every((k) => a[k] === c[k]);
  }
  return false;
}

export function PracticeView({ questions, contexts, topicName }: Props) {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
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

  const stats = useMemo(() => {
    let correct = 0;
    for (const q of questions) {
      if (revealed[q.id] && checkAnswer(q.type, answers[q.id] ?? null, q.body)) correct++;
    }
    return { correct, answered: Object.keys(revealed).length };
  }, [questions, answers, revealed]);

  if (total === 0) {
    return (
      <div className="grid place-items-center p-16 text-muted-foreground">
        Пока нет задач по этой теме.
      </div>
    );
  }

  const answer = answers[current.id] ?? null;
  const isRevealed = !!revealed[current.id];
  const isCorrect = isRevealed && checkAnswer(current.type, answer, current.body);
  const ctx = current.context_id ? contexts.get(current.context_id) : null;

  const setAnswer = (next: AnswerState) => {
    if (isRevealed) return;
    setAnswers((prev) => ({ ...prev, [current.id]: next }));
  };

  const check = () => {
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

  // Клавиатурные шорткаты
  useEffect(() => {
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

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {topicName} ·{' '}
          <span className="text-foreground font-medium">
            {idx + 1} / {total}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
            <Keyboard className="h-3.5 w-3.5" />
            <span>
              <kbd className="rounded border px-1.5 py-0.5 font-mono text-[10px]">1–4</kbd> выбор ·{' '}
              <kbd className="rounded border px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd>{' '}
              проверить
            </span>
          </div>
          <div className="text-sm text-muted-foreground">
            <span className="text-foreground font-medium">{stats.correct}</span>/{stats.answered}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-8 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${((idx + 1) / total) * 100}%` }}
        />
      </div>

      {/* Question navigator */}
      <div className="mb-8 flex flex-wrap gap-1.5">
        {questions.map((q, i) => {
          const wasRevealed = !!revealed[q.id];
          const wasCorrect = wasRevealed && checkAnswer(q.type, answers[q.id] ?? null, q.body);
          return (
            <button
              key={q.id}
              onClick={() => setIdx(i)}
              className={cn(
                'h-7 w-7 rounded-md text-xs font-medium transition-colors',
                i === idx && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                !wasRevealed && i !== idx && 'bg-muted text-muted-foreground hover:bg-muted/80',
                !wasRevealed && i === idx && 'bg-muted text-foreground',
                wasRevealed && wasCorrect && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
                wasRevealed && !wasCorrect && 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

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
              'flex items-center gap-2 rounded-md p-3 text-sm font-medium',
              isCorrect
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
            )}
          >
            {isCorrect ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
            {isCorrect ? 'Правильно!' : 'Неверно'}
          </div>
          {current.explanation ? (
            <div className="rounded-md border bg-card p-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <div className="font-medium text-foreground">Разбор</div>
              {((current.explanation as Explanation).blocks ?? []).map((b, i) => (
                <div key={i}>
                  <MathText text={b.value} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Controls */}
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={goPrev} disabled={idx === 0}>
          Назад
        </Button>
        {!isRevealed ? (
          <Button
            onClick={check}
            disabled={!isAnswerComplete(current.type, answer, current.body)}
          >
            Проверить
          </Button>
        ) : isLast && allDone ? (
          <div className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            Всё решено · {stats.correct} из {total}
          </div>
        ) : (
          <Button onClick={goNext} disabled={isLast}>
            Дальше
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
    <div className="mb-6 rounded-md border bg-muted/30 p-4">
      {ctx.title ? <div className="mb-2 text-sm font-semibold">{ctx.title}</div> : null}
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
        {(ctx.content.blocks ?? []).map((b, i) => (
          <div key={i}>
            <MathText text={b.value} />
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
    <div className="space-y-2">
      {body.options.map((opt) => {
        const isSelected = answer === opt.id;
        const isCorrect = opt.id === body.correct;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            disabled={isRevealed}
            className={cn(
              'flex w-full items-center gap-3 rounded-md border p-4 text-left transition-colors',
              !isRevealed && 'hover:border-primary/50 cursor-pointer',
              !isRevealed && isSelected && 'border-primary bg-primary/5',
              !isRevealed && !isSelected && 'border-border',
              isRevealed && isCorrect && 'border-emerald-500 bg-emerald-500/10',
              isRevealed && !isCorrect && isSelected && 'border-rose-500 bg-rose-500/10',
              isRevealed && !isCorrect && !isSelected && 'opacity-50'
            )}
          >
            <div
              className={cn(
                'grid h-5 w-5 shrink-0 place-items-center rounded-full border',
                isSelected ? 'border-primary' : 'border-muted-foreground/30'
              )}
            >
              {isSelected ? <CircleDot className="h-3 w-3 text-primary" /> : null}
            </div>
            <div className="flex-1">
              <span className="mr-2 font-semibold">{opt.id})</span>
              <MathText text={opt.content} />
            </div>
            {isRevealed && isCorrect ? <Check className="h-4 w-4 text-emerald-500" /> : null}
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
  const toggle = (id: string) => {
    if (answer.includes(id)) onChange(answer.filter((x) => x !== id));
    else onChange([...answer, id]);
  };

  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground">Можно выбрать несколько вариантов</div>
      {body.options.map((opt) => {
        const isSelected = answer.includes(opt.id);
        const isCorrect = body.correct.includes(opt.id);
        return (
          <button
            key={opt.id}
            onClick={() => toggle(opt.id)}
            disabled={isRevealed}
            className={cn(
              'flex w-full items-center gap-3 rounded-md border p-4 text-left transition-colors',
              !isRevealed && 'hover:border-primary/50 cursor-pointer',
              !isRevealed && isSelected && 'border-primary bg-primary/5',
              !isRevealed && !isSelected && 'border-border',
              isRevealed && isCorrect && 'border-emerald-500 bg-emerald-500/10',
              isRevealed && !isCorrect && isSelected && 'border-rose-500 bg-rose-500/10',
              isRevealed && !isCorrect && !isSelected && 'opacity-50'
            )}
          >
            <div
              className={cn(
                'grid h-5 w-5 shrink-0 place-items-center rounded border',
                isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'
              )}
            >
              {isSelected ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3 opacity-0" />}
            </div>
            <div className="flex-1">
              <span className="mr-2 font-semibold">{opt.id})</span>
              <MathText text={opt.content} />
            </div>
            {isRevealed && isCorrect ? <Check className="h-4 w-4 text-emerald-500" /> : null}
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
  return (
    <div className="space-y-2">
      {body.left.map((item) => {
        const selected = answer[item.id];
        const correct = body.correct[item.id];
        const wasCorrect = isRevealed && selected === correct;
        return (
          <div
            key={item.id}
            className={cn(
              'flex items-center gap-3 rounded-md border p-3',
              isRevealed && wasCorrect && 'border-emerald-500 bg-emerald-500/10',
              isRevealed && !wasCorrect && 'border-rose-500 bg-rose-500/10'
            )}
          >
            <span className="font-semibold">{item.id})</span>
            <div className="flex-1">
              <MathText text={item.content} />
            </div>
            <select
              value={selected ?? ''}
              onChange={(e) => onChange({ ...answer, [item.id]: e.target.value })}
              disabled={isRevealed}
              className="rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60"
            >
              <option value="" disabled>
                Выбери…
              </option>
              {body.right.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {isRevealed && !wasCorrect ? (
              <span className="text-sm text-muted-foreground">верно: {correct}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
