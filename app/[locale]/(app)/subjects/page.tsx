import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/routing';
import { Calculator, Atom, Code2, type LucideIcon } from 'lucide-react';

type SubjectCard = {
  slug: string;
  nameKey: 'math' | 'physics' | 'informatics';
  icon: LucideIcon;
  topics: number;
  questions: number;
  ready: boolean;
};

const subjects: SubjectCard[] = [
  { slug: 'math', nameKey: 'math', icon: Calculator, topics: 12, questions: 0, ready: true },
  { slug: 'physics', nameKey: 'physics', icon: Atom, topics: 0, questions: 0, ready: false },
  { slug: 'informatics', nameKey: 'informatics', icon: Code2, topics: 0, questions: 0, ready: false },
];

export default async function SubjectsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SubjectsContent />;
}

function SubjectsContent() {
  const t = useTranslations('subjects');

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="p-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((s) => {
            const Icon = s.icon;
            const card = (
              <Card
                className={`h-full transition-colors ${
                  s.ready ? 'hover:border-primary/40' : 'opacity-60'
                }`}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    {!s.ready ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        скоро
                      </span>
                    ) : null}
                  </div>
                  <CardTitle className="mt-3">{t(s.nameKey)}</CardTitle>
                  <CardDescription>
                    {t('topicsCount', { count: s.topics })} ·{' '}
                    {t('questionsCount', { count: s.questions })}
                  </CardDescription>
                </CardHeader>
                <CardContent />
              </Card>
            );

            return s.ready ? (
              <Link key={s.slug} href="/subjects">
                {card}
              </Link>
            ) : (
              <div key={s.slug}>{card}</div>
            );
          })}
        </div>
      </div>
    </>
  );
}
