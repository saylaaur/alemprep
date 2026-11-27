import { ChevronRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { PageHeader } from './PageHeader';
import type { SectionLink } from './nav-items';

export async function SectionLinks({
  section,
  links,
}: {
  section: 'practice' | 'materials';
  links: ReadonlyArray<SectionLink>;
}) {
  const [t, description] = await Promise.all([getTranslations('nav'), getTranslations('sections')]);

  return (
    <>
      <PageHeader title={t(section)} />
      <ul className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-6 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-10">
        {links.map(({ href, icon: Icon, labelKey, descriptionKey }) => (
          <li key={href}>
            <Link
              href={href}
              className="glass group flex h-full min-h-28 items-start gap-3 rounded-3xl p-4 transition-[background-color,border-color,box-shadow] duration-200 ease-apple hover:border-primary/30 hover:bg-card hover:shadow-sm focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-ring/40 sm:gap-4 sm:p-5"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-snug text-foreground">{t(labelKey)}</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{description(descriptionKey)}</span>
              </span>
              <ChevronRight aria-hidden className="mt-1.5 size-4 shrink-0 text-muted-foreground transition-[color,transform] duration-200 ease-apple group-hover:text-primary motion-safe:group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
