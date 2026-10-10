'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Home, Maximize2, Minimize2, Minus, Plus } from 'lucide-react';
import { formatPoint, type Interval, type RealFn, type Viewport } from '@/lib/graph/analyze';
import { fineStep, followPick, pickAt, traceAlong, type Pick, type PickScene } from '@/lib/graph/pick';
import { clampView, digitsFor, easeOut, interpolateView, panByPixels, spanX, spanY, toScreen, toWorld, zoomAround, type Size } from '@/lib/graph/view';
import { axisSteps, drawScene, type DrawPoint, type Palette } from './draw';

export type PlotCurve = {
  branches: RealFn[];
  color: string;
  /** Dashed line: the border of a strict inequality. */
  dashed?: boolean;
  /** Shade above (y > f) or below (y < f) the line. */
  fill?: 'above' | 'below';
  /** Shade vertical strips where an inequality in x holds. */
  strips?: Interval[];
  /** Vertical lines x = c. */
  verticals?: number[];
  verticalFill?: 'left' | 'right';
};
/** `solid`: a point typed by the pupil (filled); otherwise a key point of a curve (hollow). */
export type PlotMarker = { x: number; y: number; color: string; label: string; solid?: boolean };
export type PlotOverlay = {
  /** x-intervals where an inequality holds. */
  shade?: Interval[];
  /** Area under one curve between two x values (definite integral). */
  area?: { curve: number; from: number; to: number };
  /** The segment [a; b] a task is about. */
  segment?: { from: number; to: number };
  asymptotes?: number[];
};

type Gesture =
  | { mode: 'pan'; startX: number; startY: number; moved: boolean; lastX: number; lastY: number; samples: { t: number; x: number; y: number }[] }
  | { mode: 'trace'; curve: number; branch: number; startX: number; startY: number; moved: boolean }
  | { mode: 'drag-point'; startX: number; startY: number; moved: boolean }
  | { mode: 'pinch'; distance: number; centerX: number; centerY: number };

type Picked = { pick: Pick; color: string; title?: string };

const ZOOM_STEP = 0.6;

/** Converts theme colours ("hsl(var(--foreground))", "#2563eb") into canvas colours with opacity. */
function readPalette(element: HTMLElement): Palette {
  const style = getComputedStyle(element);
  const triple = (name: string) => style.getPropertyValue(name).trim() || '0 0% 50%';
  const hsla = (value: string, opacity: number) => {
    const [h, s, l] = value.replace(/\s*\/.*$/, '').split(/[\s,]+/);
    return `hsla(${h}, ${s}, ${l}, ${opacity})`;
  };
  const alpha = (color: string, opacity: number): string => {
    const variable = /var\((--[\w-]+)\)/.exec(color);
    if (variable) return hsla(triple(variable[1]), opacity);
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
    if (hex) {
      const digits = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
      const [r, g, b] = [0, 2, 4].map((at) => parseInt(digits.slice(at, at + 2), 16));
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    const ours = /^hsla\(([^,]+),([^,]+),([^,]+),[^)]+\)$/.exec(color);
    if (ours) return `hsla(${ours[1]},${ours[2]},${ours[3]}, ${opacity})`;
    return color;
  };
  return {
    background: hsla(triple('--background'), 1),
    foreground: hsla(triple('--foreground'), 1),
    muted: hsla(triple('--muted-foreground'), 1),
    card: hsla(triple('--card'), 1),
    warning: hsla(triple('--warning'), 1),
    alpha,
    font: style.fontFamily || 'system-ui, sans-serif',
  };
}

/**
 * Interactive graph on a canvas, Desmos-style: drag to pan (with inertia),
 * wheel/pinch/buttons to zoom (animated), tap a curve or press and drag along
 * it to trace, tap the plane to put a point. Every tap snaps to round
 * coordinates: near (3; 3) it selects exactly (3; 3).
 * One-finger vertical swipes scroll the page until the pupil taps the graph.
 */
export function GraphCanvas({ curves, markers = [], overlay = {}, initial, trig = false, resetKey, selected, onSelect, onViewChange, ariaLabel, legend, tall = false }: {
  curves: PlotCurve[];
  markers?: PlotMarker[];
  overlay?: PlotOverlay;
  initial: Viewport;
  trig?: boolean;
  /** Changing this value moves the view back to `initial`. */
  resetKey?: string | number;
  selected?: number | null;
  onSelect?: (index: number | null) => void;
  /** Called when the view settles after a pan or zoom. */
  onViewChange?: (view: Viewport) => void;
  ariaLabel: string;
  /** Shown over the graph in full-screen mode (the list of functions). */
  legend?: ReactNode;
  /** A taller graph for the visualization page. */
  tall?: boolean;
}) {
  const t = useTranslations('graph');
  const box = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(340);
  const [fullscreen, setFullscreen] = useState(false);
  const [screen, setScreen] = useState({ width: 360, height: 640 });
  const [active, setActive] = useState(false);
  const [live, setLive] = useState('');
  const [wheelHint, setWheelHint] = useState(false);
  const [cursor, setCursor] = useState('grab');
  const height = fullscreen
    ? Math.max(240, screen.height - 16)
    : Math.round(tall ? Math.min(560, Math.max(280, width * 0.72)) : Math.min(420, Math.max(240, width * 0.78)));
  const drawWidth = fullscreen ? Math.max(200, screen.width - 16) : width;
  const size: Size = { width: drawWidth, height };

  const view = useRef<Viewport>(initial);
  const initialRef = useRef(initial);
  useEffect(() => { initialRef.current = initial; }, [initial]);
  const props = useRef({ curves, markers, overlay, trig, selected, size });
  const picked = useRef<Picked | null>(null);
  const hover = useRef<Picked | null>(null);
  const palette = useRef<Palette | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number; type: string }>());
  const gesture = useRef<Gesture | null>(null);
  const animation = useRef<{ from: Viewport; to: Viewport; start: number; duration: number } | null>(null);
  const inertia = useRef<{ vx: number; vy: number; last: number } | null>(null);
  const frame = useRef<number | null>(null);
  const touch = useRef(false);
  const onViewChangeRef = useRef(onViewChange);
  const onSelectRef = useRef(onSelect);
  // Event handlers and the painter read the latest props from refs, updated before any redraw.
  useLayoutEffect(() => {
    props.current = { curves, markers, overlay, trig, selected, size: { width: drawWidth, height } };
    onViewChangeRef.current = onViewChange;
    onSelectRef.current = onSelect;
  });
  const wheelTimer = useRef<number | null>(null);
  const settleTimer = useRef<number | null>(null);

  const scene = useCallback((current: Viewport = view.current): PickScene => {
    const { curves: list, markers: points, trig: isTrig, size: currentSize } = props.current;
    const steps = axisSteps(current, currentSize, isTrig);
    return {
      view: current, size: currentSize, gridX: steps.x, gridY: steps.y,
      curves: list.map((curve) => curve.branches),
      verticals: list.flatMap((curve, index) => (curve.verticals ?? []).map((x) => ({ curve: index, x }))),
      markers: points,
      touch: touch.current,
    };
  }, []);

  const describe = useCallback((entry: Picked | null): DrawPoint | null => {
    if (!entry) return null;
    const { pick } = entry;
    const { size: currentSize } = props.current;
    // Rounded coordinates print exactly; fine ones get as many decimals as the zoom allows.
    const digits = 'level' in pick && pick.level === 'fine'
      ? Math.max(2, digitsFor(Math.min(fineStep(spanX(view.current), currentSize.width), fineStep(spanY(view.current), currentSize.height))))
      : 2;
    return { x: pick.x, y: pick.y, color: entry.color, title: entry.title, text: formatPoint(pick.x, pick.y, digits) };
  }, []);

  const paint = useCallback(() => {
    frame.current = null;
    const element = canvas.current;
    if (!element) return;
    const now = performance.now();
    let moving = false;
    const motion = animation.current;
    if (motion) {
      const progress = (now - motion.start) / motion.duration;
      view.current = progress >= 1 ? motion.to : interpolateView(motion.from, motion.to, easeOut(progress));
      if (progress >= 1) animation.current = null; else moving = true;
    }
    const glide = inertia.current;
    if (glide && !motion) {
      const dt = Math.min(48, now - glide.last);
      glide.last = now;
      const decay = Math.exp(-dt / 280);
      view.current = panByPixels(view.current, props.current.size, glide.vx * dt, glide.vy * dt);
      glide.vx *= decay; glide.vy *= decay;
      if (Math.hypot(glide.vx, glide.vy) < 0.02) inertia.current = null; else moving = true;
    }
    if (!palette.current) palette.current = readPalette(element);
    const { curves: list, markers: points, overlay: extra, trig: isTrig, selected: chosen, size: currentSize } = props.current;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const pixelWidth = Math.round(currentSize.width * dpr); const pixelHeight = Math.round(currentSize.height * dpr);
    if (element.width !== pixelWidth || element.height !== pixelHeight) { element.width = pixelWidth; element.height = pixelHeight; }
    const ctx = element.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const current = picked.current;
    const emphasis = current?.pick.kind === 'curve' || current?.pick.kind === 'vertical' ? current.pick.curve : -1;
    const hovering = hover.current;
    const hoverCurve = hovering && (hovering.pick.kind === 'curve' || hovering.pick.kind === 'vertical') ? hovering.pick.curve : -1;
    drawScene(ctx, {
      view: view.current, size: currentSize, trig: isTrig,
      curves: list.map((curve, index) => ({ ...curve, emphasis: index === emphasis || index === hoverCurve })),
      markers: points.map((point, index) => ({ ...point, selected: chosen === index })),
      shade: extra.shade ? { intervals: extra.shade, color: list[0]?.color ?? '#2563eb' } : undefined,
      area: extra.area && list[extra.area.curve]?.branches[0] ? { fn: list[extra.area.curve].branches[0], from: extra.area.from, to: extra.area.to, color: list[extra.area.curve].color } : undefined,
      segment: extra.segment,
      asymptotes: extra.asymptotes,
      pick: describe(current),
      hover: hovering ? { x: hovering.pick.x, y: hovering.pick.y, color: hovering.color, onCurve: hovering.pick.kind !== 'grid' } : null,
      hoverText: hovering && hovering.pick.kind !== 'grid' ? describe(hovering)?.text ?? null : null,
    }, palette.current);
    if (moving) frame.current = requestAnimationFrame(paint);
    else if (motion || glide) {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
      onViewChangeRef.current?.(view.current);
    }
  }, [describe]);

  const redraw = useCallback(() => {
    if (frame.current === null) frame.current = requestAnimationFrame(paint);
  }, [paint]);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; }, []);

  /** Reports the view a moment after direct manipulation stops. */
  const settle = useCallback(() => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => { settleTimer.current = null; if (!animation.current && !inertia.current) onViewChangeRef.current?.(view.current); }, 180);
  }, []);
  useEffect(() => () => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current);
  }, []);

  const stopMotion = () => { animation.current = null; inertia.current = null; };
  const setView = useCallback((next: Viewport) => { animation.current = null; inertia.current = null; view.current = clampView(next); redraw(); settle(); }, [redraw, settle]);
  const animateTo = useCallback((target: Viewport, duration = 320) => {
    inertia.current = null;
    animation.current = { from: view.current, to: clampView(target), start: performance.now(), duration };
    redraw();
  }, [redraw]);
  const zoomBy = useCallback((factor: number, cx?: number, cy?: number, animated = true) => {
    const base = animation.current?.to ?? view.current;
    const next = zoomAround(base, factor, cx, cy);
    if (animated) animateTo(next, 260); else setView(next);
  }, [animateTo, setView]);

  // Redraw whenever what is drawn changes.
  useLayoutEffect(() => { redraw(); }, [curves, markers, overlay, trig, selected, drawWidth, height, redraw]);

  // Back to the starting view (smoothly) when the parent asks.
  const firstReset = useRef(true);
  useEffect(() => {
    picked.current = null; hover.current = null;
    if (firstReset.current) { firstReset.current = false; view.current = initialRef.current; redraw(); return; }
    animateTo(initialRef.current, 380);
  }, [resetKey, animateTo, redraw]);

  // A key point chosen in the list below: show it, and bring it into view if needed.
  // It follows the point when its coordinates change (a slider moves the minimum).
  const chosenPoint = selected !== null && selected !== undefined ? markers[selected] : undefined;
  const chosenKey = chosenPoint ? `${selected}|${chosenPoint.x}|${chosenPoint.y}|${chosenPoint.label ?? ''}` : '';
  const shownIndex = useRef<number | null>(null);
  useEffect(() => {
    const index = selected ?? null;
    const point = index !== null ? props.current.markers[index] : undefined;
    const newlyChosen = index !== shownIndex.current;
    shownIndex.current = point ? index : null;
    if (!point) {
      if (picked.current?.pick.kind === 'marker') { picked.current = null; setLive(''); redraw(); }
      return;
    }
    picked.current = { pick: { kind: 'marker', index: index!, x: point.x, y: point.y }, color: point.color, title: point.label };
    setLive(`${point.label} ${formatPoint(point.x, point.y)}`);
    const current = view.current;
    const outside = point.x < current.xmin || point.x > current.xmax || point.y < current.ymin || point.y > current.ymax;
    if (newlyChosen && Number.isFinite(point.y) && outside) {
      const dx = point.x - (current.xmin + current.xmax) / 2; const dy = point.y - (current.ymin + current.ymax) / 2;
      animateTo({ xmin: current.xmin + dx, xmax: current.xmax + dx, ymin: current.ymin + dy, ymax: current.ymax + dy });
    } else redraw();
  }, [chosenKey, selected, animateTo, redraw]);

  // A point picked on a line moves with the line when it changes (a slider, a new value),
  // and is dropped when the line no longer passes there.
  useEffect(() => {
    const current = picked.current;
    if (!current || (current.pick.kind !== 'curve' && current.pick.kind !== 'vertical')) return;
    const pick = current.pick;
    const next = followPick(pick, curves);
    if (next && next.x === pick.x && next.y === pick.y) return;
    picked.current = next ? { ...current, pick: next } : null;
    setLive(next ? formatPoint(next.x, next.y, 4) : '');
    redraw();
  }, [curves, redraw]);

  // Theme switches (light/dark) recolour the canvas.
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => { palette.current = null; redraw(); });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    return () => observer.disconnect();
  }, [redraw]);

  useEffect(() => {
    const element = box.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Full screen: the graph covers the page; Escape or the button leaves.
  useEffect(() => {
    if (!fullscreen) return;
    const measure = () => setScreen({ width: window.innerWidth, height: window.innerHeight });
    measure();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setFullscreen(false); };
    window.addEventListener('resize', measure);
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener('resize', measure); window.removeEventListener('keydown', onKey); };
  }, [fullscreen]);

  // Tapping elsewhere on the page gives the page its scrolling back.
  useEffect(() => {
    if (!active) return;
    const onDown = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setActive(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [active]);

  const localPoint = (event: { clientX: number; clientY: number }) => {
    const rect = surface.current!.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * props.current.size.width, y: ((event.clientY - rect.top) / rect.height) * props.current.size.height };
  };

  const colorOf = (pick: Pick): string => {
    const { curves: list, markers: points } = props.current;
    if (pick.kind === 'marker') return points[pick.index]?.color ?? 'hsl(var(--foreground))';
    if (pick.kind === 'curve' || pick.kind === 'vertical') return list[pick.curve]?.color ?? 'hsl(var(--foreground))';
    return 'hsl(var(--muted-foreground))';
  };
  const titleOf = (pick: Pick): string | undefined => (pick.kind === 'marker' ? props.current.markers[pick.index]?.label : undefined);

  const reported = useRef<number | null | undefined>(undefined);
  const choose = (pick: Pick | null) => {
    picked.current = pick ? { pick, color: colorOf(pick), title: titleOf(pick) } : null;
    const index = pick?.kind === 'marker' ? pick.index : null;
    if (index !== reported.current || index !== (props.current.selected ?? null)) { reported.current = index; onSelectRef.current?.(index); }
    setLive(pick ? `${titleOf(pick) ? `${titleOf(pick)} ` : ''}${formatPoint(pick.x, pick.y, 4)}` : '');
    redraw();
  };

  // Wheel and trackpad: zoom once the graph is active (or with Ctrl / a pinch on the trackpad).
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!active && !event.ctrlKey && !fullscreen) {
        setWheelHint(true);
        if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current);
        wheelTimer.current = window.setTimeout(() => setWheelHint(false), 1400);
        return;
      }
      event.preventDefault();
      const point = localPoint(event);
      const world = toWorld(view.current, props.current.size, point.x, point.y);
      const delta = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;
      if (!event.ctrlKey && Math.abs(event.deltaX) > Math.abs(delta) * 1.2) {
        // Two-finger sideways swipe on a trackpad pans.
        setView(panByPixels(view.current, props.current.size, -event.deltaX, 0));
        return;
      }
      const factor = Math.exp(Math.max(-0.6, Math.min(0.6, delta * (event.ctrlKey ? 0.01 : 0.0022))));
      // A mouse notch animates; a trackpad's stream of small deltas is applied directly.
      zoomBy(factor, world.x, world.y, Math.abs(delta) >= 50 && !event.ctrlKey);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [active, fullscreen, setView, zoomBy]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    setActive(true);
    touch.current = event.pointerType !== 'mouse';
    stopMotion();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType });
    hover.current = null;
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { mode: 'pinch', distance: Math.hypot(a.x - b.x, a.y - b.y), centerX: (a.x + b.x) / 2, centerY: (a.y + b.y) / 2 };
      return;
    }
    const point = localPoint(event);
    // Pressing on the placed point drags it; pressing on a line traces along it; elsewhere pans.
    const current = picked.current;
    if (current && current.pick.kind === 'grid') {
      const screen = toScreen(view.current, props.current.size, current.pick.x, current.pick.y);
      if (Math.hypot(screen.x - point.x, screen.y - point.y) <= (touch.current ? 24 : 12)) {
        gesture.current = { mode: 'drag-point', startX: event.clientX, startY: event.clientY, moved: false };
        setCursor('grabbing');
        return;
      }
    }
    const hit = pickAt(point.x, point.y, scene(), { grid: false });
    if (hit && (hit.kind === 'curve' || hit.kind === 'vertical' || hit.kind === 'marker')) {
      const curve = hit.kind === 'marker' ? -1 : hit.curve;
      gesture.current = { mode: 'trace', curve, branch: hit.kind === 'curve' ? hit.branch : -1, startX: event.clientX, startY: event.clientY, moved: false };
      choose(hit);
      return;
    }
    gesture.current = { mode: 'pan', startX: event.clientX, startY: event.clientY, moved: false, lastX: event.clientX, lastY: event.clientY, samples: [{ t: performance.now(), x: event.clientX, y: event.clientY }] };
    setCursor('grabbing');
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const tracked = pointers.current.get(event.pointerId);
    const current = gesture.current;
    if (!tracked || !current) {
      // Mouse hover: show where a click would land.
      if (event.pointerType === 'mouse' && pointers.current.size === 0) {
        touch.current = false;
        const point = localPoint(event);
        const hit = pickAt(point.x, point.y, scene());
        hover.current = hit ? { pick: hit, color: colorOf(hit) } : null;
        const next = hit && hit.kind !== 'grid' ? 'pointer' : 'crosshair';
        if (next !== cursor) setCursor(next);
        redraw();
      }
      return;
    }
    tracked.x = event.clientX; tracked.y = event.clientY;
    const rect = surface.current!.getBoundingClientRect();
    const scaleX = props.current.size.width / rect.width; const scaleY = props.current.size.height / rect.height;
    if (current.mode === 'pinch') {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const centerX = (a.x + b.x) / 2; const centerY = (a.y + b.y) / 2;
      let next = panByPixels(view.current, props.current.size, (centerX - current.centerX) * scaleX, (centerY - current.centerY) * scaleY);
      if (current.distance > 0 && distance > 0) {
        const center = toWorld(next, props.current.size, (centerX - rect.left) * scaleX, (centerY - rect.top) * scaleY);
        next = zoomAround(next, current.distance / distance, center.x, center.y);
      }
      current.distance = distance; current.centerX = centerX; current.centerY = centerY;
      setView(next);
      return;
    }
    const travelled = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
    if (!current.moved && travelled < (event.pointerType === 'mouse' ? 4 : 8)) return;
    current.moved = true;
    const point = localPoint(event);
    if (current.mode === 'pan') {
      setView(panByPixels(view.current, props.current.size, (event.clientX - current.lastX) * scaleX, (event.clientY - current.lastY) * scaleY));
      current.lastX = event.clientX; current.lastY = event.clientY;
      const now = performance.now();
      current.samples.push({ t: now, x: event.clientX, y: event.clientY });
      while (current.samples.length > 2 && now - current.samples[0].t > 90) current.samples.shift();
      return;
    }
    if (current.mode === 'drag-point') {
      const hit = pickAt(point.x, point.y, scene(), { grid: true });
      if (hit) choose(hit.kind === 'grid' ? hit : { kind: 'grid', x: hit.x, y: hit.y, level: 'lattice' });
      return;
    }
    // Trace: follow the same line, sticking to its key points and round coordinates.
    const { curves: list, markers: points } = props.current;
    if (current.curve < 0 || current.branch < 0) {
      const hit = pickAt(point.x, point.y, scene(), { grid: false });
      if (hit) {
        choose(hit);
        if (hit.kind === 'curve') { current.curve = hit.curve; current.branch = hit.branch; }
      }
      return;
    }
    const fn = list[current.curve]?.branches[current.branch];
    if (!fn) return;
    const own = points.map((marker, index) => ({ ...marker, index })).filter((marker) => Math.abs(fn(marker.x) - marker.y) <= 1e-6 * Math.max(1, Math.abs(marker.y)));
    const traced = traceAlong(fn, point.x, point.y, scene(), own);
    if (traced) choose(traced.kind === 'curve' ? { ...traced, curve: current.curve, branch: current.branch } : traced);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    const wasTracked = pointers.current.delete(event.pointerId);
    if (!wasTracked) return;
    if (current?.mode === 'pinch') {
      if (pointers.current.size === 1) {
        // Pinch ended with one finger still down: continue as a pan from here.
        const [rest] = [...pointers.current.values()];
        gesture.current = { mode: 'pan', startX: rest.x, startY: rest.y, moved: true, lastX: rest.x, lastY: rest.y, samples: [{ t: performance.now(), x: rest.x, y: rest.y }] };
      } else if (pointers.current.size === 0) { gesture.current = null; settle(); }
      return;
    }
    gesture.current = null;
    setCursor('grab');
    if (!current || event.type === 'pointercancel') return;
    if (current.mode === 'pan') {
      if (current.moved) {
        const samples = current.samples;
        const first = samples[0]; const last = samples[samples.length - 1];
        const dt = last.t - first.t;
        const rect = surface.current!.getBoundingClientRect();
        const scale = props.current.size.width / rect.width;
        if (dt > 10 && performance.now() - last.t < 60) {
          const vx = ((last.x - first.x) / dt) * scale; const vy = ((last.y - first.y) / dt) * scale;
          if (Math.hypot(vx, vy) > 0.35) { inertia.current = { vx: Math.max(-4, Math.min(4, vx)), vy: Math.max(-4, Math.min(4, vy)), last: performance.now() }; redraw(); return; }
        }
        settle();
        return;
      }
      // A tap on the empty plane puts a point there (snapped to the grid); tapping it again removes it.
      const point = localPoint(event);
      const hit = pickAt(point.x, point.y, scene());
      const previous = picked.current?.pick;
      if (hit && previous && previous.kind === hit.kind && previous.x === hit.x && previous.y === hit.y) choose(null);
      else choose(hit);
      return;
    }
    if (current.mode === 'drag-point' && !current.moved) choose(null);
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const point = localPoint(event);
    const world = toWorld(view.current, props.current.size, point.x, point.y);
    zoomBy(event.shiftKey ? 1 / ZOOM_STEP : ZOOM_STEP, world.x, world.y);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = view.current;
    const entry = picked.current;
    // With a point on a line, ← and → walk along the line in grid steps.
    if (entry && entry.pick.kind === 'curve' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      const { pick } = entry;
      const fn = props.current.curves[pick.curve]?.branches[pick.branch];
      const step = scene().gridX.minor * (event.shiftKey ? 5 : 1);
      if (fn) {
        const x = Math.round((pick.x + (event.key === 'ArrowLeft' ? -step : step)) / step) * step;
        const y = fn(x);
        if (Number.isFinite(y)) {
          choose({ ...pick, x: Number(x.toPrecision(12)), y: Number(y.toPrecision(12)), level: 'minor' });
          if (x < current.xmin || x > current.xmax) animateTo(panByPixels(current, props.current.size, x < current.xmin ? props.current.size.width / 3 : -props.current.size.width / 3, 0), 220);
        }
      }
      event.preventDefault();
      return;
    }
    const stepX = spanX(current) * 0.12; const stepY = spanY(current) * 0.12;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-stepX, 0], ArrowRight: [stepX, 0], ArrowUp: [0, stepY], ArrowDown: [0, -stepY] };
    if (moves[event.key]) {
      const [dx, dy] = moves[event.key];
      const base = animation.current?.to ?? current;
      animateTo({ xmin: base.xmin + dx, xmax: base.xmax + dx, ymin: base.ymin + dy, ymax: base.ymax + dy }, 180);
    } else if (event.key === '+' || event.key === '=') zoomBy(ZOOM_STEP);
    else if (event.key === '-' || event.key === '_') zoomBy(1 / ZOOM_STEP);
    else if (event.key === '0') animateTo(initialRef.current);
    else if (event.key === 'Escape' && (picked.current || fullscreen)) { if (picked.current) choose(null); else setFullscreen(false); }
    else return;
    event.preventDefault();
  };

  const reset = () => { picked.current = null; onSelect?.(null); setLive(''); animateTo(initialRef.current, 380); };
  const button = 'flex h-8 w-8 items-center justify-center rounded-lg border bg-card/95 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-accent active:scale-95';

  // Before the first tap a vertical swipe scrolls the page; after it the graph takes every gesture.
  const touchAction = active || fullscreen ? 'none' : 'pan-y';
  const graph = <div className="relative">
    <div
      ref={surface}
      role="img"
      aria-label={ariaLabel}
      aria-roledescription={t('roleDescription')}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => { if (hover.current) { hover.current = null; redraw(); } }}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      onFocus={() => setActive(true)}
      className={`relative overflow-hidden rounded-xl border bg-background outline-none transition-shadow focus-visible:ring-4 focus-visible:ring-ring/25 ${active && !fullscreen ? 'border-primary/50 shadow-sm' : ''}`}
      style={{ touchAction, cursor, height }}
      data-testid="graph-canvas"
    >
      <canvas ref={canvas} aria-hidden className="block h-full w-full" style={{ width: '100%', height }} />
    </div>
    <div className="absolute right-2 top-2 flex gap-1.5">
      <button type="button" aria-label={t('zoomIn')} title={t('zoomIn')} onClick={() => zoomBy(ZOOM_STEP)} className={button}><Plus className="h-4 w-4" /></button>
      <button type="button" aria-label={t('zoomOut')} title={t('zoomOut')} onClick={() => zoomBy(1 / ZOOM_STEP)} className={button}><Minus className="h-4 w-4" /></button>
      <button type="button" aria-label={t('reset')} title={t('reset')} onClick={reset} className={button}><Home className="h-4 w-4" /></button>
      <button type="button" aria-label={t(fullscreen ? 'exitFullscreen' : 'fullscreen')} title={t(fullscreen ? 'exitFullscreen' : 'fullscreen')} aria-pressed={fullscreen}
        onClick={() => setFullscreen((value) => !value)} className={button}>{fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
    </div>
    {fullscreen && legend && <div className="pointer-events-none absolute left-2 top-2 max-w-[70%] rounded-lg border bg-card/90 px-3 py-2 text-sm shadow-sm backdrop-blur">{legend}</div>}
    {wheelHint && <div role="status" className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-fit max-w-[90%] rounded-lg bg-foreground/85 px-3 py-1.5 text-center text-sm text-background shadow">{t('wheelHint')}</div>}
    <p aria-live="polite" className="sr-only">{live}</p>
  </div>;

  return <div ref={box} className="w-full select-none">
    {fullscreen
      ? <div className="fixed inset-0 z-50 bg-background p-2" role="dialog" aria-modal="true" aria-label={ariaLabel}>{graph}</div>
      : graph}
    {fullscreen && <div style={{ height }} aria-hidden />}
  </div>;
}
