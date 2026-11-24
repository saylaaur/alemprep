import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { TopicPractice } from '@/components/problems/TopicPractice';
import { buildLessonLabels } from '@/lib/lessons/labels';
import { resolveBankItem, setCount, topicSet } from '@/lib/problems/bank';
import { getLibrary } from '@/lib/supabase/queries/books';
import { getActor } from '@/lib/server/actor';
import { isLocalMode } from '@/lib/data-mode';
import type { Locale } from '@/types/db';

export const dynamic = 'force-dynamic';

/** Задачи одной темы из банка: набор по 15, переход к следующему набору. */
export default async function TopicProblemsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; topic: string }>;
  searchParams: Promise<{ set?: string }>;
}) {
  const [{ locale, topic }, sp] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const l = locale as Locale;
  const total = setCount(topic);
  if (total === 0) notFound();
  const set = Math.min(Math.max(0, Number.parseInt(sp.set ?? '0', 10) || 0), total - 1);

  const [t, tl, library, actor] = await Promise.all([
    getTranslations('problems'), getTranslations('lessons'), getLibrary(l), getActor(),
  ]);
  const storageTopic = actor ? `${actor.id}:${topic}` : topic;
  const info = library.flatMap((s) => s.topics.map((tp) => ({ ...tp, subject: s.name }))).find((tp) => tp.slug === topic);
  const problems = topicSet(topic, set).map((it) => resolveBankItem(it, l));
  const base = buildLessonLabels((key) => tl.raw(key) as string).practice;
  const labels = { ...base, title: t('setTitle', { n: set + 1, total }), closedTitle: t('setDoneTitle'), closedText: t.raw('setDoneText') as string };

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pb-10 pt-4 sm:px-6">
      <Link href="/problems" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" aria-hidden />
        {t('title')}
      </Link>
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{info?.subject}</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{info?.name ?? topic}</h1>
      </header>
      <TopicPractice
        key={`${topic}-${set}`}
        storageKey={`alemprep:topic:${storageTopic}:set${set}:v1`}
        problems={problems}
        labels={labels}
        activityUrl={isLocalMode() ? '/api/local/activity' : undefined}
      />
      <nav className="flex items-center justify-between gap-2">
        {set > 0 ? (
          <Link
            href={{ pathname: '/problems/[topic]', params: { topic }, query: { set: String(set - 1) } }}
            className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {t('prevSet')}
          </Link>
        ) : (
          <span />
        )}
        {set + 1 < total && (
          <Link
            href={{ pathname: '/problems/[topic]', params: { topic }, query: { set: String(set + 1) } }}
            className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {t('nextSet')}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </nav>
    </div>
  );
}
