import { getTranslations, setRequestLocale } from 'next-intl/server';
import { JoinClass } from '@/components/teacher/JoinClass';
import { PageHeader } from '@/components/layout/PageHeader';

export default async function JoinClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const { locale } = await params;
  const { code } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('teacher');
  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <PageHeader className="max-w-lg px-0 sm:px-0 lg:px-0" title={t('joinTitle')} />
      <div className="py-6">
        <JoinClass initialCode={typeof code === 'string' ? code : ''} />
      </div>
    </div>
  );
}
