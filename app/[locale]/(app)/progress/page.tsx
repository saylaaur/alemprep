import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function ProgressPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ProgressContent />;
}

function ProgressContent() {
  const t = useTranslations('progress');

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
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
