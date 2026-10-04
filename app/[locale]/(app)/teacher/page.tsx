import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/PageHeader';
import { getTeacherGroups } from '@/lib/supabase/queries/teacher';
import { Link } from '@/i18n/routing';

export const dynamic = 'force-dynamic';

export default async function TeacherPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('teacher');
  const result = await getTeacherGroups();
  return <>
    <PageHeader title={t('title')} subtitle={t('subtitle')} />
    <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-4">
      {'error' in result ? <p role="alert" className="rounded-xl border p-6">{t('unavailable')}</p>
        : result.data.groups.length === 0 ? <p className="rounded-xl border p-6 text-muted-foreground">{t('noGroups')}</p>
        : <div className="grid gap-4 sm:grid-cols-2">{result.data.groups.map((group) => <Link key={group.id} href={{ pathname: '/teacher/groups/[groupId]', params: { groupId: group.id } }} className="rounded-xl border bg-card p-6 hover:border-primary transition-colors">
          <p className="text-sm text-muted-foreground">{group.schoolName}</p>
          <h2 className="mt-2 text-xl font-semibold">{group.name}</h2>
          <p className="mt-4 text-sm text-primary">{t('openGroup')} →</p>
        </Link>)}</div>}
    </div>
  </>;
}
