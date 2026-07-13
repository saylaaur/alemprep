'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Compass, Check, ArrowLeft, ArrowRight } from 'lucide-react';
import { completeOnboarding } from '@/lib/supabase/profile-actions';
import { EXAM_SECOND_SUBJECTS, EXAM_PAIR_MAX_SCORE, type ExamSecondSubject } from '@/lib/exam';
import { validateExamDate, clampTargetScore } from '@/lib/onboarding';
import { MIN_DAILY_GOAL, MAX_DAILY_GOAL, MIN_TARGET_SCORE, MAX_TARGET_SCORE } from '@/lib/settings';

type Step = 'subject' | 'examDate' | 'targetScore' | 'dailyGoal' | 'done';
const STEP_ORDER: Step[] = ['subject', 'examDate', 'targetScore', 'dailyGoal'];

export function OnboardingWizard() {
  const t = useTranslations('onboarding');
  const tSubjects = useTranslations('subjects');

  const [step, setStep] = useState<Step>('subject');
  const [second, setSecond] = useState<ExamSecondSubject>(EXAM_SECOND_SUBJECTS[0]);
  const [examDate, setExamDate] = useState('');
  const [targetScore, setTargetScore] = useState(70);
  const [dailyGoal, setDailyGoal] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const stepIndex = STEP_ORDER.indexOf(step);
  const dateError = examDate.length > 0 && !validateExamDate(examDate);

  const goNext = () => {
    setError(null);
    if (step === 'examDate' && !validateExamDate(examDate)) return;

    const next = STEP_ORDER[stepIndex + 1];
    if (next) {
      setStep(next);
      return;
    }

    // Последний шаг («дневная цель») — сохраняем и показываем «Готово».
    startSaving(async () => {
      const res = await completeOnboarding({ secondSubject: second, examDate, targetScore, dailyGoal });
      if (res.ok) {
        setStep('done');
      } else {
        setError(t('saveError'));
      }
    });
  };

  const goBack = () => {
    setError(null);
    const prev = STEP_ORDER[stepIndex - 1];
    if (prev) setStep(prev);
  };

  if (step === 'done') {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-success/10">
          <Check className="h-8 w-8 text-success" />
        </div>
        <h1 className="text-2xl font-semibold">{t('doneTitle')}</h1>
        <p className="mt-3 text-muted-foreground">{t('doneDesc')}</p>
        <div className="mt-8 flex flex-col gap-3">
          <Button asChild size="lg" className="shadow-primary">
            <Link href="/diagnostic">{t('startDiagnosticButton')}</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/dashboard">{t('laterButton')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10">
          <Compass className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('stepOf', { step: stepIndex + 1, total: STEP_ORDER.length })}
        </p>
      </div>

      {step === 'subject' && (
        <div>
          <h2 className="text-base font-semibold">{t('subjectStepTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('subjectStepDesc')}</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
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
      )}

      {step === 'examDate' && (
        <div>
          <h2 className="text-base font-semibold">{t('examDateStepTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('examDateStepDesc')}</p>
          <label className="mt-5 flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t('examDateLabel')}</span>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="h-11 w-full max-w-[220px] rounded-xl border bg-card px-3 text-sm focus:outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
            />
          </label>
          {dateError && (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {t('examDateError')}
            </p>
          )}
        </div>
      )}

      {step === 'targetScore' && (
        <div>
          <h2 className="text-base font-semibold">{t('targetScoreStepTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('targetScoreStepDesc', { max: EXAM_PAIR_MAX_SCORE })}
          </p>
          <label className="mt-5 flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t('targetScoreLabel')}</span>
            <input
              type="number"
              inputMode="numeric"
              min={MIN_TARGET_SCORE}
              max={MAX_TARGET_SCORE}
              value={targetScore}
              onChange={(e) => setTargetScore(clampTargetScore(Number(e.target.value)))}
              className="h-11 w-28 rounded-xl border bg-card px-3 text-base font-semibold tabular-nums focus:outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
            />
          </label>
        </div>
      )}

      {step === 'dailyGoal' && (
        <div>
          <h2 className="text-base font-semibold">{t('dailyGoalStepTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('dailyGoalStepDesc')}</p>
          <label className="mt-5 flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t('dailyGoalLabel')}</span>
            <input
              type="number"
              inputMode="numeric"
              min={MIN_DAILY_GOAL}
              max={MAX_DAILY_GOAL}
              value={dailyGoal}
              onChange={(e) =>
                setDailyGoal(Math.min(MAX_DAILY_GOAL, Math.max(MIN_DAILY_GOAL, Number(e.target.value))))
              }
              className="h-11 w-28 rounded-xl border bg-card px-3 text-base font-semibold tabular-nums focus:outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
            />
          </label>
        </div>
      )}

      {error && (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="mt-8 flex items-center gap-3">
        {stepIndex > 0 && (
          <Button variant="outline" onClick={goBack} disabled={saving}>
            <ArrowLeft className="h-4 w-4" />
            {t('back')}
          </Button>
        )}
        <Button
          className="flex-1"
          onClick={goNext}
          disabled={saving || (step === 'examDate' && (!examDate || dateError))}
        >
          {saving ? t('loading') : stepIndex === STEP_ORDER.length - 1 ? t('finish') : t('next')}
          {!saving && <ArrowRight className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
