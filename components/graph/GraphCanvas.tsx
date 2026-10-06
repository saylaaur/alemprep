'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Home, Minus, Plus } from 'lucide-react';
import { formatNumber, formatPoint, niceStep, piStep, sampleSegments, type Interval, type RealFn, type Viewport } from '@/lib/graph/analyze';

export type PlotCurve = { branches: RealFn[]; color: string };
export type PlotMarker = { x: number; y: number; color: string; label: string };
export type PlotOverlay = {
  /** x-intervals where an inequality holds. */
  shade?: Interval[];
  /** Area under one curve between two x values (definite integral). */
  area?: { curve: number; from: number; to: number };
  /** The segment [a; b] a task is about. */
  segment?: { from: number; to: number };
  asymptotes?: number[];
};

type Trace = { x: number; y: number; color: string; label?: string };

const MIN_SPAN = 1e-3;
const MAX_SPAN = 1e5;

/**
 * Interactive SVG plot: drag to pan, pinch or buttons to zoom, tap a line to
 * read coordinates. One-finger vertical swipes still scroll the page.
 */
export function GraphCanvas({ curves, markers = [], overlay = {}, initial, trig = false, resetKey, selected, onSelect, ariaLabel }: {
  curves: PlotCurve[];
  markers?: PlotMarker[];
  overlay?: PlotOverlay;
  initial: Viewport;
  trig?: boolean;
  /** Changing this value moves the view back to `initial`. */
  resetKey?: string | number;
  selected?: number | null;
  onSelect?: (index: number | null) => void;
  ariaLabel: string;
}) {
  const t = useTranslations('graph');
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(340);
  const height = Math.round(Math.min(420, Math.max(240, width * 0.78)));
  const [view, setView] = useState<Viewport>(initial);
  const viewRef = useRef(view);
  const initialRef = useRef(initial);
  useEffect(() => { initialRef.current = initial; }, [initial]);
  const [trace, setTrace] = useState<Trace | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startX: number; startY: number; moved: boolean; distance: number } | null>(null);
  const frame = useRef<number | null>(null);
  const active = useRef(false);

  useEffect(() => { viewRef.current = initialRef.current; setView(initialRef.current); setTrace(null); }, [resetKey]);

  useEffect(() => {
    const element = box.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const commit = useCallback((next: Viewport) => {
    viewRef.current = next;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => { frame.current = null; setView(viewRef.current); });
  }, []);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);

  const zoom = useCallback((factor: number, centerX?: number, centerY?: number) => {
    const current = viewRef.current;
    const cx = centerX ?? (current.xmin + current.xmax) / 2;
    const cy = centerY ?? (current.ymin + current.ymax) / 2;
    const next = {
      xmin: cx - (cx - current.xmin) * factor, xmax: cx + (current.xmax - cx) * factor,
      ymin: cy - (cy - current.ymin) * factor, ymax: cy + (current.ymax - cy) * factor,
    };
    const span = next.xmax - next.xmin;
    // Block only zooming further past a limit, so a very wide or narrow start view can still be zoomed back.
    if ((span < MIN_SPAN && factor < 1) || (span > MAX_SPAN && factor > 1)) return;
    commit(next);
  }, [commit]);

  const toWorld = useCallback((px: number, py: number) => {
    const current = viewRef.current;
    return { x: current.xmin + (px / width) * (current.xmax - current.xmin), y: current.ymax - (py / height) * (current.ymax - current.ymin) };
  }, [width, height]);

  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    // Wheel zoom only after the pupil has clicked into the graph, so page scrolling keeps working.
    const onWheel = (event: WheelEvent) => {
      if (!active.current && !event.ctrlKey) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const point = toWorld(event.clientX - rect.left, event.clientY - rect.top);
      zoom(Math.exp(Math.max(-0.5, Math.min(0.5, event.deltaY * 0.0015))), point.x, point.y);
    };
    const leave = () => { active.current = false; };
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('mouseleave', leave);
    return () => { element.removeEventListener('wheel', onWheel); element.removeEventListener('mouseleave', leave); };
  }, [toWorld, zoom]);

  const sx = (x: number) => ((x - view.xmin) / (view.xmax - view.xmin)) * width;
  const sy = (y: number) => height - ((y - view.ymin) / (view.ymax - view.ymin)) * height;

  const paths = useMemo(() => curves.map((curve) => curve.branches.map((branch) => {
    const count = Math.min(1400, Math.round(width * 2));
    const segments = sampleSegments(branch, view.xmin, view.xmax, count, view.ymax - view.ymin);
    const toX = (x: number) => (((x - view.xmin) / (view.xmax - view.xmin)) * width).toFixed(1);
    const toY = (y: number) => (height - ((y - view.ymin) / (view.ymax - view.ymin)) * height).toFixed(1);
    return segments.map((segment) => segment.map((point, index) => `${index ? 'L' : 'M'}${toX(point.x)} ${toY(point.y)}`).join('')).join('');
  })), [curves, view, width, height]);

  const areaPath = useMemo(() => {
    const area = overlay.area;
    const fn = area ? curves[area.curve]?.branches[0] : undefined;
    if (!area || !fn) return null;
    const from = Math.max(area.from, view.xmin); const to = Math.min(area.to, view.xmax);
    if (from >= to) return null;
    const yLimit = (view.ymax - view.ymin) * 4;
    const toX = (x: number) => (((x - view.xmin) / (view.xmax - view.xmin)) * width).toFixed(1);
    const toY = (y: number) => (height - ((Math.max(view.ymin - yLimit, Math.min(view.ymax + yLimit, y)) - view.ymin) / (view.ymax - view.ymin)) * height).toFixed(1);
    let path = `M${toX(from)} ${toY(0)}`;
    for (let index = 0; index <= 200; index++) {
      const x = from + (index / 200) * (to - from);
      const y = fn(x);
      path += `L${toX(x)} ${toY(Number.isFinite(y) ? y : 0)}`;
    }
    return `${path}L${toX(to)} ${toY(0)}Z`;
  }, [overlay.area, curves, view, width, height]);

  const xPiStep = trig ? piStep(view.xmax - view.xmin, width) : null;
  const xStep = xPiStep ?? niceStep(view.xmax - view.xmin, width, 56);
  const yStep = niceStep(view.ymax - view.ymin, height, 40);
  const xTicks: number[] = []; const yTicks: number[] = [];
  for (let value = Math.ceil(view.xmin / xStep) * xStep; value <= view.xmax && xTicks.length < 60; value += xStep) xTicks.push(Math.abs(value) < xStep * 1e-6 ? 0 : value);
  for (let value = Math.ceil(view.ymin / yStep) * yStep; value <= view.ymax && yTicks.length < 60; value += yStep) yTicks.push(Math.abs(value) < yStep * 1e-6 ? 0 : value);
  const axisY = Math.max(0, Math.min(height, sy(0)));
  const axisX = Math.max(0, Math.min(width, sx(0)));
  const xLabelY = Math.min(height - 6, Math.max(14, axisY + 16));
  const yLabelX = axisX < 30 ? axisX + 6 : axisX - 6;
  const yAnchor = axisX < 30 ? 'start' : 'end';

  const traceAt = (px: number, py: number) => {
    // Key points win when the tap is close to one.
    let best: { distance: number; marker?: number; trace?: Trace } = { distance: 28 };
    markers.forEach((marker, index) => {
      const distance = Math.hypot(sx(marker.x) - px, sy(marker.y) - py);
      if (distance < Math.min(best.distance, 22)) best = { distance, marker: index };
    });
    if (best.marker !== undefined) { onSelect?.(best.marker); setTrace(null); return; }
    const world = toWorld(px, py);
    curves.forEach((curve) => curve.branches.forEach((branch) => {
      const y = branch(world.x);
      if (!Number.isFinite(y)) return;
      const distance = Math.abs(sy(y) - py);
      if (distance < best.distance) best = { distance, trace: { x: world.x, y, color: curve.color } };
    }));
    onSelect?.(null);
    setTrace(best.trace ?? null);
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    active.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    gesture.current = {
      startX: event.clientX, startY: event.clientY, moved: pointers.current.size > 1,
      distance: points.length === 2 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0,
    };
  };
  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous || !gesture.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (pointers.current.size === 1) {
      if (!gesture.current.moved && Math.hypot(event.clientX - gesture.current.startX, event.clientY - gesture.current.startY) < 6) return;
      gesture.current.moved = true;
      const current = viewRef.current;
      const dx = ((event.clientX - previous.x) / rect.width) * (current.xmax - current.xmin);
      const dy = ((event.clientY - previous.y) / rect.height) * (current.ymax - current.ymin);
      commit({ xmin: current.xmin - dx, xmax: current.xmax - dx, ymin: current.ymin + dy, ymax: current.ymax + dy });
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      return;
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()].slice(0, 2);
    const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    if (gesture.current.distance > 0 && distance > 0) {
      const center = toWorld(((points[0].x + points[1].x) / 2 - rect.left) * (width / rect.width), ((points[0].y + points[1].y) / 2 - rect.top) * (height / rect.height));
      zoom(gesture.current.distance / distance, center.x, center.y);
    }
    gesture.current.distance = distance;
  };
  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const tap = gesture.current && !gesture.current.moved && pointers.current.size === 1;
    pointers.current.delete(event.pointerId);
    if (tap && event.type === 'pointerup') {
      const rect = event.currentTarget.getBoundingClientRect();
      traceAt((event.clientX - rect.left) * (width / rect.width), (event.clientY - rect.top) * (height / rect.height));
    }
    if (pointers.current.size === 0) gesture.current = null;
    else {
      // Pinch ended with one finger still down: continue as a pan from here.
      const [rest] = [...pointers.current.values()];
      gesture.current = { startX: rest.x, startY: rest.y, moved: true, distance: 0 };
    }
  };
  const onKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    const current = viewRef.current;
    const stepX = (current.xmax - current.xmin) * 0.1; const stepY = (current.ymax - current.ymin) * 0.1;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-stepX, 0], ArrowRight: [stepX, 0], ArrowUp: [0, stepY], ArrowDown: [0, -stepY] };
    if (moves[event.key]) {
      const [dx, dy] = moves[event.key];
      commit({ xmin: current.xmin + dx, xmax: current.xmax + dx, ymin: current.ymin + dy, ymax: current.ymax + dy });
    } else if (event.key === '+' || event.key === '=') zoom(0.8);
    else if (event.key === '-') zoom(1.25);
    else if (event.key === '0') commit(initialRef.current);
    else return;
    event.preventDefault();
  };

  const selectedMarker = selected !== null && selected !== undefined ? markers[selected] : undefined;
  const callout: Trace | null = selectedMarker ? { ...selectedMarker } : trace;
  const calloutText = callout ? `${callout.label ? `${callout.label} ` : ''}${formatPoint(callout.x, callout.y)}` : '';
  const calloutWidth = calloutText.length * 7 + 16;
  const calloutX = callout ? Math.max(4, Math.min(width - calloutWidth - 4, sx(callout.x) - calloutWidth / 2)) : 0;
  const calloutY = callout ? (sy(callout.y) > 44 ? sy(callout.y) - 40 : sy(callout.y) + 14) : 0;
  const shadeColor = curves[0]?.color ?? '#2563eb';

  return <div ref={box} className="relative w-full select-none">
    <svg
      ref={svg}
      role="img"
      aria-label={ariaLabel}
      tabIndex={0}
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block rounded-xl border bg-background text-foreground outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
      style={{ touchAction: 'pan-y' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <g stroke="hsl(var(--border))" strokeWidth="1">
        {xTicks.map((value) => <line key={`gx${value}`} x1={sx(value)} x2={sx(value)} y1={0} y2={height} />)}
        {yTicks.map((value) => <line key={`gy${value}`} x1={0} x2={width} y1={sy(value)} y2={sy(value)} />)}
      </g>
      {overlay.shade?.map((interval, index) => interval.from === interval.to
        ? null
        : <rect key={`s${index}`} x={sx(Math.max(interval.from, view.xmin))} width={Math.max(0, sx(Math.min(interval.to, view.xmax)) - sx(Math.max(interval.from, view.xmin)))} y={0} height={height} fill={shadeColor} opacity={0.14} />)}
      {overlay.segment && <rect x={sx(overlay.segment.from)} width={Math.max(0, sx(overlay.segment.to) - sx(overlay.segment.from))} y={0} height={height} fill="hsl(var(--warning))" opacity={0.08} />}
      {areaPath && <path d={areaPath} fill={curves[overlay.area!.curve]?.color} opacity={0.22} />}
      <g stroke="hsl(var(--muted-foreground))" strokeWidth="1.5">
        <line x1={0} x2={width} y1={axisY} y2={axisY} />
        <line x1={axisX} x2={axisX} y1={0} y2={height} />
      </g>
      <g fill="hsl(var(--muted-foreground))" fontSize="11" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {xTicks.filter((value) => value !== 0 && sx(value) > 14 && sx(value) < width - 14).map((value) => <text key={`lx${value}`} x={sx(value)} y={xLabelY} textAnchor="middle">{formatNumber(value, { pi: Boolean(xPiStep) })}</text>)}
        {yTicks.filter((value) => value !== 0 && sy(value) > 10 && sy(value) < height - 8).map((value) => <text key={`ly${value}`} x={yLabelX} y={sy(value) + 4} textAnchor={yAnchor}>{formatNumber(value, { pi: false })}</text>)}
        <text x={width - 6} y={axisY - 6} textAnchor="end" fontStyle="italic" fontSize="13">x</text>
        <text x={axisX + 8} y={14} fontStyle="italic" fontSize="13">y</text>
      </g>
      {overlay.segment && <g stroke="hsl(var(--warning))" strokeWidth="4" strokeLinecap="round">
        <line x1={sx(overlay.segment.from)} x2={sx(overlay.segment.to)} y1={axisY} y2={axisY} />
      </g>}
      {overlay.shade?.map((interval, index) => interval.from === interval.to
        ? <circle key={`p${index}`} cx={sx(interval.from)} cy={axisY} r={5} fill={shadeColor} />
        : <line key={`l${index}`} x1={sx(Math.max(interval.from, view.xmin - 1))} x2={sx(Math.min(interval.to, view.xmax + 1))} y1={axisY} y2={axisY} stroke={shadeColor} strokeWidth={5} strokeLinecap="round" opacity={0.85} />)}
      {overlay.asymptotes?.map((x) => <line key={`a${x}`} x1={sx(x)} x2={sx(x)} y1={0} y2={height} stroke="hsl(var(--muted-foreground))" strokeDasharray="6 5" strokeWidth="1.5" />)}
      {paths.map((branches, curve) => branches.map((d, branch) => <path key={`c${curve}-${branch}`} d={d} fill="none" stroke={curves[curve].color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />))}
      {markers.map((marker, index) => Number.isFinite(marker.y) && <circle key={`m${index}`} cx={sx(marker.x)} cy={sy(marker.y)} r={selected === index ? 7 : 5} fill="hsl(var(--background))" stroke={marker.color} strokeWidth={selected === index ? 3.5 : 2.5} />)}
      {trace && !selectedMarker && <circle cx={sx(trace.x)} cy={sy(trace.y)} r={5.5} fill={trace.color} stroke="hsl(var(--background))" strokeWidth={2} />}
      {callout && <g pointerEvents="none">
        <rect x={calloutX} y={calloutY} width={calloutWidth} height={26} rx={8} fill="hsl(var(--card))" stroke={callout.color} strokeWidth={1.5} />
        <text x={calloutX + calloutWidth / 2} y={calloutY + 17} textAnchor="middle" fontSize="12.5" fill="hsl(var(--foreground))" fontWeight={600}>{calloutText}</text>
      </g>}
    </svg>
    <div className="absolute right-2 top-2 flex flex-col gap-1.5">
      <button type="button" aria-label={t('zoomIn')} title={t('zoomIn')} onClick={() => zoom(0.7)} className="flex h-9 w-9 items-center justify-center rounded-lg border bg-card/95 shadow-sm active:scale-95"><Plus className="h-5 w-5" /></button>
      <button type="button" aria-label={t('zoomOut')} title={t('zoomOut')} onClick={() => zoom(1 / 0.7)} className="flex h-9 w-9 items-center justify-center rounded-lg border bg-card/95 shadow-sm active:scale-95"><Minus className="h-5 w-5" /></button>
      <button type="button" aria-label={t('reset')} title={t('reset')} onClick={() => { commit(initialRef.current); setTrace(null); onSelect?.(null); }} className="flex h-9 w-9 items-center justify-center rounded-lg border bg-card/95 shadow-sm active:scale-95"><Home className="h-5 w-5" /></button>
    </div>
  </div>;
}
