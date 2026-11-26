import { setRequestLocale } from 'next-intl/server';
import { SectionLinks } from '@/components/layout/SectionLinks';
import { visiblePracticeLinks } from '@/components/layout/nav-items';
import { isLocalMode } from '@/lib/data-mode';
import { isPilotTopicsOnly } from '@/lib/learning/feature-flag';

export default async function PracticePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const topicsOnly = isLocalMode() || isPilotTopicsOnly();

  return <SectionLinks section="practice" links={visiblePracticeLinks(topicsOnly)} />;
}
