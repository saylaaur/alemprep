'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { loadDesmos, type DesmosCalculator } from '@/lib/desmos/loader';

export function DesmosEmbed({ apiKey, locale, expression }: { apiKey: string; locale: string; expression: string }) {
  const t = useTranslations('visualization');
  const container = useRef<HTMLDivElement>(null);
  const calculator = useRef<DesmosCalculator | null>(null);
  const latestExpression = useRef(expression);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | undefined;
    let instance: DesmosCalculator | undefined;
    void loadDesmos(apiKey).then((api) => {
      if (disposed || !container.current) return;
      try {
        instance = api.GraphingCalculator(container.current, {
          expressions: false, settingsMenu: true, keypad: false, images: false,
          links: false, pasteGraphLink: false, language: locale === 'ru' ? 'ru' : 'en',
          accentColor: '#10b981', border: false,
        });
        calculator.current = instance;
        instance.setMathBounds({ left: -4, right: 4, bottom: -8, top: 8 });
        instance.setExpression({ id: 'function', latex: latestExpression.current, color: '#10b981' });
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => instance?.resize());
          observer.observe(container.current);
        }
        setStatus('ready');
      } catch { instance?.destroy(); instance = undefined; calculator.current = null; setStatus('error'); }
    }).catch(() => { if (!disposed) setStatus('error'); });
    return () => { disposed = true; observer?.disconnect(); instance?.destroy(); calculator.current = null; };
  }, [apiKey, locale, retry]);
  useEffect(() => {
    latestExpression.current = expression;
    if (status === 'ready') {
      try { calculator.current?.setExpression({ id: 'function', latex: expression, color: '#10b981' }); }
      catch { setStatus('error'); }
    }
  }, [expression, status]);
  return <div className="space-y-3">
    {status === 'loading' && <p role="status" className="text-sm">{t('loading')}</p>}
    {status === 'error' && <div role="alert" className="space-y-2"><p>{t('sdkError')}</p><Button variant="outline" onClick={() => { setStatus('loading'); setRetry((value) => value + 1); }}>{t('retry')}</Button></div>}
    {locale === 'kk' && <p className="text-sm text-muted-foreground">{t('sdkLanguage')}</p>}
    <div ref={container} role="region" aria-label="Desmos" className={status === 'error' ? 'hidden' : 'h-[400px] w-full overflow-hidden rounded-lg bg-white'} />
  </div>;
}
