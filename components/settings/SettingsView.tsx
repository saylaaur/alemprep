'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/supabase/auth-actions';
import { clearAllSavedExams } from '@/lib/exam-storage';
import { updateProfileSettings } from '@/lib/supabase/profile-actions';
import { MIN_DAILY_GOAL, MAX_DAILY_GOAL, MIN_TARGET_SCORE, MAX_TARGET_SCORE } from '@/lib/settings';
import { EXAM_SECOND_SUBJECTS, type ExamSecondSubject } from '@/lib/exam';
import type { Locale } from '@/types/db';
import { Monitor, Moon, Sun, Languages, Target, User, LogOut, Check, CalendarClock } from 'lucide-react';

type Props = {
  locale: Locale;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  dailyGoal: number;
  secondSubject: ExamSecondSubject;
  examDate: string | null;
  targetScore: number;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function SettingsView({
  locale,
  displayName,
  email,
  avatarUrl,
  dailyGoal,
  secondSubject,
  examDate: initialExamDate,
  targetScore: initialTargetScore,
}: Props) {
  const t = useTranslations('settings');
  const tSubjects = useTranslations('subjects');
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [pendingLocale, startLocaleTransition] = useTransition();
  const changeLocale = (next: Locale) => {
    if (next === locale) return;
    startLocaleTransition(async () => {
      await updateProfileSettings({ locale: next });
      // Меняем и URL-префикс (/ru ↔ /kk), и сохранённый в профиле язык.
      // SettingsView живёт только на /settings, поэтому маршрут статичен.
      router.replace('/settings', { locale: next });
    });
  };

  const [goal, setGoal] = useState(dailyGoal);
  const [goalState, setGoalState] = useState<SaveState>('idle');
  const [savingGoal, startGoalTransition] = useTransition();
  const goalDirty = goal !== dailyGoal;

  const saveGoal = () => {
    const clamped = Math.min(MAX_DAILY_GOAL, Math.max(MIN_DAILY_GOAL, Math.round(goal)));
    setGoal(clamped);
    setGoalState('saving');
    startGoalTransition(async () => {
      const res = await updateProfileSettings({ dailyGoal: clamped });
      if (res.ok) {
        setGoalState('saved');
        router.refresh();
      } else {
        setGoalState('error');
      }
    });
  };

  const [second, setSecond] = useState<ExamSecondSubject>(secondSubject);
  const [examDate, setExamDate] = useState(initialExamDate ?? '');
  const [targetScore, setTargetScore] = useState(initialTargetScore);
  const [examState, setExamState] = useState<SaveState>('idle');
  const [savingExam, startExamTransition] = useTransition();
  const examDirty =
    second !== secondSubject ||
    examDate !== (initialExamDate ?? '') ||
    targetScore !== initialTargetScore;

  const saveExam = () => {
    setExamState('saving');
    startExamTransition(async () => {
      const res = await updateProfileSettings({ secondSubject: second, examDate, targetScore });
      if (res.ok) {
        setExamState('saved');
        router.refresh();
      } else {
        setExamState('error');
      }
    });
  };

  const initial = (displayName[0] ?? '?').toUpperCase();

  const themeOptions = [
    { value: 'light', label: t('themeLight'), icon: Sun },
    { value: 'dark', label: t('themeDark'), icon: Moon },
    { value: 'system', label: t('themeSystem'), icon: Monitor },
  ] as const;

  const localeOptions: { value: Locale; label: string }[] = [
    { value: 'ru', label: t('languageRu') },
    { value: 'kk', label: t('languageKk') },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* ── Профиль ─────────────────────────────────────────────── */}
      <SettingsSection icon={User} title={t('profileTitle')} description={t('profileDesc')}>
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-14 w-14 rounded-full ring-2 ring-border" />
          ) : (
            <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-lg font-semibold text-primary ring-2 ring-primary/15">
              {initial}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-base font-semibold">{displayName}</div>
            {email && <div className="truncate text-sm text-muted-foreground">{email}</div>}
          </div>
        </div>
        {/* Прогресс пробника в localStorage — чистим при выходе, чтобы он
            не достался следующему аккаунту на этом устройстве. */}
        <form action={signOut} onSubmit={() => clearAllSavedExams()} className="mt-5">
          <Button type="submit" variant="outline" className="w-full sm:w-auto">
            <LogOut className="h-4 w-4" />
            {t('signOut')}
          </Button>
        </form>
      </SettingsSection>

      {/* ── Оформление (тема) ───────────────────────────────────── */}
      <SettingsSection icon={Sun} title={t('appearanceTitle')} description={t('appearanceDesc')}>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('appearanceTitle')}>
          {themeOptions.map((opt) => {
            const Icon = opt.icon;
            const active = mounted && theme === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(opt.value)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm font-medium transition-all duration-150 focus-visible:ring-4 focus-visible:ring-ring/25',
                  active
                    ? 'border-primary bg-primary/8 text-foreground ring-1 ring-primary/30'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:bg-accent'
                )}
              >
                <Icon className="h-5 w-5" />
                {opt.label}
              </button>
            );
          })}
        </div>
      </SettingsSection>

      {/* ── Язык ────────────────────────────────────────────────── */}
      <SettingsSection icon={Languages} title={t('languageTitle')} description={t('languageDesc')}>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('languageTitle')}>
          {localeOptions.map((opt) => {
            const active = locale === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={pendingLocale}
                onClick={() => changeLocale(opt.value)}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl border px-4 py-3.5 text-sm font-medium transition-all duration-150 focus-visible:ring-4 focus-visible:ring-ring/25 disabled:opacity-60',
                  active
                    ? 'border-primary bg-primary/8 text-foreground ring-1 ring-primary/30'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:bg-accent'
                )}
              >
                {active && <Check className="h-4 w-4 text-primary" />}
                {opt.label}
              </button>
            );
          })}
        </div>
      </SettingsSection>

      {/* ── Дневная цель ────────────────────────────────────────── */}
      <SettingsSection icon={Target} title={t('goalTitle')} description={t('goalDesc')}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t('goalUnit')}</span>
            <input
              type="number"
              inputMode="numeric"
              min={MIN_DAILY_GOAL}
              max={MAX_DAILY_GOAL}
              value={goal}
              onChange={(e) => {
                setGoal(Number(e.target.value));
                setGoalState('idle');
              }}
              className="h-11 w-28 rounded-xl border bg-card px-3 text-base font-semibold tabular-nums focus:outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
            />
          </label>
          <Button onClick={saveGoal} disabled={savingGoal || !goalDirty}>
            {goalState === 'saving' ? t('saving') : t('save')}
          </Button>
          {goalState === 'saved' && !goalDirty && (
            <span className="flex items-center gap-1.5 text-sm text-success">
              <Check className="h-4 w-4" />
              {t('saved')}
            </span>
          )}
          {goalState === 'error' && (
            <span className="text-sm text-destructive" role="alert">
              {t('saveError')}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t('goalHint', { min: MIN_DAILY_GOAL, max: MAX_DAILY_GOAL })}
        </p>
      </SettingsSection>

      {/* ── Экзамен ─────────────────────────────────────────────── */}
      <SettingsSection icon={CalendarClock} title={t('examTitle')} description={t('examDesc')}>
        <div className="space-y-4">
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('examPairLabel')}</span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('examPairLabel')}>
              {EXAM_SECOND_SUBJECTS.map((slug) => {
                const active = second === slug;
                return (
                  <button
                    key={slug}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => { setSecond(slug); setExamState('idle'); }}
                    className={cn(
                      'rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-150 focus-visible:ring-4 focus-visible:ring-ring/25',
                      active
                        ? 'border-primary bg-primary/8 text-foreground ring-1 ring-primary/30'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:bg-accent'
                    )}
                  >
                    {tSubjects('math')} + {tSubjects(slug)}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t('examDateLabel')}</span>
            <input
              type="date"
              value={examDate}
              onChange={(e) => { setExamDate(e.target.value); setExamState('idle'); }}
              className="h-11 w-full max-w-[220px] rounded-xl border bg-card px-3 text-sm focus:outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t('targetScoreLabel')}</span>
            <input
              type="number"
              inputMode="numeric"
              min={MIN_TARGET_SCORE}
              max={MAX_TARGET_SCORE}
              value={targetScore}
              onChange={(e) => { setTargetScore(Number(e.target.value)); setExamState('idle'); }}
              className="h-11 w-28 rounded-xl border bg-card px-3 text-base font-semibold tabular-nums focus:outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
            />
            <span className="text-xs text-muted-foreground">
              {t('targetScoreHint', { min: MIN_TARGET_SCORE, max: MAX_TARGET_SCORE })}
            </span>
          </label>

          <div className="flex items-center gap-3">
            <Button onClick={saveExam} disabled={savingExam || !examDirty}>
              {examState === 'saving' ? t('saving') : t('save')}
            </Button>
            {examState === 'saved' && !examDirty && (
              <span className="flex items-center gap-1.5 text-sm text-success">
                <Check className="h-4 w-4" />
                {t('saved')}
              </span>
            )}
            {examState === 'error' && (
              <span className="text-sm text-destructive" role="alert">
                {t('saveError')}
              </span>
            )}
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-5 flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
