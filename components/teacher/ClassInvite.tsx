'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { createPilotClassInvite } from '@/lib/supabase/pilot-access-actions';

export function ClassInvite({ groupId }: { groupId: string }) {
  const t = useTranslations('teacher');
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  async function create() {
    setBusy(true); setError(false); setCopied(false); setToken(null);
    try {
      const result = await createPilotClassInvite({ groupId, operationId: crypto.randomUUID() });
      if (result.ok && result.value.token) setToken(result.value.token);
      else setError(true);
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  return <section className="rounded-xl border bg-card p-5 space-y-3">
    <h2 className="font-semibold">{t('inviteTitle')}</h2>
    <p className="text-sm text-muted-foreground">{t('inviteHelp')}</p>
    <Button onClick={create} disabled={busy}>{busy ? t('loading') : t('createInvite')}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{t('unavailable')}</p>}
    {token && <div className="space-y-2">
      <label className="block text-sm" htmlFor="class-token">{t('inviteCode')}</label>
      <input id="class-token" readOnly value={token} onFocus={(event) => event.target.select()} className="w-full rounded-lg border bg-background p-3 font-mono text-sm" />
      <Button variant="outline" onClick={async () => {
        try { await navigator.clipboard.writeText(token); setCopied(true); }
        catch { setCopied(false); }
      }}>{copied ? t('copied') : t('copy')}</Button>
    </div>}
  </section>;
}
