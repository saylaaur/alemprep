import { getTranslations } from 'next-intl/server';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { CalendarClock, Target, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProgressRing } from '@/components/gamification/ProgressRing';
import { MasteryBar } from '@/components/gamification/MasteryBar';
import { getDiagnosticBaseline, type TopicMasteryStat } from '@/lib/supabase/queries';
import { daysUntilExam, projectedPairScore, buildPriorityTopics } from '@/lib/plan';
import { EXAM_PAIR_MAX_SCORE } from '@/lib/exam';
import type { Locale, Profile } from '@/types/db';

type Props = {
  profile: Profile;
  topicMastery: TopicMasteryStat[];
  locale: Locale;
};

export async function PlanSection({ profile, topicMastery, locale }: Props) {
  const t = await getTranslations('plan');
  const baseline = await getDiagnosticBaseline(profile.id);

  if (!baseline) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10">
            <Compass className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-base font-semibold">{t('emptyTitle')}</h2>
          <p className="max-w-sm text-sm text-muted-foreground">{t('emptyDesc')}</p>
          <Button asChild className="mt-2">
            <Link href="/diagnostic">{t('startDiagnosticButton')}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const days = profile.exam_date ? daysUntilExam(profile.exam_date) : null;
  const projected = projectedPairScore(baseline.score);
  const target = profile.target_score ?? EXAM_PAIR_MAX_SCORE;
  const progressToTarget = target > 0 ? Math.min(1, projected / target) : 0;

  const currentByTopic = new Map(topicMastery.map((tm) => [tm.topicId, tm.accuracy]));
  const priority = buildPriorityTopics(baseline.topicStats).map((p) => ({
    ...p,
    current: currentByTopic.get(p.topicId) ?? null,
  }));

  return (
    <section>
      <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {t('title')}
      </h2>
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
        <Card>
          <CardContent className="flex h-full flex-col justify-between p-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">{t('examCountdown')}</span>
              <CalendarClock className="h-[18px] w-[18px] text-primary" />
            </div>
            <div className="mt-3">
              {days !== null ? (
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-3xl font-bold tabular-nums">{Math.max(0, days)}</span>
                  <span className="text-sm text-muted-foreground">{t('daysUnit', { count: Math.max(0, days) })}</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('noExamDate')}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-6 p-6">
            <ProgressRing value={progressToTarget} size={88} strokeWidth={7}>
              <span className="font-mono text-lg font-bold tabular-nums">{projected}</span>
            </ProgressRing>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Target className="h-4 w-4 text-primary" />
                {t('targetProgress')}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{t('targetHint', { projected, target })}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="mb-4 text-sm font-semibold">{t('priorityTopics')}</div>
            {priority.length > 0 ? (
              <div className="flex flex-col gap-4">
                {priority.map((p) => {
                  const name = locale === 'kk' ? p.nameKk : p.nameRu;
                  const delta = p.current !== null ? p.current - p.accuracy : null;
                  return (
                    <div key={p.topicId}>
                      <MasteryBar label={name} value={p.current ?? p.accuracy} tone="warning" />
                      {delta !== null && delta !== 0 && (
                        <p className={cn('mt-1 text-xs', delta > 0 ? 'text-success' : 'text-destructive')}>
                          {delta > 0
                            ? t('deltaUp', { percent: Math.round(delta * 100) })
                            : t('deltaDown', { percent: Math.round(-delta * 100) })}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('priorityEmpty')}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
