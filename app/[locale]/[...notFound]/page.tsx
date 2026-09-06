import { notFound } from 'next/navigation';

/** Routes unknown locale-prefixed URLs through app/[locale]/not-found.tsx. */
export default function LocaleNotFoundPage() {
  notFound();
}
