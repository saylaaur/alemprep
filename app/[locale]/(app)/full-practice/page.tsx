import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function FullPracticePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <FullPracticeContent />;
}

function FullPracticeContent() {
  const t = useTranslations('practice');
  const tNav = useTranslations('nav');

  return (
    <>
      <PageHeader title={tNav('fullPractice')} />
      <div className="p-8">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>{t('comingSoon')}</CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      </div>
    </>
  );
}
