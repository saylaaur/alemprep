import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { GraduationCap, ArrowRight } from 'lucide-react';

export default function LandingPage() {
  const tBrand = useTranslations('brand');
  const tAuth = useTranslations('auth');

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-between px-6 md:px-12">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <GraduationCap className="h-5 w-5" />
          </div>
          <span className="text-base font-semibold tracking-tight">
            {tBrand('name')}
          </span>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/login">{tAuth('signIn')}</Link>
        </Button>
      </header>

      <section className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-2xl text-center">
          <h1 className="text-4xl md:text-6xl font-semibold tracking-tight">
            {tBrand('tagline')}
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Математика, физика, информатика. По спецификации НЦТ.
            <br className="hidden sm:block" />
            Без рекламы, без отвлечений, бесплатно.
          </p>
          <div className="mt-10 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/login">
                {tAuth('signIn')}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="px-6 py-8 text-center text-xs text-muted-foreground">
        © 2026 AlemPrep
      </footer>
    </main>
  );
}
