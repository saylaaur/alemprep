import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Compass } from 'lucide-react';

export default async function NotFoundPage() {
  const t = await getTranslations('errorPage');

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-6 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-grid [mask-image:radial-gradient(ellipse_at_center,black,transparent_60%)] [-webkit-mask-image:radial-gradient(ellipse_at_center,black,transparent_60%)]"
      />
      <div className="max-w-md animate-scale-in">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <Compass className="h-7 w-7" />
        </div>
        <p className="mt-6 font-mono text-sm font-semibold tracking-[0.24em] text-primary">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t('notFoundTitle')}</h1>
        <p className="mt-3 text-pretty text-muted-foreground">{t('notFoundText')}</p>
        <Button asChild className="mt-7">
          <Link href="/">{t('homeAction')}</Link>
        </Button>
      </div>
    </main>
  );
}
