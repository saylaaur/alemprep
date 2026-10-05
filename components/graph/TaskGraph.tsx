'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MathText } from '@/components/math/MathText';
import { autoViewport, formatIntervals, formatNumber, formatPoint, integrate, keyPoints, solveRelation, type Interval, type KeyPoint } from '@/lib/graph/analyze';
import { extractTaskGraph } from '@/lib/graph/extract';
import { GRAPH_COLORS } from '@/lib/graph/topics';
import { GraphCanvas, type PlotMarker } from './GraphCanvas';

const MAX_MARKERS = 10;
const SOLUTION_WINDOW = { xmin: -60, xmax: 60 };
const WIDE_WINDOW = { xmin: -120, xmax: 120 };

function sameIntervals(left: Interval[], right: Interval[], inner: { xmin: number; xmax: number }) {
  const clip = (list: Interval[]) => list.filter((interval) => interval.to > inner.xmin && interval.from < inner.xmax)
    .map((interval) => `${interval.from <= inner.xmin ? '-' : interval.from.toFixed(6)}|${interval.to >= inner.xmax ? '+' : interval.to.toFixed(6)}|${interval.fromClosed}|${interval.toClosed}`).join(',');
  return clip(left) === clip(right) && left.length === right.length;
}

/**
 * The picture of a task after it is answered: its functions, their zeros,
 * extrema and asymptotes, the solutions of its equation or inequality, or the
 * area of its integral. Renders nothing when the stem has nothing to draw.
 */
export function TaskGraph({ stem, stemBlocks }: { stem: string; stemBlocks?: unknown }) {
  const t = useTranslations('graph');
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const model = useMemo(() => {
    const graph = extractTaskGraph(stem, stemBlocks);
    if (!graph) return null;
    const fns = graph.curves.flatMap((curve) => curve.branches);
    const view = autoViewport(fns, { trig: graph.trig, equalAspect: graph.equalAspect, focus: graph.focus });
    const owner = graph.curves.flatMap((curve, index) => curve.branches.map(() => index));
    let points: KeyPoint[] = keyPoints(fns, view)
      // Two branches of one circle meet at its edge; that is not an intersection.
      .filter((point) => point.kind !== 'intersection' || new Set(point.curves.map((curve) => owner[curve])).size > 1);
    // With several curves (a system, both sides of an equation) the answer is where they meet.
    if (graph.curves.length > 1) points = points.filter((point) => point.kind === 'intersection' || point.kind === 'asymptote');
    let shade: Interval[] | undefined;
    let solution: string | null = null;
    const relation = graph.relation;
    if (relation) {
      const left = graph.curves[relation.left].branches[0];
      const right = relation.right === null ? () => 0 : graph.curves[relation.right].branches[0];
      if (relation.relation !== '=') {
        shade = solveRelation(left, relation.relation, right, view);
        const wide = solveRelation(left, relation.relation, right, SOLUTION_WINDOW);
        // Periodic answers (trigonometry) never settle; show only the picture then.
        if (!graph.trig && sameIntervals(wide, solveRelation(left, relation.relation, right, WIDE_WINDOW), SOLUTION_WINDOW)) solution = formatIntervals(wide, SOLUTION_WINDOW);
      } else {
        const roots = solveRelation(left, '=', right, SOLUTION_WINDOW).map((interval) => interval.from);
        if (!graph.trig && roots.length <= 6) solution = roots.length ? roots.map((x) => formatNumber(x)).join('; ') : '∅';
      }
    }
    const asymptotes = points.filter((point) => point.kind === 'asymptote').map((point) => point.x);
    const visible = points.filter((point) => point.kind !== 'asymptote' && point.x >= view.xmin && point.x <= view.xmax && point.y >= view.ymin && point.y <= view.ymax)
      .sort((a, b) => Math.abs(a.x) - Math.abs(b.x)).slice(0, MAX_MARKERS).sort((a, b) => a.x - b.x);
    const integral = graph.area ? integrate(graph.curves[graph.area.curve].branches[0], graph.area.from, graph.area.to) : NaN;
    return { graph, view, visible, asymptotes, shade, solution, integral, owner };
  }, [stem, stemBlocks]);

  if (!model) return null;
  const { graph, view, visible, asymptotes, shade, solution, integral, owner } = model;
  const pointLabel = (point: KeyPoint) => t(`points.${point.kind}`);
  const markers: PlotMarker[] = visible.map((point) => ({
    x: point.x, y: point.y, label: pointLabel(point),
    color: point.kind === 'intersection' ? 'hsl(var(--foreground))' : GRAPH_COLORS[owner[point.curves[0]] % GRAPH_COLORS.length],
  }));
  const relationKey = graph.relation ? (graph.relation.relation === '=' ? 'equationSolutions' : 'inequalitySolutions') : null;

  return <section aria-labelledby="task-graph-title" className="space-y-3 rounded-xl border bg-muted/30 p-3 sm:p-4" data-testid="task-graph">
    <div className="flex items-center justify-between gap-3">
      <h3 id="task-graph-title" className="font-semibold">{t('taskTitle')}</h3>
      <button type="button" className="text-sm font-medium text-primary underline-offset-4 hover:underline" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{t(open ? 'hide' : 'show')}</button>
    </div>
    {open && <>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {graph.curves.map((curve, index) => <li key={index} className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-1 w-5 rounded-full" style={{ background: GRAPH_COLORS[index % GRAPH_COLORS.length] }} />
          <MathText text={`$${curve.latex}$`} />
        </li>)}
      </ul>
      <GraphCanvas
        curves={graph.curves.map((curve, index) => ({ branches: curve.branches, color: GRAPH_COLORS[index % GRAPH_COLORS.length] }))}
        markers={markers}
        overlay={{ shade, asymptotes, area: graph.area ?? undefined, segment: graph.segment ?? undefined }}
        initial={view}
        trig={graph.trig}
        selected={selected}
        onSelect={setSelected}
        ariaLabel={t('aria', { functions: graph.curves.map((curve) => curve.latex).join('; ') })}
      />
      {relationKey && solution && <p className="text-sm"><span className="font-medium">{t(relationKey)}</span> <span className="font-mono">{solution}</span></p>}
      {graph.area && Number.isFinite(integral) && <p className="text-sm"><span className="font-medium">{t('integralValue', { from: formatNumber(graph.area.from), to: formatNumber(graph.area.to) })}</span> <span className="font-mono">≈ {formatNumber(integral, { pi: false })}</span></p>}
      {graph.segment && <p className="text-sm text-muted-foreground">{t('segmentNote', { from: formatNumber(graph.segment.from), to: formatNumber(graph.segment.to) })}</p>}
      {(visible.length > 0 || asymptotes.length > 0) && <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('keyPoints')}</p>
        <ul className="flex flex-wrap gap-2">
          {visible.map((point, index) => <li key={`p${index}`}>
            <button type="button" aria-pressed={selected === index} onClick={() => setSelected(selected === index ? null : index)}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${selected === index ? 'border-primary bg-primary/10' : 'bg-card hover:bg-accent'}`}>
              {pointLabel(point)} <span className="font-mono">{formatPoint(point.x, point.y)}</span>
            </button>
          </li>)}
          {asymptotes.map((x) => <li key={`a${x}`} className="rounded-full border border-dashed bg-card px-3 py-1.5 text-sm">{t('points.asymptote')} <span className="font-mono">x = {formatNumber(x)}</span></li>)}
        </ul>
      </div>}
      <p className="text-xs text-muted-foreground">{t('help')}</p>
    </>}
  </section>;
}
