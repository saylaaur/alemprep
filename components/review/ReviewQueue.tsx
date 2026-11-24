'use client';

import { useState } from 'react';
import { Link } from '@/i18n/routing';
import { Check, ChevronRight, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardTrainer, type CardReviewLabels } from '@/components/cards/CardReview';
import type { StudyCard } from '@/lib/cards/content';
import { nextToReview, queueProgress } from '@/lib/cards/queue';
import { REVIEW_INTERVALS_DAYS } from '@/lib/books/schedule';

export type QueueItem = {
  slug: string;
  name: string;
  subjectName: string;
  /** Сколько повторений уже засчитано (0..6): сейчас идёт повторение №stage+1. */
  stage: number;
  /** Готовая подпись срока: «сегодня» или «просрочено на 2 дня». */
  dueText: string;
  /** Карточки книги; нет — повторять по самой книге. */
  cards: StudyCard[] | null;
};

export type ReviewQueueLabels = {
  start: string;
  resume: string;
  /** «Повторено {done} из {total}» */
  progress: string;
  /** «Повторение {n} из 7» */
  stage: string;
  repeat: string;
  openBook: string;
  noCards: string;
  allDone: string;
  allDoneHint: string;
  toToday: string;
  toLibrary: string;
  empty: string;
  intervals: string;
};

const fill = (tpl: string, vars: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/**
 * Очередь «Повторить сегодня». Список запоминается при открытии страницы:
 * после каждой книги сервер обновляет данные, но книга остаётся в списке с галочкой.
 */
export function ReviewQueue({
  items,
  dateLocale,
  labels,
  cardLabels,
}: {
  items: QueueItem[];
  dateLocale: string;
  labels: ReviewQueueLabels;
  cardLabels: CardReviewLabels;
}) {
  const [list] = useState(items);
  const [done, setDone] = useState<ReadonlySet<string>>(() => new Set());
  const [active, setActive] = useState<string | null>(null);

  const queue = list.map((b) => ({ slug: b.slug, hasCards: b.cards !== null }));
  const progress = queueProgress(queue, done);
  const current = active ? list.find((b) => b.slug === active) ?? null : null;
  const markDone = (slug: string) => setDone((d) => (d.has(slug) ? d : new Set(d).add(slug)));

  const goNext = () => {
    const next = nextToReview(queue, done);
    setActive(next ? next.slug : null);
  };

  if (list.length === 0) {
    return (
      <div className="glass rounded-3xl p-6 text-center">
        <p className="text-lg font-semibold">{labels.empty}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href="/dashboard">{labels.toToday}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/library">{labels.toLibrary}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="glass rounded-3xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium" aria-live="polite">
              {fill(labels.progress, { done: progress.done, total: progress.total })}
            </p>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
              className="mt-2 h-2 w-64 max-w-full overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full rounded-full bg-streak transition-[width] duration-300 ease-apple" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
          </div>
          {progress.hasNext && (
            <Button size="lg" onClick={goNext}>
              <Layers className="h-4 w-4" aria-hidden="true" />
              {progress.done > 0 ? labels.resume : labels.start}
            </Button>
          )}
        </div>
        {progress.allDone && (
          <div className="mt-4 rounded-2xl bg-success/15 p-4">
            <p className="font-semibold">{labels.allDone}</p>
            <p className="mt-1 text-sm text-muted-foreground">{labels.allDoneHint}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button asChild size="sm">
                <Link href="/dashboard">{labels.toToday}</Link>
              </Button>
              <Button asChild size="sm" variant="secondary">
                <Link href="/library">{labels.toLibrary}</Link>
              </Button>
            </div>
          </div>
        )}
      </div>

      <ul className="grid gap-3">
        {list.map((b) => {
          const isDone = done.has(b.slug);
          const step = Math.min(b.stage, REVIEW_INTERVALS_DAYS.length - 1);
          return (
            <li key={b.slug} className="glass grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 rounded-3xl p-4 sm:grid-cols-[auto_1fr_auto]">
              <span
                aria-hidden="true"
                className={
                  isDone
                    ? 'flex h-14 w-10 shrink-0 items-center justify-center rounded-[3px_8px_8px_3px] bg-success text-success-foreground'
                    : 'h-14 w-10 shrink-0 rounded-[3px_8px_8px_3px] bg-streak shadow-[0_0_0_2px_hsl(var(--streak)/0.4),0_0_14px_hsl(var(--streak)/0.45)]'
                }
              >
                {isDone && <Check className="h-5 w-5" />}
              </span>
              <div className="min-w-0">
                <div className="text-base font-semibold leading-snug">{b.name}</div>
                <div className="text-sm text-muted-foreground">
                  {b.subjectName} · {b.dueText}
                </div>
                <div className="mt-2 text-xs font-medium text-muted-foreground">{fill(labels.stage, { n: step + 1, total: REVIEW_INTERVALS_DAYS.length })}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5" aria-label={labels.intervals}>
                  {REVIEW_INTERVALS_DAYS.map((d, i) => (
                    <span
                      key={d}
                      className={
                        i === step && !isDone
                          ? 'rounded-full bg-streak px-2 py-0.5 text-xs font-semibold text-[#2b1100]'
                          : i < step || isDone
                            ? 'rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary'
                            : 'rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'
                      }
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </div>
              {b.cards ? (
                <Button className="col-span-2 sm:col-span-1" variant={isDone ? 'secondary' : 'default'} onClick={() => setActive(b.slug)}>
                  {labels.repeat}
                </Button>
              ) : (
                <Button asChild variant="outline" className="col-span-2 sm:col-span-1">
                  <Link href={{ pathname: '/library/[book]', params: { book: b.slug } }}>
                    {labels.openBook}
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              )}
              {!b.cards && <p className="col-span-full text-xs text-muted-foreground">{labels.noCards}</p>}
            </li>
          );
        })}
      </ul>

      {current?.cards && (
        <CardTrainer
          key={current.slug}
          slug={current.slug}
          cards={current.cards}
          title={current.name}
          kicker={current.subjectName}
          due={true}
          dateLocale={dateLocale}
          labels={cardLabels}
          onClose={() => setActive(null)}
          onSaved={() => markDone(current.slug)}
          onNext={goNext}
        />
      )}
    </div>
  );
}
