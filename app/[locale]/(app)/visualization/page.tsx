import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/PageHeader';
import { VisualizationWorkspace } from '@/components/visualization/VisualizationWorkspace';

export default async function VisualizationPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('visualization');
  const apiKey = process.env.DESMOS_ENABLED === 'true' ? process.env.NEXT_PUBLIC_DESMOS_API_KEY?.trim() || null : null;
  return <><PageHeader title={t('title')} subtitle={t('subtitle')} /><VisualizationWorkspace apiKey={apiKey} /></>;
}
