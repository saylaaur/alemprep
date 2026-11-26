'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { BookOpen, ChevronRight, Orbit, Search } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { BookState } from '@/lib/books/state';

const BookRing = dynamic(() => import('./BookRing').then((module) => module.BookRing), { ssr: false });

type CatalogBook = {
  slug: string;
  name: string;
  state: BookState;
  subject: string;
  topic: string;
};

const progressStyle = {
  due: 'bg-streak/15 text-foreground',
  scheduled: 'bg-primary/10 text-foreground',
  mastered: 'bg-muted text-foreground',
};

export function BookCatalog({ books, subjects }: {
  books: CatalogBook[];
  subjects: { slug: string; name: string }[];
}) {
  const t = useTranslations('library');
  const locale = useLocale();
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [showRing, setShowRing] = useState(false);
  const terms = search.trim().toLocaleLowerCase(locale).split(/\s+/).filter(Boolean);
  const subjectNames = new Map(subjects.map(({ slug, name }) => [slug, name]));
  const categories = [
    { slug: 'all', name: t('allBooks') },
    ...subjects,
    { slug: 'learned', name: t('ringLearned') },
  ];
  const visible = books.filter((book) => {
    if (category === 'learned' ? book.state !== 'mastered' : category !== 'all' && category !== book.subject) return false;
    const searchable = `${book.name} ${book.topic}`.toLocaleLowerCase(locale);
    return terms.every((term) => searchable.includes(term));
  });

  return (
    <section aria-labelledby="library-catalog" className="space-y-4">
      <div className="space-y-4 rounded-3xl border bg-card/80 p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="library-catalog" className="text-lg font-semibold tracking-tight">{t('catalogTitle')}</h2>
          {books.length > 0 && (
            <Button type="button" variant={showRing ? 'secondary' : 'outline'} aria-pressed={showRing} onClick={() => setShowRing(!showRing)}>
              <Orbit className="size-4" aria-hidden />
              {t('ringView')}
            </Button>
          )}
        </div>
        <label className="relative block">
          <span className="sr-only">{t('search')}</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('search')}
            className="h-11 w-full rounded-xl border bg-background pl-10 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <div role="group" aria-label={t('filter')} className="flex flex-wrap gap-1.5">
          {categories.map(({ slug, name }) => (
            <Button key={slug} type="button" variant={category === slug ? 'default' : 'ghost'} size="sm"
              aria-pressed={category === slug} onClick={() => setCategory(slug)}>
              {name}
            </Button>
          ))}
        </div>
      </div>

      <p role="status" className={cn('text-sm text-muted-foreground', visible.length === 0 ? 'rounded-2xl border bg-card/80 p-5 text-center' : 'px-1')}>
        {visible.length > 0
          ? t('booksCount', { count: visible.length })
          : category === 'learned' && !search.trim() ? t('ringLearnedEmpty') : t('noBooks')}
      </p>

      {showRing && visible.length > 0 && (
        <div className="rounded-3xl border bg-card/65 pb-4">
          <BookRing books={visible} />
          <p className="px-4 text-center text-sm text-muted-foreground">{t('ringHint')}</p>
        </div>
      )}
      {!showRing && visible.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {visible.map((book) => {
            const progress = book.state === 'due' || book.state === 'scheduled' || book.state === 'mastered' ? book.state : null;
            return (
              <li key={book.slug}>
                <Link
                  href={{ pathname: '/library/[book]', params: { book: book.slug } }}
                  prefetch={false}
                  className="group flex h-full items-center gap-3 rounded-2xl border bg-card/85 p-3.5 shadow-sm transition-colors hover:border-primary/50 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <BookOpen className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-semibold leading-snug">{book.name}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {subjectNames.get(book.subject)}
                      {progress && <span className={cn('rounded-full px-2 py-0.5', progressStyle[progress])}>{t(`state.${progress}`)}</span>}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
