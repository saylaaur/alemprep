'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from '@/i18n/routing';
import { Check, Layers, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { reviewBookAction } from '@/lib/supabase/book-actions';
import { playSound } from '@/lib/sound/ui-sounds';
import type { StudyCard } from '@/lib/cards/content';
import { answer, currentCard, flip, isFinished, retryMissed, startSession, summary, type Session } from '@/lib/cards/session';
import { CollectibleCard, type CollectibleCardLabels } from './CollectibleCard';

export type CardReviewLabels = CollectibleCardLabels & {
  start: string;
  startHint: string;
  fallback: string | null;
  close: string;
  /** «Карточка {n} из {total}» */
  progress: string;
  showAnswer: string;
  forgot: string;
  recalled: string;
  keys: string;
  /** «Вспомнил {recalled} из {total}» */
  resultTitle: string;
  saving: string;
  /** «Повторение засчитано. Следующее: {date}» */
  savedCounted: string;
  /** «Меньше половины — шаг назад. Следующее: {date}» */
  savedLapse: string;
  /** «Срок ещё не наступил, график не изменился. Следующее: {date}» */
  savedEarly: string;
  savedMastered: string;
  saveError: string;
  saveRetry: string;
  /** «Повторить забытые ({n})» */
  retryMissed: string;
  trainingDone: string;
  allRecalled: string;
  /** «Следующая книга» — только в очереди «Повторить сегодня» */
  next?: string;
};

type Save = { status: 'idle' } | { status: 'saving' } | { status: 'error' } | { status: 'saved'; dueOn: string | null };

const fill = (tpl: string, vars: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/**
 * Повторение книги по карточкам. Результат первого прохода («вспомнил N из M»)
 * уходит в график книги 1-3-7-10-14-30-60 так же, как три кнопки раньше.
 */
export function CardReview({
  slug,
  cards,
  title,
  kicker,
  due,
  dateLocale,
  labels,
}: {
  slug: string;
  cards: StudyCard[];
  title: string;
  kicker: string;
  /** Срок повторения наступил — график сдвинется. */
  due: boolean;
  dateLocale: string;
  labels: CardReviewLabels;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid gap-3">
      <div>
        <h3 className="text-base font-semibold">{labels.start}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{fill(labels.startHint, { count: cards.length })}</p>
        {labels.fallback && <p className="mt-1 text-sm text-muted-foreground">{labels.fallback}</p>}
      </div>
      <div>
        <Button size="lg" onClick={() => setOpen(true)}>
          <Layers className="h-4 w-4" aria-hidden="true" />
          {labels.start}
        </Button>
      </div>
      {open && (
        <CardTrainer slug={slug} cards={cards} title={title} kicker={kicker} due={due} dateLocale={dateLocale} labels={labels} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

/**
 * Окно тренажёра. Используется со страницы книги и из очереди «Повторить сегодня».
 * onSaved — результат первого прохода записан в график; onNext — показать кнопку «Следующая книга».
 */
export function CardTrainer({
  slug,
  cards,
  title,
  kicker,
  due,
  dateLocale,
  labels,
  onClose,
  onSaved,
  onNext,
}: {
  slug: string;
  cards: StudyCard[];
  title: string;
  kicker: string;
  due: boolean;
  dateLocale: string;
  labels: CardReviewLabels;
  onClose: () => void;
  onSaved?: () => void;
  onNext?: () => void;
}) {
  const router = useRouter();
  const [session, setSession] = useState<Session>(() => startSession(cards));
  const [save, setSave] = useState<Save>({ status: 'idle' });
  const [firstRatio, setFirstRatio] = useState<number | null>(null);
  // после сохранения страница обновится и `due` станет false — помним, как было на старте
  const [dueAtStart] = useState(due);
  const root = useRef<HTMLDivElement>(null);
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // фокус в окно, замок прокрутки страницы, возврат фокуса при закрытии
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  const persist = useCallback(
    async (ratio: number) => {
      setSave({ status: 'saving' });
      const r = await reviewBookAction(slug, ratio);
      if (r.ok) {
        setSave({ status: 'saved', dueOn: r.dueOn });
        onSaved?.();
        router.refresh();
      } else {
        setSave({ status: 'error' });
      }
    },
    [router, slug, onSaved]
  );

  const onFlip = useCallback(() => {
    const s = sessionRef.current;
    if (isFinished(s)) return;
    playSound('flip');
    setSession(flip(s));
  }, []);

  const onAnswer = useCallback(
    (recalled: boolean) => {
      const s = sessionRef.current;
      if (isFinished(s) || !s.flipped) return;
      const next = answer(s, recalled);
      playSound(isFinished(next) ? 'complete' : recalled ? 'correct' : 'wrong');
      setSession(next);
      if (isFinished(next) && next.pass === 0) {
        const ratio = summary(next).ratio;
        setFirstRatio(ratio);
        void persist(ratio);
      }
    },
    [persist]
  );

  const onRetryMissed = () => {
    const next = retryMissed(session);
    if (next) setSession(next);
  };

  // клавиши: Пробел/Enter — перевернуть, ← или 1 — не вспомнил, → или 2 — вспомнил, Esc — закрыть
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.closest('input, textarea, select') || t.isContentEditable)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      const onControl = t instanceof HTMLElement && !!t.closest('button, a');
      if ((e.key === ' ' || e.key === 'Enter') && !onControl) {
        e.preventDefault();
        onFlip();
      } else if (e.key === 'ArrowLeft' || e.key === '1') {
        e.preventDefault();
        onAnswer(false);
      } else if (e.key === 'ArrowRight' || e.key === '2') {
        e.preventDefault();
        onAnswer(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onAnswer, onClose, onFlip]);

  const finished = isFinished(session);
  const card = currentCard(session);
  const total = session.deck.length;
  const result = summary(session);
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long' });

  let saveLine: string | null = null;
  if (session.pass === 0 && save.status === 'saving') saveLine = labels.saving;
  if (session.pass === 0 && save.status === 'saved') {
    if (save.dueOn === null) saveLine = labels.savedMastered;
    else {
      const date = fmt(save.dueOn);
      saveLine = !dueAtStart ? fill(labels.savedEarly, { date }) : (firstRatio ?? 1) < 0.5 ? fill(labels.savedLapse, { date }) : fill(labels.savedCounted, { date });
    }
  }

  // в портале: у родителя есть backdrop-filter, из-за него fixed считался бы от его границ
  return createPortal(
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={labels.start}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background/95 backdrop-blur-xl focus-visible:outline-none"
    >
      <div className="mx-auto flex w-full max-w-xl items-center gap-3 px-4 pb-2 pt-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{title}</div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={Math.min(session.index, total)}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-apple" style={{ width: `${(Math.min(session.index, total) / total) * 100}%` }} />
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label={labels.close} onClick={onClose}>
          <X className="h-5 w-5" aria-hidden="true" />
        </Button>
      </div>

      {!finished && card && (
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 px-4 pb-8 pt-2 sm:px-6">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {fill(labels.progress, { n: session.index + 1, total })}
          </p>
          <CollectibleCard
            key={`${session.pass}-${card.id}`}
            card={card}
            number={session.index + 1}
            total={total}
            title={title}
            kicker={kicker}
            flipped={session.flipped}
            onFlip={onFlip}
            labels={labels}
          />
          <div className="grid w-full max-w-[350px] gap-2">
            {session.flipped ? (
              <div className="grid grid-cols-2 gap-3">
                <Button type="button" data-sound="off" size="lg" variant="outline" className="border-destructive/50 text-destructive hover:text-destructive" onClick={() => onAnswer(false)}>
                  <X className="h-4 w-4" aria-hidden="true" />
                  {labels.forgot}
                </Button>
                <Button type="button" data-sound="off" size="lg" onClick={() => onAnswer(true)}>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {labels.recalled}
                </Button>
              </div>
            ) : (
              <Button type="button" data-sound="off" size="lg" onClick={onFlip}>
                {labels.showAnswer}
              </Button>
            )}
            <p className="hidden text-center text-xs text-muted-foreground sm:block">{labels.keys}</p>
          </div>
        </div>
      )}

      {finished && (
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-4 pb-10 text-center sm:px-6">
          <div className="text-5xl font-bold tracking-tight">
            {result.recalled}
            <span className="text-muted-foreground"> / {result.total}</span>
          </div>
          <h2 className="text-xl font-semibold">{fill(labels.resultTitle, { recalled: result.recalled, total: result.total })}</h2>
          {session.pass === 0 && saveLine && (
            <p role="status" className="text-sm text-muted-foreground">
              {saveLine}
            </p>
          )}
          {session.pass > 0 && <p className="text-sm text-muted-foreground">{labels.trainingDone}</p>}
          {session.pass === 0 && save.status === 'error' && (
            <div className="grid gap-2">
              <p role="alert" className="text-sm font-medium text-destructive">
                {labels.saveError}
              </p>
              <Button type="button" variant="secondary" onClick={() => void persist(firstRatio ?? result.ratio)}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {labels.saveRetry}
              </Button>
            </div>
          )}
          {result.missed.length === 0 && <p className="text-sm font-medium text-success">{labels.allRecalled}</p>}
          <div className="flex flex-wrap justify-center gap-3">
            {result.missed.length > 0 && (
              <Button type="button" variant="secondary" size="lg" onClick={onRetryMissed}>
                {fill(labels.retryMissed, { n: result.missed.length })}
              </Button>
            )}
            {onNext && labels.next && session.pass === 0 && save.status === 'saved' ? (
              <Button type="button" size="lg" onClick={onNext}>
                {labels.next}
              </Button>
            ) : (
              <Button type="button" size="lg" onClick={onClose}>
                {labels.close}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
