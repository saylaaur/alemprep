import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { PageHeader } from '@/components/layout/PageHeader';
import { LESSONS, resolveLesson } from '@/lib/lessons/catalog';
import { buildProblemFolders } from '@/lib/problems/folders';
import { bankCounts } from '@/lib/problems/bank';
import { getLibrary } from '@/lib/supabase/queries/books';
import { cn } from '@/lib/utils';
import type { Locale } from '@/types/db';

export const dynamic = 'force-dynamic';

/** Раздел «Задачи»: все задачи по предметам и темам ЕНТ, как папка «Задачи» в первой версии. */
export default async function ProblemsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const [t, library] = await Promise.all([getTranslations('problems'), getLibrary(l)]);
  const lessons = LESSONS.map((x) => resolveLesson(x, l)).map((x) => ({
    id: x.id,
    title: x.title,
    bookSlug: x.bookSlug,
    count: x.problems.length + x.mock.length,
  }));
  const folders = buildProblemFolders(library, lessons, bankCounts());
  const total = folders.reduce((n, s) => n + s.count, 0);

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle', { count: total })} />
      <div className="mx-auto max-w-5xl space-y-4 px-4 pb-8 sm:px-6 lg:px-8">
        {folders.map((s) => (
          <details key={s.slug} className="group rounded-3xl border bg-card/70 shadow-sm backdrop-blur-xl" open={s.count > 0}>
            <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
              <Folder className="h-6 w-6 text-primary group-open:hidden" aria-hidden />
              <FolderOpen className="hidden h-6 w-6 text-primary group-open:block" aria-hidden />
              <span className="flex-1 text-lg font-bold tracking-tight">{s.name}</span>
              <span className="text-sm text-muted-foreground">{t('count', { count: s.count })}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-150 group-open:rotate-90" aria-hidden />
            </summary>
            <ul className="grid gap-1 px-2 pb-3">
              {s.topics.map((tp) => (
                <li key={tp.slug} className={cn('rounded-2xl px-3 py-2', tp.count > 0 ? 'bg-muted/50' : '')}>
                  <div className="flex items-center gap-3">
                    <Folder className={cn('h-4 w-4 shrink-0', tp.count > 0 ? 'text-primary' : 'text-muted-foreground/60')} aria-hidden />
                    <span className={cn('min-w-0 flex-1 text-sm', tp.count === 0 && 'text-muted-foreground')}>
                      {tp.topicNo ? `${tp.topicNo}. ` : ''}
                      {tp.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{tp.count > 0 ? t('count', { count: tp.count }) : t('empty')}</span>
                  </div>
                  {tp.bank > 0 && (
                    <Link
                      href={{ pathname: '/problems/[topic]', params: { topic: tp.slug } }}
                      className="ml-7 mt-1.5 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90"
                    >
                      {t('open')} · {t('count', { count: tp.bank })}
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  )}
                  {tp.lessons.length > 0 && (
                    <ul className="mt-1.5 grid gap-1 pl-7">
                      {tp.lessons.map((ls) => (
                        <li key={ls.id}>
                          <Link
                            href={{ pathname: '/videos/[lesson]', params: { lesson: ls.id } }}
                            className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-sm transition-colors duration-150 hover:bg-muted"
                          >
                            <span className="min-w-0 truncate">{ls.title}</span>
                            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                              {t('count', { count: ls.count })}
                              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </>
  );
}
