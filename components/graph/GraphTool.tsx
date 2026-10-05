'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, X } from 'lucide-react';
import { MathText } from '@/components/math/MathText';
import { autoViewport, formatNumber, formatPoint, keyPoints, type KeyPoint } from '@/lib/graph/analyze';
import { buildUserCurve, latexWithValues, type UserCurve } from '@/lib/graph/user-input';
import { GRAPH_COLORS } from '@/lib/graph/topics';
import { GraphCanvas, type PlotMarker } from './GraphCanvas';

export type GraphPreset = { id: string; label: string; expression: string; values?: Record<string, number> };

const MAX_LINES = 4;
const KEYS: { label: string; insert: string }[] = [
  { label: 'x', insert: 'x' }, { label: 'x²', insert: '^2' }, { label: 'aᵇ', insert: '^' },
  { label: '√', insert: 'sqrt(' }, { label: '|x|', insert: 'abs(' }, { label: '(', insert: '(' }, { label: ')', insert: ')' },
  { label: '÷', insert: '/' }, { label: 'π', insert: 'pi' }, { label: 'sin', insert: 'sin(' }, { label: 'cos', insert: 'cos(' },
  { label: 'tg', insert: 'tg(' }, { label: 'ln', insert: 'ln(' }, { label: 'log₂', insert: 'log_2(' },
];

type Line = { id: number; text: string };

/**
 * Desmos-style graphing tool: up to four lines, a maths keypad for phones,
 * sliders for letters other than x and y, key points under the graph.
 */
export function GraphTool({ initial = [''], presets, defaults = {}, hint, idPrefix = 'graph', onPrimaryChange }: {
  initial?: string[];
  /** LaTeX of the first line with slider values filled in (for the optional Desmos panel). */
  onPrimaryChange?: (latex: string | null) => void;
  presets?: GraphPreset[];
  defaults?: Record<string, number>;
  hint?: string;
  idPrefix?: string;
}) {
  const t = useTranslations('graph');
  const nextId = useRef(initial.length);
  const [lines, setLines] = useState<Line[]>(initial.map((text, id) => ({ id, text })));
  const [values, setValues] = useState<Record<string, number>>(defaults);
  const [focused, setFocused] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const inputs = useRef(new Map<number, HTMLInputElement>());

  // Letters other than x and y become sliders; an untouched slider starts at 1.
  const { built, params, scope } = useMemo(() => {
    const first = lines.map((line) => (line.text.trim() ? buildUserCurve(line.text, values) : null));
    const names = [...new Set(first.flatMap((curve) => (curve?.ok ? curve.params : [])))].sort();
    const effective = { ...Object.fromEntries(names.map((name) => [name, 1])), ...values };
    const final = names.some((name) => values[name] === undefined)
      ? lines.map((line) => (line.text.trim() ? buildUserCurve(line.text, effective) : null))
      : first;
    return { built: final, params: names, scope: effective };
  }, [lines, values]);
  const ready = built.map((curve, index) => ({ curve, index })).filter((entry): entry is { curve: Extract<UserCurve, { ok: true }>; index: number } => Boolean(entry.curve?.ok));
  const primary = lines[0]?.text ?? '';
  const primaryLatex = built[0]?.ok ? latexWithValues(primary, scope) : null;
  useEffect(() => { onPrimaryChange?.(primaryLatex); }, [primaryLatex, onPrimaryChange]);

  const fns = ready.flatMap((entry) => entry.curve.branches);
  const trig = ready.some((entry) => entry.curve.trig);
  const equalAspect = ready.some((entry) => entry.curve.implicit);
  const signature = ready.map((entry) => lines[entry.index].text).join('|') + JSON.stringify(params.map((name) => scope[name]));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the signature captures every input of the fit
  const view = useMemo(() => (fns.length ? autoViewport(fns, { trig, equalAspect }) : { xmin: -6, xmax: 6, ymin: -5, ymax: 5 }), [signature]);
  const owner = ready.flatMap((entry) => entry.curve.branches.map(() => entry.index));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed when the visible window inputs change
  const points = useMemo<KeyPoint[]>(() => (fns.length ? keyPoints(fns, view) : []), [signature, view]);
  const visible = points
    .filter((point) => point.kind !== 'intersection' || new Set(point.curves.map((curve) => owner[curve])).size > 1)
    .filter((point) => point.kind === 'asymptote' || point.y >= view.ymin && point.y <= view.ymax)
    .slice(0, 12);
  const markers: PlotMarker[] = visible.filter((point) => point.kind !== 'asymptote').map((point) => ({
    x: point.x, y: point.y, label: t(`points.${point.kind}`),
    color: point.kind === 'intersection' ? 'hsl(var(--foreground))' : GRAPH_COLORS[owner[point.curves[0]] % GRAPH_COLORS.length],
  }));
  const markerPoints = visible.filter((point) => point.kind !== 'asymptote');

  const update = (id: number, text: string) => { setLines((current) => current.map((line) => (line.id === id ? { ...line, text } : line))); setSelected(null); };
  const insert = (snippet: string) => {
    const line = lines[focused] ?? lines[0];
    if (!line) return;
    const input = inputs.current.get(line.id);
    const start = input?.selectionStart ?? line.text.length; const end = input?.selectionEnd ?? line.text.length;
    const text = line.text.slice(0, start) + snippet + line.text.slice(end);
    update(line.id, text);
    requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + snippet.length, start + snippet.length); });
  };
  const applyPreset = (preset: GraphPreset) => {
    setLines([{ id: nextId.current++, text: preset.expression }]);
    setValues({ ...defaults, ...preset.values });
    setFocused(0); setSelected(null); setResetKey((value) => value + 1);
  };
  const errorText = (curve: UserCurve | null) => {
    if (!curve || curve.ok) return null;
    if (curve.error === 'unknown-symbol' && curve.at) return t('errors.unknownSymbol', { symbol: curve.at });
    return t(`errors.${curve.error === 'unknown-symbol' ? 'syntax' : curve.error}`);
  };

  return <div className="space-y-4">
    {presets && <div className="flex flex-wrap gap-2" role="group" aria-label={t('presets')}>
      {presets.map((preset) => <button key={preset.id} type="button" onClick={() => applyPreset(preset)}
        className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${lines.length === 1 && lines[0].text === preset.expression ? 'border-primary bg-primary/10 text-foreground' : 'bg-card hover:bg-accent'}`}>{preset.label}</button>)}
    </div>}
    {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    <div className="space-y-2">
      {lines.map((line, index) => {
        const curve = built[index];
        const error = errorText(curve);
        const inputId = `${idPrefix}-line-${line.id}`;
        return <div key={line.id} className="rounded-xl border bg-card p-2.5">
          <div className="flex items-center gap-2">
            <span aria-hidden className="h-6 w-1.5 shrink-0 rounded-full" style={{ background: GRAPH_COLORS[index % GRAPH_COLORS.length] }} />
            <label htmlFor={inputId} className="sr-only">{t('lineLabel', { index: index + 1 })}</label>
            <input
              id={inputId}
              ref={(element) => { if (element) inputs.current.set(line.id, element); else inputs.current.delete(line.id); }}
              value={line.text}
              onChange={(event) => update(line.id, event.target.value)}
              onFocus={() => setFocused(index)}
              placeholder={t('placeholder')}
              inputMode="text" autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${inputId}-error` : undefined}
              className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1.5 font-mono text-base outline-none"
            />
            {lines.length > 1 && <button type="button" aria-label={t('removeLine', { index: index + 1 })} onClick={() => { setLines((current) => current.filter((item) => item.id !== line.id)); setFocused(0); }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>}
          </div>
          {curve?.ok && <div className="overflow-x-auto pl-4 text-sm text-muted-foreground"><MathText text={`$${curve.latex}$`} /></div>}
          {error && <p id={`${inputId}-error`} role="status" className="pl-4 text-sm text-destructive">{error}</p>}
        </div>;
      })}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('keypad')}>
        {KEYS.map((key) => <button key={key.label} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insert(key.insert)}
          className="h-10 min-w-10 rounded-lg border bg-card px-2.5 font-mono text-sm hover:bg-accent active:scale-95">{key.label}</button>)}
        {lines.length < MAX_LINES && <button type="button" onClick={() => { setLines((current) => [...current, { id: nextId.current++, text: '' }]); setFocused(lines.length); }}
          className="flex h-10 items-center gap-1.5 rounded-lg border border-dashed px-3 text-sm hover:bg-accent"><Plus className="h-4 w-4" />{t('addLine')}</button>}
      </div>
    </div>
    {params.length > 0 && <div className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-2">
      {params.map((name) => <div key={name} className="space-y-1">
        <label htmlFor={`${idPrefix}-param-${name}`} className="flex justify-between font-mono text-sm"><span>{name}</span><output>{formatNumber(scope[name], { pi: false })}</output></label>
        <input id={`${idPrefix}-param-${name}`} type="range" min={-5} max={5} step={0.5} value={scope[name]} aria-label={t('parameter', { name })}
          onChange={(event) => setValues((current) => ({ ...current, [name]: Number(event.target.value) }))} className="w-full accent-primary" />
      </div>)}
    </div>}
    <GraphCanvas
      curves={ready.map((entry) => ({ branches: entry.curve.branches, color: GRAPH_COLORS[entry.index % GRAPH_COLORS.length] }))}
      markers={markers}
      overlay={{ asymptotes: visible.filter((point) => point.kind === 'asymptote').map((point) => point.x) }}
      initial={view}
      trig={trig}
      resetKey={`${resetKey}:${ready.length > 0}`}
      selected={selected}
      onSelect={setSelected}
      ariaLabel={ready.length ? t('aria', { functions: ready.map((entry) => entry.curve.latex).join('; ') }) : t('emptyAria')}
    />
    {visible.length > 0 && <ul className="flex flex-wrap gap-2" aria-label={t('keyPoints')}>
      {markerPoints.map((point, index) => <li key={`p${index}`}>
        <button type="button" aria-pressed={selected === index} onClick={() => setSelected(selected === index ? null : index)}
          className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${selected === index ? 'border-primary bg-primary/10' : 'bg-card hover:bg-accent'}`}>
          {t(`points.${point.kind}`)} <span className="font-mono">{formatPoint(point.x, point.y)}</span>
        </button>
      </li>)}
      {visible.filter((point) => point.kind === 'asymptote').map((point) => <li key={`a${point.x}`} className="rounded-full border border-dashed bg-card px-3 py-1.5 text-sm">{t('points.asymptote')} <span className="font-mono">x = {formatNumber(point.x)}</span></li>)}
    </ul>}
    <p className="text-xs text-muted-foreground">{t('help')}</p>
  </div>;
}
