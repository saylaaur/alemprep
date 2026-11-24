'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Lock, RotateCcw, Trophy } from 'lucide-react';
import { MathText } from '@/components/math/MathText';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ResolvedQuestion } from '@/lib/lessons/catalog';
import { fill } from '@/lib/lessons/progress';
import { playSound } from '@/lib/sound/ui-sounds';
import { QuestionCard } from './QuestionCard';
import type { LessonLabels } from './labels';

type Phase = 'intro' | 'running' | 'done';

/**
 * Пробник строго по теме: закрыт, пока не решены все задачи. Ответы не показываем до конца,
 * потом — результат и разбор каждого вопроса.
 */
export function MockSection({
  questions,
  unlocked,
  left,
  best,
  onFinish,
  labels,
  demoUnlock,
}: {
  questions: ResolvedQuestion[];
  unlocked: boolean;
  left: number;
  best: { score: number; total: number } | null;
  onFinish: (score: number, total: number) => void;
  labels: LessonLabels['mock'];
  /** Только для демо: открыть пробник, не решая задачи. */
  demoUnlock?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | undefined)[]>([]);
  const wasUnlocked = useRef(unlocked);

  useEffect(() => {
    if (unlocked && !wasUnlocked.current) window.setTimeout(() => playSound('unlock'), 900);
    wasUnlocked.current = unlocked;
  }, [unlocked]);

  const start = () => {
    setAnswers(Array(questions.length).fill(undefined));
    setIndex(0);
    setPhase('running');
  };

  const choose = (i: number) => {
    playSound('select');
    setAnswers((a) => a.map((v, k) => (k === index ? i : v)));
  };

  const go = (to: number) => {
    playSound('flip');
    setIndex(to);
  };

  const finish = () => {
    const score = questions.filter((q, i) => answers[i] === q.correct).length;
    onFinish(score, questions.length);
    setPhase('done');
    playSound(score / questions.length >= 0.6 ? 'complete' : 'wrong');
  };

  const score = questions.filter((q, i) => answers[i] === q.correct).length;
  const q = questions[index];
  const allAnswered = answers.length === questions.length && answers.every((a) => a !== undefined);

  return (
    <section aria-labelledby="mock-title" className="relative overflow-hidden rounded-3xl border bg-card/70 backdrop-blur-xl p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="mock-title" className="flex items-center gap-2 text-xl font-bold tracking-tight">
          {labels.title}
          {!unlocked && <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />}
        </h2>
        {best && <div className="text-sm text-muted-foreground">{fill(labels.best, { score: best.score, total: best.total })}</div>}
      </div>

      {!unlocked && (
        <div className="mt-4 rounded-2xl bg-muted/60 p-5">
          <div className="font-semibold">{labels.lockedTitle}</div>
          <p className="mt-1 text-sm text-muted-foreground">{fill(labels.lockedHint, { left })}</p>
          {demoUnlock && (
            <Button variant="outline" size="sm" className="mt-3" onClick={demoUnlock}>
              {labels.unlockDemo}
            </Button>
          )}
        </div>
      )}

      {unlocked && phase === 'intro' && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-primary/10 p-5">
          <p className="max-w-md text-[15px]">{fill(labels.intro, { n: questions.length })}</p>
          <Button onClick={start}>
            {labels.start}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {unlocked && phase === 'running' && q && (
        <div className="mt-4">
          <div className="mb-4 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-apple" style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
            </div>
            <span className="text-sm tabular-nums text-muted-foreground">{fill(labels.question, { n: index + 1, total: questions.length })}</span>
          </div>
          <div key={q.id} className="animate-fade-in">
            <QuestionCard
              q={q}
              selected={answers[index]}
              revealed={false}
              onSelect={choose}
              heading={fill(labels.question, { n: index + 1, total: questions.length })}
              solutionLabel=""
              rightLabel=""
              wrongLabel=""
            />
          </div>
          <div className="mt-5 flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => go(index - 1)} disabled={index === 0}>
              <ArrowLeft className="h-4 w-4" />
              {labels.prev}
            </Button>
            {index < questions.length - 1 ? (
              <Button onClick={() => go(index + 1)} disabled={answers[index] === undefined}>
                {labels.next}
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={finish} disabled={!allAnswered}>
                {labels.finish}
              </Button>
            )}
          </div>
        </div>
      )}

      {unlocked && phase === 'done' && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-primary/10 p-5">
            <Trophy className="h-8 w-8 text-primary" aria-hidden />
            <div className="flex-1">
              <div className="text-3xl font-bold tabular-nums tracking-tight">{fill(labels.result, { score, total: questions.length })}</div>
            </div>
            <Button variant="outline" onClick={start}>
              <RotateCcw className="h-4 w-4" />
              {labels.retry}
            </Button>
          </div>
          <h3 className="mb-2 mt-5 text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">{labels.review}</h3>
          <ol className="grid gap-2">
            {questions.map((item, i) => {
              const a = answers[i];
              const ok = a === item.correct;
              return (
                <li key={item.id}>
                  <details className="group rounded-2xl border bg-background px-4 py-3">
                    <summary className="flex cursor-pointer list-none items-start gap-3 text-[15px]">
                      <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold', ok ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive')}>
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <MathText text={item.question} />
                      </span>
                    </summary>
                    <div className="mt-3 grid gap-1 pl-9 text-sm">
                      {!ok && (
                        <p>
                          <span className="text-muted-foreground">{labels.yourAnswer}: </span>
                          <MathText text={a === undefined ? '—' : item.options[a]} />
                        </p>
                      )}
                      <p>
                        <span className="text-muted-foreground">{labels.rightAnswer}: </span>
                        <span className="font-medium">
                          <MathText text={item.options[item.correct]} />
                        </span>
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        <MathText text={item.solution} />
                      </p>
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
