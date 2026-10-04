'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { MathText } from '@/components/math/MathText';
import { graphExpression, graphPoints, graphValue, type GraphKind } from '@/lib/desmos/presets';
import { DesmosEmbed } from './DesmosEmbed';

export function VisualizationWorkspace({ apiKey }: { apiKey: string | null }) {
  const t = useTranslations('visualization');
  const locale = useLocale();
  const [kind, setKind] = useState<GraphKind>('quadratic');
  const [a, setA] = useState(1.5);
  const [b, setB] = useState(-1);
  const [sdkOpen, setSdkOpen] = useState(false);
  const expression = graphExpression(kind, a, b);
  const points = graphPoints(kind, a, b);
  const path = Array.from({ length: 161 }, (_, index) => {
    const x = -4 + index / 20;
    const y = graphValue(kind, a, b, x);
    return `${index === 0 ? 'M' : 'L'}${(x + 4) * 50},${200 - y * 25}`;
  }).join(' ');
  return <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
    <div className="flex flex-wrap gap-2" role="group" aria-label={t('chooseFunction')}>
      {(['linear', 'quadratic'] as const).map((value) => <Button key={value} variant={kind === value ? 'default' : 'outline'} aria-pressed={kind === value} onClick={() => setKind(value)}>{t(value)}</Button>)}
    </div>
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <section className="rounded-xl border bg-card p-4 sm:p-6 space-y-4">
        <MathText text={`$${expression}$`} className="text-xl" />
        <svg role="img" aria-label={t('graphLabel')} viewBox="0 0 400 400" className="w-full max-h-[480px] rounded-lg bg-background">
          <defs><clipPath id="function-viewport"><rect width="400" height="400" /></clipPath></defs>
          {Array.from({ length: 9 }, (_, index) => <g key={index} stroke="currentColor" className="text-muted-foreground/20"><path d={`M ${index * 50} 0 V 400 M 0 ${index * 50} H 400`} /></g>)}
          <path d="M 0 200 H 400 M 200 0 V 400" stroke="currentColor" className="text-muted-foreground" />
          <text x="382" y="192" fill="currentColor" fontSize="14">x</text><text x="209" y="16" fill="currentColor" fontSize="14">y</text>
          {[-4, -2, 0, 2, 4].map((x) => <text key={x} x={Math.max(10, Math.min(389, (x + 4) * 50))} y="218" textAnchor="middle" fill="currentColor" fontSize="11">{x}</text>)}
          {[-6, -4, -2, 2, 4, 6].map((y) => <text key={y} x="191" y={204 - y * 25} textAnchor="end" fill="currentColor" fontSize="11">{y}</text>)}
          <path clipPath="url(#function-viewport)" d={path} fill="none" stroke="currentColor" strokeWidth="3" className="text-primary" />
        </svg>
        <p className="text-sm text-muted-foreground">{t('localHelp')}</p>
      </section>
      <section className="rounded-xl border bg-card p-5 space-y-5">
        <h2 className="font-semibold">{t('parameters')}</h2>
        {[{ name: 'a', value: a, update: setA, min: -3, max: 3 }, { name: 'b', value: b, update: setB, min: -5, max: 5 }].map((parameter) => <div key={parameter.name} className="space-y-2">
          <label htmlFor={`graph-${parameter.name}`} className="flex justify-between font-mono"><span>{parameter.name}</span><output>{parameter.value}</output></label>
          <input id={`graph-${parameter.name}`} aria-label={t('parameter', { name: parameter.name })} type="range" min={parameter.min} max={parameter.max} step="0.5" value={parameter.value} onChange={(event) => parameter.update(Number(event.target.value))} className="w-full accent-primary" />
        </div>)}
        <Button variant="outline" onClick={() => { setA(1.5); setB(-1); }}>{t('reset')}</Button>
        <p className="text-sm text-muted-foreground">{t(kind === 'linear' ? 'linearHelp' : 'quadraticHelp')}</p>
        <table className="w-full text-sm"><caption className="text-left mb-2 font-medium">{t('table')}</caption><thead><tr><th scope="col" className="py-2">x</th><th scope="col" className="py-2">y</th></tr></thead><tbody>{points.map((point) => <tr key={point.x} className="border-t text-center"><td className="py-2">{point.x}</td><td className="py-2">{point.y}</td></tr>)}</tbody></table>
      </section>
    </div>
    {apiKey && <section className="rounded-xl border bg-card p-5 space-y-4">
      <h2 className="font-semibold">Desmos</h2>
      <Button variant="outline" onClick={() => setSdkOpen((value) => !value)}>{t(sdkOpen ? 'closeSdk' : 'openSdk')}</Button>
      {sdkOpen && <DesmosEmbed apiKey={apiKey} locale={locale} expression={expression} />}
    </section>}
  </div>;
}
