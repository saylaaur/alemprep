import { setRequestLocale } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SettingsContent />;
}

function SettingsContent() {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');

  return (
    <>
      <PageHeader title={t('settings')} />
      <div className="p-4 sm:p-6 lg:p-8">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>{t('settings')}</CardTitle>
            <CardDescription>{tCommon('comingSoon')}</CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      </div>
    </>
  );
}
