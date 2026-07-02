import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';
import { getProfile, getUnpublishedQuestions } from '@/lib/supabase/queries';
import { publishAll } from '@/lib/supabase/admin-actions';
import { ReviewCard } from './ReviewCard';
import type { Locale } from '@/types/db';

export default async function AdminReviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const profile = await getProfile();
  if (!profile?.is_admin) {
    redirect(`/${locale}/dashboard`);
  }

  const [t, questions] = await Promise.all([
    getTranslations('admin'),
    getUnpublishedQuestions(),
  ]);

  const labels = {
    publish: t('publish'),
    delete: t('delete'),
    answer: t('answer'),
    explanation: t('explanation'),
    topic: t('topic'),
    difficulty: t('difficulty'),
    source: t('source'),
  };

  const subtitle =
    questions.length === 0
      ? t('subtitleEmpty')
      : t('subtitle', { count: questions.length });

  return (
    <>
      <PageHeader title={t('title')} subtitle={subtitle} />

      <div className="p-8 space-y-6 max-w-3xl">
        {questions.length > 0 && (
          <form action={publishAll}>
            <Button type="submit" variant="outline" className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {t('publishAll', { count: questions.length })}
            </Button>
          </form>
        )}

        {questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noQuestions')}</p>
        ) : (
          <div className="space-y-6">
            {questions.map((q) => (
              <ReviewCard
                key={q.id}
                question={q}
                locale={locale as Locale}
                labels={labels}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
