import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { PageHeader } from '@/components/layout/PageHeader';
import { LocalTest, type LocalTestLabels } from '@/components/localtest/LocalTest';
import { LESSONS, resolveLesson } from '@/lib/lessons/catalog';
import { readLocalState } from '@/lib/local/store';
import { bestOf, pickQuestions, testPlan } from '@/lib/local/tests';
import { localDateStr } from '@/lib/streak';
import { cn } from '@/lib/utils';
import type { TestKind } from '@/lib/local/state';
import type { Locale } from '@/types/db';

const TABS: ReadonlyArray<{ kind: TestKind; href: '/diagnostic' | '/weekly' | '/full-practice'; key: 'tabDiagnostic' | 'tabWeekly' | 'tabFull' }> = [
  { kind: 'diagnostic', href: '/diagnostic', key: 'tabDiagnostic' },
  { kind: 'weekly', href: '/weekly', key: 'tabWeekly' },
  { kind: 'full', href: '/full-practice', key: 'tabFull' },
];
const FULL_MAX = 40;

/** Диагностика, недельный тест и полный пробник без базы: вопросы берутся из уроков. */
export async function LocalTestPage({ kind, locale }: { kind: TestKind; locale: Locale }) {
  const [t, state] = await Promise.all([getTranslations('localTest'), readLocalState()]);
  const second = state.profile.secondSubject;

  // Вопросы всех уроков нужных предметов (математика + второй, если выбран), без повторов.
  const seen = new Set<string>();
  const pool = LESSONS.filter((l) => !second || l.subject === 'math' || l.subject === second)
    .flatMap((l) => {
      const r = resolveLesson(l, locale);
      return [...r.problems, ...r.mock];
    })
    .filter((q) => (seen.has(q.id) ? false : (seen.add(q.id), true)));

  const plan = testPlan(kind, pool.length);
  const questions = pickQuestions(pool, plan.count, `${localDateStr()}:${kind}`);
  const best = bestOf(state.tests, kind);
  const titleKey = kind === 'diagnostic' ? 'titleDiagnostic' : kind === 'weekly' ? 'titleWeekly' : 'titleFull';
  const introKey = kind === 'diagnostic' ? 'introDiagnostic' : kind === 'weekly' ? 'introWeekly' : 'introFull';
  const partialText = kind === 'full' && plan.count < FULL_MAX ? (t.raw('partial') as string).replace('{n}', String(plan.count)).replace('{max}', String(FULL_MAX)) : null;

  const labels: LocalTestLabels = {
    title: t(titleKey),
    intro: t(introKey),
    facts: t.raw('facts') as string,
    partial: pool.length > 0 ? partialText : null,
    best: t.raw('best') as string,
    start: t('start'),
    question: t.raw('question') as string,
    prev: t('prev'),
    next: t('next'),
    finish: t('finish'),
    unanswered: t.raw('unanswered') as string,
    result: t.raw('result') as string,
    percent: t.raw('percent') as string,
    timeUp: t('timeUp'),
    retry: t('retry'),
    review: t('review'),
    yourAnswer: t('yourAnswer'),
    rightAnswer: t('rightAnswer'),
    saveError: t('saveError'),
    timer: t('timer'),
    questionList: t('questionList'),
    verdictGood: t('verdictGood'),
    verdictMid: t('verdictMid'),
    verdictLow: t('verdictLow'),
    empty: t('empty'),
  };

  return (
    <>
      <PageHeader title={t(titleKey)} subtitle={t('subtitle')} />
      <div className="mx-auto grid max-w-3xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <nav aria-label={t('tabsLabel')} className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
          {TABS.map((tab) => (
            <Link
              key={tab.kind}
              href={tab.href}
              aria-current={tab.kind === kind ? 'page' : undefined}
              className={cn(
                'truncate rounded-full px-2 py-2 text-center text-[13px] font-medium transition-colors duration-150 sm:text-sm',
                tab.kind === kind ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t(tab.key)}
            </Link>
          ))}
        </nav>
        {/* key: при смене вида теста состояние начинается заново */}
        <LocalTest key={kind} kind={kind} questions={questions} seconds={plan.seconds} best={best ? { correct: best.correct, total: best.total } : null} labels={labels} />
      </div>
    </>
  );
}
