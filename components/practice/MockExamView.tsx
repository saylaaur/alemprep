'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { MathText } from '@/components/math/MathText';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Check,
  X,
  Flag,
  Clock,
  ChevronLeft,
  ChevronRight,
  Trophy,
  AlertCircle,
} from 'lucide-react';
import type { Question, QuestionBody, Explanation, ContextContent } from '@/types/db';
import { createExamSession, finishExamSession } from '@/lib/supabase/practice-actions';
import type { MockExamTopic } from '@/lib/supabase/queries';

// 40 minutes
const EXAM_DURATION_S = 40 * 60;

type AnswerState = string | string[] | Record<string, string> | null;
type QuestionFlag = 'none' | 'answered' | 'flagged';
type ExamPhase = 'intro' | 'exam' | 'result';

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
  if (
    type === 'matching' &&
    'correct' in body &&
    typeof body.correct === 'object' &&
    !Array.isArray(body.correct)
  ) {
    const a = answer as Record<string, string>;
    const c = body.correct as Record<string, string>;
    return Object.keys(c).every((k) => a[k] === c[k]);
  }
  return false;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type Props = {
  questions: Question[];
  contexts: Map<string, { id: string; title: string | null; content: ContextContent }>;
  topics: MockExamTopic[];
  subjectId: string;
  locale: string;
};

export function MockExamView({ questions, contexts, topics, subjectId, locale }: Props) {
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
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const total = questions.length;
  const current = questions[idx];

  const answeredCount = Object.values(flags).filter((f) => f === 'answered').length;
  const flaggedCount = Object.values(flags).filter((f) => f === 'flagged').length;

  // Timer tick
  useEffect(() => {
    if (phase !== 'exam') return;
    timerRef.current = setInterval(() => {
      setTimeLeft((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current!);
          setTimesUp(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [phase]);

  // Auto-submit when time runs out
  useEffect(() => {
    if (timesUp && phase === 'exam') {
      void handleSubmit(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timesUp]);

  const startExam = useCallback(async () => {
    const res = await createExamSession({ subjectId, totalQuestions: total });
    if ('error' in res) return;
    setSessionId(res.sessionId);
    startTimeRef.current = Date.now();
    setPhase('exam');
  }, [subjectId, total]);

  const handleSubmit = useCallback(
    async (auto = false) => {
      if (submitting) return;
      if (!auto) setConfirmOpen(false);
      setSubmitting(true);

      const timeSpentMs = Date.now() - startTimeRef.current;
      const results = questions.map((q) => {
        const answer = answers[q.id] ?? null;
        const isCorrect = checkAnswer(q.type, answer, q.body);
        return {
          questionId: q.id,
          isCorrect,
          givenAnswer: answer,
          timeSpentMs: Math.round(timeSpentMs / questions.length),
        };
      });

      if (sessionId) {
        await finishExamSession({ sessionId, results });
      }

      setSubmitting(false);
      setPhase('result');
    },
    [submitting, questions, answers, sessionId]
  );

  const setAnswer = (next: AnswerState) => {
    if (!current) return;
    setAnswers((prev) => ({ ...prev, [current.id]: next }));
    setFlags((prev) => ({ ...prev, [current.id]: 'answered' }));
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
            const answer = answers[current.id] ?? null;
            if (current.type === 'single') {
              setAnswer(opt.id);
            } else {
              const arr = Array.isArray(answer) ? answer : [];
              setAnswer(arr.includes(opt.id) ? arr.filter((x) => x !== opt.id) : [...arr, opt.id]);
            }
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
            <p className="mt-3 text-muted-foreground">
              {t('subtitle', { count: total, duration: Math.round(EXAM_DURATION_S / 60) })}
            </p>
            <div className="mt-8 grid grid-cols-3 divide-x divide-border rounded-xl border bg-card/50 py-5 text-center">
              <div>
                <div className="text-2xl font-semibold">{total}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t('totalQuestions')}</div>
              </div>
              <div>
                <div className="text-2xl font-semibold">{Math.round(EXAM_DURATION_S / 60)}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t('minutesLabel')}</div>
              </div>
              <div>
                <div className="text-2xl font-semibold">4</div>
                <div className="mt-1 text-xs text-muted-foreground">{t('typesLabel')}</div>
              </div>
            </div>
            <Button size="lg" className="mt-8 shadow-primary" onClick={() => void startExam()}>
              {t('startButton')}
            </Button>
          </>
        )}
      </div>
    );
  }

  // ── RESULT ────────────────────────────────────────────────────────────────
  if (phase === 'result') {
    return <ResultScreen questions={questions} contexts={contexts} topics={topics} answers={answers} locale={locale} t={t} />;
  }

  // ── EXAM ──────────────────────────────────────────────────────────────────
  const answer = current ? (answers[current.id] ?? null) : null;
  const currentFlag = current ? (flags[current.id] ?? 'none') : 'none';
  const ctx = current?.context_id ? contexts.get(current.context_id) : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      {/* Top bar */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="min-w-0 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{idx + 1}</span> / {total}
        </div>
        <div className="flex items-center gap-3">
          <div className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium tabular-nums', timeLeft <= 300 ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground')}>
            <Clock className="h-3.5 w-3.5" />
            {formatTime(timeLeft)}
          </div>
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-primary">{answeredCount}</span>/{total}
          </div>
        </div>
      </div>

      {/* Navigator */}
      <div className="mb-6 flex flex-wrap gap-1.5">
        {questions.map((q, i) => {
          const f = flags[q.id] ?? 'none';
          return (
            <button
              key={q.id}
              onClick={() => setIdx(i)}
              className={cn(
                'h-8 w-8 rounded-lg text-xs font-medium transition-all duration-150',
                i === idx && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                f === 'none' && i !== idx && 'bg-muted text-muted-foreground hover:bg-muted/70',
                f === 'none' && i === idx && 'bg-muted text-foreground',
                f === 'answered' && 'bg-primary/15 text-primary',
                f === 'flagged' && 'bg-warning/20 text-warning'
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* Question */}
      <div key={current.id} className="animate-fade-in">
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

        <div className="mb-6 text-lg leading-relaxed">
          <MathText text={(current.body as { stem: string }).stem} />
        </div>

        {/* Answer area */}
        <div className="mb-8">
          {current.type === 'single' && 'options' in current.body && (
            <ul className="space-y-2">
              {(current.body as { options: { id: string; content: string }[] }).options.map((opt) => (
                <li key={opt.id}>
                  <button
                    onClick={() => setAnswer(opt.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium text-left transition-all duration-150',
                      answer === opt.id
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-card hover:border-primary/40 hover:bg-accent'
                    )}
                  >
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{opt.id})</span>
                    <MathText text={opt.content} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {current.type === 'multi' && 'options' in current.body && (
            <ul className="space-y-2">
              {(current.body as { options: { id: string; content: string }[] }).options.map((opt) => {
                const selected = Array.isArray(answer) && answer.includes(opt.id);
                return (
                  <li key={opt.id}>
                    <button
                      onClick={() => {
                        const arr = Array.isArray(answer) ? answer : [];
                        setAnswer(selected ? arr.filter((x) => x !== opt.id) : [...arr, opt.id]);
                      }}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium text-left transition-all duration-150',
                        selected
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border bg-card hover:border-primary/40 hover:bg-accent'
                      )}
                    >
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{opt.id})</span>
                      <MathText text={opt.content} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {current.type === 'matching' && 'left' in current.body && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                {(current.body as { left: { id: string; content: string }[] }).left.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">{item.id}.</span>
                    <MathText text={item.content} />
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {(current.body as { left: { id: string }[]; right: string[] }).left.map((item) => {
                  const opts = (current.body as { right: string[] }).right;
                  const currentAnswer = (answer as Record<string, string> | null)?.[item.id] ?? '';
                  return (
                    <select
                      key={item.id}
                      value={currentAnswer}
                      onChange={(e) => {
                        const prev = (answer as Record<string, string> | null) ?? {};
                        setAnswer({ ...prev, [item.id]: e.target.value });
                      }}
                      className="w-full rounded-lg border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="">{t('matchingPlaceholder')}</option>
                      {opts.map((o, i) => (
                        <option key={i} value={o}>{o}</option>
                      ))}
                    </select>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => { if (idx > 0) setIdx(idx - 1); }} disabled={idx === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { if (idx < total - 1) setIdx(idx + 1); }} disabled={idx === total - 1}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleFlag}
              className={cn('gap-1.5', currentFlag === 'flagged' ? 'text-warning' : 'text-muted-foreground')}
            >
              <Flag className="h-4 w-4" />
              {currentFlag === 'flagged' ? t('unflagQuestion') : t('flagQuestion')}
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={submitting}
          >
            {t('submitButton')}
          </Button>
        </div>
      </div>

      {/* Confirm dialog */}
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
  t: ReturnType<typeof useTranslations<'exam'>>;
};

function ResultScreen({ questions, topics, answers, locale, t }: ResultProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const results = questions.map((q) => {
    const answer = answers[q.id] ?? null;
    return { q, answer, isCorrect: checkAnswer(q.type, answer, q.body) };
  });

  const correctCount = results.filter((r) => r.isCorrect).length;
  const pct = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;

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

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      {/* Summary */}
      <div className="rounded-2xl border bg-card p-6 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10">
          <Trophy className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold">{t('resultTitle')}</h1>
        <div className="mt-4 text-5xl font-semibold tabular-nums">{pct}%</div>
        <p className="mt-2 text-muted-foreground">{t('score', { correct: correctCount, total: questions.length })}</p>
        <div className="mt-5 grid grid-cols-3 divide-x divide-border border-t pt-5">
          <div>
            <div className="text-2xl font-semibold text-success">{correctCount}</div>
            <div className="mt-1 text-xs text-muted-foreground">{t('correctLabel')}</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-destructive">{questions.length - correctCount - (questions.length - results.filter((r) => r.answer !== null).length)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{t('wrongLabel')}</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-muted-foreground">
              {results.filter((r) => r.answer === null).length}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{t('skippedLabel')}</div>
          </div>
        </div>
      </div>

      {/* Topic breakdown */}
      {Object.keys(topicStats).length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {t('topicsBreakdown')}
          </h2>
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
                        <div
                          className={cn('h-full rounded-full', p >= 70 ? 'bg-success' : p >= 40 ? 'bg-warning' : 'bg-destructive')}
                          style={{ width: `${p}%` }}
                        />
                      </div>
                      <span className={cn('w-8 text-right tabular-nums text-xs font-medium', p >= 70 ? 'text-success' : p >= 40 ? 'text-warning' : 'text-destructive')}>
                        {p}%
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* Question list */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {t('allQuestions')}
        </h2>
        <div className="space-y-2">
          {results.map(({ q, answer, isCorrect }, i) => {
            const isOpen = expandedId === q.id;
            const stem = (q.body as { stem: string }).stem;
            const exp = q.explanation as Explanation | null;
            return (
              <div key={q.id} className="rounded-xl border bg-card">
                <button
                  className="flex w-full items-start gap-3 p-4 text-left"
                  onClick={() => setExpandedId(isOpen ? null : q.id)}
                >
                  <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold', isCorrect ? 'bg-success/15 text-success' : answer !== null ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground')}>
                    {isCorrect ? <Check className="h-3.5 w-3.5" /> : answer !== null ? <X className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="flex-1 text-sm leading-relaxed">
                    <MathText text={stem} />
                  </span>
                  <span className="mt-1 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                </button>

                {isOpen && (
                  <div className="border-t px-4 pb-4 pt-3 space-y-3">
                    {/* Correct answer */}
                    <CorrectAnswerBlock q={q} answer={answer} isCorrect={isCorrect} t={t} />
                    {/* Explanation */}
                    {exp && exp.blocks.length > 0 && (
                      <div className="rounded-lg bg-muted/30 px-4 py-3 text-sm space-y-1">
                        <div className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('explanationLabel')}</div>
                        {exp.blocks.map((b, bi) => (
                          <MathText key={bi} text={b.value} />
                        ))}
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

function CorrectAnswerBlock({
  q,
  answer,
  isCorrect,
  t,
}: {
  q: Question;
  answer: AnswerState;
  isCorrect: boolean;
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
            <li
              key={opt.id}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
                isOpt ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive line-through'
              )}
            >
              {isOpt ? <Check className="h-4 w-4 shrink-0" /> : <X className="h-4 w-4 shrink-0" />}
              <span className="font-mono text-xs">{opt.id})</span>
              <MathText text={opt.content} />
            </li>
          );
        })}
      </ul>
    );
  }

  if (!isCorrect) {
    return (
      <p className="text-sm text-muted-foreground italic">{t('checkManually')}</p>
    );
  }
  return null;
}
