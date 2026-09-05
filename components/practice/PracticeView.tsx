'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { MathText } from '@/components/math/MathText';
import { ContentBlocks } from '@/components/content/ContentBlocks';
import { QuestionStem } from '@/components/content/QuestionStem';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Check,
  X,
  ArrowRight,
  ArrowLeft,
  Keyboard,
  Maximize2,
  Minimize2,
  Trophy,
  Zap,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import type { Question, ContextContent } from '@/types/db';
import { normalizeExplanationBlocks } from '@/lib/explanation';
import { recordAttempt } from '@/lib/supabase/practice-actions';
import { askAssistant, getAssistantHistory } from '@/lib/supabase/assistant-actions';
import {
  AI_DAILY_LIMIT,
  ASSISTANT_MAX_QUESTION_LENGTH,
  splitAssistantAnswer,
  type AssistantMode,
  type AssistantTurn,
} from '@/lib/assistant';
import { checkAnswer, isAnswerComplete, type AnswerState } from '@/lib/practice';

type AssistantQuestionState = {
  loading: boolean;
  error: boolean;
  history: AssistantTurn[];
};

const EMPTY_ASSISTANT_STATE: AssistantQuestionState = { loading: false, error: false, history: [] };

type Props = {
  questions: Question[];
  contexts: Map<string, { id: string; title: string | null; content: ContextContent }>;
  topicName: string;
};

export function PracticeView({ questions, contexts, topicName }: Props) {
  const t = useTranslations('practice');
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [focus, setFocus] = useState(false);
  const [xpPop, setXpPop] = useState<{ id: number; amount: number } | null>(null);
  const [pendingAttempts, setPendingAttempts] = useState<Record<string, boolean>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, boolean>>({});
  const [explanationOpen, setExplanationOpen] = useState<Record<string, boolean>>({});
  const [assistantState, setAssistantState] = useState<Record<string, AssistantQuestionState>>({});
  const [assistantPanelOpen, setAssistantPanelOpen] = useState<Record<string, boolean>>({});
  const [assistantRemaining, setAssistantRemaining] = useState<number | null>(null);
  const [assistantLimitReached, setAssistantLimitReached] = useState(false);
  const [assistantGlobalLimitReached, setAssistantGlobalLimitReached] = useState(false);
  const [assistantQuestionLimitReached, setAssistantQuestionLimitReached] = useState<Record<string, boolean>>({});
  const [assistantInvalidQuestion, setAssistantInvalidQuestion] = useState<Record<string, boolean>>({});
  const [askInput, setAskInput] = useState('');
  const questionShownAt = useRef<Record<string, number>>({});
  const recordedRef = useRef<Set<string>>(new Set());
  // Раз загруженную историю для вопроса больше не перезапрашиваем при повторном
  // открытии панели; mountedRef глушит setState, если ответ getAssistantHistory
  // придёт уже после размонтирования компонента.
  const historyLoadedRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const total = questions.length;
  const current = questions[idx];

  // Засекаем время показа вопроса
  useEffect(() => {
    if (current && !questionShownAt.current[current.id]) {
      questionShownAt.current[current.id] = Date.now();
    }
  }, [current]);

  // Черновик свободного вопроса не должен переезжать на следующую задачу.
  useEffect(() => {
    setAskInput('');
  }, [current?.id]);

  // Focus mode — скрываем sidebar и второстепенные элементы
  useEffect(() => {
    document.body.classList.toggle('focus-mode', focus);
    return () => document.body.classList.remove('focus-mode');
  }, [focus]);

  const stats = useMemo(() => {
    let correct = 0;
    for (const q of questions) {
      if (revealed[q.id] && checkAnswer(q.type, answers[q.id] ?? null, q.body)) correct++;
    }
    return { correct, answered: Object.keys(revealed).length };
  }, [questions, answers, revealed]);

  const answer = current ? (answers[current.id] ?? null) : null;
  const isRevealed = current ? !!revealed[current.id] : false;
  const isCorrect = isRevealed && current != null && checkAnswer(current.type, answer, current.body);
  const isSaving = current ? !!pendingAttempts[current.id] : false;
  const hasSaveError = current ? !!saveErrors[current.id] : false;
  const ctx = current?.context_id ? contexts.get(current.context_id) : null;

  const setAnswer = (next: AnswerState) => {
    if (!current || isRevealed) return;
    setAnswers((prev) => ({ ...prev, [current.id]: next }));
  };

  const check = () => {
    if (!current) return;
    if (!isAnswerComplete(current.type, answer, current.body)) return;
    if (recordedRef.current.has(current.id) || pendingAttempts[current.id]) return;

    // Сохраняем попытку в БД и показываем «+N XP» по реально начисленному XP.
    const shownAt = questionShownAt.current[current.id] ?? Date.now();
    const timeSpent = Date.now() - shownAt;
    setPendingAttempts((prev) => ({ ...prev, [current.id]: true }));
    setSaveErrors((prev) => ({ ...prev, [current.id]: false }));
    void recordAttempt({
      questionId: current.id,
      givenAnswer: answer,
      timeSpentMs: timeSpent,
    }).then((res) => {
      if (!res.ok) {
        setSaveErrors((prev) => ({ ...prev, [current.id]: true }));
        return;
      }
      recordedRef.current.add(current.id);
      setRevealed((prev) => ({ ...prev, [current.id]: true }));
      if (res.ok && res.xpAwarded > 0) {
        setXpPop({ id: Date.now(), amount: res.xpAwarded });
      }
    }).catch(() => {
      setSaveErrors((prev) => ({ ...prev, [current.id]: true }));
    }).finally(() => {
      setPendingAttempts((prev) => ({ ...prev, [current.id]: false }));
    });
  };

  // Микро-празднование «+N XP» гаснет само.
  useEffect(() => {
    if (!xpPop) return;
    const timer = window.setTimeout(() => setXpPop(null), 1200);
    return () => window.clearTimeout(timer);
  }, [xpPop]);

  // Слой 2 (ИИ-помощь): история диалога хранится по вопросу; remaining/дневной
  // лимит — общие на сессию тренажёра (сервер знает точный лимит, клиент
  // только отражает его). Лимит реплик на задачу — per-вопрос, отдельно от
  // дневного: у них разные сообщения и разный сброс.
  const askAI = (mode: AssistantMode, userQuestion?: string) => {
    if (!current) return;
    const qId = current.id;
    setAssistantState((prev) => ({
      ...prev,
      [qId]: { loading: true, error: false, history: prev[qId]?.history ?? [] },
    }));
    void askAssistant({ questionId: qId, mode, userAnswer: answer, userQuestion })
      .then((res) => {
        if (res.ok) {
          setAssistantState((prev) => ({ ...prev, [qId]: { loading: false, error: false, history: res.history } }));
          setAssistantRemaining(res.remaining);
          setAssistantQuestionLimitReached((prev) => ({ ...prev, [qId]: false }));
          setAssistantInvalidQuestion((prev) => ({ ...prev, [qId]: false }));
          if (mode === 'ask') setAskInput('');
          return;
        }
        setAssistantState((prev) => ({
          ...prev,
          [qId]: { loading: false, error: res.error === 'model-error', history: prev[qId]?.history ?? [] },
        }));
        if (res.error === 'daily-limit') {
          setAssistantLimitReached(true);
          setAssistantRemaining(0);
        } else if (res.error === 'global-limit') {
          // Общий бюджет партнёра исчерпан — личная квота ученика не тронута
          // (сервер её не списывал), поэтому assistantRemaining не трогаем.
          setAssistantGlobalLimitReached(true);
        } else if (res.error === 'question-limit') {
          setAssistantQuestionLimitReached((prev) => ({ ...prev, [qId]: true }));
        } else if (res.error === 'invalid-input') {
          setAssistantInvalidQuestion((prev) => ({ ...prev, [qId]: true }));
        }
      })
      .catch(() => {
        setAssistantState((prev) => ({
          ...prev,
          [qId]: { loading: false, error: true, history: prev[qId]?.history ?? [] },
        }));
      });
  };

  // Первое раскрытие панели ассистента для задачи — лениво грузит историю
  // диалога (большинство задач ассистентом не пользуются вовсе: грузить на
  // маунт каждого вопроса — 19 пустых запросов из 20 при узкой БД и медленном
  // интернете у сельских школьников). Повторное открытие переиспользует кэш.
  const toggleAssistantPanel = () => {
    if (!current) return;
    const qId = current.id;
    const willOpen = !assistantPanelOpen[qId];
    setAssistantPanelOpen((prev) => ({ ...prev, [qId]: willOpen }));
    if (!willOpen || historyLoadedRef.current.has(qId)) return;

    historyLoadedRef.current.add(qId);
    setAssistantState((prev) => ({
      ...prev,
      [qId]: { loading: true, error: false, history: prev[qId]?.history ?? [] },
    }));
    void getAssistantHistory(qId)
      .then((history) => {
        if (!mountedRef.current) return;
        setAssistantState((prev) => ({ ...prev, [qId]: { loading: false, error: false, history } }));
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setAssistantState((prev) => ({
          ...prev,
          [qId]: { loading: false, error: true, history: prev[qId]?.history ?? [] },
        }));
      });
  };

  const submitAskInput = () => {
    const trimmed = askInput.trim();
    if (trimmed.length === 0 || trimmed.length > ASSISTANT_MAX_QUESTION_LENGTH) return;
    askAI('ask', trimmed);
  };

  const goNext = () => {
    if (idx < total - 1) setIdx(idx + 1);
  };
  const goPrev = () => {
    if (idx > 0) setIdx(idx - 1);
  };

  const isLast = idx === total - 1;
  const allDone = stats.answered === total;
  const optionCount = current
    ? ((current.body as { options?: { id: string }[] }).options?.length ?? 0)
    : 0;

  // Клавиатурные шорткаты (хук должен быть до раннего return)
  useEffect(() => {
    if (!current) return;
    const handler = (e: KeyboardEvent) => {
      // Не перехватываем, если фокус на input/select/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      ) return;

      // 1-9 — выбор варианта
      if (!isRevealed && current.type !== 'matching') {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 9) {
          const body = current.body as { options?: { id: string }[] };
          const opt = body.options?.[num - 1];
          if (opt) {
            e.preventDefault();
            if (current.type === 'single') {
              setAnswer(opt.id);
            } else {
              const arr = Array.isArray(answer) ? answer : [];
              setAnswer(arr.includes(opt.id) ? arr.filter((x) => x !== opt.id) : [...arr, opt.id]);
            }
          }
          return;
        }
      }

      // Enter — проверить или дальше
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!isRevealed) {
          check();
        } else if (!isLast) {
          goNext();
        }
        return;
      }

      // Стрелки — навигация
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  if (total === 0) {
    return (
      <div className="mx-auto grid max-w-md place-items-center p-16 text-center">
        <div className="rounded-2xl border bg-card p-10 shadow-sm">
          <p className="text-muted-foreground">{t('noQuestions')}</p>
        </div>
      </div>
    );
  }

  const explanationBlocks = normalizeExplanationBlocks(current.explanation);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="min-w-0 text-sm text-muted-foreground">
          <span className="truncate">{topicName}</span> ·{' '}
          <span className="font-mono font-medium tabular-nums text-foreground">
            {idx + 1} / {total}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {current.type !== 'matching' ? (
            <div
              data-hide-in-focus
              className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex"
            >
              <Keyboard className="h-3.5 w-3.5" />
              <span className="flex items-center gap-1">
                <kbd>1</kbd>–<kbd>{optionCount}</kbd> {t('shortcutSelect')} · <kbd>↵</kbd>{' '}
                {t('shortcutVerify')}
              </span>
            </div>
          ) : null}
          <div data-hide-in-focus className="font-mono text-sm tabular-nums text-muted-foreground">
            <span className="font-semibold text-success">{stats.correct}</span>
            <span className="text-muted-foreground/60">/{stats.answered}</span>
          </div>
          <button
            type="button"
            onClick={() => setFocus((f) => !f)}
            aria-label={focus ? t('exitFocusMode') : t('focusMode')}
            aria-pressed={focus}
            title={focus ? t('exitFocusMode') : t('focusMode')}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/25"
          >
            {focus ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-7 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-all duration-500 ease-smooth"
          style={{ width: `${((idx + 1) / total) * 100}%` }}
        />
      </div>

      {/* Question navigator */}
      <div data-hide-in-focus className="mb-8 flex flex-wrap gap-1.5">
        {questions.map((q, i) => {
          const wasRevealed = !!revealed[q.id];
          const wasCorrect = wasRevealed && checkAnswer(q.type, answers[q.id] ?? null, q.body);
          return (
            <button
              key={q.id}
              onClick={() => setIdx(i)}
              aria-label={t('question', { current: i + 1, total })}
              aria-current={i === idx ? 'true' : undefined}
              className={cn(
                'h-8 w-8 rounded-lg text-xs font-medium transition-all duration-200 ease-smooth focus-visible:ring-4 focus-visible:ring-ring/25',
                i === idx && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                !wasRevealed && i !== idx && 'bg-muted text-muted-foreground hover:bg-muted/70',
                !wasRevealed && i === idx && 'bg-muted text-foreground',
                wasRevealed && wasCorrect && 'bg-success/15 text-success hover:bg-success/25',
                wasRevealed && !wasCorrect && 'bg-destructive/15 text-destructive hover:bg-destructive/25'
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* Anim wrapper — fades on question change */}
      <div key={current.id} className="animate-fade-in">
        {/* Context (для контекстных блоков) */}
        {ctx ? <ContextBlock ctx={ctx} /> : null}

        {/* Question */}
        <div className="mb-6">
          <div className="text-lg leading-relaxed">
            <QuestionStem body={current.body} />
          </div>
        </div>

        {/* Answer area */}
        <div className="mb-8">
          {current.type === 'single' && (
            <SingleAnswer
              body={current.body as { options: { id: string; content: string }[]; correct: string }}
              answer={typeof answer === 'string' ? answer : null}
              isRevealed={isRevealed}
              onChange={setAnswer}
            />
          )}
          {current.type === 'multi' && (
            <MultiAnswer
              body={current.body as { options: { id: string; content: string }[]; correct: string[] }}
              answer={Array.isArray(answer) ? answer : []}
              isRevealed={isRevealed}
              onChange={setAnswer}
            />
          )}
          {current.type === 'matching' && (
            <MatchingAnswer
              body={
                current.body as {
                  left: { id: string; content: string }[];
                  right: string[];
                  correct: Record<string, string>;
                }
              }
              answer={
                answer && typeof answer === 'object' && !Array.isArray(answer)
                  ? (answer as Record<string, string>)
                  : {}
              }
              isRevealed={isRevealed}
              onChange={setAnswer}
            />
          )}
        </div>

        {/* Verdict + explanation + ИИ-помощь */}
        {isRevealed ? (
          <div className="mb-6 space-y-3">
            <div
              className={cn(
                'flex animate-scale-in items-center gap-2 rounded-xl p-3.5 text-sm font-medium',
                isCorrect
                  ? 'bg-success/10 text-success'
                  : 'bg-destructive/10 text-destructive'
              )}
            >
              <span
                className={cn(
                  'grid h-6 w-6 place-items-center rounded-full',
                  isCorrect ? 'bg-success/15' : 'bg-destructive/15'
                )}
              >
                {isCorrect ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
              </span>
              {isCorrect ? t('correct') : t('incorrect')}
              {isCorrect && xpPop ? (
                <span
                  key={xpPop.id}
                  className="ml-auto inline-flex animate-xp-pop items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 font-mono text-xs font-bold text-primary"
                >
                  <Zap className="h-3 w-3" />+{xpPop.amount} XP
                </span>
              ) : null}
            </div>

            {/* Слой 1 — «Разбор»: бесплатно, безлимитно, без API (уже сохранён в БД) */}
            {explanationBlocks.length > 0 ? (
              explanationOpen[current.id] ? (
                <div className="animate-slide-up space-y-2 rounded-xl border bg-card p-5 text-sm leading-relaxed text-muted-foreground shadow-xs">
                  <div className="font-medium text-foreground">{t('explanation')}</div>
                  <ContentBlocks blocks={explanationBlocks} />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setExplanationOpen((prev) => ({ ...prev, [current.id]: true }))}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                >
                  <ChevronDown className="h-4 w-4" />
                  {t('showExplanation')}
                </button>
              )
            ) : null}

            {/*
              Слой 2 — ИИ-помощь: «почему неверно» (если ошибся) и «объясни проще».
              ИНВАРИАНТ: эти кнопки рендерятся ТОЛЬКО внутри isRevealed-ветки, а
              isRevealed выставляется единственно в успешном .then() recordAttempt
              выше (после подтверждённой записи попытки). Не переносить их наружу
              и не выставлять isRevealed раньше: сервер сам вычисляет
              answerRevealed по наличию попытки в БД, и если клиент попросит
              «почему неверно» до того, как попытка реально сохранилась, сервер
              решит, что ответ не раскрыт, и откажется называть ошибку.
            */}
            <AssistantHelp
              availableModes={isCorrect ? ['simpler'] : ['why-wrong', 'simpler']}
              panelOpen={!!assistantPanelOpen[current.id]}
              onTogglePanel={toggleAssistantPanel}
              state={assistantState[current.id] ?? EMPTY_ASSISTANT_STATE}
              askInput={askInput}
              onAskInputChange={setAskInput}
              onSubmitAsk={submitAskInput}
              remaining={assistantRemaining}
              dailyLimitReached={assistantLimitReached}
              globalLimitReached={assistantGlobalLimitReached}
              questionLimitReached={!!assistantQuestionLimitReached[current.id]}
              invalidQuestion={!!assistantInvalidQuestion[current.id]}
              onAsk={askAI}
            />
          </div>
        ) : (
          <div className="mb-6">
            <AssistantHelp
              availableModes={['hint']}
              panelOpen={!!assistantPanelOpen[current.id]}
              onTogglePanel={toggleAssistantPanel}
              state={assistantState[current.id] ?? EMPTY_ASSISTANT_STATE}
              askInput={askInput}
              onAskInputChange={setAskInput}
              onSubmitAsk={submitAskInput}
              remaining={assistantRemaining}
              dailyLimitReached={assistantLimitReached}
              globalLimitReached={assistantGlobalLimitReached}
              questionLimitReached={!!assistantQuestionLimitReached[current.id]}
              invalidQuestion={!!assistantInvalidQuestion[current.id]}
              onAsk={askAI}
            />
          </div>
        )}
        {!isRevealed && hasSaveError ? (
          <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
            {t('saveError')}
          </div>
        ) : null}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={goPrev} disabled={idx === 0}>
          <ArrowLeft className="h-4 w-4" />
          {t('previousQuestion')}
        </Button>
        {!isRevealed ? (
          <Button
            onClick={check}
            disabled={!isAnswerComplete(current.type, answer, current.body) || isSaving}
          >
            {isSaving ? t('saving') : t('checkAnswer')}
          </Button>
        ) : isLast && allDone ? (
          <div className="inline-flex items-center gap-2 rounded-lg bg-success/10 px-4 py-2 text-sm font-medium text-success">
            <Trophy className="h-4 w-4" />
            {t('allDone', { correct: stats.correct, total })}
          </div>
        ) : (
          <Button onClick={goNext} disabled={isLast}>
            {t('nextQuestion')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function ContextBlock({
  ctx,
}: {
  ctx: { id: string; title: string | null; content: ContextContent };
}) {
  return (
    <div className="mb-6 rounded-xl border bg-muted/40 p-4">
      {ctx.title ? <div className="mb-2 text-sm font-semibold">{ctx.title}</div> : null}
      <div className="text-sm leading-relaxed text-muted-foreground">
        <ContentBlocks blocks={ctx.content.blocks ?? []} />
      </div>
    </div>
  );
}

function SingleAnswer({
  body,
  answer,
  isRevealed,
  onChange,
}: {
  body: { options: { id: string; content: string }[]; correct: string };
  answer: string | null;
  isRevealed: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2.5" role="radiogroup">
      {body.options.map((opt, i) => {
        const isSelected = answer === opt.id;
        const isCorrect = opt.id === body.correct;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            disabled={isRevealed}
            role="radio"
            aria-checked={isSelected}
            className={cn(
              'group flex w-full items-center gap-3.5 rounded-xl border p-4 text-left transition-all duration-200 ease-smooth focus-visible:ring-4 focus-visible:ring-ring/25',
              !isRevealed && 'cursor-pointer hover:border-primary/50 hover:bg-accent/40 active:scale-[0.995]',
              !isRevealed && isSelected && 'border-primary bg-primary/5 ring-1 ring-primary/30',
              !isRevealed && !isSelected && 'border-border',
              isRevealed && isCorrect && 'border-success/60 bg-success/10',
              isRevealed && !isCorrect && isSelected && 'border-destructive/60 bg-destructive/10',
              isRevealed && !isCorrect && !isSelected && 'opacity-50'
            )}
          >
            <div
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-semibold uppercase transition-colors',
                !isRevealed && isSelected && 'border-primary bg-primary text-primary-foreground',
                !isRevealed && !isSelected && 'border-muted-foreground/30 text-muted-foreground group-hover:border-primary/50',
                isRevealed && isCorrect && 'border-success bg-success text-success-foreground',
                isRevealed && !isCorrect && isSelected && 'border-destructive bg-destructive text-destructive-foreground',
                isRevealed && !isCorrect && !isSelected && 'border-muted-foreground/30 text-muted-foreground'
              )}
            >
              {opt.id}
            </div>
            <div className="flex-1">
              <MathText text={opt.content} />
            </div>
            {!isRevealed ? (
              <kbd className="hidden sm:inline-flex">{i + 1}</kbd>
            ) : isCorrect ? (
              <Check className="h-5 w-5 text-success" />
            ) : isSelected ? (
              <X className="h-5 w-5 text-destructive" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function MultiAnswer({
  body,
  answer,
  isRevealed,
  onChange,
}: {
  body: { options: { id: string; content: string }[]; correct: string[] };
  answer: string[];
  isRevealed: boolean;
  onChange: (v: string[]) => void;
}) {
  const t = useTranslations('practice');
  const toggle = (id: string) => {
    if (answer.includes(id)) onChange(answer.filter((x) => x !== id));
    else onChange([...answer, id]);
  };

  return (
    <div className="space-y-2.5" role="group" aria-label={t('multiHint')}>
      <div className="text-sm text-muted-foreground">{t('multiHint')}</div>
      {body.options.map((opt, i) => {
        const isSelected = answer.includes(opt.id);
        const isCorrect = body.correct.includes(opt.id);
        return (
          <button
            key={opt.id}
            onClick={() => toggle(opt.id)}
            disabled={isRevealed}
            role="checkbox"
            aria-checked={isSelected}
            className={cn(
              'group flex w-full items-center gap-3.5 rounded-xl border p-4 text-left transition-all duration-200 ease-smooth focus-visible:ring-4 focus-visible:ring-ring/25',
              !isRevealed && 'cursor-pointer hover:border-primary/50 hover:bg-accent/40 active:scale-[0.995]',
              !isRevealed && isSelected && 'border-primary bg-primary/5 ring-1 ring-primary/30',
              !isRevealed && !isSelected && 'border-border',
              isRevealed && isCorrect && 'border-success/60 bg-success/10',
              isRevealed && !isCorrect && isSelected && 'border-destructive/60 bg-destructive/10',
              isRevealed && !isCorrect && !isSelected && 'opacity-50'
            )}
          >
            <div
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-md border text-xs font-semibold uppercase transition-colors',
                !isRevealed && isSelected && 'border-primary bg-primary text-primary-foreground',
                !isRevealed && !isSelected && 'border-muted-foreground/30 text-muted-foreground group-hover:border-primary/50',
                isRevealed && isCorrect && 'border-success bg-success text-success-foreground',
                isRevealed && !isCorrect && isSelected && 'border-destructive bg-destructive text-destructive-foreground',
                isRevealed && !isCorrect && !isSelected && 'border-muted-foreground/30 text-muted-foreground'
              )}
            >
              {opt.id}
            </div>
            <div className="flex-1">
              <MathText text={opt.content} />
            </div>
            {!isRevealed ? (
              <kbd className="hidden sm:inline-flex">{i + 1}</kbd>
            ) : isCorrect ? (
              <Check className="h-5 w-5 text-success" />
            ) : isSelected ? (
              <X className="h-5 w-5 text-destructive" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function MatchingAnswer({
  body,
  answer,
  isRevealed,
  onChange,
}: {
  body: {
    left: { id: string; content: string }[];
    right: string[];
    correct: Record<string, string>;
  };
  answer: Record<string, string>;
  isRevealed: boolean;
  onChange: (v: Record<string, string>) => void;
}) {
  const t = useTranslations('practice');
  return (
    <div className="space-y-2.5">
      {body.left.map((item) => {
        const selected = answer[item.id];
        const correct = body.correct[item.id];
        const wasCorrect = isRevealed && selected === correct;
        return (
          <div
            key={item.id}
            className={cn(
              'flex items-center gap-3.5 rounded-xl border p-3.5 transition-colors',
              !isRevealed && 'border-border',
              isRevealed && wasCorrect && 'border-success/60 bg-success/10',
              isRevealed && !wasCorrect && 'border-destructive/60 bg-destructive/10'
            )}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-muted-foreground/30 text-xs font-semibold uppercase text-muted-foreground">
              {item.id}
            </span>
            <div className="flex-1">
              <MathText text={item.content} />
            </div>
            <select
              value={selected ?? ''}
              onChange={(e) => onChange({ ...answer, [item.id]: e.target.value })}
              disabled={isRevealed}
              aria-label={t('matchingSelectFor', { item: item.id })}
              className="rounded-lg border bg-background px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25 disabled:opacity-60"
            >
              <option value="" disabled>
                {t('matchingPlaceholder')}
              </option>
              {body.right.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {isRevealed && !wasCorrect ? (
              <span className="shrink-0 text-sm text-muted-foreground">{t('correctAnswer', { answer: correct })}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const ASSISTANT_MODE_KEY: Record<Exclude<AssistantMode, 'ask'>, 'assistantHint' | 'assistantWhyWrong' | 'assistantSimpler'> = {
  hint: 'assistantHint',
  'why-wrong': 'assistantWhyWrong',
  simpler: 'assistantSimpler',
};

/** Реплика ученика — пресет переводится через next-intl, свободный вопрос (mode=null) показывается как есть. */
function studentTurnLabelUi(t: ReturnType<typeof useTranslations>, turn: AssistantTurn): string {
  if (turn.mode && turn.mode !== 'ask') return t(ASSISTANT_MODE_KEY[turn.mode]);
  return turn.text;
}

/**
 * Слой 2 — диалог с ИИ-ассистентом: свёрнутая панель по умолчанию (история
 * грузится лениво при первом раскрытии, см. toggleAssistantPanel), внутри —
 * транскрипт, кнопки пресетов и поле свободного вопроса. Доступно и до, и
 * после проверки ответа — availableModes меняет только состав кнопок.
 */
function AssistantHelp({
  availableModes,
  panelOpen,
  onTogglePanel,
  state,
  askInput,
  onAskInputChange,
  onSubmitAsk,
  remaining,
  dailyLimitReached,
  globalLimitReached,
  questionLimitReached,
  invalidQuestion,
  onAsk,
}: {
  availableModes: Exclude<AssistantMode, 'ask'>[];
  panelOpen: boolean;
  onTogglePanel: () => void;
  state: AssistantQuestionState;
  askInput: string;
  onAskInputChange: (v: string) => void;
  onSubmitAsk: () => void;
  remaining: number | null;
  dailyLimitReached: boolean;
  globalLimitReached: boolean;
  questionLimitReached: boolean;
  invalidQuestion: boolean;
  onAsk: (mode: AssistantMode) => void;
}) {
  const t = useTranslations('practice');
  const blocked = state.loading || dailyLimitReached || globalLimitReached || questionLimitReached;

  if (!panelOpen) {
    return (
      <button
        type="button"
        onClick={onTogglePanel}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary/80"
      >
        <Sparkles className="h-4 w-4" />
        {t('assistantHelp')}
      </button>
    );
  }

  return (
    <div className="animate-slide-up space-y-3 rounded-xl border bg-card p-4">
      <button
        type="button"
        onClick={onTogglePanel}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground"
      >
        <ChevronDown className="h-4 w-4" />
        {t('assistantHelp')}
      </button>

      {state.history.length > 0 ? (
        <div className="space-y-2.5">
          {state.history.map((turn, i) =>
            turn.role === 'student' ? (
              <div key={i} className="text-sm font-medium text-muted-foreground">
                {t('assistantYouLabel')}: {studentTurnLabelUi(t, turn)}
              </div>
            ) : (
              <div key={i} className="space-y-2 rounded-xl border bg-accent/30 p-4 text-sm leading-relaxed">
                {splitAssistantAnswer(turn.text).map((paragraph, j) => (
                  <MathText key={j} text={paragraph} />
                ))}
              </div>
            )
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {availableModes.map((mode) => (
          <Button
            key={mode}
            type="button"
            variant="outline"
            size="sm"
            disabled={blocked}
            onClick={() => onAsk(mode)}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t(ASSISTANT_MODE_KEY[mode])}
          </Button>
        ))}
        {remaining != null && !dailyLimitReached ? (
          <span className="text-xs text-muted-foreground">
            {t('assistantRemaining', { remaining, limit: AI_DAILY_LIMIT })}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={askInput}
          maxLength={ASSISTANT_MAX_QUESTION_LENGTH}
          disabled={blocked}
          placeholder={t('assistantAskPlaceholder')}
          onChange={(e) => onAskInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSubmitAsk();
            }
          }}
          className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25 disabled:opacity-60"
        />
        <Button type="button" size="sm" disabled={blocked || askInput.trim().length === 0} onClick={onSubmitAsk}>
          {t('assistantAskSubmit')}
        </Button>
      </div>

      {dailyLimitReached ? <p className="text-xs text-muted-foreground">{t('assistantLimitReached')}</p> : null}
      {!dailyLimitReached && globalLimitReached ? (
        <p className="text-xs text-muted-foreground">{t('assistantGlobalLimit')}</p>
      ) : null}
      {!dailyLimitReached && !globalLimitReached && questionLimitReached ? (
        <p className="text-xs text-muted-foreground">{t('assistantQuestionLimitReached')}</p>
      ) : null}
      {invalidQuestion ? <p className="text-xs text-destructive">{t('assistantInvalidQuestion')}</p> : null}
      {state.loading ? <p className="text-xs text-muted-foreground">{t('assistantLoading')}</p> : null}
      {state.error ? <p className="text-xs text-destructive">{t('assistantError')}</p> : null}
    </div>
  );
}
