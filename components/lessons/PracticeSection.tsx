'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ResolvedQuestion } from '@/lib/lessons/catalog';
import { answeredCount, correctCount, fill, type LessonProgress } from '@/lib/lessons/progress';
import { playSound } from '@/lib/sound/ui-sounds';
import { QuestionCard } from './QuestionCard';
import type { LessonLabels } from './labels';

/** 12–15 задач под видео: ответ проверяется сразу, рядом — разбор. Цифры 1–5 выбирают вариант, Enter — дальше. */
export function PracticeSection({
  problems,
  progress,
  onAnswer,
  labels,
}: {
  problems: ResolvedQuestion[];
  progress: LessonProgress;
  onAnswer: (id: string, index: number) => void;
  labels: LessonLabels['practice'];
}) {
  const [active, setActive] = useState(0);
  const jumped = useRef(false);
  const done = answeredCount(problems, progress);
  const right = correctCount(problems, progress);
  const closed = done === problems.length;
  const q = problems[Math.min(active, problems.length - 1)];
  const selected = progress.answers[q.id];

  // После загрузки сохранённого прогресса встаём на первую нерешённую задачу.
  useEffect(() => {
    if (jumped.current) return;
    jumped.current = true;
    const first = problems.findIndex((p) => progress.answers[p.id] === undefined);
    if (first > 0) setActive(first);
  }, [problems, progress.answers]);

  const next = () => {
    const after = problems.findIndex((p, i) => i > active && progress.answers[p.id] === undefined);
    const any = problems.findIndex((p) => progress.answers[p.id] === undefined);
    setActive(after !== -1 ? after : any !== -1 ? any : Math.min(active + 1, problems.length - 1));
  };

  // i — индекс варианта; для вопроса с несколькими ответами — маска отмеченных вариантов
  const answer = (i: number) => {
    if (selected !== undefined) return;
    const ok = i === q.correct;
    playSound(ok ? 'correct' : 'wrong');
    onAnswer(q.id, i);
    if (done + 1 === problems.length) window.setTimeout(() => playSound('complete'), 420);
  };

  const latest = useRef({ answer, next, selected, q, active });
  useEffect(() => {
    latest.current = { answer, next, selected, q, active };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && (t.closest('input,textarea,select,[data-player]') || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const { answer: a, next: n, selected: s, q: cur } = latest.current;
      if (/^[1-6]$/.test(e.key)) {
        const i = Number(e.key) - 1;
        if (!cur.multi && !cur.rows && i < cur.options.length && s === undefined) {
          e.preventDefault();
          a(i);
        }
      } else if (e.key === 'Enter' && s !== undefined) {
        e.preventDefault();
        n();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <section aria-labelledby="practice-title" className="rounded-3xl border bg-card/70 backdrop-blur-xl p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="practice-title" className="text-xl font-bold tracking-tight">
          {labels.title}
        </h2>
        <div className="text-sm text-muted-foreground">
          {fill(labels.progress, { done, total: problems.length })}
          {done > 0 && <> · {fill(labels.correct, { n: right })}</>}
        </div>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-apple" style={{ width: `${(done / problems.length) * 100}%` }} />
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5" role="tablist" aria-label={labels.title}>
        {problems.map((p, i) => {
          const a = progress.answers[p.id];
          const state = a === undefined ? 'todo' : a === p.correct ? 'ok' : 'bad';
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={fill(labels.question, { n: i + 1 })}
              onClick={() => setActive(i)}
              className={cn(
                'h-9 w-9 rounded-full text-[13px] font-semibold tabular-nums transition-[transform,background-color,color,box-shadow] duration-150 ease-apple active:scale-90',
                'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25',
                state === 'todo' && 'bg-muted text-muted-foreground hover:bg-accent',
                state === 'ok' && 'bg-success/15 text-success',
                state === 'bad' && 'bg-destructive/15 text-destructive',
                i === active && 'ring-2 ring-primary ring-offset-2 ring-offset-card'
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      <div key={q.id} className="mt-5 animate-fade-in">
        <QuestionCard
          q={q}
          selected={selected}
          revealed
          onSelect={answer}
          levelLabels={labels.levels}
          heading={fill(labels.question, { n: active + 1 })}
          solutionLabel={labels.solution}
          rightLabel={labels.right}
          wrongLabel={labels.wrong}
          checkLabel={labels.check}
          multiHint={labels.multiHint}
          matchHint={labels.matchHint}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="hidden text-xs text-muted-foreground sm:block">{labels.hint}</p>
        <Button onClick={next} disabled={selected === undefined || (closed && active === problems.length - 1)} className="ml-auto">
          {labels.next}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {closed && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl bg-primary/10 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <div className="font-semibold">{labels.closedTitle}</div>
            <p className="mt-0.5 text-sm text-muted-foreground">{fill(labels.closedText, { correct: right, total: problems.length })}</p>
          </div>
        </div>
      )}
    </section>
  );
}
