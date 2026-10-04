'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { joinPilotClass } from '@/lib/supabase/pilot-access-actions';

export function JoinClass() {
  const t = useTranslations('teacher');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'idle' | 'error' | 'joined'>('idle');
  const pending = useRef<{ token: string; operationId: string } | null>(null);
  return <form className="mx-auto max-w-lg rounded-xl border bg-card p-6 space-y-4" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setStatus('idle');
    const value = token.trim();
    if (pending.current?.token !== value) pending.current = { token: value, operationId: crypto.randomUUID() };
    try {
      const result = await joinPilotClass(pending.current);
      setStatus(result.ok ? 'joined' : 'error');
    } catch { setStatus('error'); }
    finally { setBusy(false); }
  }}>
    <p className="text-sm text-muted-foreground">{t('joinHelp')}</p>
    <label htmlFor="join-token" className="block text-sm font-medium">{t('inviteCode')}</label>
    <input id="join-token" value={token} onChange={(event) => { setToken(event.target.value); setStatus('idle'); }} autoComplete="off" autoCapitalize="none" spellCheck={false} required minLength={22} maxLength={128} className="w-full rounded-lg border bg-background p-3" />
    <Button disabled={busy || status === 'joined'} type="submit">{busy ? t('loading') : t('join')}</Button>
    {status === 'error' && <p role="alert" className="text-sm text-destructive">{t('joinError')}</p>}
    {status === 'joined' && <div role="status" className="space-y-3"><p>{t('joined')}</p><Button asChild><Link href="/subjects">{t('startPractice')}</Link></Button></div>}
  </form>;
}
