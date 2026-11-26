import { setRequestLocale } from 'next-intl/server';
import { SectionLinks } from '@/components/layout/SectionLinks';
import { materialLinks } from '@/components/layout/nav-items';

export default async function MaterialsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <SectionLinks section="materials" links={materialLinks} />;
}
