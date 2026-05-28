import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { signInWithGoogle } from '@/lib/supabase/auth-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GraduationCap, ArrowLeft } from 'lucide-react';

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [tAuth, tBrand] = await Promise.all([
    getTranslations('auth'),
    getTranslations('brand'),
  ]);

  async function action() {
    'use server';
    await signInWithGoogle(`/${locale}/dashboard`);
  }

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-grid [mask-image:radial-gradient(ellipse_at_center,black,transparent_60%)] [-webkit-mask-image:radial-gradient(ellipse_at_center,black,transparent_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] bg-glow"
      />

      <Link
        href="/"
        className="absolute left-6 top-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {tBrand('name')}
      </Link>

      <Card className="w-full max-w-sm animate-scale-in shadow-lg">
        <CardHeader className="items-center text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-primary">
            <GraduationCap className="h-6 w-6" />
          </div>
          <CardTitle className="mt-4 text-xl">{tBrand('name')}</CardTitle>
          <CardDescription>{tAuth('signInDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action}>
            <Button type="submit" className="w-full" size="lg">
              {tAuth('signInWithGoogle')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
