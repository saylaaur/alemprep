/**
 * Viewport maths for the interactive graph: screen ↔ world conversion, zoom
 * around a point, smooth transitions and the major/minor grid. Pure functions,
 * unit-tested in view.test.ts.
 */
import { niceStep, piStep, type Viewport } from './analyze';

export type Size = { width: number; height: number };
export type GridSteps = { major: number; minor: number; pi: boolean };

/** Narrowest and widest x-span the pupil can zoom to. */
export const MIN_SPAN = 1e-3;
export const MAX_SPAN = 1e5;

export const spanX = (view: Viewport) => view.xmax - view.xmin;
export const spanY = (view: Viewport) => view.ymax - view.ymin;

export function toScreen(view: Viewport, size: Size, x: number, y: number) {
  return {
    x: ((x - view.xmin) / spanX(view)) * size.width,
    y: size.height - ((y - view.ymin) / spanY(view)) * size.height,
  };
}

export function toWorld(view: Viewport, size: Size, px: number, py: number) {
  return {
    x: view.xmin + (px / size.width) * spanX(view),
    y: view.ymax - (py / size.height) * spanY(view),
  };
}

/** Zooms by `factor` (< 1 zooms in) keeping the world point (cx, cy) under the same pixel. */
export function zoomAround(view: Viewport, factor: number, cx = (view.xmin + view.xmax) / 2, cy = (view.ymin + view.ymax) / 2): Viewport {
  const next = {
    xmin: cx - (cx - view.xmin) * factor, xmax: cx + (view.xmax - cx) * factor,
    ymin: cy - (cy - view.ymin) * factor, ymax: cy + (view.ymax - cy) * factor,
  };
  const span = spanX(next);
  // Block only zooming further past a limit, so a very wide or narrow start view can still be zoomed back.
  if ((span < MIN_SPAN && factor < 1) || (span > MAX_SPAN && factor > 1)) return view;
  return next;
}

/** Moves the view by a pixel offset (a drag to the right shows what is on the left). */
export function panByPixels(view: Viewport, size: Size, dx: number, dy: number): Viewport {
  const wx = (dx / size.width) * spanX(view);
  const wy = (dy / size.height) * spanY(view);
  return { xmin: view.xmin - wx, xmax: view.xmax - wx, ymin: view.ymin + wy, ymax: view.ymax + wy };
}

/**
 * In-between view for an animated move: the centre moves linearly and the
 * spans change geometrically, so a big zoom looks steady instead of rushing.
 */
export function interpolateView(from: Viewport, to: Viewport, t: number): Viewport {
  const lerp = (a: number, b: number) => a + (b - a) * t;
  const geo = (a: number, b: number) => (a > 0 && b > 0 ? a * Math.pow(b / a, t) : lerp(a, b));
  const cx = lerp((from.xmin + from.xmax) / 2, (to.xmin + to.xmax) / 2);
  const cy = lerp((from.ymin + from.ymax) / 2, (to.ymin + to.ymax) / 2);
  const sx = geo(spanX(from), spanX(to)) / 2;
  const sy = geo(spanY(from), spanY(to)) / 2;
  return { xmin: cx - sx, xmax: cx + sx, ymin: cy - sy, ymax: cy + sy };
}

/** Ease-out cubic: fast start, gentle stop. */
export const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** Minor step for a 1-2-5 major step: 1 → 0.2, 2 → 0.5, 5 → 1 (as in Desmos). */
export function minorStep(major: number): number {
  const power = Math.pow(10, Math.floor(Math.log10(major) + 1e-9));
  const mantissa = Math.round(major / power);
  return mantissa === 2 ? major / 4 : major / 5;
}

/** Major and minor grid steps along one axis. `pi` uses multiples of π (trigonometry). */
export function gridSteps(span: number, pixels: number, options: { pi?: boolean; minPixels?: number } = {}): GridSteps {
  const minPixels = options.minPixels ?? 56;
  const pi = options.pi ? piStep(span, pixels, minPixels) : null;
  if (pi !== null) {
    const ratio = Math.round((pi / Math.PI) * 12);
    // π/6 → π/12, π/4 → π/12, π/2 → π/6, π → π/4, 2π → π/2, 4π → π.
    const minor = ratio === 2 ? pi / 2 : ratio === 3 ? pi / 3 : ratio === 6 ? pi / 3 : pi / 4;
    return { major: pi, minor, pi: true };
  }
  const major = niceStep(span, pixels, minPixels);
  return { major, minor: minorStep(major), pi: false };
}

/** Grid values from min to max (inclusive), at most `limit` of them; −0 and float noise cleaned up. */
export function ticksIn(min: number, max: number, step: number, limit = 400): number[] {
  if (!(step > 0) || !Number.isFinite(min) || !Number.isFinite(max)) return [];
  const first = Math.ceil(min / step - 1e-9);
  const last = Math.floor(max / step + 1e-9);
  if (last - first > limit) return [];
  const values: number[] = [];
  for (let k = first; k <= last; k++) values.push(clean(k * step));
  return values;
}

/** Removes float noise: 0.30000000000000004 → 0.3, −0 → 0. */
export function clean(value: number): number {
  if (!Number.isFinite(value)) return value;
  const rounded = Number(value.toPrecision(12));
  return rounded === 0 ? 0 : rounded;
}

/** Decimal places of a grid step, so values on that grid print exactly (0.25 → 2, 0.2 → 1, 5 → 0). */
export function digitsFor(step: number): number {
  if (!(step > 0) || !Number.isFinite(step)) return 2;
  const text = String(clean(step));
  if (text.includes('e')) return Math.min(8, Math.max(0, -Math.floor(Math.log10(step))));
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : Math.min(8, text.length - dot - 1);
}

/** Keeps a target view a sensible shape: never wider/narrower than the zoom limits. */
export function clampView(view: Viewport): Viewport {
  const span = spanX(view);
  if (span >= MIN_SPAN && span <= MAX_SPAN && spanY(view) > 0) return view;
  const target = Math.min(MAX_SPAN, Math.max(MIN_SPAN, span));
  return zoomAround(view, target / span);
}

export function sameView(a: Viewport, b: Viewport, tolerance = 1e-9): boolean {
  const scale = Math.max(spanX(a), spanY(a)) * tolerance;
  return Math.abs(a.xmin - b.xmin) <= scale && Math.abs(a.xmax - b.xmax) <= scale && Math.abs(a.ymin - b.ymin) <= scale && Math.abs(a.ymax - b.ymax) <= scale;
}

const SOLVE_LIMIT = 1000;

/**
 * Where x-only lines are solved: ±1000, widened in powers of two when the view goes
 * beyond, so a pan or zoom inside ±1000 never re-solves or changes the answer.
 */
export function solvingWindow(view: Viewport | null): { xmin: number; xmax: number } {
  if (!view || (view.xmin >= -SOLVE_LIMIT / 2 && view.xmax <= SOLVE_LIMIT / 2)) return { xmin: -SOLVE_LIMIT, xmax: SOLVE_LIMIT };
  const span = Math.max(1e-9, view.xmax - view.xmin);
  const size = 2 ** Math.ceil(Math.log2(span));
  const center = Math.round((view.xmin + view.xmax) / 2 / size) * size;
  return { xmin: Math.min(-SOLVE_LIMIT, center - 2 * size), xmax: Math.max(SOLVE_LIMIT, center + 2 * size) };
}
