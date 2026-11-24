'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Clock, RotateCcw, Trophy } from 'lucide-react';
import { MathText } from '@/components/math/MathText';
import { QuestionCard } from '@/components/lessons/QuestionCard';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ResolvedQuestion } from '@/lib/lessons/catalog';
import type { TestKind } from '@/lib/local/state';
import { playSound } from '@/lib/sound/ui-sounds';

export type LocalTestLabels = {
  title: string;
  intro: string;
  /** «{n} вопросов · {min} мин» */
  facts: string;
  /** «Сейчас доступно {n} из {max} вопросов …» — null, если вопросов хватает */
  partial: string | null;
  best: string;
  start: string;
  /** «Вопрос {n} из {total}» */
  question: string;
  prev: string;
  next: string;
  finish: string;
  /** «Не отвечено: {n}» */
  unanswered: string;
  /** «{score} из {total}» */
  result: string;
  /** «{percent}%» */
  percent: string;
  timeUp: string;
  retry: string;
  review: string;
  yourAnswer: string;
  rightAnswer: string;
  saveError: string;
  timer: string;
  questionList: string;
  verdictGood: string;
  verdictMid: string;
  verdictLow: string;
  empty: string;
};

type Phase = 'intro' | 'running' | 'done';

const fill = (tpl: string, vars: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export function LocalTest({
  kind,
  questions,
  seconds,
  best,
  labels,
}: {
  kind: TestKind;
  questions: ResolvedQuestion[];
  seconds: number;
  best: { correct: number; total: number } | null;
  labels: LocalTestLabels;
}) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | undefined)[]>([]);
  const [left, setLeft] = useState(seconds);
  const [timeUp, setTimeUp] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const endAt = useRef(0);
  const answersRef = useRef<(number | undefined)[]>([]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const finish = useCallback(
    (byTimer: boolean) => {
      const given = answersRef.current;
      const correct = questions.filter((q, i) => given[i] === q.correct).length;
      setTimeUp(byTimer);
      setPhase('done');
      playSound(correct / questions.length >= 0.6 ? 'complete' : 'wrong');
      fetch('/api/local/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, correct, total: questions.length }),
      })
        .then((r) => setSaveFailed(!r.ok))
        .catch(() => setSaveFailed(true));
    },
    [kind, questions]
  );
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  const start = () => {
    const empty = Array<number | undefined>(questions.length).fill(undefined);
    answersRef.current = empty;
    setAnswers(empty);
    setIndex(0);
    setTimeUp(false);
    setSaveFailed(false);
    endAt.current = Date.now() + seconds * 1000;
    setLeft(seconds);
    setPhase('running');
  };

  // Таймер: считаем от конечной метки, а не по числу тиков — вкладка в фоне не «замедляет» время.
  useEffect(() => {
    if (phase !== 'running') return;
    const id = window.setInterval(() => {
      const rest = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000));
      setLeft(rest);
      if (rest === 0) finishRef.current(true);
    }, 500);
    return () => window.clearInterval(id);
  }, [phase]);

  const choose = useCallback(
    (i: number) => {
      playSound('select');
      setAnswers((a) => a.map((v, k) => (k === index ? i : v)));
    },
    [index]
  );
  const go = useCallback(
    (to: number) => {
      if (to < 0 || to >= questions.length) return;
      playSound('flip');
      setIndex(to);
    },
    [questions.length]
  );

  // Клавиши: 1–6 выбрать вариант, ← → переходить между вопросами.
  useEffect(() => {
    if (phase !== 'running') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= (questions[index]?.options.length ?? 0)) choose(n - 1);
      else if (e.key === 'ArrowRight') go(index + 1);
      else if (e.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, index, questions, choose, go]);

  if (questions.length === 0) {
    return <div className="glass rounded-3xl p-6 text-center text-muted-foreground">{labels.empty}</div>;
  }

  const q = questions[index];
  const score = questions.filter((item, i) => answers[i] === item.correct).length;
  const unanswered = answers.filter((a) => a === undefined).length;
  const ratio = score / questions.length;

  return (
    <section className="glass rounded-3xl p-4 sm:p-6" aria-labelledby="local-test-title">
      {phase === 'intro' && (
        <div>
          <h2 id="local-test-title" className="text-2xl font-bold tracking-tight">
            {labels.title}
          </h2>
          <p className="mt-2 max-w-xl text-[15px] text-muted-foreground">{labels.intro}</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-muted px-3.5 py-1.5 text-sm font-medium">
            <Clock className="h-4 w-4" aria-hidden="true" />
            {fill(labels.facts, { n: questions.length, min: Math.round(seconds / 60) })}
          </div>
          {labels.partial && <p className="mt-3 text-sm text-muted-foreground">{labels.partial}</p>}
          {best && <p className="mt-3 text-sm text-muted-foreground">{fill(labels.best, { score: best.correct, total: best.total })}</p>}
          <Button size="lg" className="mt-5" onClick={start}>
            {labels.start}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}

      {phase === 'running' && q && (
        <div>
          <div className="mb-4 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-apple" style={{ width: `${((questions.length - unanswered) / questions.length) * 100}%` }} />
            </div>
            <span
              className={cn('inline-flex items-center gap-1.5 font-mono text-sm font-semibold tabular-nums', left <= 60 ? 'text-streak' : 'text-muted-foreground')}
              role="timer"
              aria-label={labels.timer}
            >
              <Clock className="h-4 w-4" aria-hidden="true" />
              {clock(left)}
            </span>
          </div>

          <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label={labels.questionList}>
            {questions.map((item, i) => (
              <button
                key={item.id}
                type="button"
                data-sound="off"
                onClick={() => go(i)}
                aria-label={fill(labels.question, { n: i + 1, total: questions.length })}
                aria-current={i === index ? 'step' : undefined}
                className={cn(
                  'h-8 min-w-8 rounded-lg px-2 text-xs font-semibold tabular-nums transition-colors duration-150',
                  i === index ? 'bg-primary text-primary-foreground' : answers[i] !== undefined ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground hover:bg-accent'
                )}
              >
                {i + 1}
              </button>
            ))}
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
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {labels.prev}
            </Button>
            {index < questions.length - 1 ? (
              <Button onClick={() => go(index + 1)}>
                {labels.next}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : (
              <Button onClick={() => finish(false)}>{labels.finish}</Button>
            )}
          </div>
          {unanswered > 0 && index === questions.length - 1 && <p className="mt-3 text-right text-xs text-muted-foreground">{fill(labels.unanswered, { n: unanswered })}</p>}
        </div>
      )}

      {phase === 'done' && (
        <div>
          <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-primary/10 p-5">
            <Trophy className="h-8 w-8 text-primary" aria-hidden="true" />
            <div className="min-w-[10rem] flex-1">
              <div className="text-3xl font-bold tabular-nums tracking-tight">{fill(labels.result, { score, total: questions.length })}</div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                {fill(labels.percent, { percent: Math.round(ratio * 100) })} · {ratio >= 0.8 ? labels.verdictGood : ratio >= 0.5 ? labels.verdictMid : labels.verdictLow}
              </div>
              {timeUp && <div className="mt-1 text-sm font-medium text-streak">{labels.timeUp}</div>}
              {saveFailed && <div className="mt-1 text-sm text-destructive">{labels.saveError}</div>}
            </div>
            <Button variant="outline" onClick={start} className="w-full sm:w-auto">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
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
                      <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold', ok ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive')}>{i + 1}</span>
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
