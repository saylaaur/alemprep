'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Check,
  ArrowRight,
  GraduationCap,
  Atom,
  Code2,
  Sparkles,
  Clock,
  Zap,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { completeOnboarding } from '@/lib/supabase/profile-actions';
import { EXAM_SECOND_SUBJECTS, EXAM_PAIR_MAX_SCORE, type ExamSecondSubject } from '@/lib/exam';
import { validateExamDate, clampTargetScore } from '@/lib/onboarding';
import { MIN_DAILY_GOAL, MAX_DAILY_GOAL, MIN_TARGET_SCORE, MAX_TARGET_SCORE } from '@/lib/settings';
import { daysUntilExam } from '@/lib/plan';
import { CalendarPicker } from './CalendarPicker';

type Step = 'subject' | 'examDate' | 'targetScore' | 'dailyGoal' | 'done';
const STEP_ORDER: Step[] = ['subject', 'examDate', 'targetScore', 'dailyGoal'];

const SUBJECT_ICONS: Record<ExamSecondSubject, LucideIcon> = {
  physics: Atom,
  informatics: Code2,
};

const DAILY_GOAL_PRESETS: { key: string; labelKey: string; value: number }[] = [
  { key: 'light', labelKey: 'dailyGoalPresetLight', value: 10 },
  { key: 'recommended', labelKey: 'dailyGoalPresetRecommended', value: 20 },
  { key: 'intensive', labelKey: 'dailyGoalPresetIntensive', value: 35 },
];

function targetScoreHintKey(targetScore: number): string {
  const ratio = targetScore / MAX_TARGET_SCORE;
  if (ratio < 0.4) return 'targetScoreHintLow';
  if (ratio < 0.7) return 'targetScoreHintMid';
  if (ratio < 0.9) return 'targetScoreHintHigh';
  return 'targetScoreHintTop';
}

export function OnboardingWizard() {
  const t = useTranslations('onboarding');
  const tSubjects = useTranslations('subjects');
  const tBrand = useTranslations('brand');

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
    const SubjectIcon = SUBJECT_ICONS[second];
    const summaryItems: { icon: LucideIcon; label: string }[] = [
      { icon: SubjectIcon, label: `${tSubjects('math')} + ${tSubjects(second)}` },
      {
        icon: Clock,
        label: t('doneSummaryExam', { days: Math.max(0, daysUntilExam(examDate)), date: examDate }),
      },
      { icon: Zap, label: t('doneSummaryTarget', { target: targetScore, max: MAX_TARGET_SCORE }) },
      { icon: Target, label: t('doneSummaryDaily', { count: dailyGoal }) },
    ];

    return (
      <div className="mx-auto max-w-md px-6 py-16">
        <div className="overflow-hidden rounded-2xl border bg-gradient-to-b from-primary/15 via-card to-card p-8 text-center shadow-lg">
          <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-primary shadow-primary">
            <Check className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-semibold">{t('doneTitle')}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{t('doneDesc')}</p>

          <div className="mt-8 flex flex-col gap-2.5 text-left">
            {summaryItems.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border bg-card/50 px-3.5 py-2.5 text-sm"
              >
                <item.icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 truncate">{item.label}</span>
              </div>
            ))}
          </div>

          <Button asChild size="lg" className="mt-8 w-full shadow-primary">
            <Link href="/diagnostic">
              {t('startDiagnosticButton')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        <div className="mt-4 text-center">
          <Link
            href="/dashboard"
            className="rounded text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
          >
            {t('laterButton')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <div className="mb-8 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-foreground">
          <GraduationCap className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold">{tBrand('name')}</span>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <div className="mt-4 flex items-center gap-3">
          <div className="flex flex-1 gap-1.5" role="progressbar" aria-valuenow={stepIndex + 1} aria-valuemin={1} aria-valuemax={STEP_ORDER.length}>
            {STEP_ORDER.map((s, i) => (
              <span
                key={s}
                className={cn('h-1.5 flex-1 rounded-full transition-colors', i === stepIndex ? 'bg-primary' : 'bg-muted')}
              />
            ))}
          </div>
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {t('stepOf', { step: stepIndex + 1, total: STEP_ORDER.length })}
          </span>
        </div>
      </div>

      {step === 'subject' && (
        <div>
          <h2 className="text-base font-semibold">{t('subjectStepTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('subjectStepDesc')}</p>
          <div className="mt-5 flex flex-col gap-2.5">
            {EXAM_SECOND_SUBJECTS.map((slug) => {
              const selected = second === slug;
              const Icon = SUBJECT_ICONS[slug];
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => setSecond(slug)}
                  aria-pressed={selected}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25',
                    selected
                      ? 'border-primary bg-primary/8 ring-1 ring-primary/30'
                      : 'border-border bg-card hover:border-primary/30 hover:bg-accent'
                  )}
                >
                  <div
                    className={cn(
                      'grid h-10 w-10 shrink-0 place-items-center rounded-lg',
                      selected ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">
                      {tSubjects('math')} + {tSubjects(slug)}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {t(`subjectStepHint.${slug}`)}
                    </div>
                  </div>
                  {selected && (
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>
              );
            })}
            <div className="flex items-center gap-3 rounded-xl border border-dashed px-4 py-3.5 opacity-60">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-muted-foreground">
                  {t('subjectComingSoonTitle')}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{t('subjectComingSoonDesc')}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 'examDate' && (
        <div>
          <h2 className="text-base font-semibold">{t('examDateStepTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('examDateStepDesc')}</p>
          <div className="mt-5">
            <CalendarPicker value={examDate} onChange={setExamDate} />
          </div>
          {examDate && !dateError && (
            <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-primary/25 bg-primary/8 px-4 py-3">
              <Clock className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              <p className="text-sm">{t('examDateCountdown', { days: daysUntilExam(examDate) })}</p>
            </div>
          )}
          {dateError && (
            <p className="mt-3 text-sm text-destructive" role="alert">
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
          <div className="mt-6">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-4xl font-bold tabular-nums text-primary">{targetScore}</span>
              <span className="font-mono text-lg text-muted-foreground">/ {MAX_TARGET_SCORE}</span>
            </div>
            <input
              type="range"
              min={MIN_TARGET_SCORE}
              max={MAX_TARGET_SCORE}
              value={targetScore}
              onChange={(e) => setTargetScore(clampTargetScore(Number(e.target.value)))}
              className="range-emerald mt-5 h-5 w-full"
              aria-label={t('targetScoreLabel')}
            />
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>{MIN_TARGET_SCORE}</span>
              <span>{MAX_TARGET_SCORE}</span>
            </div>
          </div>
          <div className="mt-5 flex items-start gap-2.5 rounded-xl border bg-muted/50 px-4 py-3">
            <Zap className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            <p className="text-sm text-muted-foreground">{t(targetScoreHintKey(targetScore))}</p>
          </div>
        </div>
      )}

      {step === 'dailyGoal' && (
        <div>
          <h2 className="text-base font-semibold">{t('dailyGoalStepTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('dailyGoalStepDesc')}</p>

          <div className="mt-6 flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={() => setDailyGoal((v) => Math.max(MIN_DAILY_GOAL, v - 1))}
              aria-label={t('decreaseDailyGoal')}
              className="grid h-11 w-11 place-items-center rounded-xl border text-lg font-semibold transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
            >
              −
            </button>
            <div className="text-center">
              <span className="font-mono text-4xl font-bold tabular-nums">{dailyGoal}</span>
              <p className="mt-1 text-xs text-muted-foreground">{t('dailyGoalUnit')}</p>
            </div>
            <button
              type="button"
              onClick={() => setDailyGoal((v) => Math.min(MAX_DAILY_GOAL, v + 1))}
              aria-label={t('increaseDailyGoal')}
              className="grid h-11 w-11 place-items-center rounded-xl border text-lg font-semibold transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
            >
              +
            </button>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {DAILY_GOAL_PRESETS.map((preset) => {
              const selected = dailyGoal === preset.value;
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => setDailyGoal(preset.value)}
                  aria-pressed={selected}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-center text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25',
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border hover:bg-accent'
                  )}
                >
                  {t(preset.labelKey)} · {preset.value}
                </button>
              );
            })}
          </div>

          {examDate && !dateError && (
            <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/8 px-4 py-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <p className="text-sm text-muted-foreground">
                {t('dailyGoalProjection', {
                  days: Math.max(0, daysUntilExam(examDate)),
                  total: dailyGoal * Math.max(0, daysUntilExam(examDate)),
                  target: targetScore,
                })}
              </p>
            </div>
          )}
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
