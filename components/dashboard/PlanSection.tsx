import { getTranslations } from 'next-intl/server';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { Clock, Zap, TriangleAlert, Compass, ChevronRight, ArrowRight } from 'lucide-react';
import { ProgressRing } from '@/components/gamification/ProgressRing';
import { MasteryBar, type MasteryTone } from '@/components/gamification/MasteryBar';
import { getDiagnosticBaseline, type TopicMasteryStat } from '@/lib/supabase/queries';
import { daysUntilExam, projectedPairScore, buildPriorityTopics } from '@/lib/plan';
import { EXAM_PAIR_MAX_SCORE } from '@/lib/exam';
import type { Locale, Profile } from '@/types/db';

type Props = {
  profile: Profile;
  topicMastery: TopicMasteryStat[];
  locale: Locale;
};

/** Тон полосы приоритетной темы по текущему освоению (тот же порог, что и weakTone на дашборде). */
function priorityTone(accuracy: number): MasteryTone {
  if (accuracy < 0.4) return 'destructive';
  if (accuracy < 0.7) return 'warning';
  return 'primary';
}

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
    <Card>
      <CardContent className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold">{t('title')}</h2>
          <Link
            href="/progress"
            className="inline-flex items-center gap-1 rounded text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
          >
            {t('detailsLink')}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
          <div className="flex flex-col justify-between rounded-xl border bg-background/40 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">{t('examCountdown')}</span>
              <Clock className="h-[18px] w-[18px] text-primary" />
            </div>
            <div className="mt-3">
              {days !== null ? (
                <>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono text-3xl font-bold tabular-nums">{Math.max(0, days)}</span>
                    <span className="text-sm text-muted-foreground">
                      {t('daysUnit', { count: Math.max(0, days) })}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('examWeeksUnit', { count: Math.floor(Math.max(0, days) / 7) })} · {profile.exam_date}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t('noExamDate')}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-6 rounded-xl border bg-background/40 p-5">
            <ProgressRing value={progressToTarget} size={88} strokeWidth={7}>
              <span className="font-mono text-lg font-bold tabular-nums">{projected}</span>
            </ProgressRing>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Zap className="h-4 w-4 text-primary" />
                {t('targetProgress')}
              </div>
              <div className="mt-2.5 flex items-center gap-2.5">
                <div className="text-center">
                  <div className="font-mono text-base font-bold tabular-nums text-primary">{projected}</div>
                  <div className="text-[11px] text-muted-foreground">{t('projectedLabel')}</div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="text-center">
                  <div className="font-mono text-base font-bold tabular-nums">{target}</div>
                  <div className="text-[11px] text-muted-foreground">{t('targetLabel')}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-background/40 p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <TriangleAlert className="h-4 w-4 text-destructive" />
              {t('priorityTopics')}
            </div>
            {priority.length > 0 ? (
              <div className="flex flex-col gap-4">
                {priority.map((p) => {
                  const name = locale === 'kk' ? p.nameKk : p.nameRu;
                  const value = p.current ?? p.accuracy;
                  const delta = p.current !== null ? p.current - p.accuracy : null;
                  return (
                    <div key={p.topicId}>
                      <MasteryBar
                        label={name}
                        value={value}
                        valueLabel={t('priorityStart', { percent: Math.round(p.accuracy * 100) })}
                        tone={priorityTone(value)}
                      />
                      {delta !== null && delta > 0 && (
                        <p className="mt-1 text-right text-xs text-success">
                          {t('deltaUp', { percent: Math.round(delta * 100) })}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('priorityEmpty')}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
