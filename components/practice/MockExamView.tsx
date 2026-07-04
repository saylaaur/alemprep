'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { MathText } from '@/components/math/MathText';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check, X, Minus, Flag, Clock, ChevronLeft, ChevronRight, Trophy, AlertCircle } from 'lucide-react';
import type { Question, Explanation, ContextContent, QuestionType } from '@/types/db';
import { createExamSession, finishExamSession } from '@/lib/supabase/practice-actions';
import type { MockExamTopic } from '@/lib/supabase/queries';
import { EXAM_DURATION_S, EXAM_BLUEPRINT, QUESTION_POINTS, scoreAnswer, type ExamShortfall } from '@/lib/exam';
import { isAnswerEmpty } from '@/lib/practice';

const PART_TITLE_KEY: Record<QuestionType, 'partSingleTitle' | 'partMultiTitle' | 'partMatchingTitle'> = {
  single: 'partSingleTitle',
  multi: 'partMultiTitle',
  matching: 'partMatchingTitle',
};

type AnswerState = string | string[] | Record<string, string> | null;
type QuestionFlag = 'none' | 'answered' | 'flagged';
type ExamPhase = 'intro' | 'exam' | 'result';

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

type Props = {
  questions: Question[];
  contexts: Map<string, { id: string; title: string | null; content: ContextContent }>;
  topics: MockExamTopic[];
  subjectId: string;
  locale: string;
  shortfall: ExamShortfall[];
};

export function MockExamView({ questions, contexts, topics, subjectId, locale, shortfall }: Props) {
  const t = useTranslations('exam');

  const [phase, setPhase] = useState<ExamPhase>('intro');
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [flags, setFlags] = useState<Record<string, QuestionFlag>>({});
  const [timeLeft, setTimeLeft] = useState(EXAM_DURATION_S);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [timesUp, setTimesUp] = useState(false);
  const [elapsedS, setElapsedS] = useState(0);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const total = questions.length;
  const current = questions[idx];
  const answeredCount = Object.values(flags).filter((f) => f === 'answered').length;
  const flaggedCount = Object.values(flags).filter((f) => f === 'flagged').length;

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

  const startExam = useCallback(async () => {
    // Пробник работает и без сессии в БД (баллы считаются на клиенте) —
    // просто не сохранятся попытки. Не блокируем старт молчаливым return.
    const res = await createExamSession({ subjectId, totalQuestions: total });
    if (!('error' in res)) setSessionId(res.sessionId);
    startTimeRef.current = Date.now();
    setPhase('exam');
  }, [subjectId, total]);

  const handleSubmit = useCallback(async (auto = false) => {
    if (submitting) return;
    if (!auto) setConfirmOpen(false);
    setSubmitting(true);
    const timeSpentMs = Date.now() - startTimeRef.current;
    const results = questions.map((q) => {
      const answer = answers[q.id] ?? null;
      return { questionId: q.id, givenAnswer: answer, timeSpentMs: Math.round(timeSpentMs / Math.max(questions.length, 1)) };
    });
    if (sessionId) await finishExamSession({ sessionId, results });
    setElapsedS(Math.min(EXAM_DURATION_S, Math.round(timeSpentMs / 1000)));
    setSubmitting(false);
    setPhase('result');
  }, [submitting, questions, answers, sessionId]);

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

  // ── INTRO ─────────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    const maxScore = questions.reduce((s, q) => s + QUESTION_POINTS[q.type], 0);
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-primary/10">
          <Trophy className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        {total === 0 ? (
          <p className="mt-4 text-muted-foreground">{t('noQuestionsDesc')}</p>
        ) : (
          <>
            <p className="mt-3 text-muted-foreground">{t('subtitle', { count: total, duration: Math.round(EXAM_DURATION_S / 60), max: maxScore })}</p>

            {/* Формат ЕНТ */}
            <div className="mt-8 rounded-xl border bg-card/50 text-left">
              <div className="border-b px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('formatTitle')}</div>
              <div className="divide-y divide-border">
                {EXAM_BLUEPRINT.map((part) => (
                  <div key={part.type} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span>{t(PART_TITLE_KEY[part.type])}</span>
                    <span className="tabular-nums text-muted-foreground">{t('partCount', { count: part.count, points: part.points })}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Нехватка задач в банке */}
            {shortfall.length > 0 && (
              <div className="mt-4 space-y-2">
                {shortfall.map((s) => (
                  <div key={s.type} className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-left text-sm text-warning">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{t('shortfallWarning', { available: s.available, required: s.required, type: t(PART_TITLE_KEY[s.type]) })}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 grid grid-cols-3 divide-x divide-border rounded-xl border bg-card/50 py-5 text-center">
              <div><div className="text-2xl font-semibold">{total}</div><div className="mt-1 text-xs text-muted-foreground">{t('totalQuestions')}</div></div>
              <div><div className="text-2xl font-semibold">{Math.round(EXAM_DURATION_S / 60)}</div><div className="mt-1 text-xs text-muted-foreground">{t('minutesLabel')}</div></div>
              <div><div className="text-2xl font-semibold">{maxScore}</div><div className="mt-1 text-xs text-muted-foreground">{t('maxPointsLabel')}</div></div>
            </div>
            <Button size="lg" className="mt-8 shadow-primary" onClick={() => void startExam()}>{t('startButton')}</Button>
          </>
        )}
      </div>
    );
  }

  // ── RESULT ────────────────────────────────────────────────────────────────
  if (phase === 'result') {
    return <ResultScreen questions={questions} contexts={contexts} topics={topics} answers={answers} locale={locale} elapsedS={elapsedS} t={t} />;
  }

  // ── EXAM ──────────────────────────────────────────────────────────────────
  const answer = current ? (answers[current.id] ?? null) : null;
  const currentFlag = current ? (flags[current.id] ?? 'none') : 'none';
  const ctx = current?.context_id ? contexts.get(current.context_id) : null;

  return (
    <div className="flex flex-col">
      {/* ── Sticky timer header ─────────────────────────────────────── */}
      <div className="sticky top-0 z-10 flex h-14 flex-shrink-0 items-center justify-between border-b bg-card/80 px-4 sm:px-6 backdrop-blur-xl">
        <div className="flex items-center gap-3 min-w-0">
          <span className="hidden truncate text-sm font-semibold sm:block">{t('examSubject')}</span>
          <span className="text-sm text-muted-foreground tabular-nums whitespace-nowrap">
            {idx + 1} / {total}
          </span>
        </div>

        {/* Timer */}
        <div className={cn(
          'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold tabular-nums',
          timeLeft <= 300
            ? 'bg-destructive/10 border-destructive/30 text-destructive'
            : 'bg-warning/10 border-warning/30 text-warning'
        )}>
          <Clock className="h-3.5 w-3.5" />
          {formatTime(timeLeft)}
        </div>

        <Button size="sm" variant="destructive" onClick={() => setConfirmOpen(true)} disabled={submitting}>
          {t('submitButton')}
        </Button>
      </div>

      {/* ── Body: question panel + navigator sidebar ─────────────────── */}
      <div className="flex min-h-0">
        {/* Question column */}
        <div className="flex-1 min-w-0">
          {/* Mobile navigator pills */}
          <div className="flex flex-wrap gap-1.5 px-4 pt-4 pb-2 lg:hidden">
            {questions.map((q, i) => {
              const f = flags[q.id] ?? 'none';
              return (
                <button key={q.id} onClick={() => setIdx(i)} className={cn(
                  'h-8 w-8 rounded-lg text-xs font-medium transition-colors',
                  i === idx && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                  f === 'none' && 'bg-muted text-muted-foreground hover:bg-muted/70',
                  f === 'answered' && 'bg-primary/15 text-primary',
                  f === 'flagged' && 'bg-warning/20 text-warning'
                )}>{i + 1}</button>
              );
            })}
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
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
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
                (current.body as { options: { id: string; content: string }[] }).options.map((opt) => {
                  const selected = answer === opt.id;
                  return (
                    <button key={opt.id} onClick={() => setAnswer(opt.id)}
                      className={cn(
                        'flex w-full items-center gap-3.5 rounded-xl border px-4 py-3.5 text-sm font-medium text-left transition-all duration-150',
                        selected ? 'border-primary bg-primary/8 text-foreground' : 'border-border bg-card hover:border-primary/30 hover:bg-accent'
                      )}>
                      <span className={cn(
                        'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
                        selected ? 'bg-primary text-primary-foreground' : 'border border-muted-foreground/30 text-muted-foreground'
                      )}>{opt.id}</span>
                      <MathText text={opt.content} />
                    </button>
                  );
                })
              )}

              {current.type === 'multi' && 'options' in current.body && (
                (current.body as { options: { id: string; content: string }[] }).options.map((opt) => {
                  const selected = Array.isArray(answer) && answer.includes(opt.id);
                  return (
                    <button key={opt.id} onClick={() => {
                      const arr = Array.isArray(answer) ? answer : [];
                      setAnswer(selected ? arr.filter((x) => x !== opt.id) : [...arr, opt.id]);
                    }}
                      className={cn(
                        'flex w-full items-center gap-3.5 rounded-xl border px-4 py-3.5 text-sm font-medium text-left transition-all duration-150',
                        selected ? 'border-primary bg-primary/8 text-foreground' : 'border-border bg-card hover:border-primary/30 hover:bg-accent'
                      )}>
                      <span className={cn(
                        'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
                        selected ? 'bg-primary text-primary-foreground' : 'border border-muted-foreground/30 text-muted-foreground'
                      )}>{opt.id}</span>
                      <MathText text={opt.content} />
                    </button>
                  );
                })
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
          <div className="grid grid-cols-5 gap-1.5 mb-5">
            {questions.map((q, i) => {
              const f = flags[q.id] ?? 'none';
              return (
                <button key={q.id} onClick={() => setIdx(i)} className={cn(
                  'h-9 w-full rounded-lg text-xs font-medium transition-colors',
                  i === idx && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                  f === 'none' && 'bg-muted/60 text-muted-foreground hover:bg-muted',
                  f === 'answered' && 'bg-primary/15 text-primary',
                  f === 'flagged' && 'bg-warning/20 text-warning'
                )}>{i + 1}</button>
              );
            })}
          </div>
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
          <div className="mx-4 w-full max-w-sm rounded-2xl border bg-card p-6 shadow-lg">
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

type ResultProps = {
  questions: Question[];
  contexts: Map<string, { id: string; title: string | null; content: ContextContent }>;
  topics: MockExamTopic[];
  answers: Record<string, AnswerState>;
  locale: string;
  elapsedS: number;
  t: ReturnType<typeof useTranslations<'exam'>>;
};

function ResultScreen({ questions, topics, answers, locale, elapsedS, t }: ResultProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const results = questions.map((q) => {
    const answer = answers[q.id] ?? null;
    const points = scoreAnswer(q.type, q.body, answer);
    return { q, answer, points, isCorrect: points === QUESTION_POINTS[q.type] };
  });

  const correctCount = results.filter((r) => r.isCorrect).length;
  const earnedScore = results.reduce((s, r) => s + r.points, 0);
  const maxScore = questions.reduce((s, q) => s + QUESTION_POINTS[q.type], 0);

  const typeStats = EXAM_BLUEPRINT.map((part) => {
    const ofType = results.filter((r) => r.q.type === part.type);
    const correct = ofType.filter((r) => r.isCorrect).length;
    return {
      type: part.type,
      total: ofType.length,
      correct,
      earnedPts: ofType.reduce((s, r) => s + r.points, 0),
      maxPts: ofType.length * part.points,
    };
  }).filter((s) => s.total > 0);

  const topicMap = new Map(topics.map((t) => [t.id, t]));
  const topicStats: Record<string, { name: string; total: number; correct: number }> = {};
  for (const { q, isCorrect } of results) {
    if (!q.topic_id) continue;
    const topic = topicMap.get(q.topic_id);
    if (!topic) continue;
    const name = locale === 'kk' ? topic.name_kk : topic.name_ru;
    if (!topicStats[q.topic_id]) topicStats[q.topic_id] = { name, total: 0, correct: 0 };
    topicStats[q.topic_id].total++;
    if (isCorrect) topicStats[q.topic_id].correct++;
  }

  const skipped = results.filter((r) => isAnswerEmpty(r.answer)).length;
  const wrong = questions.length - correctCount - skipped;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      {/* Summary card */}
      <div className="rounded-2xl border bg-card p-6 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10">
          <Trophy className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold">{t('resultTitle')}</h1>
        <div className="mt-4 text-5xl font-semibold tabular-nums">{earnedScore}</div>
        <p className="mt-2 text-muted-foreground">{t('scorePoints', { score: earnedScore, max: maxScore })}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('score', { correct: correctCount, total: questions.length })}</p>
        <div className="mt-5 grid grid-cols-4 divide-x divide-border border-t pt-5">
          <div><div className="text-2xl font-semibold text-success">{correctCount}</div><div className="mt-1 text-xs text-muted-foreground">{t('correctLabel')}</div></div>
          <div><div className="text-2xl font-semibold text-destructive">{wrong}</div><div className="mt-1 text-xs text-muted-foreground">{t('wrongLabel')}</div></div>
          <div><div className="text-2xl font-semibold text-muted-foreground">{skipped}</div><div className="mt-1 text-xs text-muted-foreground">{t('skippedLabel')}</div></div>
          <div><div className="text-2xl font-semibold tabular-nums">{formatTime(elapsedS)}</div><div className="mt-1 text-xs text-muted-foreground">{t('timeSpent')}</div></div>
        </div>
      </div>

      {/* Breakdown by question type */}
      {typeStats.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">{t('byType')}</h2>
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
        </section>
      )}

      {/* Topic breakdown */}
      {Object.keys(topicStats).length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">{t('topicsBreakdown')}</h2>
          <div className="rounded-xl border bg-card divide-y divide-border">
            {Object.values(topicStats)
              .sort((a, b) => a.correct / a.total - b.correct / b.total)
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
        </section>
      )}

      {/* Question list */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">{t('allQuestions')}</h2>
        <div className="space-y-2">
          {results.map(({ q, answer, points, isCorrect }, i) => {
            const isOpen = expandedId === q.id;
            const stem = (q.body as { stem: string }).stem;
            const exp = q.explanation as Explanation | null;
            const isPartial = !isCorrect && points > 0;
            const isSkipped = isAnswerEmpty(answer);
            return (
              <div key={q.id} className="rounded-xl border bg-card">
                <button className="flex w-full items-start gap-3 p-4 text-left" onClick={() => setExpandedId(isOpen ? null : q.id)}>
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
                        {exp.blocks.map((b, bi) => <MathText key={bi} text={b.value} />)}
                      </div>
                    )}
                  </div>
                )}
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
