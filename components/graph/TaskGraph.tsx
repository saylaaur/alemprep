'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MathText } from '@/components/math/MathText';
import { formatNumber, formatPoint, type KeyPoint } from '@/lib/graph/analyze';
import { buildTaskModel } from '@/lib/graph/task-model';
import { GRAPH_COLORS } from '@/lib/graph/topics';
import { GraphCanvas, type PlotMarker } from './GraphCanvas';

/**
 * The picture of a task after it is answered: its functions, their zeros,
 * extrema and asymptotes, the solutions of its equation or inequality, or the
 * area of its integral. Renders nothing when the stem has nothing to draw.
 */
export function TaskGraph({ stem, stemBlocks }: { stem: string; stemBlocks?: unknown }) {
  const t = useTranslations('graph');
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const model = useMemo(() => buildTaskModel(stem, stemBlocks), [stem, stemBlocks]);

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
        legend={<ul className="space-y-1">
          {graph.curves.map((curve, index) => <li key={index} className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-1 w-4 shrink-0 rounded-full" style={{ background: GRAPH_COLORS[index % GRAPH_COLORS.length] }} />
            <MathText text={`$${curve.latex}$`} />
          </li>)}
        </ul>}
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
