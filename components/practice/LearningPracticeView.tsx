'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { startTopicLearning, readLearningState, submitTopicLearning, readLearningReview } from '@/lib/supabase/learning-actions';
import { PENDING_KEY, createPending, restorePending, bindSession, freezeSubmit, updateDraft, hasCompleteAnswer, type PendingLearning } from '@/lib/learning/pending';
import type { Answer, LearningError, LearningReview, Locale, Result, StartedSession } from '@/lib/learning/contracts';
import { QuestionAnswerInput } from './QuestionAnswerInput';
import { QuestionStem } from '@/components/content/QuestionStem';
import { ContentBlocks } from '@/components/content/ContentBlocks';
import { MathText } from '@/components/math/MathText';
import { Button } from '@/components/ui/button';
import { SaveStatus } from './SaveStatus';
import { GraphTool } from '@/components/graph/GraphTool';
import { TaskGraph } from '@/components/graph/TaskGraph';
import { GRAPH_TOOL_TOPICS } from '@/lib/graph/topics';

type Phase = 'loading' | 'active' | 'submitting' | 'unknown' | 'review-loading' | 'review' | 'error';
type Fault = LearningError | 'storage-unavailable';
const terminal: Fault[] = ['unauthenticated', 'forbidden', 'invalid-input', 'not-found', 'expired', 'operation-conflict'];

export function LearningPracticeView({ owner, locale, topicSlug, topicName }: {
  owner: string; locale: Locale; topicSlug: string; topicName: string;
}) {
  const t = useTranslations('trustedPractice');
  const inputLabels = useTranslations('practice');
  const graphText = useTranslations('graph');
  const [graphFor, setGraphFor] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [fault, setFault] = useState<Fault | null>(null);
  const [session, setSession] = useState<StartedSession | null>(null);
  const [answer, setAnswer] = useState<Answer>(null);
  const [review, setReview] = useState<LearningReview | null>(null);
  const pending = useRef<PendingLearning | null>(null);
  const questionSection = useRef<HTMLElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const focusTarget = useRef<'question' | 'review' | null>(null);
  const busy = useRef(false);
  const reviewReadInProgress = useRef(false);
  const generation = useRef(0);
  const run = useRef<(intent: 'resume' | 'submit' | 'skip' | 'next') => Promise<void>>(async () => {});

  useEffect(() => {
    const auth = createClient();
    let mounted = true;
    let epoch = ++generation.current;
    busy.current = false;
    const live = () => mounted && epoch === generation.current;
    const scope = { owner, locale, topicSlug };
    const clear = () => {
      pending.current = null;
      try { sessionStorage.removeItem(PENDING_KEY); } catch { /* already unavailable */ }
    };
    const invalidate = () => {
      generation.current++;
      focusTarget.current = null;
      clear();
      setSession(null); setReview(null); setAnswer(null);
      setFault('unauthenticated'); setPhase('error');
    };
    const persist = (value: PendingLearning) => {
      try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(value)); }
      catch { throw new Error('storage-unavailable'); }
      pending.current = value;
    };
    const fail = (error: Fault) => {
      if (!live()) return;
      const reviewFailed = reviewReadInProgress.current;
      reviewReadInProgress.current = false;
      if (terminal.includes(error)) { clear(); setSession(null); setReview(null); setAnswer(null); }
      setFault(error);
      setPhase(reviewFailed ? 'error' : pending.current?.submit && !terminal.includes(error) ? 'unknown' : 'error');
    };
    const unwrap = <T,>(result: Result<T>): T => {
      if (!result.ok) throw new Error(result.error);
      return result.value;
    };
    const displaySession = (issued: StartedSession) => {
      if (issued.mode !== 'practice' || issued.items.length !== 1 || issued.items[0].question.locale !== locale || !pending.current) throw new Error('invalid-input');
      if (pending.current.sessionId && (pending.current.sessionId !== issued.id || pending.current.itemId !== issued.items[0].id)) throw new Error('invalid-input');
      persist(bindSession(pending.current, issued.id, issued.items[0].id, Date.now()));
      setSession(issued);
      setAnswer(pending.current!.submit?.answers[0].answer ?? pending.current!.answer);
    };
    const loadReview = async () => {
      reviewReadInProgress.current = true;
      setPhase('review-loading');
      const current = pending.current!;
      const value = unwrap(await readLearningReview(current.sessionId));
      if (!live()) return;
      if (value.receipt.sessionId !== current.sessionId || value.items.length !== 1 || value.items[0].itemId !== current.itemId) throw new Error('invalid-input');
      reviewReadInProgress.current = false;
      setReview(value); setPhase('review'); setFault(null);
    };
    const restore = async () => {
      if (!pending.current) persist(createPending(scope, crypto.randomUUID()));
      if (!pending.current!.sessionId) {
        const started = unwrap(await startTopicLearning(pending.current!.start));
        if (!live()) return;
        if (started.sessions.length !== 1) throw new Error('invalid-input');
        displaySession(started.sessions[0]);
      }
      const state = unwrap(await readLearningState(pending.current!.sessionId));
      if (!live()) return;
      if (state.status === 'expired' || state.status === 'cancelled') throw new Error('expired');
      if (state.status === 'submitted') {
        const started = unwrap(await startTopicLearning(pending.current!.start));
        if (!live()) return;
        if (started.sessions.length !== 1 || state.receipt.sessionId !== pending.current!.sessionId) throw new Error('invalid-input');
        displaySession(started.sessions[0]);
        await loadReview();
        return;
      }
      if (state.status !== 'active') throw new Error('expired');
      displaySession(state.session);
      if (pending.current!.submit) {
        setPhase('submitting');
        const submitted = await submitTopicLearning(pending.current!.submit);
        if (!live()) return;
        if (!submitted.ok && submitted.error === 'already-submitted') { await loadReview(); return; }
        const receipt = unwrap(submitted);
        if (receipt.sessionId !== pending.current!.sessionId) throw new Error('invalid-input');
        await loadReview();
      } else { setPhase('active'); setFault(null); }
    };
    run.current = async (intent) => {
      if (!live() || busy.current) return;
      busy.current = true;
      if (intent === 'submit' || intent === 'skip') setPhase('submitting');
      if (intent === 'next') setPhase('loading');
      try {
        reviewReadInProgress.current = false;
        // A server prop scopes local storage; Auth is rechecked on every delivery.
        const { data, error } = await auth.auth.getUser();
        if (!live()) return;
        if (error) throw new Error('temporarily-unavailable');
        if (data.user?.id !== owner) { invalidate(); return; }
        if (intent === 'next') {
          clear(); setSession(null); setReview(null); setAnswer(null);
        }
        if (!pending.current) {
          const raw = sessionStorage.getItem(PENDING_KEY);
          const saved = restorePending(raw, scope);
          if (saved) pending.current = saved;
          else { clear(); persist(createPending(scope, crypto.randomUUID())); }
        }
        if (intent === 'submit' || intent === 'skip') persist(freezeSubmit(pending.current!, crypto.randomUUID(), Date.now(), intent === 'skip'));
        setPhase(pending.current?.submit ? 'submitting' : 'loading'); setFault(null);
        await restore();
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const known: Fault[] = [...terminal, 'already-submitted', 'content-unavailable', 'rate-limited', 'temporarily-unavailable', 'storage-unavailable'];
        fail(known.includes(message as Fault) ? message as Fault : 'temporarily-unavailable');
      } finally { if (live()) busy.current = false; }
    };
    const { data: listener } = auth.auth.onAuthStateChange((event, value) => {
      if (mounted && (event === 'SIGNED_OUT' || (value && value.user.id !== owner))) invalidate();
    });
    window.addEventListener('alemprep:learning-clear', invalidate);
    void run.current('resume');
    return () => {
      mounted = false; epoch = -1;
      listener.subscription.unsubscribe();
      window.removeEventListener('alemprep:learning-clear', invalidate);
    };
  }, [owner, locale, topicSlug]);

  useEffect(() => {
    if (focusTarget.current === 'review' && phase === 'review') {
      reviewHeading.current?.focus();
      focusTarget.current = null;
    }
    if (focusTarget.current === 'question' && phase === 'active') {
      questionSection.current?.focus();
      focusTarget.current = null;
    }
  }, [phase]);

  const checkAnswer = (intent: 'submit' | 'skip') => {
    focusTarget.current = 'review';
    void run.current(intent);
  };
  const nextQuestion = () => {
    focusTarget.current = 'question';
    void run.current('next');
  };

  const changeAnswer = (value: Answer) => {
    if (busy.current || phase !== 'active' || !pending.current || pending.current.submit) return;
    const updated = updateDraft(pending.current, value);
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(updated));
      pending.current = updated; setAnswer(value);
    } catch { setFault('storage-unavailable'); setPhase('error'); }
  };
  const item = session?.items[0];
  const answerReady = item ? hasCompleteAnswer(item.question, answer) : false;
  const options = item && item.question.type !== 'matching' && 'options' in item.question.body
    ? item.question.body.options
    : null;
  const onPracticeKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    // Leave native Enter and number keys to links, other buttons, selects and graph controls.
    const questionHasOptionFocus = target instanceof HTMLElement
      && questionSection.current?.contains(target)
      && target.matches('[role="radio"], [role="checkbox"]');
    if (target !== document.body && target !== document.documentElement
      && target !== questionSection.current && target !== reviewHeading.current && !questionHasOptionFocus) return;

    if (event.key === 'Enter' && ((phase === 'active' && answerReady) || phase === 'review')) {
      event.preventDefault();
      if (event.repeat) return;
      if (phase === 'review') nextQuestion();
      else checkAnswer('submit');
      return;
    }

    if (phase !== 'active' || !options || !/^[1-9]$/.test(event.key)) return;
    const option = options[Number(event.key) - 1];
    if (!option) return;
    event.preventDefault();
    if (event.repeat) return;
    const draft = pending.current?.answer;
    const selected = Array.isArray(draft) ? draft : [];
    changeAnswer(item?.question.type === 'multi'
      ? selected.includes(option.id) ? selected.filter((id) => id !== option.id) : [...selected, option.id]
      : option.id);
  });

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => onPracticeKey(event);
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const reviewed = review?.items[0];
  const correct = reviewed?.gradingBody.correct;
  const correctText = typeof correct === 'string' ? correct : Array.isArray(correct) ? correct.join(', ') : correct ? Object.entries(correct).map(([key, value]) => `${key}: ${value}`).join('; ') : '';

  return <section className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-8">
    <h1 className="text-2xl font-semibold tracking-tight">{topicName}</h1>
    {item && <section ref={questionSection} tabIndex={-1} aria-label={t('questionTitle')}
      className="scroll-mt-20 space-y-5 rounded-2xl border bg-card p-5 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-7">
      {item.question.context && <ContentBlocks blocks={item.question.context.blocks} />}
      <QuestionStem body={item.question.body} />
      <fieldset disabled={phase !== 'active'} className="min-w-0">
        <QuestionAnswerInput question={item.question} answer={phase === 'review' && reviewed ? reviewed.answer : answer} onChange={changeAnswer}
          review={phase === 'review' && (typeof correct === 'string' || Array.isArray(correct))
            ? { correct, correctLabel: t('correctOption'), incorrectLabel: t('incorrectSelection') } : undefined}
          labels={{ matchingPlaceholder: inputLabels('matchingPlaceholder'), matchingSelectFor: (value) => t('matchingSelectFor', { item: value }), multiGroup: t('multiGroup') }} />
      </fieldset>
      {phase === 'active' && <div className="space-y-2 border-t pt-4">
        {!answerReady && <p className="text-sm text-muted-foreground">{t('answerRequired')}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button className="min-h-11 w-full sm:w-auto" disabled={!answerReady} aria-keyshortcuts="Enter" onClick={() => checkAnswer('submit')}>
            {t('submit')}
          </Button>
          <Button variant="ghost" onClick={() => checkAnswer('skip')}>{t('skip')}</Button>
          {GRAPH_TOOL_TOPICS.has(topicSlug) && (
            <Button variant="ghost" aria-expanded={graphFor === item.id} onClick={() => setGraphFor(graphFor === item.id ? null : item.id)}>
              {graphText(graphFor === item.id ? 'closeTool' : 'openTool')}
            </Button>
          )}
        </div>
        {options && options.length > 0 && (
          <p className="hidden text-xs text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:block">
            {t('keyboardHint', { last: Math.min(options.length, 9) })}
          </p>
        )}
      </div>}
    </section>}
    {phase === 'active' && item && graphFor === item.id && <div className="rounded-2xl border bg-card p-4 sm:p-5">
      <GraphTool key={item.id} idPrefix={`graph-${item.id}`} hint={graphText('practiceHint')} />
    </div>}
    {['loading', 'submitting', 'review-loading'].includes(phase) && <SaveStatus>{t(phase === 'loading' ? 'loading' : phase === 'submitting' ? 'saving' : 'loadingReview')}</SaveStatus>}
    {phase === 'unknown' && <div className="space-y-3"><SaveStatus>{t('unknown')}</SaveStatus><Button onClick={() => void run.current('resume')}>{t('retry')}</Button></div>}
    {phase === 'error' && fault && <div className="space-y-3">
      <SaveStatus>{t(`errors.${fault}`)}</SaveStatus>
      {!['unauthenticated', 'forbidden', 'storage-unavailable'].includes(fault) && <Button onClick={() => void run.current(terminal.includes(fault) ? 'next' : 'resume')}>{t(terminal.includes(fault) ? 'newTask' : 'retry')}</Button>}
    </div>}
    {phase === 'review' && review && reviewed && <section aria-labelledby="learning-review-title" className="space-y-4 rounded-2xl border bg-card p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="learning-review-title" ref={reviewHeading} tabIndex={-1} className="scroll-mt-20 text-xl font-semibold focus:outline-none">
            {t('reviewTitle')}
          </h2>
          <SaveStatus>{t('saved')}</SaveStatus>
        </div>
        <p data-testid="learning-score" className="text-xl font-semibold tabular-nums">{reviewed.points} / {reviewed.maxPoints}</p>
      </div>
      <p>{t('correctAnswer')} <MathText text={correctText} /></p>
      {reviewed.explanation && <ContentBlocks blocks={reviewed.explanation.blocks} />}
      {item && <TaskGraph key={item.id} stem={item.question.body.stem} stemBlocks={item.question.body.stem_blocks} />}
      <div className="border-t pt-4">
        <Button className="min-h-11 w-full sm:w-auto" aria-keyshortcuts="Enter" onClick={nextQuestion}>
          {t('next')}
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </section>}
  </section>;
}
