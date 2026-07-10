'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { MathText } from '@/components/math/MathText';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check, X, Minus, Flag, Clock, ChevronLeft, ChevronRight, Trophy, AlertCircle, Calculator as CalculatorIcon } from 'lucide-react';
import { Calculator } from '@/components/practice/Calculator';
import type { Question, Explanation, Locale, QuestionType } from '@/types/db';
import {
  startPairExam,
  finishExamSession,
  verifyExamSessions,
  type PairExamBlock,
} from '@/lib/supabase/practice-actions';
import type { ExamAvailability, ExamContext } from '@/lib/supabase/queries';
import {
  readSavedExam,
  writeSavedExam,
  clearSavedExam,
  type SavedExam,
  type QuestionFlag,
} from '@/lib/exam-storage';
import {
  EXAM_PAIR_DURATION_S,
  EXAM_PAIR_MAX_SCORE,
  EXAM_BLUEPRINT,
  EXAM_FIRST_SUBJECT,
  EXAM_SECOND_SUBJECTS,
  QUESTION_POINTS,
  scoreAnswer,
  type ExamSecondSubject,
} from '@/lib/exam';
import { isAnswerEmpty, type AnswerState } from '@/lib/practice';

const PART_TITLE_KEY: Record<QuestionType, 'partSingleTitle' | 'partMultiTitle' | 'partMatchingTitle'> = {
  single: 'partSingleTitle',
  multi: 'partMultiTitle',
  matching: 'partMatchingTitle',
};

type ExamPhase = 'intro' | 'exam' | 'result';

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

const BLUEPRINT_BLOCK_COUNT = EXAM_BLUEPRINT.reduce((s, p) => s + p.count, 0);

// Восстановление незавершённого пробника: экзамен привязан к живым сессиям
// в БД (по sessionId в блоках). При обновлении страницы сохранённый прогресс
// восстанавливается на те же сессии, а не заводит новые — поэтому refresh не
// сбрасывает экзамен и не плодит осиротевшие сессии. Хранение — в
// lib/exam-storage (ключ localStorage неймспейсится по userId).

type Props = {
  availability: ExamAvailability;
  locale: string;
  userId: string;
};

export function MockExamView({ availability, locale, userId }: Props) {
  const t = useTranslations('exam');
  const tSubjects = useTranslations('subjects');
  const tCalc = useTranslations('calc');

  const [phase, setPhase] = useState<ExamPhase>('intro');
  const [second, setSecond] = useState<ExamSecondSubject>(EXAM_SECOND_SUBJECTS[0]);
  const [blocks, setBlocks] = useState<PairExamBlock[]>([]);
  const [contexts, setContexts] = useState<Map<string, ExamContext>>(new Map());
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [flags, setFlags] = useState<Record<string, QuestionFlag>>({});
  const [timeLeft, setTimeLeft] = useState(EXAM_PAIR_DURATION_S);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [timesUp, setTimesUp] = useState(false);
  const [elapsedS, setElapsedS] = useState(0);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restoredRef = useRef(false);

  const questions = useMemo(() => blocks.flatMap((b) => b.questions), [blocks]);
  // блоки с глобальным смещением нумерации (1–40 / 41–80 при полных банках)
  const blockRanges = useMemo(() => {
    let offset = 0;
    return blocks.map((block) => {
      const start = offset;
      offset += block.questions.length;
      return { block, start };
    });
  }, [blocks]);

  const total = questions.length;
  const current = questions[idx];
  const answeredCount = Object.values(flags).filter((f) => f === 'answered').length;
  const flaggedCount = Object.values(flags).filter((f) => f === 'flagged').length;

  const subjectDisplayName = useCallback(
    (block: { name_ru: string; name_kk: string }) =>
      (locale === 'kk' ? block.name_kk : block.name_ru),
    [locale]
  );

  useEffect(() => {
    if (phase !== 'exam') return;
    timerRef.current = setInterval(() => {
      setTimeLeft((s) => { if (s <= 1) { clearInterval(timerRef.current!); setTimesUp(true); return 0; } return s - 1; });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [phase]);

  useEffect(() => {
    if (timesUp && phase === 'exam') void handleSubmit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timesUp]);

  // Предупреждаем при уходе со страницы во время экзамена. Прогресс сохраняется
  // в localStorage и восстановится при возврате, но диалог защищает от случайного
  // закрытия. Текст диалога браузер показывает свой, кастомный не поддерживается.
  useEffect(() => {
    if (phase !== 'exam') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [phase]);

  // Восстановление незавершённого пробника при монтировании (после refresh).
  // Один раз: перечитываем сохранённый прогресс, возвращаем те же блоки/сессии,
  // ответы и пометки, а таймер пересчитываем от абсолютного времени старта.
  // Должно идти ДО эффекта-персиста, иначе тот успел бы затереть ключ.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const saved = readSavedExam(userId);
    if (!saved) return;

    setRestoring(true);
    void (async () => {
      // Сессии должны принадлежать текущему пользователю: чужое/устаревшее
      // сохранение (смена аккаунта, удалённые сессии) отбрасываем — его
      // завершение всё равно упало бы на RLS.
      let ownership: { ok: boolean } | null = null;
      try {
        ownership = await verifyExamSessions(saved.blocks.map((b) => b.sessionId));
      } catch {
        // Сеть моргнула: сохранение не трогаем, покажем интро — восстановится
        // при следующем заходе.
      }
      setRestoring(false);
      if (!ownership?.ok) {
        if (ownership) clearSavedExam(userId);
        return;
      }

      const remaining = EXAM_PAIR_DURATION_S - Math.floor((Date.now() - saved.startTime) / 1000);
      startTimeRef.current = saved.startTime;
      setSecond(saved.second);
      setBlocks(saved.blocks);
      setContexts(new Map(saved.contexts));
      setAnswers(saved.answers ?? {});
      setFlags(saved.flags ?? {});
      setIdx(saved.idx ?? 0);
      setTimeLeft(Math.max(0, remaining));
      setPhase('exam');
      // Время уже вышло, пока страница была закрыта — сдаём сразу (как по таймеру).
      if (remaining <= 0) setTimesUp(true);
    })();
  }, [userId]);

  // Персист прогресса экзамена. Блоки/контексты статичны, реально пишем на
  // изменения ответов/пометок/индекса. startTime — из рефа (устанавливается
  // синхронно со стартом, поэтому здесь уже актуален).
  useEffect(() => {
    if (phase !== 'exam') return;
    const saved: SavedExam = {
      v: 1,
      second,
      blocks,
      contexts: Array.from(contexts.entries()),
      answers,
      flags,
      idx,
      startTime: startTimeRef.current,
    };
    writeSavedExam(userId, saved);
  }, [phase, second, blocks, contexts, answers, flags, idx, userId]);

  const startExam = useCallback(async () => {
    // Попытки сохраняются только при живых сессиях в БД — без них пробник
    // не стартуем: до 3 попыток, дальше видимая ошибка.
    if (starting) return;
    setStarting(true);
    setStartError(false);
    let res = await startPairExam({ second, locale: locale as Locale });
    for (let attempt = 0; 'error' in res && attempt < 2; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      res = await startPairExam({ second, locale: locale as Locale });
    }
    setStarting(false);
    if ('error' in res || res.blocks.every((b) => b.questions.length === 0)) {
      setStartError(true);
      return;
    }
    setBlocks(res.blocks);
    setContexts(new Map(res.contexts));
    startTimeRef.current = Date.now();
    setPhase('exam');
  }, [starting, second, locale]);

  const handleSubmit = useCallback(async (auto = false) => {
    if (submitting) return;
    if (!auto) setConfirmOpen(false);
    setSubmitting(true);
    setSubmitError(false);
    const timeSpentMs = Date.now() - startTimeRef.current;
    const perQuestionMs = Math.round(timeSpentMs / Math.max(total, 1));
    // По сессии на блок — результат каждого предмета пишется отдельно.
    // Последовательно, а не Promise.all: finishExamSession начисляет XP на
    // profiles через read-then-write (SELECT xp → UPDATE xp = old + gain).
    // Параллельный вызов для двух блоков одного и того же пользователя —
    // гонка на одной строке profiles: второй UPDATE перезаписывает результат
    // первого, XP одного блока молча теряется. Последовательный проход
    // гарантирует, что каждый read-then-write полностью завершается до
    // следующего.
    try {
      for (const block of blocks) {
        const res = await finishExamSession({
          sessionId: block.sessionId,
          results: block.questions.map((q) => ({
            questionId: q.id,
            givenAnswer: answers[q.id] ?? null,
            timeSpentMs: perQuestionMs,
          })),
        });
        if ('error' in res) {
          setSubmitError(true);
          setSubmitting(false);
          return;
        }
      }
    } catch {
      setSubmitError(true);
      setSubmitting(false);
      return;
    }
    setElapsedS(Math.min(EXAM_PAIR_DURATION_S, Math.round(timeSpentMs / 1000)));
    setSubmitting(false);
    setPhase('result');
    // Экзамен завершён — сохранённый прогресс больше не нужен (иначе
    // восстановился бы уже сданный пробник при следующем заходе).
    clearSavedExam(userId);
  }, [submitting, blocks, answers, total, userId]);

  const setAnswer = (next: AnswerState) => {
    if (!current) return;
    setAnswers((prev) => ({ ...prev, [current.id]: next }));
    setFlags((prev) => {
      // Пометку «вернуться позже» не сбрасываем; пустой ответ (снял все
      // галочки, сбросил селекты) — это «не отвечено», а не «отвечено».
      const cur = prev[current.id] ?? 'none';
      if (cur === 'flagged') return prev;
      return { ...prev, [current.id]: isAnswerEmpty(next) ? 'none' : 'answered' };
    });
  };

  const toggleFlag = () => {
    if (!current) return;
    setFlags((prev) => {
      const cur = prev[current.id] ?? 'none';
      return { ...prev, [current.id]: cur === 'flagged' ? (answers[current.id] ? 'answered' : 'none') : 'flagged' };
    });
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (phase !== 'exam' || !current) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      if (current.type !== 'matching') {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 9) {
          const body = current.body as { options?: { id: string }[] };
          const opt = body.options?.[num - 1];
          if (opt) {
            e.preventDefault();
            const ans = answers[current.id] ?? null;
            if (current.type === 'single') setAnswer(opt.id);
            else { const arr = Array.isArray(ans) ? ans : []; setAnswer(arr.includes(opt.id) ? arr.filter((x) => x !== opt.id) : [...arr, opt.id]); }
          }
        }
      }
      if (e.key === 'ArrowRight') { e.preventDefault(); if (idx < total - 1) setIdx(idx + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); if (idx > 0) setIdx(idx - 1); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, current, idx, total, answers]);

  // Идёт проверка сохранённого пробника: не показываем интро, чтобы оно не
  // мигало перед прыжком в середину восстановленного экзамена.
  if (restoring) return null;

  // ── INTRO ─────────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    const pairSlugs = [EXAM_FIRST_SUBJECT, second] as const;
    const pairShortfalls = pairSlugs.flatMap((slug) =>
      EXAM_BLUEPRINT.flatMap((part) => {
        const available = availability[slug]?.[part.type] ?? 0;
        return available < part.count
          ? [{ slug, type: part.type, available, required: part.count }]
          : [];
      })
    );
    const pairAvailableTotal = pairSlugs.reduce(
      (sum, slug) =>
        sum + Object.values(availability[slug] ?? {}).reduce((s, n) => s + (n ?? 0), 0),
      0
    );

    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-primary/10">
          <Trophy className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-3 text-muted-foreground">
          {t('subtitle', {
            count: 2 * BLUEPRINT_BLOCK_COUNT,
            duration: Math.round(EXAM_PAIR_DURATION_S / 60),
            max: EXAM_PAIR_MAX_SCORE,
          })}
        </p>

        {/* Выбор пары предметов */}
        <div className="mt-8 text-left">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('choosePair')}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {EXAM_SECOND_SUBJECTS.map((slug) => {
              const selected = second === slug;
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => setSecond(slug)}
                  aria-pressed={selected}
                  className={cn(
                    'rounded-xl border px-4 py-3.5 text-left text-sm font-medium transition-all duration-150 focus-visible:ring-4 focus-visible:ring-ring/25',
                    selected
                      ? 'border-primary bg-primary/8 ring-1 ring-primary/30'
                      : 'border-border bg-card hover:border-primary/30 hover:bg-accent'
                  )}
                >
                  {tSubjects('math')} + {tSubjects(slug)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Формат блока */}
        <div className="mt-6 rounded-xl border bg-card/50 text-left">
          <div className="border-b px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('formatBlockTitle')}</div>
          <div className="divide-y divide-border">
            {EXAM_BLUEPRINT.map((part) => (
              <div key={part.type} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>{t(PART_TITLE_KEY[part.type])}</span>
                <span className="tabular-nums text-muted-foreground">{t('partCount', { count: part.count, points: part.points })}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Нехватка задач в банке выбранной пары */}
        {pairShortfalls.length > 0 && (
          <div className="mt-4 space-y-2">
            {pairShortfalls.map((s) => (
              <div key={`${s.slug}-${s.type}`} className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-left text-sm text-warning">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {t('shortfallWarningSubject', {
                    subject: tSubjects(s.slug),
                    available: s.available,
                    required: s.required,
                    type: t(PART_TITLE_KEY[s.type]),
                  })}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 grid grid-cols-3 divide-x divide-border rounded-xl border bg-card/50 py-5 text-center">
          <div><div className="font-mono text-2xl font-bold tabular-nums">{2 * BLUEPRINT_BLOCK_COUNT}</div><div className="mt-1 text-xs text-muted-foreground">{t('totalQuestions')}</div></div>
          <div><div className="font-mono text-2xl font-bold tabular-nums">{Math.round(EXAM_PAIR_DURATION_S / 60)}</div><div className="mt-1 text-xs text-muted-foreground">{t('minutesLabel')}</div></div>
          <div><div className="font-mono text-2xl font-bold tabular-nums">{EXAM_PAIR_MAX_SCORE}</div><div className="mt-1 text-xs text-muted-foreground">{t('maxPointsLabel')}</div></div>
        </div>

        {pairAvailableTotal === 0 ? (
          <p className="mt-6 text-muted-foreground">{t('noQuestionsDesc')}</p>
        ) : (
          <Button size="lg" className="mt-8 shadow-primary" disabled={starting} onClick={() => void startExam()}>
            {starting ? t('loading') : t('startButton')}
          </Button>
        )}
        {startError && (
          <div className="mx-auto mt-4 flex max-w-sm items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-left text-sm text-destructive" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('startError')}</span>
          </div>
        )}
      </div>
    );
  }

  // ── RESULT ────────────────────────────────────────────────────────────────
  if (phase === 'result') {
    return <ResultScreen blocks={blocks} answers={answers} locale={locale} elapsedS={elapsedS} t={t} />;
  }

  // ── EXAM ──────────────────────────────────────────────────────────────────
  if (!current) return null;
  const answer = answers[current.id] ?? null;
  const currentFlag = flags[current.id] ?? 'none';
  const ctx = current.context_id ? contexts.get(current.context_id) : null;
  const currentRange = blockRanges.find(
    (r) => idx >= r.start && idx < r.start + r.block.questions.length
  );

  return (
    <div className="flex flex-col">
      {/* ── Sticky timer header ─────────────────────────────────────── */}
      <div className="sticky top-0 z-10 flex h-14 flex-shrink-0 items-center justify-between border-b bg-card/80 px-4 sm:px-6 backdrop-blur-xl">
        <div className="flex items-center gap-3 min-w-0">
          <span className="hidden truncate text-sm font-semibold sm:block">
            {currentRange ? subjectDisplayName(currentRange.block) : ''}
          </span>
          <span className="whitespace-nowrap font-mono text-sm tabular-nums text-muted-foreground">
            {idx + 1} / {total}
          </span>
        </div>

        {/* Timer */}
        <div className={cn(
          'flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-sm font-semibold tabular-nums',
          timeLeft <= 60
            ? 'bg-destructive/10 border-destructive/30 text-destructive'
            : timeLeft <= 300
              ? 'bg-warning/10 border-warning/30 text-warning'
              : 'bg-muted/40 border-border text-foreground'
        )}>
          <Clock className="h-3.5 w-3.5" />
          {formatTime(timeLeft)}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCalcOpen((v) => !v)}
            aria-pressed={calcOpen}
            aria-label={calcOpen ? tCalc('close') : tCalc('open')}
            title={calcOpen ? tCalc('close') : tCalc('open')}
            className={cn(
              'grid h-9 w-9 place-items-center rounded-lg transition-colors focus-visible:ring-4 focus-visible:ring-ring/25',
              calcOpen
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            <CalculatorIcon className="h-4 w-4" />
          </button>
          <Button size="sm" variant="destructive" onClick={() => setConfirmOpen(true)} disabled={submitting}>
            {t('submitButton')}
          </Button>
        </div>
      </div>

      {/* ── Floating calculator (только во время экзамена) ───────────── */}
      <Calculator open={calcOpen} onClose={() => setCalcOpen(false)} />

      {submitError ? (
        <div className="mx-4 mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:mx-6" role="alert">
          {t('submitError')}
        </div>
      ) : null}

      {/* ── Body: question panel + navigator sidebar ─────────────────── */}
      <div className="flex min-h-0">
        {/* Question column */}
        <div className="flex-1 min-w-0">
          {/* Mobile navigator pills */}
          <div className="px-4 pt-4 pb-2 lg:hidden">
            {blockRanges.map(({ block, start }) => (
              <div key={block.subjectSlug} className="mb-2">
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {subjectDisplayName(block)} · {start + 1}–{start + block.questions.length}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {block.questions.map((q, qi) => {
                    const i = start + qi;
                    const f = flags[q.id] ?? 'none';
                    return (
                      <button key={q.id} onClick={() => setIdx(i)}
                        aria-label={t('goToQuestion', { number: i + 1 })}
                        aria-current={i === idx ? 'true' : undefined}
                        className={cn(
                        'h-8 w-8 rounded-lg text-xs font-medium transition-colors focus-visible:ring-4 focus-visible:ring-ring/25',
                        i === idx && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                        f === 'none' && 'bg-muted text-muted-foreground hover:bg-muted/70',
                        f === 'answered' && 'bg-primary/15 text-primary',
                        f === 'flagged' && 'bg-warning/20 text-warning'
                      )}>{i + 1}</button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Question content */}
          <div key={current.id} className="animate-fade-in px-4 py-4 sm:px-6 sm:py-6 max-w-2xl">
            {/* Part label + flag toggle */}
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                {t(PART_TITLE_KEY[current.type])}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('pointsChip', { points: QUESTION_POINTS[current.type] })}
              </span>
              <button
                onClick={toggleFlag}
                aria-pressed={currentFlag === 'flagged'}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-4 focus-visible:ring-ring/25',
                  currentFlag === 'flagged'
                    ? 'border-warning/40 bg-warning/10 text-warning'
                    : 'border-border text-muted-foreground hover:border-warning/40 hover:bg-warning/10 hover:text-warning'
                )}
              >
                <Flag className="h-3 w-3" />
                {currentFlag === 'flagged' ? t('unflagQuestion') : t('flagQuestion')}
              </button>
            </div>

            {/* Context block */}
            {ctx && (
              <div className="mb-4 rounded-xl border bg-muted/40 p-4">
                {ctx.title && <div className="mb-2 text-sm font-semibold">{ctx.title}</div>}
                <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                  {(ctx.content.blocks ?? []).map((b, bi) => (
                    <div key={bi}><MathText text={b.value} /></div>
                  ))}
                </div>
              </div>
            )}

            {/* Question stem */}
            <div className="mb-6 text-[17px] leading-relaxed">
              <MathText text={(current.body as { stem: string }).stem} />
            </div>

            {/* Answer options */}
            <div className="mb-8 space-y-2.5">
              {current.type === 'single' && 'options' in current.body && (
                <div role="radiogroup" className="space-y-2.5">
                  {(current.body as { options: { id: string; content: string }[] }).options.map((opt) => {
                    const selected = answer === opt.id;
                    return (
                      <button key={opt.id} onClick={() => setAnswer(opt.id)}
                        role="radio"
                        aria-checked={selected}
                        className={cn(
                          'flex w-full items-center gap-3.5 rounded-xl border px-4 py-3.5 text-sm font-medium text-left transition-all duration-150 focus-visible:ring-4 focus-visible:ring-ring/25',
                          selected ? 'border-primary bg-primary/8 text-foreground' : 'border-border bg-card hover:border-primary/30 hover:bg-accent'
                        )}>
                        <span className={cn(
                          'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
                          selected ? 'bg-primary text-primary-foreground' : 'border border-muted-foreground/30 text-muted-foreground'
                        )}>{opt.id}</span>
                        <MathText text={opt.content} />
                      </button>
                    );
                  })}
                </div>
              )}

              {current.type === 'multi' && 'options' in current.body && (
                <div role="group" aria-label={t(PART_TITLE_KEY.multi)} className="space-y-2.5">
                  {(current.body as { options: { id: string; content: string }[] }).options.map((opt) => {
                    const selected = Array.isArray(answer) && answer.includes(opt.id);
                    return (
                      <button key={opt.id} onClick={() => {
                        const arr = Array.isArray(answer) ? answer : [];
                        setAnswer(selected ? arr.filter((x) => x !== opt.id) : [...arr, opt.id]);
                      }}
                        role="checkbox"
                        aria-checked={selected}
                        className={cn(
                          'flex w-full items-center gap-3.5 rounded-xl border px-4 py-3.5 text-sm font-medium text-left transition-all duration-150 focus-visible:ring-4 focus-visible:ring-ring/25',
                          selected ? 'border-primary bg-primary/8 text-foreground' : 'border-border bg-card hover:border-primary/30 hover:bg-accent'
                        )}>
                        <span className={cn(
                          'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
                          selected ? 'bg-primary text-primary-foreground' : 'border border-muted-foreground/30 text-muted-foreground'
                        )}>{opt.id}</span>
                        <MathText text={opt.content} />
                      </button>
                    );
                  })}
                </div>
              )}

              {current.type === 'matching' && 'left' in current.body && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    {(current.body as { left: { id: string; content: string }[] }).left.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 rounded-xl border bg-card px-3 py-3 text-sm">
                        <span className="font-mono text-xs text-muted-foreground">{item.id}.</span>
                        <MathText text={item.content} />
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {(current.body as { left: { id: string }[]; right: string[] }).left.map((item) => {
                      const opts = (current.body as { right: string[] }).right;
                      const val = (answer as Record<string, string> | null)?.[item.id] ?? '';
                      return (
                        <select key={item.id} value={val}
                          onChange={(e) => setAnswer({ ...((answer as Record<string, string> | null) ?? {}), [item.id]: e.target.value })}
                          aria-label={t('matchingSelectFor', { item: item.id })}
                          className="w-full rounded-xl border bg-card px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                          <option value="">{t('matchingPlaceholder')}</option>
                          {opts.map((o, i) => <option key={i} value={o}>{o}</option>)}
                        </select>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Prev / Next navigation */}
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => { if (idx > 0) setIdx(idx - 1); }} disabled={idx === 0}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { if (idx < total - 1) setIdx(idx + 1); }} disabled={idx === total - 1}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground ml-1">{answeredCount}/{total} {t('answeredShort')}</span>
            </div>
          </div>
        </div>

        {/* ── Desktop navigator sidebar ───────────────────────────── */}
        <div className="hidden lg:flex w-64 shrink-0 flex-col border-l bg-card/40 p-5">
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('navigatorTitle')}
          </div>
          {blockRanges.map(({ block, start }) => (
            <div key={block.subjectSlug} className="mb-4">
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {subjectDisplayName(block)} · {start + 1}–{start + block.questions.length}
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {block.questions.map((q, qi) => {
                  const i = start + qi;
                  const f = flags[q.id] ?? 'none';
                  return (
                    <button key={q.id} onClick={() => setIdx(i)}
                      aria-label={t('goToQuestion', { number: i + 1 })}
                      aria-current={i === idx ? 'true' : undefined}
                      className={cn(
                      'h-9 w-full rounded-lg font-mono text-xs font-medium tabular-nums transition-colors focus-visible:ring-4 focus-visible:ring-ring/25',
                      i === idx && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                      f === 'none' && 'bg-muted/60 text-muted-foreground hover:bg-muted',
                      f === 'answered' && 'bg-primary/15 text-primary',
                      f === 'flagged' && 'bg-warning/20 text-warning'
                    )}>{i + 1}</button>
                  );
                })}
              </div>
            </div>
          ))}
          {/* Legend */}
          <div className="space-y-2 text-xs text-muted-foreground border-t pt-4 mt-auto">
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-muted" />{t('legendUnanswered')}</div>
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-primary/30" />{t('legendAnswered')}</div>
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-warning/30" />{t('legendFlagged')}</div>
          </div>
        </div>
      </div>

      {/* ── Confirm dialog ──────────────────────────────────────────── */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label={t('confirmSubmit')} className="mx-4 w-full max-w-sm rounded-2xl border bg-card p-6 shadow-lg">
            <div className="mb-1 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-warning" />
              <h2 className="font-semibold">{t('confirmSubmit')}</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('confirmSubmitDesc', { answered: answeredCount, total, flagged: flaggedCount })}
            </p>
            <div className="mt-5 flex gap-3">
              <Button className="flex-1" onClick={() => void handleSubmit()} disabled={submitting}>
                {submitting ? t('loading') : t('confirmYes')}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setConfirmOpen(false)} disabled={submitting}>
                {t('confirmNo')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Result Screen ──────────────────────────────────────────────────────────

type QuestionResult = {
  q: Question;
  answer: AnswerState;
  points: number;
  isCorrect: boolean;
};

type BlockResult = {
  block: PairExamBlock;
  name: string;
  results: QuestionResult[];
  correct: number;
  earned: number;
  max: number;
};

type ResultProps = {
  blocks: PairExamBlock[];
  answers: Record<string, AnswerState>;
  locale: string;
  elapsedS: number;
  t: ReturnType<typeof useTranslations<'exam'>>;
};

function ResultScreen({ blocks, answers, locale, elapsedS, t }: ResultProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const blockResults: BlockResult[] = blocks.map((block) => {
    const results = block.questions.map((q) => {
      const answer = answers[q.id] ?? null;
      const points = scoreAnswer(q.type, q.body, answer);
      return { q, answer, points, isCorrect: points === QUESTION_POINTS[q.type] };
    });
    return {
      block,
      name: locale === 'kk' ? block.name_kk : block.name_ru,
      results,
      correct: results.filter((r) => r.isCorrect).length,
      earned: results.reduce((s, r) => s + r.points, 0),
      max: block.questions.reduce((s, q) => s + QUESTION_POINTS[q.type], 0),
    };
  });

  const allResults = blockResults.flatMap((b) => b.results);
  const totalQuestions = allResults.length;
  const correctCount = blockResults.reduce((s, b) => s + b.correct, 0);
  const earnedScore = blockResults.reduce((s, b) => s + b.earned, 0);
  const maxScore = blockResults.reduce((s, b) => s + b.max, 0);
  const skipped = allResults.filter((r) => isAnswerEmpty(r.answer)).length;
  const wrong = totalQuestions - correctCount - skipped;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      {/* Summary card: суммарный балл пары */}
      <div className="rounded-2xl border bg-card p-6 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10">
          <Trophy className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold">{t('resultTitle')}</h1>
        <div className="mt-4 font-mono text-5xl font-bold tabular-nums text-primary">{earnedScore}</div>
        <p className="mt-2 text-muted-foreground">{t('scorePoints', { score: earnedScore, max: maxScore })}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('score', { correct: correctCount, total: totalQuestions })}</p>

        {/* Балл по каждому предмету */}
        <div className="mt-5 grid grid-cols-2 divide-x divide-border border-t pt-5">
          {blockResults.map((b) => (
            <div key={b.block.subjectSlug}>
              <div className="font-mono text-2xl font-bold tabular-nums">{b.earned}<span className="text-sm font-normal text-muted-foreground"> / {b.max}</span></div>
              <div className="mt-1 text-xs text-muted-foreground">{b.name}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-4 divide-x divide-border border-t pt-5">
          <div><div className="font-mono text-2xl font-bold tabular-nums text-success">{correctCount}</div><div className="mt-1 text-xs text-muted-foreground">{t('correctLabel')}</div></div>
          <div><div className="font-mono text-2xl font-bold tabular-nums text-destructive">{wrong}</div><div className="mt-1 text-xs text-muted-foreground">{t('wrongLabel')}</div></div>
          <div><div className="font-mono text-2xl font-bold tabular-nums text-muted-foreground">{skipped}</div><div className="mt-1 text-xs text-muted-foreground">{t('skippedLabel')}</div></div>
          <div><div className="font-mono text-2xl font-bold tabular-nums">{formatTime(elapsedS)}</div><div className="mt-1 text-xs text-muted-foreground">{t('timeSpent')}</div></div>
        </div>
      </div>

      {/* Секции по предметам: типы + темы внутри блока */}
      {blockResults.map((b) => {
        const typeStats = EXAM_BLUEPRINT.map((part) => {
          const ofType = b.results.filter((r) => r.q.type === part.type);
          return {
            type: part.type,
            total: ofType.length,
            correct: ofType.filter((r) => r.isCorrect).length,
            earnedPts: ofType.reduce((s, r) => s + r.points, 0),
            maxPts: ofType.length * part.points,
          };
        }).filter((s) => s.total > 0);

        const topicMap = new Map(b.block.topics.map((topic) => [topic.id, topic]));
        const topicStats: Record<string, { name: string; total: number; correct: number }> = {};
        for (const { q, isCorrect } of b.results) {
          if (!q.topic_id) continue;
          const topic = topicMap.get(q.topic_id);
          if (!topic) continue;
          const name = locale === 'kk' ? topic.name_kk : topic.name_ru;
          if (!topicStats[q.topic_id]) topicStats[q.topic_id] = { name, total: 0, correct: 0 };
          topicStats[q.topic_id].total++;
          if (isCorrect) topicStats[q.topic_id].correct++;
        }

        if (b.results.length === 0) return null;
        return (
          <section key={b.block.subjectSlug}>
            <h2 className="mb-3 flex items-baseline justify-between gap-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
              <span>{b.name}</span>
              <span className="tabular-nums normal-case">{t('pointsOf', { earned: b.earned, max: b.max })} · {b.correct}/{b.results.length}</span>
            </h2>
            <div className="rounded-xl border bg-card divide-y divide-border">
              {typeStats.map((s) => {
                const p = s.maxPts > 0 ? Math.round((s.earnedPts / s.maxPts) * 100) : 0;
                return (
                  <div key={s.type} className="flex items-center gap-4 px-5 py-3.5">
                    <span className="flex-1 truncate text-sm">{t(PART_TITLE_KEY[s.type])}</span>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="tabular-nums text-muted-foreground">{s.correct}/{s.total}</span>
                      <div className="w-20 overflow-hidden rounded-full bg-muted h-1.5">
                        <div className={cn('h-full rounded-full', p >= 70 ? 'bg-success' : p >= 40 ? 'bg-warning' : 'bg-destructive')} style={{ width: `${p}%` }} />
                      </div>
                      <span className="w-14 text-right tabular-nums text-xs font-medium text-muted-foreground">{t('pointsOf', { earned: s.earnedPts, max: s.maxPts })}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {Object.keys(topicStats).length > 0 && (
              <>
                <h3 className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('topicsBreakdown')}</h3>
                <div className="rounded-xl border bg-card divide-y divide-border">
                  {Object.values(topicStats)
                    .sort((a, bb) => a.correct / a.total - bb.correct / bb.total)
                    .map((s) => {
                      const p = Math.round((s.correct / s.total) * 100);
                      return (
                        <div key={s.name} className="flex items-center gap-4 px-5 py-3.5">
                          <span className="flex-1 truncate text-sm">{s.name}</span>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="tabular-nums text-muted-foreground">{s.correct}/{s.total}</span>
                            <div className="w-20 overflow-hidden rounded-full bg-muted h-1.5">
                              <div className={cn('h-full rounded-full', p >= 70 ? 'bg-success' : p >= 40 ? 'bg-warning' : 'bg-destructive')} style={{ width: `${p}%` }} />
                            </div>
                            <span className={cn('w-8 text-right tabular-nums text-xs font-medium', p >= 70 ? 'text-success' : p >= 40 ? 'text-warning' : 'text-destructive')}>{p}%</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </>
            )}
          </section>
        );
      })}

      {/* Question list, сгруппированный по блокам */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">{t('allQuestions')}</h2>
        <div className="space-y-5">
          {blockResults.map((b, bi) => {
            const offset = blockResults.slice(0, bi).reduce((s, x) => s + x.results.length, 0);
            if (b.results.length === 0) return null;
            return (
              <div key={b.block.subjectSlug}>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{b.name}</h3>
                <div className="space-y-2">
                  {b.results.map(({ q, answer, points, isCorrect }, qi) => {
                    const i = offset + qi;
                    const isOpen = expandedId === q.id;
                    const stem = (q.body as { stem: string }).stem;
                    const exp = q.explanation as Explanation | null;
                    const isPartial = !isCorrect && points > 0;
                    const isSkipped = isAnswerEmpty(answer);
                    return (
                      <div key={q.id} className="rounded-xl border bg-card">
                        <button className="flex w-full items-start gap-3 p-4 text-left focus-visible:ring-4 focus-visible:ring-ring/25" aria-expanded={isOpen} onClick={() => setExpandedId(isOpen ? null : q.id)}>
                          <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                            isCorrect ? 'bg-success/15 text-success'
                              : isPartial ? 'bg-warning/15 text-warning'
                              : !isSkipped ? 'bg-destructive/15 text-destructive'
                              : 'bg-muted text-muted-foreground')}>
                            {isCorrect ? <Check className="h-3.5 w-3.5" /> : isPartial ? <Minus className="h-3.5 w-3.5" /> : !isSkipped ? <X className="h-3.5 w-3.5" /> : i + 1}
                          </span>
                          <span className="flex-1 text-sm leading-relaxed"><MathText text={stem} /></span>
                          <span className={cn('mt-1 shrink-0 text-xs font-medium tabular-nums',
                            isCorrect ? 'text-success' : isPartial ? 'text-warning' : 'text-muted-foreground')}>
                            {t('pointsOf', { earned: points, max: QUESTION_POINTS[q.type] })}
                          </span>
                        </button>
                        {isOpen && (
                          <div className="border-t px-4 pb-4 pt-3 space-y-3">
                            <CorrectAnswerBlock q={q} answer={answer} isCorrect={isCorrect} t={t} />
                            {exp && exp.blocks.length > 0 && (
                              <div className="rounded-lg bg-muted/30 px-4 py-3 text-sm space-y-1">
                                <div className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('explanationLabel')}</div>
                                {exp.blocks.map((eb, ebi) => <MathText key={ebi} text={eb.value} />)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function CorrectAnswerBlock({ q, answer, isCorrect, t }: {
  q: Question; answer: AnswerState; isCorrect: boolean;
  t: ReturnType<typeof useTranslations<'exam'>>;
}) {
  if (q.type === 'single' && 'options' in q.body && 'correct' in q.body) {
    const opts = (q.body as { options: { id: string; content: string }[]; correct: string }).options;
    const correctId = (q.body as { correct: string }).correct;
    return (
      <ul className="space-y-1.5">
        {opts.map((opt) => {
          const isOpt = opt.id === correctId;
          const wasChosen = answer === opt.id;
          if (!isOpt && !wasChosen) return null;
          return (
            <li key={opt.id} className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
              isOpt ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive line-through')}>
              {isOpt ? <Check className="h-4 w-4 shrink-0" /> : <X className="h-4 w-4 shrink-0" />}
              <span className="font-mono text-xs">{opt.id})</span>
              <MathText text={opt.content} />
            </li>
          );
        })}
      </ul>
    );
  }
  if (!isCorrect) return <p className="text-sm text-muted-foreground italic">{t('checkManually')}</p>;
  return null;
}
