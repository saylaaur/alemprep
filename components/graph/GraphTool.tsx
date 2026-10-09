'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Delete, Eye, EyeOff, Keyboard, Lightbulb, Pause, Play, Plus, Table2, X } from 'lucide-react';
import { MathText } from '@/components/math/MathText';
import { autoViewport, formatNumber, formatPoint, keyPoints, niceStep, type KeyPoint, type Viewport } from '@/lib/graph/analyze';
import { buildDefinitions, buildUserCurve, latexWithValues, type UserCurve } from '@/lib/graph/user-input';
import { GRAPH_COLORS } from '@/lib/graph/topics';
import { GraphCanvas, type PlotCurve, type PlotMarker } from './GraphCanvas';

export type GraphPreset = { id: string; label: string; expression: string; values?: Record<string, number> };

const MAX_LINES = 6;
/** Key points listed under the graph before "more" (all of them stay on the graph). */
const CHIP_LIMIT = 6;
const DEFAULT_RANGE = { min: -5, max: 5 };
type Key = { label: string; insert?: string; action?: 'left' | 'right' | 'backspace'; wide?: boolean; aria?: string };
const KEYS: Key[][] = [
  [{ label: 'x', insert: 'x' }, { label: 'y', insert: 'y' }, { label: 'a', insert: 'a' }, { label: '=', insert: ' = ' }, { label: '<', insert: ' < ' }, { label: '>', insert: ' > ' }, { label: '≤', insert: ' ≤ ' }, { label: '≥', insert: ' ≥ ' }],
  [{ label: 'x²', insert: '^2' }, { label: 'aᵇ', insert: '^' }, { label: '√', insert: 'sqrt(' }, { label: '|x|', insert: 'abs(' }, { label: '(', insert: '(' }, { label: ')', insert: ')' }, { label: '÷', insert: '/' }, { label: 'π', insert: 'pi' }],
  [{ label: 'sin', insert: 'sin(' }, { label: 'cos', insert: 'cos(' }, { label: 'tg', insert: 'tg(' }, { label: 'ln', insert: 'ln(' }, { label: 'log₂', insert: 'log_2(' }, { label: ';', insert: '; ' }, { label: 'eˣ', insert: 'e^' }, { label: '{…}', insert: ' {0 < x < 1}', aria: 'restriction' }],
  [{ label: '←', action: 'left', aria: 'left' }, { label: '→', action: 'right', aria: 'right' }, { label: '⌫', action: 'backspace', aria: 'backspace', wide: true }],
];
/** Examples of everything the line understands; a tap adds one as a new line. */
const EXAMPLES = ['y = x^2 - 4x + 3', 'x = 2', '(2; 3)', 'y > x^2 - 4', 'x^2 - 4 < 0', 'x^2 {0 < x < 3}', 'f(x) = x^3 - 3x', "f'(x)"];

type Line = { id: number; text: string; hidden?: boolean; table?: boolean };
type Ready = { curve: Extract<UserCurve, { ok: true }>; index: number; line: Line };

const colorOf = (line: Line) => GRAPH_COLORS[line.id % GRAPH_COLORS.length];
const stepFor = (range: { min: number; max: number }) => niceStep(Math.max(1e-6, range.max - range.min), 20, 1);

/** Grows a view so typed points and vertical lines are inside it with a margin. */
function include(view: Viewport, xs: number[], ys: number[]): Viewport {
  const finiteXs = xs.filter(Number.isFinite); const finiteYs = ys.filter(Number.isFinite);
  if (!finiteXs.length && !finiteYs.length) return view;
  let { xmin, xmax, ymin, ymax } = view;
  const padX = (xmax - xmin) * 0.12; const padY = (ymax - ymin) * 0.12;
  for (const x of finiteXs) { if (x < xmin + padX) xmin = x - padX; if (x > xmax - padX) xmax = x + padX; }
  for (const y of finiteYs) { if (y < ymin + padY) ymin = y - padY; if (y > ymax - padY) ymax = y + padY; }
  return { xmin, xmax, ymin, ymax };
}

/**
 * Desmos-style graphing tool: up to six lines (functions, x = a, points,
 * inequalities, pieces {…}, f(x) and f′(x)), a maths keypad for phones,
 * sliders with play for letters other than x and y, key points under the graph.
 */
export function GraphTool({ initial = [''], presets, defaults = {}, hint, idPrefix = 'graph', onPrimaryChange, layout = 'stack' }: {
  initial?: string[];
  /** LaTeX of the first line with slider values filled in (for the optional Desmos panel). */
  onPrimaryChange?: (latex: string | null) => void;
  presets?: GraphPreset[];
  defaults?: Record<string, number>;
  hint?: string;
  idPrefix?: string;
  /** "split": lines on the left, a big graph on the right on wide screens. */
  layout?: 'stack' | 'split';
}) {
  const t = useTranslations('graph');
  const nextId = useRef(initial.length);
  const [lines, setLines] = useState<Line[]>(initial.map((text, id) => ({ id, text })));
  const [values, setValues] = useState<Record<string, number>>(defaults);
  const [ranges, setRanges] = useState<Record<string, { min: number; max: number }>>({});
  const [playing, setPlaying] = useState<string | null>(null);
  const [focused, setFocused] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [liveView, setLiveView] = useState<Viewport | null>(null);
  const [keypad, setKeypad] = useState(true);
  const [examples, setExamples] = useState(false);
  const [allChips, setAllChips] = useState(false);
  const inputs = useRef(new Map<number, HTMLInputElement>());

  // Typing and sliders stay responsive on slow phones: the maths follows a deferred copy.
  const deferredLines = useDeferredValue(lines);
  const deferredValues = useDeferredValue(values);
  // Letters other than x and y become sliders; an untouched slider starts at 1.
  const { built, params, scope } = useMemo(() => {
    const texts = deferredLines.map((line) => line.text);
    const { functions } = buildDefinitions(texts);
    const build = (scopeValues: Record<string, number>) => texts.map((text) => (text.trim() ? buildUserCurve(text, scopeValues, { functions }) : null));
    const first = build(deferredValues);
    const names = [...new Set(first.flatMap((curve) => (curve?.ok ? curve.params : [])))].sort();
    const effective = { ...Object.fromEntries(names.map((name) => [name, 1])), ...deferredValues };
    const final = names.some((name) => deferredValues[name] === undefined) ? build(effective) : first;
    return { built: final, params: names, scope: effective };
  }, [deferredLines, deferredValues]);
  const ready: Ready[] = built
    .map((curve, index) => ({ curve, index, line: deferredLines[index] }))
    .filter((entry): entry is Ready => Boolean(entry.curve?.ok && entry.line && !entry.line.hidden));
  const primary = deferredLines[0]?.text ?? '';
  const primaryLatex = built[0]?.ok && built[0].branches.length && !built[0].fill ? latexWithValues(primary, scope) : null;
  useEffect(() => { onPrimaryChange?.(primaryLatex); }, [primaryLatex, onPrimaryChange]);

  const withBranches = ready.filter((entry) => entry.curve.branches.length > 0);
  const fns = withBranches.flatMap((entry) => entry.curve.branches);
  const trig = ready.some((entry) => entry.curve.trig);
  const equalAspect = ready.some((entry) => entry.curve.implicit);
  const typedPoints = ready.filter((entry) => entry.curve.point && Number.isFinite(entry.curve.point.x) && Number.isFinite(entry.curve.point.y));
  const shapeSignature = ready.map((entry) => entry.line.text).join('|');
  const signature = shapeSignature + JSON.stringify(params.map((name) => scope[name]));
  /* eslint-disable react-hooks/exhaustive-deps -- the signature captures every input of the fit */
  const view = useMemo(() => {
    const fitted = fns.length ? autoViewport(fns, { trig, equalAspect }) : { xmin: -6, xmax: 6, ymin: -5, ymax: 5 };
    const verticals = ready.flatMap((entry) => entry.curve.verticals ?? []).filter((x) => Math.abs(x) < 1e4);
    return include(fitted, [...typedPoints.map((entry) => entry.curve.point!.x), ...verticals], typedPoints.map((entry) => entry.curve.point!.y));
  }, [signature]);
  // Key points follow the window the pupil is looking at (after a pan or zoom), as in Desmos.
  const shown = liveView ?? view;
  const owner = withBranches.flatMap((entry) => entry.curve.branches.map(() => entry.index));
  const points = useMemo<KeyPoint[]>(() => (fns.length ? keyPoints(fns, shown) : []), [signature, shown]);
  /* eslint-enable react-hooks/exhaustive-deps */
  const visible = points
    .filter((point) => point.kind !== 'intersection' || new Set(point.curves.map((curve) => owner[curve])).size > 1)
    .filter((point) => point.kind === 'asymptote' || point.y >= shown.ymin && point.y <= shown.ymax)
    .slice(0, 14);
  const lineColor = (index: number) => colorOf(deferredLines[index] ?? { id: index, text: '' });
  const markerPoints = visible.filter((point) => point.kind !== 'asymptote');
  const markers: PlotMarker[] = [
    ...markerPoints.map((point) => ({
      x: point.x, y: point.y, label: t(`points.${point.kind}`),
      color: point.kind === 'intersection' ? 'hsl(var(--foreground))' : lineColor(owner[point.curves[0]]),
    })),
    ...typedPoints.map((entry) => ({ x: entry.curve.point!.x, y: entry.curve.point!.y, label: t('points.point'), color: colorOf(entry.line), solid: true })),
  ];
  const plotCurves: PlotCurve[] = ready
    .filter((entry) => !entry.curve.point)
    .map((entry) => ({
      branches: entry.curve.branches, color: colorOf(entry.line),
      dashed: entry.curve.dashed, fill: entry.curve.fill, strips: entry.curve.strips, verticals: entry.curve.verticals,
    }));

  // Slider animation: ▶ sweeps the value back and forth between its bounds.
  const playState = useRef<{ name: string; direction: 1 | -1; last: number } | null>(null);
  useEffect(() => {
    if (!playing) { playState.current = null; return; }
    playState.current = { name: playing, direction: 1, last: performance.now() };
    let frame = requestAnimationFrame(function tick(now) {
      const state = playState.current;
      if (!state) return;
      const range = ranges[state.name] ?? DEFAULT_RANGE;
      const dt = Math.min(64, now - state.last);
      state.last = now;
      setValues((current) => {
        let value = (current[state.name] ?? 1) + state.direction * ((range.max - range.min) / 4000) * dt;
        if (value >= range.max) { value = range.max; state.direction = -1; }
        if (value <= range.min) { value = range.min; state.direction = 1; }
        return { ...current, [state.name]: Number(value.toFixed(4)) };
      });
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, ranges]);
  useEffect(() => { if (playing && !params.includes(playing)) setPlaying(null); }, [params, playing]);

  const update = (id: number, text: string) => { setLines((current) => current.map((line) => (line.id === id ? { ...line, text } : line))); setSelected(null); setLiveView(null); };
  const patchLine = (id: number, patch: Partial<Line>) => setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  const focusInput = (id: number, caret?: number) => requestAnimationFrame(() => {
    const input = inputs.current.get(id);
    input?.focus();
    if (caret !== undefined) input?.setSelectionRange(caret, caret);
  });
  const pressKey = (key: Key) => {
    const line = lines[focused] ?? lines[0];
    if (!line) return;
    const input = inputs.current.get(line.id);
    const start = input?.selectionStart ?? line.text.length; const end = input?.selectionEnd ?? line.text.length;
    if (key.action === 'left' || key.action === 'right') {
      const caret = Math.max(0, Math.min(line.text.length, (key.action === 'left' ? Math.min(start, end) - (start === end ? 1 : 0) : Math.max(start, end) + (start === end ? 1 : 0))));
      focusInput(line.id, caret);
      return;
    }
    if (key.action === 'backspace') {
      const from = start === end ? Math.max(0, start - 1) : start;
      update(line.id, line.text.slice(0, from) + line.text.slice(end));
      focusInput(line.id, from);
      return;
    }
    const snippet = key.insert ?? '';
    update(line.id, line.text.slice(0, start) + snippet + line.text.slice(end));
    focusInput(line.id, start + snippet.length);
  };
  const addLine = (text = '') => {
    if (lines.length >= MAX_LINES) return;
    const id = nextId.current++;
    // An empty first line is reused instead of leaving it blank.
    if (text && lines.length === 1 && !lines[0].text.trim()) { setLines([{ id, text }]); setFocused(0); }
    else { setLines((current) => [...current, { id, text }]); setFocused(lines.length); }
    setLiveView(null);
    focusInput(id);
  };
  const applyPreset = (preset: GraphPreset) => {
    setLines([{ id: nextId.current++, text: preset.expression }]);
    setValues({ ...defaults, ...preset.values });
    setRanges({}); setPlaying(null);
    setFocused(0); setSelected(null); setLiveView(null); setResetKey((value) => value + 1);
  };
  const errorText = (curve: UserCurve | null) => {
    if (!curve || curve.ok) return null;
    if (curve.error === 'unknown-symbol' && curve.at) return t('errors.unknownSymbol', { symbol: curve.at });
    return t(`errors.${curve.error === 'unknown-symbol' ? 'syntax' : curve.error}`);
  };
  const setRange = (name: string, patch: Partial<{ min: number; max: number }>) => setRanges((current) => {
    const range = { ...(current[name] ?? DEFAULT_RANGE), ...patch };
    if (!(range.max > range.min)) return current;
    return { ...current, [name]: range };
  });
  const onViewChange = useCallback((next: Viewport) => setLiveView(next), []);
  const keyLabel = (key: Key) => (key.aria ? t(`keys.${key.aria}`) : key.label);

  const legend = <ul className="space-y-1">
    {ready.map((entry) => <li key={entry.line.id} className="flex items-center gap-2">
      <span aria-hidden className="inline-block h-1 w-4 shrink-0 rounded-full" style={{ background: colorOf(entry.line) }} />
      <MathText text={`$${entry.curve.latex}$`} />
    </li>)}
  </ul>;

  const canvas = <GraphCanvas
    curves={plotCurves}
    markers={markers}
    overlay={{ asymptotes: visible.filter((point) => point.kind === 'asymptote').map((point) => point.x) }}
    initial={view}
    trig={trig}
    // Refit when the typed functions change (not on slider moves), so x^2-20x+96 is fitted, not just its first x.
    resetKey={`${resetKey}:${shapeSignature}`}
    selected={selected}
    onSelect={setSelected}
    onViewChange={onViewChange}
    legend={ready.length ? legend : undefined}
    tall={layout === 'split'}
    ariaLabel={ready.length ? t('aria', { functions: ready.map((entry) => entry.curve.latex).join('; ') }) : t('emptyAria')}
  />;

  const chips = visible.length > 0 && <ul className="flex flex-wrap gap-2" aria-label={t('keyPoints')}>
    {markerPoints.map((point, index) => (allChips || index < CHIP_LIMIT || selected === index) && <li key={`p${index}`}>
      <button type="button" aria-pressed={selected === index} onClick={() => setSelected(selected === index ? null : index)}
        className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${selected === index ? 'border-primary bg-primary/10' : 'bg-card hover:bg-accent'}`}>
        <span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: point.kind === 'intersection' ? 'hsl(var(--foreground))' : lineColor(owner[point.curves[0]]) }} />
        {t(`points.${point.kind}`)} <span className="font-mono">{formatPoint(point.x, point.y)}</span>
      </button>
    </li>)}
    {visible.filter((point) => point.kind === 'asymptote').map((point) => <li key={`a${point.x}`} className="rounded-full border border-dashed bg-card px-3 py-1.5 text-sm">{t('points.asymptote')} <span className="font-mono">x = {formatNumber(point.x)}</span></li>)}
    {markerPoints.length > CHIP_LIMIT && <li><button type="button" aria-expanded={allChips} onClick={() => setAllChips((value) => !value)}
      className="rounded-full border border-dashed px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent">{allChips ? t('fewerKeyPoints') : t('moreKeyPoints', { count: markerPoints.length - CHIP_LIMIT })}</button></li>}
  </ul>;

  const panel = <div className="space-y-3">
    {presets && <div className="flex flex-wrap gap-2" role="group" aria-label={t('presets')}>
      {presets.map((preset) => <button key={preset.id} type="button" onClick={() => applyPreset(preset)}
        className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${lines.length === 1 && lines[0].text === preset.expression ? 'border-primary bg-primary/10 text-foreground' : 'bg-card hover:bg-accent'}`}>{preset.label}</button>)}
    </div>}
    {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    <div className="overflow-hidden rounded-xl border bg-card">
      {lines.map((line, index) => {
        const curve = built[index];
        const error = errorText(curve);
        const inputId = `${idPrefix}-line-${line.id}`;
        const color = colorOf(line);
        const table = line.table && curve?.ok && curve.branches.length === 1 && !curve.fill ? curve.branches[0] : null;
        return <div key={line.id} className={`flex border-b last:border-b-0 ${focused === index ? 'bg-primary/[0.03]' : ''}`}>
          <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-r bg-muted/40 py-2 text-xs text-muted-foreground">
            <span aria-hidden>{index + 1}</span>
            <button type="button" aria-pressed={!line.hidden} aria-label={t(line.hidden ? 'showLine' : 'hideLine', { index: index + 1 })} title={t(line.hidden ? 'showLine' : 'hideLine', { index: index + 1 })}
              onClick={() => patchLine(line.id, { hidden: !line.hidden })}
              className="flex h-7 w-7 items-center justify-center rounded-full transition-transform active:scale-90">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border-2" style={{ borderColor: color, background: line.hidden ? 'transparent' : color }}>
                {line.hidden ? <EyeOff className="h-3 w-3" style={{ color }} /> : <Eye className="h-3 w-3 text-white" />}
              </span>
            </button>
          </div>
          <div className="min-w-0 flex-1 p-2">
            <div className="flex items-center gap-1">
              <label htmlFor={inputId} className="sr-only">{t('lineLabel', { index: index + 1 })}</label>
              <input
                id={inputId}
                ref={(element) => { if (element) inputs.current.set(line.id, element); else inputs.current.delete(line.id); }}
                value={line.text}
                onChange={(event) => update(line.id, event.target.value)}
                onFocus={() => setFocused(index)}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addLine(); } }}
                placeholder={t('placeholder')}
                inputMode="text" autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${inputId}-error` : undefined}
                className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1.5 font-mono text-base outline-none"
              />
              {curve?.ok && curve.branches.length === 1 && !curve.fill && <button type="button" aria-pressed={Boolean(line.table)} aria-label={t('tableToggle', { index: index + 1 })} title={t('tableToggle', { index: index + 1 })}
                onClick={() => patchLine(line.id, { table: !line.table })}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-accent ${line.table ? 'text-primary' : 'text-muted-foreground'}`}><Table2 className="h-4 w-4" /></button>}
              {lines.length > 1 && <button type="button" aria-label={t('removeLine', { index: index + 1 })} title={t('removeLine', { index: index + 1 })} onClick={() => { setLines((current) => current.filter((item) => item.id !== line.id)); setFocused(0); setLiveView(null); }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>}
            </div>
            {curve?.ok && <div className="overflow-x-auto px-1 text-sm text-muted-foreground"><MathText text={`$${curve.latex}$`} /></div>}
            {curve?.ok && curve.point && <p className="px-1 text-xs text-muted-foreground">{t('points.point')} <span className="font-mono">{formatPoint(curve.point.x, curve.point.y)}</span></p>}
            {error && <p id={`${inputId}-error`} role="status" className="px-1 text-sm text-destructive">{error}</p>}
            {table && <table className="mt-2 w-full max-w-xs border-collapse text-center font-mono text-sm" aria-label={t('tableCaption', { index: index + 1 })}>
              <thead><tr className="text-xs text-muted-foreground"><th className="border px-2 py-1 font-medium">x</th><th className="border px-2 py-1 font-medium">y</th></tr></thead>
              <tbody>{[-3, -2, -1, 0, 1, 2, 3].map((x) => <tr key={x}><td className="border px-2 py-0.5">{formatNumber(x)}</td><td className="border px-2 py-0.5">{formatNumber(table(x))}</td></tr>)}</tbody>
            </table>}
          </div>
        </div>;
      })}
      {lines.length < MAX_LINES && <button type="button" onClick={() => addLine()}
        className="flex w-full items-center gap-2 border-t px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><Plus className="h-4 w-4" />{t('addLine')}</button>}
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" aria-expanded={keypad} onClick={() => setKeypad((value) => !value)}
        className="flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm hover:bg-accent"><Keyboard className="h-4 w-4" />{t('keypadToggle')}</button>
      <button type="button" aria-expanded={examples} onClick={() => setExamples((value) => !value)}
        className="flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm hover:bg-accent"><Lightbulb className="h-4 w-4" />{t('examples')}</button>
    </div>
    {examples && <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
      <p className="text-sm text-muted-foreground">{t('examplesHint')}</p>
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((example) => <button key={example} type="button" disabled={lines.length >= MAX_LINES && Boolean(lines[lines.length - 1].text.trim())} onClick={() => addLine(example)}
          className="rounded-lg border bg-card px-2.5 py-1 font-mono text-sm hover:bg-accent disabled:opacity-50">{example}</button>)}
      </div>
    </div>}
    {keypad && <div className="space-y-1.5 rounded-xl border bg-muted/30 p-2" role="group" aria-label={t('keypad')}>
      {KEYS.map((row, rowIndex) => <div key={rowIndex} className="grid grid-cols-8 gap-1.5">
        {row.map((key) => <button key={key.label} type="button" aria-label={keyLabel(key)} onMouseDown={(event) => event.preventDefault()} onClick={() => pressKey(key)}
          className={`flex h-9 items-center justify-center rounded-lg border bg-card px-1 font-mono text-sm shadow-xs hover:bg-accent active:scale-95 ${key.wide ? 'col-span-2' : ''} ${key.action ? 'bg-muted' : ''}`}>{key.action === 'backspace' ? <Delete className="h-4 w-4" /> : key.label}</button>)}
      </div>)}
    </div>}
    {params.length > 0 && <div className="grid gap-3 rounded-xl border bg-card p-3">
      {params.map((name) => {
        const range = ranges[name] ?? DEFAULT_RANGE;
        const value = scope[name];
        return <div key={name} className="space-y-1">
          <div className="flex items-center gap-2">
            <button type="button" aria-label={t(playing === name ? 'pause' : 'play', { name })} title={t(playing === name ? 'pause' : 'play', { name })} aria-pressed={playing === name}
              onClick={() => setPlaying(playing === name ? null : name)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background hover:bg-accent">{playing === name ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
            <label htmlFor={`${idPrefix}-value-${name}`} className="font-mono text-sm">{name} =</label>
            <input id={`${idPrefix}-value-${name}`} type="number" inputMode="decimal" step="any" value={Number(value.toFixed(4))} aria-label={t('parameterValue', { name })}
              onChange={(event) => { const next = Number(event.target.value); if (event.target.value !== '' && Number.isFinite(next)) { setPlaying(null); setValues((current) => ({ ...current, [name]: next })); if (next < range.min) setRange(name, { min: next }); if (next > range.max) setRange(name, { max: next }); } }}
              className="w-20 rounded-md border bg-background px-2 py-1 font-mono text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <input type="number" inputMode="decimal" step="any" value={range.min} aria-label={t('rangeMin', { name })} onChange={(event) => { const next = Number(event.target.value); if (event.target.value !== '' && Number.isFinite(next)) setRange(name, { min: next }); }}
              className="w-14 rounded-md border bg-background px-1.5 py-0.5 text-center font-mono text-xs text-muted-foreground" />
            <input id={`${idPrefix}-param-${name}`} type="range" min={range.min} max={range.max} step={stepFor(range)} value={value} aria-label={t('parameter', { name })}
              onChange={(event) => { setPlaying(null); setValues((current) => ({ ...current, [name]: Number(event.target.value) })); }} className="min-w-0 flex-1 accent-primary" />
            <input type="number" inputMode="decimal" step="any" value={range.max} aria-label={t('rangeMax', { name })} onChange={(event) => { const next = Number(event.target.value); if (event.target.value !== '' && Number.isFinite(next)) setRange(name, { max: next }); }}
              className="w-14 rounded-md border bg-background px-1.5 py-0.5 text-center font-mono text-xs text-muted-foreground" />
          </div>
        </div>;
      })}
    </div>}
  </div>;

  if (layout === 'split') {
    return <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
      <div className="min-w-0">{panel}</div>
      <div className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:self-start">
        {canvas}
        {chips}
        <p className="text-xs text-muted-foreground">{t('help')}</p>
      </div>
    </div>;
  }
  return <div className="space-y-4">
    {panel}
    {canvas}
    {chips}
    <p className="text-xs text-muted-foreground">{t('help')}</p>
  </div>;
}
