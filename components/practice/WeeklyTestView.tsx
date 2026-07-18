'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { MathText } from '@/components/math/MathText';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { AlertCircle, CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';
import { QuestionAnswerInput } from '@/components/practice/QuestionAnswerInput';
import type { Question, Locale, QuestionType, SecondSubject, QuestionBody } from '@/types/db';
import { startWeeklyTest, finishWeeklyTest } from '@/lib/supabase/weekly-actions';
import type { ExamContext, WeeklyTestSummary } from '@/lib/supabase/queries';
import { EXAM_FIRST_SUBJECT, QUESTION_POINTS, scoreAnswer } from '@/lib/exam';
import { WEEKLY_BLOCK_COUNT } from '@/lib/weekly';
import { isAnswerEmpty, type AnswerState } from '@/lib/practice';

const PART_TITLE_KEY: Record<QuestionType, 'partSingleTitle' | 'partMultiTitle' | 'partMatchingTitle'> = {
  single: 'partSingleTitle',
  multi: 'partMultiTitle',
  matching: 'partMatchingTitle',
};

type Phase = 'intro' | 'test' | 'result';

type Block = {
  subjectSlug: string;
  name_ru: string;
  name_kk: string;
  topics: { id: string; name_ru: string; name_kk: string }[];
  questions: Question[];
};

type Props = { second: SecondSubject; locale: string; summary: WeeklyTestSummary };

export function WeeklyTestView({ second, locale, summary }: Props) {
  const t = useTranslations('weekly');
  const tExam = useTranslations('exam');
  const tSubjects = useTranslations('subjects');

  const [phase, setPhase] = useState<Phase>('intro');
  const [alreadyDone, setAlreadyDone] = useState(!summary.availableThisWeek);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [contexts, setContexts] = useState<Map<string, ExamContext>>(new Map());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<{ correctCount: number; score: number } | null>(null);
  const startTimeRef = useRef(0);

  const questions = useMemo(() => blocks.flatMap((b) => b.questions), [blocks]);
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
  const answeredCount = Object.values(answers).filter((a) => !isAnswerEmpty(a)).length;

  const subjectDisplayName = useCallback(
    (block: { name_ru: string; name_kk: string }) => (locale === 'kk' ? block.name_kk : block.name_ru),
    [locale]
  );

  const nextAvailableLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'kk' ? 'kk-KZ' : 'ru-RU', {
        day: 'numeric',
        month: 'long',
      }).format(new Date(summary.nextAvailableAt)),
    [locale, summary.nextAvailableAt]
  );

  // Предупреждаем при уходе со страницы во время теста (без localStorage-резюма).
  useEffect(() => {
    if (phase !== 'test') return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [phase]);

  const start = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    setStartError(false);
    const res = await startWeeklyTest({ locale: locale as Locale });
    setStarting(false);
    if ('error' in res) {
      // Защита от гонки: если по факту тест уже пройден на этой неделе
      // (сводка на странице устарела), переключаемся на состояние "уже пройден"
      // вместо непонятной ошибки.
      if (res.error === 'already-done-this-week') {
        setAlreadyDone(true);
        return;
      }
      setStartError(true);
      return;
    }
    if (res.blocks.every((b) => b.questions.length === 0)) {
      setStartError(true);
      return;
    }
    setBlocks(res.blocks);
    setContexts(new Map(res.contexts));
    setSessionId(res.sessionId);
    startTimeRef.current = Date.now();
    setPhase('test');
  }, [starting, locale]);

  const handleSubmit = useCallback(async () => {
    if (submitting || !sessionId) return;
    setConfirmOpen(false);
    setSubmitting(true);
    setSubmitError(false);
    const timeSpentMs = Date.now() - startTimeRef.current;
    const perQuestionMs = Math.round(timeSpentMs / Math.max(total, 1));
    const res = await finishWeeklyTest({
      sessionId,
      results: questions.map((q) => ({
        questionId: q.id,
        givenAnswer: answers[q.id] ?? null,
        timeSpentMs: perQuestionMs,
      })),
    });
    setSubmitting(false);
    if ('error' in res) {
      setSubmitError(true);
      return;
    }
    setResult(res);
    setPhase('result');
  }, [submitting, sessionId, questions, answers, total]);

  const setAnswer = (next: AnswerState) => {
    if (!current) return;
    setAnswers((prev) => ({ ...prev, [current.id]: next }));
  };

  // Клавиатурные шорткаты — как в пробнике/диагностике: цифры выбирают вариант, стрелки листают.
  useEffect(() => {
    if (phase !== 'test' || !current) return;
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

  // ── INTRO ─────────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    if (alreadyDone) {
      return (
        <div className="mx-auto max-w-lg px-6 py-16 text-center">
          <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-primary/10">
            <CalendarClock className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold">{t('alreadyDoneTitle')}</h1>
          <p className="mt-3 text-muted-foreground">
            {t('alreadyDoneDesc', { date: nextAvailableLabel })}
          </p>
          {summary.lastScore !== null && (
            <p className="mt-2 text-sm text-muted-foreground">
              {t('alreadyDoneScore', { score: summary.lastScore })}
            </p>
          )}
          <Button asChild size="lg" className="mt-8 shadow-primary">
            <Link href="/dashboard">{t('goToDashboardButton')}</Link>
          </Button>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-primary/10">
          <CalendarClock className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-3 text-muted-foreground">
          {t('subtitle', { count: WEEKLY_BLOCK_COUNT * 2 })}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('pairLabel', { pair: `${tSubjects(EXAM_FIRST_SUBJECT)} + ${tSubjects(second)}` })}
        </p>

        <div className="mt-6 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-left text-sm text-warning">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t('noFeedbackNotice')}</span>
        </div>

        <Button size="lg" className="mt-8 shadow-primary" disabled={starting} onClick={() => void start()}>
          {starting ? t('loading') : t('startButton')}
        </Button>
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
  if (phase === 'result' && result) {
    return <WeeklyResultScreen blocks={blocks} answers={answers} locale={locale} result={result} t={t} tExam={tExam} />;
  }

  // ── TEST ──────────────────────────────────────────────────────────────────
  if (!current) return null;
  const answer = answers[current.id] ?? null;
  const ctx = current.context_id ? contexts.get(current.context_id) : null;
  const currentRange = blockRanges.find((r) => idx >= r.start && idx < r.start + r.block.questions.length);

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 flex h-14 flex-shrink-0 items-center justify-between border-b bg-card/80 px-4 sm:px-6 backdrop-blur-xl">
        <div className="flex items-center gap-3 min-w-0">
          <span className="hidden truncate text-sm font-semibold sm:block">
            {currentRange ? subjectDisplayName(currentRange.block) : ''}
          </span>
          <span className="whitespace-nowrap font-mono text-sm tabular-nums text-muted-foreground">
            {idx + 1} / {total}
          </span>
        </div>
        <Button size="sm" variant="destructive" onClick={() => setConfirmOpen(true)} disabled={submitting}>
          {t('submitButton')}
        </Button>
      </div>

      {submitError ? (
        <div className="mx-4 mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:mx-6" role="alert">
          {t('submitError')}
        </div>
      ) : null}

      <div className="flex min-h-0">
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
                    const answered = !isAnswerEmpty(answers[q.id] ?? null);
                    return (
                      <button key={q.id} onClick={() => setIdx(i)}
                        aria-label={tExam('goToQuestion', { number: i + 1 })}
                        aria-current={i === idx ? 'true' : undefined}
                        className={cn(
                          'h-8 w-8 rounded-lg text-xs font-medium transition-colors focus-visible:ring-4 focus-visible:ring-ring/25',
                          i === idx && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                          answered ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                        )}>
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div key={current.id} className="animate-fade-in px-4 py-4 sm:px-6 sm:py-6 max-w-2xl">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                {tExam(PART_TITLE_KEY[current.type])}
              </span>
            </div>

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

            <div className="mb-6 text-[17px] leading-relaxed">
              <MathText text={(current.body as { stem: string }).stem} />
            </div>

            <div className="mb-8">
              <QuestionAnswerInput
                question={current}
                answer={answer}
                onChange={setAnswer}
                labels={{
                  matchingPlaceholder: tExam('matchingPlaceholder'),
                  matchingSelectFor: (item) => tExam('matchingSelectFor', { item }),
                  multiGroup: tExam(PART_TITLE_KEY.multi),
                }}
              />
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => { if (idx > 0) setIdx(idx - 1); }} disabled={idx === 0}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { if (idx < total - 1) setIdx(idx + 1); }} disabled={idx === total - 1}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground ml-1">{answeredCount}/{total} {tExam('answeredShort')}</span>
            </div>
          </div>
        </div>

        {/* Desktop navigator sidebar */}
        <div className="hidden lg:flex w-64 shrink-0 flex-col border-l bg-card/40 p-5">
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {tExam('navigatorTitle')}
          </div>
          {blockRanges.map(({ block, start }) => (
            <div key={block.subjectSlug} className="mb-4">
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {subjectDisplayName(block)} · {start + 1}–{start + block.questions.length}
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {block.questions.map((q, qi) => {
                  const i = start + qi;
                  const answered = !isAnswerEmpty(answers[q.id] ?? null);
                  return (
                    <button key={q.id} onClick={() => setIdx(i)}
                      aria-label={tExam('goToQuestion', { number: i + 1 })}
                      aria-current={i === idx ? 'true' : undefined}
                      className={cn(
                        'h-9 w-full rounded-lg font-mono text-xs font-medium tabular-nums transition-colors focus-visible:ring-4 focus-visible:ring-ring/25',
                        i === idx && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                        answered ? 'bg-primary/15 text-primary' : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                      )}>
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label={t('confirmSubmit')} className="mx-4 w-full max-w-sm rounded-2xl border bg-card p-6 shadow-lg">
            <div className="mb-1 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-warning" />
              <h2 className="font-semibold">{t('confirmSubmit')}</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('confirmSubmitDesc', { answered: answeredCount, total })}
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

type ResultProps = {
  blocks: Block[];
  answers: Record<string, AnswerState>;
  locale: string;
  result: { correctCount: number; score: number };
  t: ReturnType<typeof useTranslations<'weekly'>>;
  tExam: ReturnType<typeof useTranslations<'exam'>>;
};

function WeeklyResultScreen({ blocks, answers, locale, result, t, tExam }: ResultProps) {
  const blockResults = blocks.map((block) => {
    const results = block.questions.map((q) => {
      const answer = answers[q.id] ?? null;
      const points = scoreAnswer(q.type, q.body as QuestionBody, answer);
      return { q, points, isCorrect: points === QUESTION_POINTS[q.type] };
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

  const maxScore = blockResults.reduce((s, b) => s + b.max, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      <div className="rounded-2xl border bg-card p-6 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10">
          <CalendarClock className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold">{t('resultTitle')}</h1>
        <div className="mt-4 font-mono text-5xl font-bold tabular-nums text-primary">{result.score}</div>
        <p className="mt-2 text-muted-foreground">{tExam('scorePoints', { score: result.score, max: maxScore })}</p>

        <div className="mt-5 grid grid-cols-2 divide-x divide-border border-t pt-5">
          {blockResults.map((b) => (
            <div key={b.block.subjectSlug}>
              <div className="font-mono text-2xl font-bold tabular-nums">
                {b.earned}<span className="text-sm font-normal text-muted-foreground"> / {b.max}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{b.name}</div>
            </div>
          ))}
        </div>
      </div>

      {blockResults.map((b) => {
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
              <span className="tabular-nums normal-case">{tExam('pointsOf', { earned: b.earned, max: b.max })} · {b.correct}/{b.results.length}</span>
            </h2>
            {Object.keys(topicStats).length > 0 && (
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
            )}
          </section>
        );
      })}

      <Button asChild size="lg" className="w-full shadow-primary">
        <Link href="/dashboard">{t('goToDashboardButton')}</Link>
      </Button>
    </div>
  );
}
