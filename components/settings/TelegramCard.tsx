'use client';

import { useState, useTransition } from 'react';
import { Send } from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { createTelegramLinkAction, unlinkTelegramAction } from '@/lib/supabase/telegram-actions';

type Labels = { title: string; text: string; connect: string; open: string; openHint: string; linked: string; disconnect: string; error: string };

/** Привязка Telegram для утренних напоминаний о книгах. */
export function TelegramCard({ linked, labels }: { linked: boolean; labels: Labels }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  return (
    <section className="rounded-3xl border bg-card/70 backdrop-blur-xl p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#229ED9]/15 text-[#229ED9]">
          <Send className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{labels.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{linked ? labels.linked : labels.text}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {linked ? (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => start(async () => { await unlinkTelegramAction(); router.refresh(); })}
              >
                {labels.disconnect}
              </Button>
            ) : url ? (
              <>
                <Button asChild size="sm">
                  <a href={url} target="_blank" rel="noopener noreferrer">{labels.open}</a>
                </Button>
                <span className="text-xs text-muted-foreground">{labels.openHint}</span>
              </>
            ) : (
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setError(false);
                    const r = await createTelegramLinkAction();
                    if (r.ok) setUrl(r.url);
                    else setError(true);
                  })
                }
              >
                {labels.connect}
              </Button>
            )}
          </div>
          {error && <p role="status" className="mt-2 text-sm text-destructive">{labels.error}</p>}
        </div>
      </div>
    </section>
  );
}
