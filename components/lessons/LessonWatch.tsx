'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { BookOpen, CheckCircle2, Flame } from 'lucide-react';
import { SoundToggle } from '@/components/sound/SoundProvider';
import type { BookContent } from '@/lib/books/content';
import type { ResolvedLesson } from '@/lib/lessons/catalog';
import { EMPTY_PROGRESS, answeredCount, fill, isTopicClosed, loadProgress, saveProgress, type LessonProgress } from '@/lib/lessons/progress';
import { BookNotes } from './BookNotes';
import { MockSection } from './MockSection';
import { PracticeSection } from './PracticeSection';
import { VideoPlayer } from './VideoPlayer';
import type { LessonLabels } from './labels';

/**
 * Страница видеоурока в духе YouTube: слева видео, под ним 12–15 задач и пробник по теме,
 * справа — страницы книги-конспекта. Без зависимостей от роутера: ссылки приходят слотами.
 */
export function LessonWatch({
  lesson,
  subtitle,
  book,
  bookTitle,
  bookAction,
  backSlot,
  labels,
  demo = false,
  activityUrl,
  giftBook,
  accountId,
  dateLocale = 'ru-RU',
}: {
  lesson: ResolvedLesson;
  subtitle: string;
  book: BookContent | null;
  bookTitle: string;
  bookAction?: ReactNode;
  backSlot?: ReactNode;
  labels: LessonLabels;
  demo?: boolean;
  /** Куда сообщать о сделанном (задача решена, урок просмотрен) — чтобы кольца и серия на «Сегодня» видели урок. */
  activityUrl?: string;
  accountId?: string;
  /** Выдать книгу-конспект, когда тема закрыта. Повторный вызов безопасен. */
  giftBook?: () => Promise<{ ok: boolean; dueOn?: string | null }>;
  dateLocale?: string;
}) {
  const [progress, setProgress] = useState<LessonProgress>(EMPTY_PROGRESS);
  const loaded = useRef(false);
  const [forced, setForced] = useState(false);

  useEffect(() => {
    setProgress(loadProgress(lesson.id, accountId));
    loaded.current = true;
  }, [lesson.id, accountId]);

  const update = useCallback(
    (fn: (p: LessonProgress) => LessonProgress) => {
      setProgress((prev) => {
        const next = fn(prev);
        if (loaded.current) saveProgress(lesson.id, next, accountId);
        return next;
      });
    },
    [lesson.id, accountId]
  );

  // Запросы к cookie идут строго по очереди: два одновременных перезаписали бы друг друга.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(job, job);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  const [streak, setStreak] = useState<number | null>(null);
  const reportActivity = useCallback(
    (kind: 'problem' | 'lesson') => {
      if (!activityUrl) return;
      void enqueue(async () => {
        try {
          const res = await fetch(activityUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ kind }),
          });
          const data = (await res.json()) as { ok?: boolean; streak?: number };
          if (data.ok && typeof data.streak === 'number') setStreak(data.streak);
        } catch {
          /* сеть пропала — прогресс урока всё равно сохранён в браузере */
        }
      });
    },
    [activityUrl, enqueue]
  );

  const [gift, setGift] = useState<{ dueOn: string | null } | null>(null);
  const giftAsked = useRef(false);

  const closed = isTopicClosed(lesson.problems, progress);

  useEffect(() => {
    if (!closed || !loaded.current || !giftBook || giftAsked.current) return;
    giftAsked.current = true;
    void enqueue(async () => {
      try {
        const r = await giftBook();
        if (r.ok) setGift({ dueOn: r.dueOn ?? null });
      } catch {
        /* книга останется доступной в библиотеке; в следующий раз попробуем снова */
        giftAsked.current = false;
      }
    });
  }, [closed, giftBook, enqueue]);
  const left = lesson.problems.length - answeredCount(lesson.problems, progress);

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
      {backSlot && <div className="mb-3">{backSlot}</div>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-6">
          <VideoPlayer
            src={lesson.video}
            poster={lesson.poster}
            labels={labels.video}
            onWatched={() => {
              if (!progress.watched) reportActivity('lesson');
              update((p) => (p.watched ? p : { ...p, watched: true }));
            }}
          />

          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{subtitle}</div>
              <h1 className="mt-1 text-balance text-2xl font-bold tracking-tight sm:text-3xl">{lesson.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                {progress.watched && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
                    <CheckCircle2 className="h-4 w-4" />
                    {labels.video.watched}
                  </span>
                )}
                {streak !== null && streak > 0 && labels.streakChip && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-streak/15 px-2.5 py-1 font-semibold text-streak">
                    <Flame className="h-4 w-4 fill-streak" aria-hidden />
                    {fill(labels.streakChip, { n: streak })}
                  </span>
                )}
                {demo && <span className="rounded-full bg-foreground px-2.5 py-1 text-xs font-semibold text-background">{labels.demoBadge}</span>}
                {lesson.textFallback && <span className="text-muted-foreground">{labels.textFallback}</span>}
              </div>
            </div>
            <SoundToggle labelOn={labels.sound.on} labelOff={labels.sound.off} />
          </header>

          <PracticeSection
            problems={lesson.problems}
            progress={progress}
            onAnswer={(id, i) => {
              if (progress.answers[id] === undefined) reportActivity('problem');
              update((p) => ({ ...p, answers: { ...p.answers, [id]: i } }));
            }}
            labels={labels.practice}
          />

          {gift && labels.gift && (
            <section className="flex flex-wrap items-center gap-4 rounded-3xl border border-primary/25 bg-primary/10 p-5 backdrop-blur-xl">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-primary">
                <BookOpen className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold">{labels.gift.title}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {fill(labels.gift.text, {
                    date: gift.dueOn
                      ? new Date(`${gift.dueOn}T12:00:00Z`).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long' })
                      : '—',
                  })}
                </p>
              </div>
              {bookAction}
            </section>
          )}

          <MockSection
            questions={lesson.mock}
            unlocked={closed || forced}
            left={left}
            best={progress.mock}
            onFinish={(score, total) =>
              update((p) => (!p.mock || score / total > p.mock.score / p.mock.total ? { ...p, mock: { score, total } } : p))
            }
            labels={labels.mock}
            demoUnlock={demo ? () => setForced(true) : undefined}
          />
        </div>

        <aside className="min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain">
          <BookNotes title={bookTitle} content={book} action={bookAction} labels={labels.notes} />
        </aside>
      </div>
    </div>
  );
}
