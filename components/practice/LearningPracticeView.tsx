'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
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

  const changeAnswer = (value: Answer) => {
    if (busy.current || phase !== 'active' || !pending.current || pending.current.submit) return;
    const updated = updateDraft(pending.current, value);
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(updated));
      pending.current = updated; setAnswer(value);
    } catch { setFault('storage-unavailable'); setPhase('error'); }
  };
  const item = session?.items[0];
  const reviewed = review?.items[0];
  const correct = reviewed?.gradingBody.correct;
  const correctText = typeof correct === 'string' ? correct : Array.isArray(correct) ? correct.join(', ') : correct ? Object.entries(correct).map(([key, value]) => `${key}: ${value}`).join('; ') : '';

  return <section className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-8">
    <h1 className="text-2xl font-semibold tracking-tight">{topicName}</h1>
    {item && <div className="space-y-5 rounded-2xl border bg-card p-5 sm:p-7">
      {item.question.context && <ContentBlocks blocks={item.question.context.blocks} />}
      <QuestionStem body={item.question.body} />
      <fieldset disabled={phase !== 'active'} className="min-w-0">
        <QuestionAnswerInput question={item.question} answer={phase === 'review' && reviewed ? reviewed.answer : answer} onChange={changeAnswer}
          labels={{ matchingPlaceholder: inputLabels('matchingPlaceholder'), matchingSelectFor: (value) => t('matchingSelectFor', { item: value }), multiGroup: t('multiGroup') }} />
      </fieldset>
    </div>}
    {phase === 'active' && item && <div className="flex flex-wrap gap-3">
      <Button disabled={!hasCompleteAnswer(item.question, answer)} onClick={() => void run.current('submit')}>{t('submit')}</Button>
      <Button variant="outline" onClick={() => void run.current('skip')}>{t('skip')}</Button>
      {GRAPH_TOOL_TOPICS.has(topicSlug) && <Button variant="outline" aria-expanded={graphFor === item.id} onClick={() => setGraphFor(graphFor === item.id ? null : item.id)}>{graphText(graphFor === item.id ? 'closeTool' : 'openTool')}</Button>}
    </div>}
    {phase === 'active' && item && graphFor === item.id && <div className="rounded-2xl border bg-card p-4 sm:p-5">
      <GraphTool key={item.id} idPrefix={`graph-${item.id}`} hint={graphText('practiceHint')} />
    </div>}
    {['loading', 'submitting', 'review-loading'].includes(phase) && <SaveStatus>{t(phase === 'loading' ? 'loading' : phase === 'submitting' ? 'saving' : 'loadingReview')}</SaveStatus>}
    {phase === 'unknown' && <div className="space-y-3"><SaveStatus>{t('unknown')}</SaveStatus><Button onClick={() => void run.current('resume')}>{t('retry')}</Button></div>}
    {phase === 'error' && fault && <div className="space-y-3">
      <SaveStatus>{t(`errors.${fault}`)}</SaveStatus>
      {!['unauthenticated', 'forbidden', 'storage-unavailable'].includes(fault) && <Button onClick={() => void run.current(terminal.includes(fault) ? 'next' : 'resume')}>{t(terminal.includes(fault) ? 'newTask' : 'retry')}</Button>}
    </div>}
    {phase === 'review' && review && reviewed && <div className="space-y-4 rounded-2xl border bg-card p-5">
      <SaveStatus>{t('saved')}</SaveStatus>
      <p data-testid="learning-score" className="text-2xl font-semibold">{reviewed.points} / {reviewed.maxPoints}</p>
      <p>{t('correctAnswer')} <MathText text={correctText} /></p>
      {reviewed.explanation && <ContentBlocks blocks={reviewed.explanation.blocks} />}
      {item && <TaskGraph key={item.id} stem={item.question.body.stem} stemBlocks={item.question.body.stem_blocks} />}
      <Button onClick={() => void run.current('next')}>{t('next')}</Button>
    </div>}
  </section>;
}
