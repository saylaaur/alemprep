import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Clock, Play } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { LESSONS, resolveLesson } from '@/lib/lessons/catalog';
import { fill } from '@/lib/lessons/progress';
import type { Locale } from '@/types/db';

export const dynamic = 'force-dynamic';

export default async function VideosPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('lessons');
  const lessons = LESSONS.map((l) => resolveLesson(l, locale as Locale));

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('title')}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{t('subtitle')}</p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lessons.map((l) => (
          <li key={l.id}>
            <Link
              href={{ pathname: '/videos/[lesson]', params: { lesson: l.id } }}
              className="group block overflow-hidden rounded-3xl border bg-card/70 backdrop-blur-xl shadow-sm transition-[transform,box-shadow] duration-200 ease-apple hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99]"
            >
              <div className="relative aspect-video overflow-hidden bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.poster} alt="" className="h-full w-full object-cover transition-transform duration-500 ease-apple group-hover:scale-[1.03]" />
                <span className="glass glass-dark absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full">
                  <Play className="ml-0.5 h-6 w-6 fill-current" />
                </span>
                <span className="glass glass-dark absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium">
                  <Clock className="h-3 w-3" />
                  {fill(t.raw('minutes') as string, { n: Math.round(l.durationSec / 60) })}
                </span>
              </div>
              <div className="p-4">
                <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{t(`subject.${l.subject}`)}</div>
                <div className="mt-1 text-lg font-semibold leading-snug">{l.title}</div>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-sm text-muted-foreground">{t('soon')}</p>
    </div>
  );
}
