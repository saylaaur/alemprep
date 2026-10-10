/**
 * What a tap or a click on the graph selects, with "magnetic" snapping:
 * key points first, then a curve (snapped to grid lines and lattice points
 * it passes through), then the plane itself (snapped to the grid). Tapping
 * near (3; 3) gives exactly (3; 3), not (3,11; 2,94). Pure functions,
 * unit-tested in pick.test.ts.
 */
import { niceStep, snap, type RealFn, type Viewport } from './analyze';
import { clean, spanX, spanY, toScreen, toWorld, type GridSteps, type Size } from './view';

/** How "round" the picked point is, best first. */
export type SnapLevel = 'lattice' | 'major' | 'minor' | 'fine';

export type Pick =
  | { kind: 'marker'; index: number; x: number; y: number }
  | { kind: 'curve'; curve: number; branch: number; x: number; y: number; level: SnapLevel }
  | { kind: 'vertical'; curve: number; x: number; y: number; level: SnapLevel }
  | { kind: 'grid'; x: number; y: number; level: SnapLevel };

export type PickScene = {
  view: Viewport;
  size: Size;
  /** Grid steps of each axis (as drawn). */
  gridX: GridSteps;
  gridY: GridSteps;
  /** Branches of every curve, indexed by curve. */
  curves: RealFn[][];
  /** Vertical lines x = c, with the curve they belong to. */
  verticals?: { curve: number; x: number }[];
  markers?: { x: number; y: number }[];
  /** Fingers are less precise than a mouse: bigger snapping zones. */
  touch?: boolean;
};

export type Radii = { marker: number; curve: number; lattice: number; major: number; minor: number };

/** Snapping zones in CSS pixels. */
export function radii(touch = false): Radii {
  return touch
    ? { marker: 26, curve: 26, lattice: 22, major: 16, minor: 9 }
    : { marker: 15, curve: 14, lattice: 13, major: 9, minor: 6 };
}

/** About four pixels per step: the finest rounding used for coordinates. */
export function fineStep(span: number, pixels: number): number {
  return niceStep(span, pixels, 4);
}

const RANK: Record<SnapLevel, number> = { lattice: 0, major: 1, minor: 2, fine: 3 };

export function onGrid(value: number, step: number): boolean {
  if (!(step > 0) || !Number.isFinite(value)) return false;
  const ratio = value / step;
  return Math.abs(ratio - Math.round(ratio)) < 1e-7 * Math.max(1, Math.abs(ratio));
}

/**
 * Rounding steps of one axis, roundest first: the major grid, a power of ten
 * between major and minor (1 when the major grid is 2), the minor grid.
 */
export function snapLadder(grid: GridSteps): { step: number; level: 'major' | 'minor' }[] {
  const ladder: { step: number; level: 'major' | 'minor' }[] = [{ step: grid.major, level: 'major' }];
  if (!grid.pi) {
    const decade = Math.pow(10, Math.floor(Math.log10(grid.major) - 1e-9));
    if (decade < grid.major * (1 - 1e-9) && decade > grid.minor * (1 + 1e-9)) ladder.push({ step: clean(decade), level: 'major' });
  }
  ladder.push({ step: grid.minor, level: 'minor' });
  return ladder;
}

/** The step of "round" lattice points: integers on a 1- or 2-grid, multiples of 5 on a 5-grid. */
export function latticeStep(grid: GridSteps): number {
  const ladder = snapLadder(grid);
  return ladder.length === 3 ? ladder[1].step : ladder[0].step;
}

/** Rounds one coordinate to the roundest grid whose line is within reach. */
export function snapAxis(value: number, grid: GridSteps, fine: number, pixelsPerUnit: number, zone: Radii): { value: number; level: SnapLevel } {
  for (const { step, level } of snapLadder(grid)) {
    const rounded = clean(Math.round(value / step) * step);
    if (Math.abs(rounded - value) * pixelsPerUnit <= zone[level]) return { value: rounded, level };
  }
  return { value: clean(Math.round(value / fine) * fine), level: 'fine' };
}

/** Snaps a point of the empty plane: both coordinates to the grid. */
export function snapToGrid(px: number, py: number, scene: PickScene): Extract<Pick, { kind: 'grid' }> {
  const { view, size } = scene;
  const zone = radii(scene.touch);
  const world = toWorld(view, size, px, py);
  const unitX = size.width / spanX(view); const unitY = size.height / spanY(view);
  // A lattice point (round on both axes) catches the tap from a little further away.
  const stepX = latticeStep(scene.gridX); const stepY = latticeStep(scene.gridY);
  const lattice = { x: clean(Math.round(world.x / stepX) * stepX), y: clean(Math.round(world.y / stepY) * stepY) };
  const latticeScreen = toScreen(view, size, lattice.x, lattice.y);
  if (Math.hypot(latticeScreen.x - px, latticeScreen.y - py) <= zone.lattice) return { kind: 'grid', ...lattice, level: 'lattice' };
  const sx = snapAxis(world.x, scene.gridX, fineStep(spanX(view), size.width), unitX, zone);
  const sy = snapAxis(world.y, scene.gridY, fineStep(spanY(view), size.height), unitY, zone);
  const level: SnapLevel = RANK[sx.level] > RANK[sy.level] ? sx.level : sy.level;
  const isLattice = onGrid(sx.value, stepX) && onGrid(sy.value, stepY);
  return { kind: 'grid', x: sx.value, y: sy.value, level: isLattice ? 'lattice' : level };
}

/** Bisection for fn(x) = target between a and b (fn(a) − target and fn(b) − target differ in sign). */
function solveBetween(fn: RealFn, target: number, a: number, b: number): number | null {
  let left = a; let right = b;
  let fl = fn(left) - target;
  if (!Number.isFinite(fl)) return null;
  for (let iteration = 0; iteration < 60; iteration++) {
    const middle = (left + right) / 2;
    const fm = fn(middle) - target;
    if (!Number.isFinite(fm)) return null;
    if (fm === 0) return middle;
    if (Math.sign(fm) === Math.sign(fl)) { left = middle; fl = fm; } else right = middle;
  }
  return (left + right) / 2;
}

type Candidate = { x: number; y: number; distance: number; level: SnapLevel };

/**
 * The point of a branch closest to the pointer (in pixels), searched within
 * `reach` pixels; also finds where steep parts cross the pointer's level.
 */
export function nearestOnBranch(fn: RealFn, px: number, py: number, view: Viewport, size: Size, reach: number): Candidate | null {
  const perPixel = spanX(view) / size.width;
  const target = toWorld(view, size, px, py).y;
  let best: Candidate | null = null;
  const consider = (x: number, y: number) => {
    if (!Number.isFinite(y)) return;
    const screen = toScreen(view, size, x, y);
    const distance = Math.hypot(screen.x - px, screen.y - py);
    if (distance <= reach && (!best || distance < best.distance)) best = { x, y, distance, level: 'fine' };
  };
  const steps = Math.ceil(reach) * 2;
  let previous: { x: number; y: number } | null = null;
  for (let index = -steps; index <= steps; index++) {
    const x = view.xmin + (px + index * 0.5) * perPixel;
    const y = fn(x);
    consider(x, y);
    if (previous && Number.isFinite(y) && Math.sign(previous.y - target) !== Math.sign(y - target)) {
      // A steep stretch passes the pointer's height between two samples.
      const root = solveBetween(fn, target, previous.x, x);
      if (root !== null) {
        const value = fn(root);
        // Only a real crossing, not the jump at an asymptote.
        if (Number.isFinite(value) && Math.abs(toScreen(view, size, root, value).y - py) < 1.5) consider(root, value);
      }
    }
    previous = Number.isFinite(y) ? { x, y } : null;
  }
  return best;
}

/**
 * Rounds a point found on a branch: to a lattice point the branch passes
 * through, else to the nearest grid line it crosses, else to a fine step.
 */
export function snapOnBranch(fn: RealFn, raw: { x: number; y: number }, px: number, py: number, scene: PickScene): Candidate {
  const { view, size } = scene;
  const zone = radii(scene.touch);
  const unitY = size.height / spanY(view);
  const fineX = fineStep(spanX(view), size.width);
  const stepX = latticeStep(scene.gridX); const stepY = latticeStep(scene.gridY);
  type Scored = Candidate & { score: number };
  const candidates: Scored[] = [];
  const add = (x: number, y: number, level: SnapLevel, penalty: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const screen = toScreen(view, size, x, y);
    const distance = Math.hypot(screen.x - px, screen.y - py);
    const lattice = onGrid(x, stepX) && onGrid(y, stepY);
    candidates.push({ x, y, distance, level: lattice ? 'lattice' : level, score: distance + (lattice ? 0 : penalty) });
  };
  // x on a grid line, y read from the curve.
  for (const { step, level } of snapLadder(scene.gridX)) {
    const x = clean(Math.round(raw.x / step) * step);
    add(x, fn(x), level, 0);
  }
  // y on a grid line, x solved on the curve near the raw point (helps on steep curves).
  const window = (zone.curve * spanX(view)) / size.width;
  for (const { step, level } of snapLadder(scene.gridY)) {
    const y = clean(Math.round(raw.y / step) * step);
    if (Math.abs(y - raw.y) * unitY > zone.curve) continue;
    let previous = raw.x - window; let previousValue = fn(previous) - y;
    for (let index = 1; index <= 24; index++) {
      const x = raw.x - window + (index / 12) * window;
      const value = fn(x) - y;
      if (value === 0) add(x, y, level, 4);
      else if (Number.isFinite(value) && Number.isFinite(previousValue) && previousValue !== 0 && Math.sign(value) !== Math.sign(previousValue)) {
        const root = solveBetween(fn, y, previous, x);
        // A round y with an unround x reads worse than a round x: small penalty.
        if (root !== null && Math.abs(fn(root) - y) <= 1e-9 * Math.max(1, Math.abs(y))) add(clean(snap(root)), y, level, 4);
      }
      previous = x; previousValue = value;
    }
  }
  const reach: Record<SnapLevel, number> = { lattice: zone.lattice, major: zone.major + 2, minor: zone.minor + 2, fine: Infinity };
  const usable = candidates.filter((candidate) => candidate.level !== 'fine' && candidate.distance <= reach[candidate.level]);
  usable.sort((a, b) => RANK[a.level] - RANK[b.level] || a.score - b.score);
  const chosen = usable[0];
  if (chosen) return { x: clean(chosen.x), y: clean(snap(chosen.y)), distance: chosen.distance, level: chosen.level };
  // Fine rounding of x, unless the curve is so steep there that it would jump away from the finger.
  const x = clean(Math.round(raw.x / fineX) * fineX);
  const y = fn(x);
  if (Number.isFinite(y)) {
    const screen = toScreen(view, size, x, y);
    const distance = Math.hypot(screen.x - px, screen.y - py);
    if (distance <= zone.curve + 4) return { x, y: clean(snap(y)), distance, level: 'fine' };
  }
  return { x: raw.x, y: raw.y, distance: 0, level: 'fine' };
}

/** Everything the pointer could mean at (px, py); null on the empty plane when `grid` is off. */
export function pickAt(px: number, py: number, scene: PickScene, options: { grid?: boolean } = {}): Pick | null {
  const { view, size } = scene;
  const zone = radii(scene.touch);
  // 1. Key points and typed points.
  let marker: { index: number; distance: number } | null = null;
  const markers = scene.markers ?? [];
  for (let index = 0; index < markers.length; index++) {
    const point = markers[index];
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const screen = toScreen(view, size, point.x, point.y);
    const distance = Math.hypot(screen.x - px, screen.y - py);
    if (distance <= zone.marker && (!marker || distance < marker.distance)) marker = { index, distance };
  }
  if (marker) return { kind: 'marker', index: marker.index, x: markers[marker.index].x, y: markers[marker.index].y };
  // 2. The closest curve or vertical line.
  let best: { curve: number; branch: number; candidate: Candidate } | null = null;
  for (let curve = 0; curve < scene.curves.length; curve++) {
    for (let branch = 0; branch < scene.curves[curve].length; branch++) {
      const candidate = nearestOnBranch(scene.curves[curve][branch], px, py, view, size, zone.curve);
      if (candidate && (!best || candidate.distance < best.candidate.distance)) best = { curve, branch, candidate };
    }
  }
  let vertical: { curve: number; x: number; distance: number } | null = null;
  for (const line of scene.verticals ?? []) {
    const distance = Math.abs(toScreen(view, size, line.x, 0).x - px);
    if (distance <= zone.curve && (!vertical || distance < vertical.distance)) vertical = { ...line, distance };
  }
  if (vertical && (!best || vertical.distance < best.candidate.distance)) {
    const y = snapAxis(toWorld(view, size, px, py).y, scene.gridY, fineStep(spanY(view), size.height), size.height / spanY(view), zone);
    return { kind: 'vertical', curve: vertical.curve, x: vertical.x, y: y.value, level: y.level };
  }
  if (best) {
    const snapped = snapOnBranch(scene.curves[best.curve][best.branch], best.candidate, px, py, scene);
    return { kind: 'curve', curve: best.curve, branch: best.branch, x: snapped.x, y: snapped.y, level: snapped.level };
  }
  // 3. The plane.
  return options.grid === false ? null : snapToGrid(px, py, scene);
}

/**
 * Dragging along one branch (trace): follows the pointer's x, sticks to key
 * points of the same curve and to round coordinates on the way.
 */
export function traceAlong(fn: RealFn, px: number, py: number, scene: PickScene, markers: { x: number; y: number; index: number }[] = []): Pick | null {
  const { view, size } = scene;
  const zone = radii(scene.touch);
  for (const marker of markers) {
    const screen = toScreen(view, size, marker.x, marker.y);
    if (Math.abs(screen.x - px) <= zone.marker * 0.6) return { kind: 'marker', index: marker.index, x: marker.x, y: marker.y };
  }
  const x = toWorld(view, size, px, py).x;
  const y = fn(x);
  // Near the pointer if the curve is close; otherwise straight above or below it (x decides).
  const near = nearestOnBranch(fn, px, py, view, size, zone.curve * 2);
  const raw = near ?? (Number.isFinite(y) ? { x, y, distance: 0, level: 'fine' as const } : null);
  if (!raw) return null;
  const target = toScreen(view, size, raw.x, raw.y);
  const snapped = snapOnBranch(fn, raw, target.x, target.y, scene);
  return { kind: 'curve', curve: -1, branch: -1, x: snapped.x, y: snapped.y, level: snapped.level };
}

/**
 * A point picked on a line, after the lines changed (a slider moved, a value was typed):
 * the same x on the same line, or null when the line no longer passes there.
 * Grid points stay; key points (markers) are followed by their index elsewhere.
 */
export function followPick(pick: Pick, curves: { branches: RealFn[]; verticals?: number[] }[]): Pick | null {
  if (pick.kind === 'curve') {
    const y = curves[pick.curve]?.branches[pick.branch]?.(pick.x);
    return y !== undefined && Number.isFinite(y) ? { ...pick, y } : null;
  }
  if (pick.kind === 'vertical') return curves[pick.curve]?.verticals?.some((x) => Math.abs(x - pick.x) < 1e-9) ? pick : null;
  return pick;
}
