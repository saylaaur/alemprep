import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { Link } from '@/i18n/routing';
import { Flame, Target, Zap, TriangleAlert, Sparkles } from 'lucide-react';
import {
  getProfile,
  getGamification,
  getSubjectsWithCounts,
  displayName,
  subjectName,
} from '@/lib/supabase/queries';
import { ACHIEVEMENT_KEYS } from '@/lib/gamification';
import { getSubjectIcon } from '@/lib/icons';
import { ProgressRing } from '@/components/gamification/ProgressRing';
import { MasteryBar, type MasteryTone } from '@/components/gamification/MasteryBar';
import { ACHIEVEMENT_META } from '@/components/gamification/achievement-meta';
import type { Locale } from '@/types/db';

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** Тон полосы слабой темы по точности. */
function weakTone(accuracy: number): MasteryTone {
  if (accuracy < 0.4) return 'destructive';
  if (accuracy < 0.7) return 'warning';
  return 'primary';
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const profile = await getProfile();
  const userId = profile?.id;

  const [t, tSubjects, tAch, g, subjects] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('subjects'),
    getTranslations('achievements'),
    userId ? getGamification(userId) : Promise.resolve(null),
    getSubjectsWithCounts(),
  ]);

  const name = displayName(profile) ?? t('defaultName');

  // --- Derived gamification state (safe defaults for a brand-new user) ---
  const dailyTotal = profile?.daily_goal ?? 20;
  const solvedToday = g?.solvedToday ?? 0;
  const goalPct = dailyTotal > 0 ? solvedToday / dailyTotal : 0;
  const goalReached = solvedToday >= dailyTotal && dailyTotal > 0;

  const level = g?.level ?? 1;
  const xp = g?.xp ?? 0;
  const percentToNext = g?.percentToNext ?? 0;
  const xpToNext = g?.xpToNext ?? 0;

  const currentStreak = g?.currentStreak ?? 0;
  const longestStreak = g?.longestStreak ?? 0;
  const litFlames = Math.min(currentStreak, 7);

  // Mastery aggregated per subject.
  const masteryBySubject = new Map<string, { correct: number; total: number }>();
  for (const tm of g?.topicMastery ?? []) {
    const cur = masteryBySubject.get(tm.subjectId) ?? { correct: 0, total: 0 };
    masteryBySubject.set(tm.subjectId, {
      correct: cur.correct + tm.correct,
      total: cur.total + tm.total,
    });
  }

  // Weak topics — lowest accuracy with at least a few attempts.
  const weak = [...(g?.topicMastery ?? [])]
    .filter((tm) => tm.total >= 3)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3);

  const earnedCount = g?.earned.length ?? 0;
  const totalBadges = ACHIEVEMENT_KEYS.length;
  const upcoming = g?.upcoming ?? [];

  const streakChip =
    currentStreak > 0 ? (
      <div className="inline-flex items-center gap-2 rounded-xl border border-streak/30 bg-streak/10 px-3.5 py-2">
        <Flame className="h-4 w-4 fill-streak text-streak" />
        <span className="flex items-baseline gap-1.5">
          <span className="font-mono text-lg font-bold tabular-nums text-streak">
            {currentStreak}
          </span>
          <span className="text-xs font-medium text-streak/90">
            {t('streakWord', { count: currentStreak })}
          </span>
        </span>
      </div>
    ) : undefined;

  return (
    <>
      <PageHeader
        title={t('greeting', { name })}
        subtitle={t('subtitle')}
        action={streakChip}
      />

      <div className="space-y-8 p-4 sm:p-6 lg:p-8">
        {/* ── Top row: daily goal · streak · XP/level ── */}
        <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
          {/* Daily goal ring */}
          <Card>
            <CardContent className="flex items-center gap-6 p-6">
              <ProgressRing value={goalPct} size={104} strokeWidth={8} glow>
                <span className="font-mono text-xl font-bold tabular-nums">
                  {Math.round(goalPct * 100)}%
                </span>
              </ProgressRing>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Target className="h-4 w-4 text-primary" />
                  {t('dailyGoal')}
                </div>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="font-mono text-3xl font-bold tabular-nums">
                    {solvedToday}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    / {dailyTotal} {t('goalUnit')}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {goalReached ? t('goalReached') : t('keepGoing')}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Streak week */}
          <Card>
            <CardContent className="flex h-full flex-col justify-between p-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  {t('streak')}
                </span>
                <Flame className="h-[18px] w-[18px] fill-streak text-streak" />
              </div>
              <div className="mt-3 flex items-end justify-between gap-1.5">
                {WEEKDAY_KEYS.map((day, i) => {
                  const active = i < litFlames;
                  return (
                    <div key={day} className="flex flex-col items-center gap-1.5">
                      <div
                        className={
                          active
                            ? 'grid h-7 w-7 place-items-center rounded-lg bg-streak/15'
                            : 'grid h-7 w-7 place-items-center rounded-lg bg-muted'
                        }
                      >
                        <Flame
                          className={
                            active
                              ? 'h-[15px] w-[15px] fill-streak text-streak'
                              : 'h-[13px] w-[13px] text-muted-foreground/50'
                          }
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {t(`weekday.${day}`)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {currentStreak > 0
                  ? t('streakRecord', { count: longestStreak })
                  : t('streakStart')}
              </p>
            </CardContent>
          </Card>

          {/* XP / level */}
          <Card>
            <CardContent className="flex h-full flex-col justify-between p-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  {t('level', { level })}
                </span>
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/12 text-primary">
                  <Zap className="h-[18px] w-[18px]" />
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-3xl font-bold tabular-nums text-primary">
                    {xp}
                  </span>
                  <span className="text-sm text-muted-foreground">XP</span>
                </div>
                <MasteryBar value={percentToNext} className="mt-3" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('xpToNext', { xp: xpToNext, level: level + 1 })}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ── Subjects with mastery ── */}
        <section>
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t('activeSubjects')}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.map((s) => {
              const Icon = getSubjectIcon(s.icon);
              const ready = s.is_active && s.question_count > 0;
              const m = masteryBySubject.get(s.id);
              const masteryVal = m && m.total > 0 ? m.correct / m.total : 0;

              const inner = (
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div
                      className={
                        ready
                          ? 'grid h-11 w-11 place-items-center rounded-xl bg-primary/12 text-primary'
                          : 'grid h-11 w-11 place-items-center rounded-xl bg-muted text-muted-foreground'
                      }
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    {ready ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-2.5 py-0.5 text-xs font-medium text-primary">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        {t('continue')}
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                        {tSubjects('comingSoon')}
                      </span>
                    )}
                  </div>

                  <h3 className="mt-4 text-base font-semibold">
                    {subjectName(s, locale as Locale)}
                  </h3>

                  {ready ? (
                    <>
                      <MasteryBar
                        label={t('mastery')}
                        value={masteryVal}
                        className="mt-3"
                      />
                      <p className="mt-2.5 text-xs text-muted-foreground">
                        {tSubjects('topicsCount', { count: s.topic_count })} ·{' '}
                        {tSubjects('questionsCount', { count: s.question_count })}
                      </p>
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      {tSubjects('comingSoon')}
                    </p>
                  )}
                </CardContent>
              );

              return ready ? (
                <Card
                  key={s.id}
                  className="group border-primary/25 transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                >
                  <Link
                    href={{ pathname: '/subjects/[subject]', params: { subject: s.slug } }}
                    className="block rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
                  >
                    {inner}
                  </Link>
                </Card>
              ) : (
                <Card key={s.id} className="opacity-70">
                  {inner}
                </Card>
              );
            })}
          </div>
        </section>

        {/* ── Weak topics · upcoming badges ── */}
        <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          {/* Weak topics */}
          <Card>
            <CardContent className="p-6">
              <div className="mb-5 flex items-center gap-2 text-sm font-semibold">
                <TriangleAlert className="h-4 w-4 text-destructive" />
                {t('weakTopics')}
              </div>
              {weak.length > 0 ? (
                <div className="flex flex-col gap-4">
                  {weak.map((tm) => (
                    <MasteryBar
                      key={tm.topicId}
                      label={locale === 'kk' ? tm.nameKk : tm.nameRu}
                      value={tm.accuracy}
                      tone={weakTone(tm.accuracy)}
                    />
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t('weakTopicsEmpty')}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Upcoming badges */}
          <Card>
            <CardContent className="p-6">
              <div className="mb-5 flex items-center justify-between">
                <span className="text-sm font-semibold">{t('upcomingBadges')}</span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {earnedCount} / {totalBadges}
                </span>
              </div>
              {upcoming.length > 0 ? (
                <div className="flex flex-col gap-4">
                  {upcoming.map((u, i) => {
                    const Icon = ACHIEVEMENT_META[u.key].icon;
                    const gold = i === 0;
                    return (
                      <div key={u.key} className="flex items-center gap-3">
                        <div
                          className={
                            gold
                              ? 'grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-badge-gold/15 text-badge-gold ring-1 ring-inset ring-badge-gold/35'
                              : 'grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary'
                          }
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <MasteryBar
                          className="min-w-0 flex-1"
                          label={tAch(`${u.key}.title`)}
                          value={u.progress}
                          valueLabel={`${u.current}/${u.target}`}
                          tone={gold ? 'gold' : 'primary'}
                          thickness="sm"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <Sparkles className="h-6 w-6 text-badge-gold" />
                  <p className="text-sm text-muted-foreground">
                    {t('badgesAllClose')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </>
  );
}
