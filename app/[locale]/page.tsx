import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight, GraduationCap } from 'lucide-react';
import { AppBackdrop } from '@/components/layout/AppBackdrop';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { isLocalMode } from '@/lib/data-mode';
import { isPilotTopicsOnly } from '@/lib/learning/feature-flag';
import { signInWithGoogle } from '@/lib/supabase/auth-actions';

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const local = isLocalMode();
  const pilot = !local && isPilotTopicsOnly();
  const [tBrand, t, tAuth] = await Promise.all([
    getTranslations('brand'),
    getTranslations(pilot ? 'pilotLanding' : 'landing'),
    getTranslations('auth'),
  ]);

  async function signIn() {
    'use server';
    await signInWithGoogle(`/${locale}/dashboard`);
  }

  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <AppBackdrop />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <div className="glass flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
            <GraduationCap aria-hidden className="size-5" />
          </span>
          <span className="text-sm font-semibold tracking-tight">{tBrand('name')}</span>
        </div>
        <LanguageSwitcher compact />
      </header>

      <main className="grid flex-1 place-items-center px-5 pb-12 pt-6 sm:px-8 sm:pb-24">
        <section
          aria-labelledby="landing-title"
          className="glass w-full max-w-3xl rounded-[2rem] bg-card/75 px-5 py-12 text-center sm:px-12 sm:py-16"
        >
          <h1
            id="landing-title"
            className="text-balance text-[clamp(2.5rem,7vw,4.75rem)] font-extrabold leading-[1.02] tracking-[-0.055em]"
          >
            {t('title')}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-base leading-relaxed text-foreground/85 sm:text-lg">
            {t('description')}
          </p>

          {local ? (
            <Button asChild size="lg" className="mt-8">
              <Link href="/dashboard">
                {tAuth('continueWithoutSignIn')}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </Button>
          ) : (
            <form action={signIn} className="mt-8">
              <Button type="submit" size="lg">
                {tAuth('signInWithGoogle')}
                <ArrowRight aria-hidden className="size-4" />
              </Button>
            </form>
          )}

          {pilot && (
            <p data-testid="pilot-content-note" className="mx-auto mt-6 max-w-md text-balance text-sm leading-relaxed text-foreground/80">
              {t('reviewNote')}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
