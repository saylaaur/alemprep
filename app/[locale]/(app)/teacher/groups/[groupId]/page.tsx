import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getTeacherRoster } from '@/lib/supabase/queries/teacher';
import { summarizeRoster } from '@/lib/teacher/contracts';
import { PageHeader } from '@/components/layout/PageHeader';
import { ClassInvite } from '@/components/teacher/ClassInvite';
import { Link } from '@/i18n/routing';

export const dynamic = 'force-dynamic';

export default async function TeacherGroupPage({ params }: { params: Promise<{ locale: string; groupId: string }> }) {
  const { locale, groupId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('teacher');
  const result = await getTeacherRoster(groupId);
  if ('error' in result) {
    if (result.error === 'not-found') notFound();
    return <><PageHeader title={t('title')} /><p role="alert" className="p-6">{t('unavailable')}</p></>;
  }
  const roster = result.data;
  const summary = summarizeRoster(roster);
  const time = (value: string) => new Intl.DateTimeFormat(locale === 'kk' ? 'kk-KZ' : 'ru-KZ', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Almaty' }).format(new Date(value));
  return <>
    <PageHeader title={roster.group.name} subtitle={roster.group.schoolName} action={<a href={`/${locale}/teacher/groups/${groupId}`} className="rounded-lg border px-4 py-2 text-sm">{t('refresh')}</a>} />
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <Link href="/teacher" className="text-sm text-primary">← {t('allGroups')}</Link>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[{ label: t('pupils'), value: summary.pupils }, { label: t('active'), value: `${summary.active} / ${summary.pupils}` }, { label: t('accuracy'), value: summary.accuracy === null ? '—' : `${summary.accuracy}%` }].map((stat) => <div key={stat.label} className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">{stat.label}</p><p className="mt-2 text-3xl font-semibold">{stat.value}</p></div>)}
      </div>
      <div className="space-y-1 text-sm text-muted-foreground"><p>{t('metricHelp')}</p><p>{t('asOf', { time: time(roster.asOf) })}</p></div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm text-left"><thead className="border-b"><tr>{['pupil', 'attempts', 'uniqueQuestions', 'firstScore', 'lastActive'].map((key) => <th key={key} scope="col" className="p-4 font-medium whitespace-nowrap">{t(key)}</th>)}</tr></thead>
          <tbody>{roster.students.map((pupil, index) => <tr key={pupil.id} className="border-b last:border-0"><th scope="row" className="p-4 font-medium whitespace-nowrap">{pupil.name || t('unnamedPupil', { number: index + 1 })}</th><td className="p-4">{pupil.attempts}</td><td className="p-4">{pupil.uniqueQuestions}</td><td className="p-4">{pupil.firstMaxPoints ? `${pupil.firstPoints} / ${pupil.firstMaxPoints}` : '—'}</td><td className="p-4 whitespace-nowrap">{pupil.lastActiveAt ? time(pupil.lastActiveAt) : t('notStarted')}</td></tr>)}</tbody>
        </table>
        {roster.students.length === 0 && <p className="p-6 text-muted-foreground">{t('noPupils')}</p>}
      </div>
      <ClassInvite groupId={groupId} />
    </div>
  </>;
}
