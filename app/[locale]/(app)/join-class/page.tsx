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
  return <><PageHeader title={t('joinTitle')} /><div className="p-4 sm:p-8"><JoinClass initialCode={typeof code === 'string' ? code : ''} /></div></>;
}
