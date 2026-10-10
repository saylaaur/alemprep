import { describe, expect, it } from 'vitest';
import { fineStep, followPick, onGrid, pickAt, snapAxis, snapToGrid, traceAlong, radii, type PickScene } from './pick';
import { gridSteps, toScreen } from './view';
import type { RealFn, Viewport } from './analyze';

const size = { width: 400, height: 320 };
const view: Viewport = { xmin: -6, xmax: 6, ymin: -4.8, ymax: 4.8 };

function scene(curves: RealFn[][], extra: Partial<PickScene> = {}): PickScene {
  const v = extra.view ?? view;
  return {
    view: v, size,
    gridX: gridSteps(v.xmax - v.xmin, size.width),
    gridY: gridSteps(v.ymax - v.ymin, size.height, { minPixels: 40 }),
    curves, ...extra,
  };
}

const at = (x: number, y: number, v: Viewport = view) => toScreen(v, size, x, y);

describe('snapToGrid', () => {
  it('a tap a few pixels off (3; 3) selects exactly (3; 3)', () => {
    const p = at(3.11, 2.93);
    const pick = snapToGrid(p.x, p.y, scene([]));
    expect(pick).toMatchObject({ x: 3, y: 3, level: 'lattice' });
  });

  it('a finger lands further off and still gets (3; 3); a mouse there means (3,5; 2,5)', () => {
    const p = at(3.45, 2.6);
    expect(snapToGrid(p.x, p.y, scene([]))).toMatchObject({ x: 3.5, y: 2.5 });
    expect(snapToGrid(p.x, p.y, scene([], { touch: true }))).toMatchObject({ x: 3, y: 3, level: 'lattice' });
  });

  it('between grid lines it rounds to the minor grid or a fine step, never to 3,11', () => {
    const p = at(3.62, -1.41);
    expect(snapToGrid(p.x, p.y, scene([]))).toMatchObject({ x: 3.5, y: -1.5, level: 'minor' });
    const q = at(3.31, -1.29);
    const pick = snapToGrid(q.x, q.y, scene([]));
    expect(pick).toMatchObject({ x: 3.4, y: -1.2, level: 'fine' });
  });

  it('zoomed in, the grid gets finer and so does snapping', () => {
    const zoomed: Viewport = { xmin: 2.9, xmax: 3.3, ymin: 2.9, ymax: 3.22 };
    const p = at(3.1237, 3.0412, zoomed);
    const pick = snapToGrid(p.x, p.y, scene([], { view: zoomed }));
    expect(Math.abs(pick.x - 3.1237)).toBeLessThan(0.006);
    expect(String(pick.x).length).toBeLessThanOrEqual(5);
  });
});

describe('pickAt on curves', () => {
  const line: RealFn = (x) => x;
  const parabola: RealFn = (x) => x * x - 4 * x + 3;

  it('a tap near (3; 3) on y = x gives exactly (3; 3)', () => {
    const p = at(3.12, 3.05);
    expect(pickAt(p.x, p.y, scene([[line]]))).toMatchObject({ kind: 'curve', curve: 0, x: 3, y: 3, level: 'lattice' });
  });

  it('a tap on a parabola between lattice points rounds x and reads y from the curve', () => {
    const p = at(2.58, parabola(2.58));
    expect(pickAt(p.x, p.y, scene([[parabola]]))).toMatchObject({ kind: 'curve', x: 2.5, y: -0.75, level: 'minor' });
    // Near the vertex the lattice point (2; −1) wins.
    const v = at(2.27, parabola(2.27));
    expect(pickAt(v.x, v.y, scene([[parabola]]))).toMatchObject({ kind: 'curve', x: 2, y: -1, level: 'lattice' });
    // Where no round x is close, a round y is used and x is solved on the curve.
    const q = at(3.27, parabola(3.27));
    const pick = pickAt(q.x, q.y, scene([[parabola]]));
    expect(pick).toMatchObject({ kind: 'curve', y: 0.5, level: 'minor' });
    expect(pick!.x).toBeCloseTo(2 + Math.sqrt(1.5), 9);
  });

  it('picks lattice points on a steep line through (1; 3)', () => {
    const steep: RealFn = (x) => 10 * x - 7;
    const p = at(1.012, 3.2);
    expect(pickAt(p.x, p.y, scene([[steep]]))).toMatchObject({ kind: 'curve', x: 1, y: 3 });
  });

  it('finds a steep line even when the tap is beside it', () => {
    const steep: RealFn = (x) => 40 * x;
    const p = at(0.06, 2);
    const pick = pickAt(p.x, p.y, scene([[steep]]));
    expect(pick?.kind).toBe('curve');
    expect(Math.abs(pick!.y - 40 * pick!.x)).toBeLessThan(1e-9);
  });

  it('key points win over curves and the grid', () => {
    const p = at(1.05, 0.08);
    expect(pickAt(p.x, p.y, scene([[parabola]], { markers: [{ x: 1, y: 0 }, { x: 3, y: 0 }] }))).toMatchObject({ kind: 'marker', index: 0, x: 1, y: 0 });
  });

  it('the empty plane snaps to the grid, or gives nothing when the grid is off', () => {
    const p = at(-4.04, 3.97);
    expect(pickAt(p.x, p.y, scene([[parabola]]))).toMatchObject({ kind: 'grid', x: -4, y: 4 });
    expect(pickAt(p.x, p.y, scene([[parabola]]), { grid: false })).toBeNull();
  });

  it('does not stick to the jump of 1/x at its asymptote', () => {
    const hyperbola: RealFn = (x) => (x === 0 ? NaN : 1 / x);
    const p = at(0, 3);
    const pick = pickAt(p.x, p.y, scene([[hyperbola]]));
    if (pick?.kind === 'curve') expect(Math.abs(pick.y - 1 / pick.x)).toBeLessThan(1e-9);
    else expect(pick?.kind).toBe('grid');
  });

  it('vertical lines give their x and a snapped y', () => {
    const p = at(2.03, 1.96);
    expect(pickAt(p.x, p.y, scene([], { verticals: [{ curve: 1, x: 2 }] }))).toMatchObject({ kind: 'vertical', curve: 1, x: 2, y: 2 });
  });

  it('closest of two curves wins', () => {
    const p = at(1, 1.1);
    const pick = pickAt(p.x, p.y, scene([[(x) => x], [(x) => -x]]));
    expect(pick).toMatchObject({ kind: 'curve', curve: 0, x: 1, y: 1 });
  });
});

describe('traceAlong', () => {
  it('sticks to round x while dragging and to key points', () => {
    const fn: RealFn = (x) => x * x;
    const s = scene([[fn]]);
    const near = at(2.03, 4.1);
    expect(traceAlong(fn, near.x, near.y, s)).toMatchObject({ x: 2, y: 4 });
    const marker = at(0.04, 0);
    expect(traceAlong(fn, marker.x, marker.y, s, [{ x: 0, y: 0, index: 3 }])).toMatchObject({ kind: 'marker', index: 3 });
  });

  it('follows the pointer x when the finger is far above the curve', () => {
    const fn: RealFn = (x) => x / 2;
    const p = at(1.62, 4);
    expect(traceAlong(fn, p.x, p.y, scene([[fn]]))).toMatchObject({ x: 1.5, y: 0.75 });
  });
});

describe('helpers', () => {
  it('onGrid tolerates float noise', () => {
    expect(onGrid(0.1 * 3, 0.1)).toBe(true);
    expect(onGrid(0.35, 0.2)).toBe(false);
  });
  it('snapAxis prefers major, then minor, then fine', () => {
    const grid = { major: 1, minor: 0.2, pi: false };
    const zone = radii(false);
    expect(snapAxis(2.98, grid, 0.05, 33, zone)).toEqual({ value: 3, level: 'major' });
    expect(snapAxis(2.41, grid, 0.05, 33, zone)).toEqual({ value: 2.4, level: 'minor' });
    expect(snapAxis(2.31, grid, 0.05, 100, zone)).toEqual({ value: 2.3, level: 'fine' });
    // On a 2-grid, integers come before halves.
    expect(snapAxis(2.9, { major: 2, minor: 0.5, pi: false }, 0.2, 33, zone)).toEqual({ value: 3, level: 'major' });
  });
  it('fineStep is about four pixels', () => {
    expect(fineStep(12, 400)).toBe(0.2);
    expect(fineStep(1, 400)).toBe(0.01);
  });
});

describe('followPick (review 2026-10-10)', () => {
  it('keeps a point on a line at the same x when the line changes', () => {
    const pick = { kind: 'curve', curve: 0, branch: 0, x: 1, y: -4, level: 'major' } as const;
    const moved = followPick(pick, [{ branches: [(x) => x * x - 2 * x - 2] }]);
    expect(moved).toMatchObject({ kind: 'curve', x: 1, y: -3 });
  });

  it('drops the point when the line no longer passes there', () => {
    const pick = { kind: 'curve', curve: 0, branch: 0, x: -1, y: 1, level: 'major' } as const;
    expect(followPick(pick, [{ branches: [Math.sqrt] }])).toBeNull();
    expect(followPick(pick, [])).toBeNull();
    const vertical = { kind: 'vertical', curve: 0, x: 3, y: 1, level: 'major' } as const;
    expect(followPick(vertical, [{ branches: [], verticals: [3] }])).toBe(vertical);
    expect(followPick(vertical, [{ branches: [], verticals: [2] }])).toBeNull();
  });
});
