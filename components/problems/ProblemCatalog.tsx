'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronRight, Play, Search } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import type { SubjectFolder } from '@/lib/problems/folders';

export function ProblemCatalog({ subjects }: { subjects: SubjectFolder[] }) {
  const t = useTranslations('problems');
  const locale = useLocale();
  const [subjectSlug, setSubjectSlug] = useState('all');
  const [search, setSearch] = useState('');
  const terms = search.trim().toLocaleLowerCase(locale).split(/\s+/).filter(Boolean);

  if (subjects.length === 0) {
    return <p className="glass rounded-2xl p-5 text-sm text-muted-foreground">{t('noProblems')}</p>;
  }

  const filters = [{ slug: 'all', name: t('allSubjects') }, ...subjects];
  const results = subjects
    .filter((subject) => subjectSlug === 'all' || subject.slug === subjectSlug)
    .map((subject) => ({
      ...subject,
      topics: subject.topics.filter((topic) => {
        const searchable = [topic.name, ...topic.lessons.map((lesson) => lesson.title)].join(' ').toLocaleLowerCase(locale);
        return terms.every((term) => searchable.includes(term));
      }),
    }))
    .filter((subject) => subject.topics.length > 0);
  const found = results.reduce((total, subject) => total + subject.topics.length, 0);

  return (
    <div className="space-y-6">
      <div className="glass grid gap-3 rounded-3xl p-4 sm:p-5">
        <label className="relative block">
          <span className="sr-only">{t('search')}</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('search')}
            className="h-11 w-full rounded-xl border bg-background pl-10 pr-3 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
          />
        </label>
        <div role="group" aria-label={t('subjectFilter')} className="flex flex-wrap gap-1.5">
          {filters.map(({ slug, name }) => (
            <Button
              key={slug}
              type="button"
              variant={subjectSlug === slug ? 'default' : 'ghost'}
              size="sm"
              className="min-h-11"
              aria-pressed={subjectSlug === slug}
              onClick={() => setSubjectSlug(slug)}
            >
              {name}
            </Button>
          ))}
        </div>
      </div>

      <p role="status" className={found === 0 ? 'glass rounded-2xl p-5 text-sm text-muted-foreground' : 'sr-only'}>
        {found === 0 ? t('noMatches') : t('topicsFound', { count: found })}
      </p>

      {results.map((subject) => (
        <section key={subject.slug} aria-labelledby={`problem-subject-${subject.slug}`} className="space-y-3">
          <h2 id={`problem-subject-${subject.slug}`} className="text-xl font-bold">{subject.name}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {subject.topics.map((topic) => (
              <li key={topic.slug} className="glass flex flex-col rounded-2xl">
                {topic.bank > 0 ? (
                  <Link
                    href={{ pathname: '/problems/[topic]', params: { topic: topic.slug } }}
                    prefetch={false}
                    className="group flex flex-1 items-center justify-between gap-3 rounded-2xl px-4 py-3.5 transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-snug">{topic.name}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{t('count', { count: topic.bank })}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
                  </Link>
                ) : (
                  <h3 className="px-4 pb-2 pt-3.5 text-sm font-semibold leading-snug">{topic.name}</h3>
                )}
                {topic.lessons.length > 0 && (
                  <ul className="mx-4 mb-2 border-t">
                    {topic.lessons.map((lesson) => (
                      <li key={lesson.id}>
                        <Link
                          href={{ pathname: '/videos/[lesson]', params: { lesson: lesson.id } }}
                          prefetch={false}
                          className="flex min-h-11 items-center gap-2 rounded-lg px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                          <Play className="size-3.5 shrink-0 text-primary" aria-hidden />
                          <span className="min-w-0 flex-1">{lesson.title}</span>
                          <span className="shrink-0">{t('count', { count: lesson.count })}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
