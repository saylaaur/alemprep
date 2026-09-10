import { getTranslations } from 'next-intl/server';
import { BookOpen, ArrowLeft, ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';

export async function ContentUnavailable({
  assessment = false,
  suggestions = [],
}: {
  assessment?: boolean;
  suggestions?: Array<{ slug: string; name: string; count: number }>;
}) {
  const t = await getTranslations('contentAvailability');
  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:px-6 sm:py-16">
      <div className="rounded-2xl border bg-card p-6 sm:p-8">
        <BookOpen className="mb-5 h-8 w-8 text-primary" aria-hidden="true" />
        <h1 className="text-xl font-semibold">{t(assessment ? 'assessmentTitle' : 'topicTitle')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t(assessment ? 'assessmentDescription' : 'topicDescription')}</p>
        {suggestions.length > 0 && (
          <div className="mt-6 space-y-2">
            <h2 className="text-sm font-medium">{t('availableTopics')}</h2>
            {suggestions.map((topic) => (
              <Link key={topic.slug} href={{ pathname: '/practice/topic/[topic]', params: { topic: topic.slug } }} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm hover:border-primary/40">
                <span>{topic.name}<span className="mt-1 block text-xs text-muted-foreground">{t('questionCount', { count: topic.count })}</span></span>
                <ArrowRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              </Link>
            ))}
          </div>
        )}
        <Link href="/subjects" className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />{t('backToSubjects')}
        </Link>
      </div>
    </div>
  );
}
