import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  getProfile,
  getGamification,
  getSubjectsWithCounts,
  getWeeklyTestSummary,
  getDiagnosticBaseline,
  displayName,
} from '@/lib/supabase/queries';
import { isPilotTopicsOnly } from '@/lib/learning/feature-flag';
import { TodayView } from '@/components/today/TodayView';
import { getBookReviewsToday } from '@/lib/supabase/queries/books';
import { isLocalMode } from '@/lib/data-mode';
import { localGamification } from '@/lib/local/profile';
import { DAILY_LESSON_GOAL, activityOn } from '@/lib/local/activity';
import { readLocalState } from '@/lib/local/store';
import { localDateStr } from '@/lib/streak';
import type { Locale } from '@/types/db';

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;

  const profile = await getProfile();
  const userId = profile?.id;
  // План, пробник и еженедельный тест — только после онбординга и не на пилоте «только темы».
  // Без базы нет ни попыток, ни диагностики: показываем только кольца, цитату и дни до ЕНТ.
  const local = isLocalMode();
  const localState = local ? await readLocalState() : null;
  const withPlan = !local && Boolean(profile?.second_subject) && !isPilotTopicsOnly();

  const [tDash, g, subjects, weeklyTest, baseline, books] = await Promise.all([
    getTranslations('dashboard'),
    localState ? Promise.resolve(localGamification(localState)) : userId ? getGamification(userId) : Promise.resolve(null),
    local ? Promise.resolve([]) : getSubjectsWithCounts(l),
    userId && withPlan ? getWeeklyTestSummary(userId) : Promise.resolve(null),
    userId && withPlan ? getDiagnosticBaseline(userId) : Promise.resolve(null),
    userId ? getBookReviewsToday(userId, l).catch(() => ({ due: [], reviewedToday: 0 })) : Promise.resolve({ due: [], reviewedToday: 0 }),
  ]);

  return (
    <TodayView
      locale={l}
      name={displayName(profile) ?? tDash('defaultName')}
      dailyGoal={profile?.daily_goal ?? null}
      examDate={profile?.exam_date ?? null}
      targetScore={profile?.target_score ?? null}
      baselineScore={baseline?.score ?? null}
      g={g}
      lessons={localState ? { done: Math.min(activityOn(localState, localDateStr()).lessons, DAILY_LESSON_GOAL), total: DAILY_LESSON_GOAL } : null}
      subjects={subjects}
      weeklyTest={weeklyTest}
      books={books}
    />
  );
}
