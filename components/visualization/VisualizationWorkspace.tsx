'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { GraphTool, type GraphPreset } from '@/components/graph/GraphTool';
import { DesmosEmbed } from './DesmosEmbed';

const PRESETS: { id: string; expression: string; values?: Record<string, number> }[] = [
  { id: 'linear', expression: 'a x + b', values: { a: 1, b: 1 } },
  { id: 'quadratic', expression: 'a x^2 + b x + c', values: { a: 1, b: -2, c: -3 } },
  { id: 'cubic', expression: 'a x^3 + b x', values: { a: 1, b: -3 } },
  { id: 'hyperbola', expression: 'a / (x - b)', values: { a: 2, b: 0 } },
  { id: 'sqrt', expression: 'a sqrt(x - b)', values: { a: 1, b: 0 } },
  { id: 'abs', expression: 'a |x - b| + c', values: { a: 1, b: 1, c: -2 } },
  { id: 'exponential', expression: 'a^x', values: { a: 2 } },
  { id: 'logarithm', expression: 'log_a x', values: { a: 2 } },
  { id: 'sine', expression: 'a sin(b x)', values: { a: 1, b: 1 } },
  { id: 'circle', expression: 'x^2 + y^2 = a^2', values: { a: 3 } },
];

export function VisualizationWorkspace({ apiKey }: { apiKey: string | null }) {
  const t = useTranslations('visualization');
  const g = useTranslations('graph');
  const locale = useLocale();
  const [sdkOpen, setSdkOpen] = useState(false);
  const [expression, setExpression] = useState<string | null>(null);
  const presets: GraphPreset[] = PRESETS.map((preset) => ({ ...preset, label: g(`presetNames.${preset.id}`) }));
  return <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
    <section className="rounded-xl border bg-card p-4 sm:p-6">
      <GraphTool idPrefix="workspace" layout="split" presets={presets} initial={[PRESETS[1].expression]} defaults={PRESETS[1].values} onPrimaryChange={setExpression} />
      <p className="mt-3 text-sm text-muted-foreground">{t('localHelp')}</p>
    </section>
    {apiKey && <section className="rounded-xl border bg-card p-5 space-y-4">
      <h2 className="font-semibold">Desmos</h2>
      <Button variant="outline" onClick={() => setSdkOpen((value) => !value)}>{t(sdkOpen ? 'closeSdk' : 'openSdk')}</Button>
      {sdkOpen && expression && <DesmosEmbed apiKey={apiKey} locale={locale} expression={`y=${expression}`} />}
    </section>}
  </div>;
}
