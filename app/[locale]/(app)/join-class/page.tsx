import { getTranslations, setRequestLocale } from 'next-intl/server';
import { JoinClass } from '@/components/teacher/JoinClass';
import { PageHeader } from '@/components/layout/PageHeader';

export default async function JoinClassPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('teacher');
  return <><PageHeader title={t('joinTitle')} /><div className="p-4 sm:p-8"><JoinClass /></div></>;
}
