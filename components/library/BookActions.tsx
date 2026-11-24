'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { receiveBookAction, reviewBookAction } from '@/lib/supabase/book-actions';
import type { BookState } from '@/lib/supabase/queries/books';

type Labels = {
  receive: string;
  receiveHint: string;
  reviewTitle: string;
  reviewHint: string;
  reviewEarly: string;
  recallAll: string;
  recallMost: string;
  recallFew: string;
  saved: string;
  error: string;
};

/** Получить книгу / отметить повторение. Результат пересчитывает сервер. */
export function BookActions({ slug, state, labels }: { slug: string; state: BookState; labels: Labels }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean }>) =>
    start(async () => {
      setMessage(null);
      const r = await fn();
      setMessage(r.ok ? labels.saved : labels.error);
      if (r.ok) router.refresh();
    });

  if (state === 'available') {
    return (
      <div className="grid gap-2">
        <Button size="lg" disabled={pending} onClick={() => run(() => receiveBookAction(slug))}>
          {labels.receive}
        </Button>
        <p className="text-sm text-muted-foreground">{labels.receiveHint}</p>
        {message && <p role="status" className="text-sm font-medium">{message}</p>}
      </div>
    );
  }

  if (state !== 'due' && state !== 'scheduled') return null;

  return (
    <div className="grid gap-3">
      <div>
        <h3 className="text-base font-semibold">{labels.reviewTitle}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{state === 'due' ? labels.reviewHint : labels.reviewEarly}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Button disabled={pending} onClick={() => run(() => reviewBookAction(slug, 1))}>{labels.recallAll}</Button>
        <Button variant="secondary" disabled={pending} onClick={() => run(() => reviewBookAction(slug, 0.75))}>{labels.recallMost}</Button>
        <Button variant="outline" disabled={pending} onClick={() => run(() => reviewBookAction(slug, 0.25))}>{labels.recallFew}</Button>
      </div>
      {message && <p role="status" className="text-sm font-medium">{message}</p>}
    </div>
  );
}
