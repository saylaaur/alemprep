import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import {
  GraduationCap,
  ArrowRight,
  Sparkles,
  Focus,
  Keyboard,
  BookOpenCheck,
  Flame,
  Languages,
  ListChecks,
  Calculator,
  Atom,
  Code2,
  Check,
  type LucideIcon,
} from 'lucide-react';

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [tBrand, t, tSubjects] = await Promise.all([
    getTranslations('brand'),
    getTranslations('landing'),
    getTranslations('subjects'),
  ]);

  const features: { icon: LucideIcon; title: string; text: string }[] = [
    { icon: Focus, title: t('f1Title'), text: t('f1Text') },
    { icon: Keyboard, title: t('f2Title'), text: t('f2Text') },
    { icon: BookOpenCheck, title: t('f3Title'), text: t('f3Text') },
    { icon: Flame, title: t('f4Title'), text: t('f4Text') },
    { icon: Languages, title: t('f5Title'), text: t('f5Text') },
    { icon: ListChecks, title: t('f6Title'), text: t('f6Text') },
  ];

  const subjects: {
    icon: LucideIcon;
    name: string;
    desc: string;
    active: boolean;
  }[] = [
    { icon: Calculator, name: tSubjects('math'), desc: t('subjMathDesc'), active: true },
    { icon: Atom, name: tSubjects('physics'), desc: tSubjects('comingSoon'), active: false },
    { icon: Code2, name: tSubjects('informatics'), desc: tSubjects('comingSoon'), active: false },
  ];

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden">
      {/* Background layers */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-grid [mask-image:radial-gradient(ellipse_at_top,black,transparent_65%)] [-webkit-mask-image:radial-gradient(ellipse_at_top,black,transparent_65%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px] bg-glow"
      />

      {/* Header */}
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground shadow-primary">
            <GraduationCap className="h-5 w-5" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">
            {tBrand('name')}
          </span>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/login">{t('ctaSecondary')}</Link>
        </Button>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-3xl px-6 pb-16 pt-16 text-center md:pt-24">
        <div className="animate-fade-in-up">
          <div className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-xs backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {t('badge')}
          </div>

          <h1 className="mt-7 text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            {t('heroTitleTop')}
            <br />
            <span className="text-gradient">{t('heroTitleAccent')}</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-balance text-base leading-relaxed text-muted-foreground md:text-lg">
            {t('heroLead')}
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/login">
                {t('ctaPrimary')}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">{t('ctaSecondary')}</Link>
            </Button>
          </div>

          <div className="mt-5 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Check className="h-4 w-4 text-primary" />
            {t('heroReassure')}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto mb-8 w-full max-w-xl px-6">
        <dl className="grid grid-cols-3 divide-x divide-border rounded-2xl border bg-card/50 py-6 text-center shadow-xs backdrop-blur">
          {[
            { value: '3', label: t('stat1Label') },
            { value: '12', label: t('stat2Label') },
            { value: '4', label: t('stat3Label') },
          ].map((s) => (
            <div key={s.label} className="px-3">
              <dt className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                {s.value}
              </dt>
              <dd className="mt-1 text-xs text-muted-foreground">{s.label}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Features */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {t('featuresTitle')}
          </h2>
          <p className="mt-3 text-muted-foreground">{t('featuresLead')}</p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="group rounded-2xl border bg-card p-5 shadow-xs transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
              >
                <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-105">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-[15px] font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {f.text}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Subjects */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-16 md:pb-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {t('subjectsTitle')}
          </h2>
          <p className="mt-3 text-muted-foreground">{t('subjectsLead')}</p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {subjects.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.name}
                className="flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-xs"
              >
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{s.name}</h3>
                    {s.active ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-success" />
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{s.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-20">
        <div className="relative overflow-hidden rounded-2xl border bg-card px-8 py-14 text-center shadow-sm">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-glow" />
          <div className="relative">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              {t('finalTitle')}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-muted-foreground">
              {t('finalLead')}
            </p>
            <Button asChild size="lg" className="mt-8">
              <Link href="/login">
                {t('ctaPrimary')}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-center text-xs text-muted-foreground sm:flex-row sm:text-left">
          <div className="flex items-center gap-2">
            <div className="grid h-6 w-6 place-items-center rounded bg-primary text-primary-foreground">
              <GraduationCap className="h-3.5 w-3.5" />
            </div>
            <span className="font-medium text-foreground">{tBrand('name')}</span>
            <span>· {t('footerNote')}</span>
          </div>
          <span>© 2026 AlemPrep</span>
        </div>
      </footer>
    </main>
  );
}
