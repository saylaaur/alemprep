import { describe, expect, it } from 'vitest';
import { compile, parseExpression } from './parse';
import {
  analyze, autoViewport, formatIntervals, formatNumber, formatPoint, integrate, keyPoints,
  niceStep, piStep, sampleSegments, settlesBeyond, snap, solveRelation, type Interval, type Relation,
} from './analyze';

function fn(input: string): (x: number) => number {
  const result = parseExpression(input);
  if (!result.ok) throw new Error(input);
  const compiled = compile(result.node);
  return (x) => compiled(x);
}
const W = { xmin: -10, xmax: 10 };
const { PI } = Math;
const close = (actual: number[], expected: number[], digits = 6) => {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], digits));
};
const solve = (left: string, relation: Relation, right: string, window = W) => formatIntervals(solveRelation(fn(left), relation, fn(right), window), window);

describe('analyze: roots, extrema, asymptotes', () => {
  it('quadratic: two roots and the vertex', () => {
    const result = analyze(fn('x^2 - 4x + 3'), -10, 10);
    expect(result.roots).toEqual([1, 3]);
    expect(result.minima).toEqual([2]);
    expect(result.maxima).toEqual([]);
    expect(result.asymptotes).toEqual([]);
  });

  it('cubic: irrational roots and both extrema', () => {
    const result = analyze(fn('x^3 - 3x'), -10, 10);
    close(result.roots, [-Math.sqrt(3), 0, Math.sqrt(3)]);
    expect(result.maxima).toEqual([-1]);
    expect(result.minima).toEqual([1]);
  });

  it('f(x) = x^3 - 6x^2 + 9x - 4: max at 1 (touching root), min at 3, root at 4', () => {
    const result = analyze(fn('x^3 - 6x^2 + 9x - 4'), -10, 10);
    expect(result.roots).toEqual([1, 4]);
    expect(result.maxima).toEqual([1]);
    expect(result.minima).toEqual([3]);
  });

  it('touching zero counts as a root: (x-1)^2, |x|', () => {
    expect(analyze(fn('(x-1)^2'), -10, 10).roots).toEqual([1]);
    expect(analyze(fn('|x|'), -10, 10)).toMatchObject({ roots: [0], minima: [0] });
  });

  it('quartic with three roots and a W shape', () => {
    const result = analyze(fn('x^4 - 2x^2'), -10, 10);
    close(result.roots, [-Math.SQRT2, 0, Math.SQRT2]);
    expect(result.maxima).toEqual([0]);
    expect(result.minima).toEqual([-1, 1]);
  });

  it('rational functions: poles are asymptotes, not roots', () => {
    expect(analyze(fn('1/x'), -10, 10)).toEqual({ roots: [], asymptotes: [0], maxima: [], minima: [] });
    expect(analyze(fn('1/x^2'), -10, 10).asymptotes).toEqual([0]);
    expect(analyze(fn('\\frac{x+1}{x-2}'), -10, 10)).toMatchObject({ roots: [-1], asymptotes: [2] });
    expect(analyze(fn('\\frac{1}{x^2-4}'), -10, 10)).toMatchObject({ roots: [], asymptotes: [-2, 2], maxima: [0] });
    expect(analyze(fn('\\frac{1}{x - 2} + 1'), -10, 10)).toMatchObject({ roots: [1], asymptotes: [2] });
    expect(analyze(fn('\\frac{x-2}{x+1}'), -10, 10)).toMatchObject({ roots: [2], asymptotes: [-1] });
    expect(analyze(fn('\\frac{x}{x^2+1}'), -10, 10)).toEqual({ roots: [0], asymptotes: [], maxima: [1], minima: [-1] });
  });

  it('a removable gap is neither a root nor an asymptote', () => {
    expect(analyze(fn('\\frac{x^2-1}{x-1}'), -10, 10)).toMatchObject({ roots: [-1], asymptotes: [] });
  });

  it('logarithms: domain edge is an asymptote', () => {
    expect(analyze(fn('\\ln x'), -10, 10)).toMatchObject({ roots: [1], asymptotes: [0] });
    expect(analyze(fn('\\lg x'), -10, 10)).toMatchObject({ roots: [1], asymptotes: [0] });
    expect(analyze(fn('\\log_2(x-1)'), -10, 10)).toMatchObject({ roots: [2], asymptotes: [1] });
    expect(analyze(fn('\\log_{\\frac{1}{3}} x'), -10, 10)).toMatchObject({ roots: [1], asymptotes: [0] });
    expect(analyze(fn('\\ln x + \\frac{2}{x}'), -10, 10)).toMatchObject({ roots: [], asymptotes: [0], minima: [2] });
  });

  it('x ln x tends to 0 at 0 but x = 0 is outside the domain, so it is no root', () => {
    const result = analyze(fn('x\\ln x'), -10, 10);
    expect(result.roots).toEqual([1]);
    expect(result.minima[0]).toBeCloseTo(1 / Math.E, 6);
  });

  it('square roots: the domain edge value 0 is a root, no asymptote', () => {
    expect(analyze(fn('\\sqrt{x}'), -10, 10)).toEqual({ roots: [0], asymptotes: [], maxima: [], minima: [] });
    expect(analyze(fn('\\sqrt{4-x^2}'), -10, 10)).toMatchObject({ roots: [-2, 2], asymptotes: [], maxima: [0] });
    close(analyze(fn('\\sqrt{x^2-2}'), -10, 10).roots, [-Math.SQRT2, Math.SQRT2]);
    expect(analyze(fn('\\sqrt{x+3}'), -10, 10)).toMatchObject({ roots: [-3], asymptotes: [] });
    expect(analyze(fn('\\sqrt{x} + 1'), -10, 10)).toMatchObject({ roots: [], asymptotes: [] });
  });

  it('odd roots and odd powers pass through 0 without extrema', () => {
    expect(analyze(fn('\\sqrt[3]{x}'), -10, 10)).toEqual({ roots: [0], asymptotes: [], maxima: [], minima: [] });
    expect(analyze(fn('x^3'), -10, 10)).toEqual({ roots: [0], asymptotes: [], maxima: [], minima: [] });
  });

  it('tangent and cotangent: roots and asymptotes alternate at multiples of π/2', () => {
    const tan = analyze(fn('\\operatorname{tg} x'), -5, 5);
    close(tan.roots, [-PI, 0, PI]);
    close(tan.asymptotes, [-1.5 * PI, -PI / 2, PI / 2, 1.5 * PI]);
    expect(tan.maxima).toEqual([]);
    const cot = analyze(fn('ctg x'), -4, 4);
    close(cot.roots, [-PI / 2, PI / 2]);
    close(cot.asymptotes, [-PI, 0, PI]);
  });

  it('sine extrema snap to exact multiples of π', () => {
    const result = analyze(fn('\\sin x'), -4, 4);
    expect(result.roots).toEqual([-PI, 0, PI]);
    expect(result.maxima).toEqual([PI / 2]);
    expect(result.minima).toEqual([-PI / 2]);
  });

  it('the exponent has no special points', () => {
    expect(analyze(fn('e^x'), -10, 10)).toEqual({ roots: [], asymptotes: [], maxima: [], minima: [] });
    expect(analyze(fn('(x - 2)^2 e^x'), -10, 10)).toMatchObject({ roots: [2], maxima: [0], minima: [2] });
  });
});

describe('keyPoints', () => {
  it('lists roots, the y-intercept and the vertex sorted by x', () => {
    expect(keyPoints([fn('x^2 - 4x + 3')], W)).toEqual([
      { kind: 'y-intercept', x: 0, y: 3, curves: [0] },
      { kind: 'root', x: 1, y: 0, curves: [0] },
      { kind: 'min', x: 2, y: -1, curves: [0] },
      { kind: 'root', x: 3, y: 0, curves: [0] },
    ]);
  });

  it('merges a vertex on the axis with the root instead of drawing two markers', () => {
    const points = keyPoints([fn('(x-1)^2')], W);
    expect(points.filter((point) => point.x === 1)).toHaveLength(1);
  });

  it('marks asymptotes with y = NaN', () => {
    const points = keyPoints([fn('\\frac{x+1}{x-2}')], W);
    expect(points.map((point) => point.kind)).toEqual(['root', 'y-intercept', 'asymptote']);
    expect(points[2].x).toBe(2);
    expect(points[2].y).toBeNaN();
    expect(points[1].y).toBe(-0.5);
  });

  it('finds intersections of two curves and shares markers on the axis', () => {
    const points = keyPoints([fn('x^2'), fn('2x + 3')], W);
    const intersections = points.filter((point) => point.kind === 'intersection');
    expect(intersections.map((point) => [point.x, point.y])).toEqual([[-1, 1], [3, 9]]);
    expect(intersections.every((point) => point.curves.join() === '0,1')).toBe(true);
    // y = x² and y = 2x + 3 share no y-intercept, but y = |x| and y = x do share (0; 0).
    const shared = keyPoints([fn('|x|'), fn('x')], W).find((point) => point.x === 0);
    expect(shared?.curves.sort()).toEqual([0, 1]);
  });

  it('a plateau like |x-1| + |x+1| on [−1; 1] has no extremum markers', () => {
    expect(keyPoints([fn('|x-1|+|x+1|')], W).map((point) => point.kind)).toEqual(['y-intercept']);
  });

  it('constant functions get no roots or y-intercept, parallel lines no intersections', () => {
    expect(keyPoints([fn('4')], W)).toEqual([]);
    expect(keyPoints([fn('2x'), fn('2x+1')], W).filter((point) => point.kind === 'intersection')).toEqual([]);
  });
});

describe('solveRelation and formatIntervals', () => {
  it.each([
    ['x^2 - 4x + 3', '>', '0', '(−∞; 1) ∪ (3; +∞)'],
    ['x^2 - 4x + 3', '<=', '0', '[1; 3]'],
    ['x^2 - 4x + 3', '!=', '0', '(−∞; 1) ∪ (1; 3) ∪ (3; +∞)'],
    ['x^2 - 1', '<', '0', '(−1; 1)'],
    ['x^2 - 9', '<', '0', '(−3; 3)'],
    ['-x^2+6x-5', '>=', '0', '[1; 5]'],
    ['x^2 - 4x + 5', '>=', '0', '(−∞; +∞)'],
    ['x^2 - 4x + 5', '<', '0', '∅'],
    ['(x-1)^2', '<=', '0', '{1}'],
    ['(x-1)^2', '<', '0', '∅'],
    ['(x-1)^2', '>', '0', '(−∞; 1) ∪ (1; +∞)'],
    ['(x-1)^2', '>=', '0', '(−∞; +∞)'],
    ['(x-2)^2(x+1)', '>=', '0', '[−1; +∞)'],
    ['(x-2)^2(x+1)', '<=', '0', '(−∞; −1] ∪ {2}'],
    ['2x - 3', '>', '5', '(4; +∞)'],
    ['|2x - 8| + |x - 3|', '<=', '4', '[7/3; 5]'],
    ['\\frac{x+1}{x-2}', '>=', '0', '(−∞; −1] ∪ (2; +∞)'],
    // Regression: bisection used to land exactly on the pole x = −1 and lose the asymptote.
    ['\\frac{x-2}{x+1}', '>=', '0', '(−∞; −1) ∪ [2; +∞)'],
    ['(x-2)/(x+1)', '<', '0', '(−1; 2)'],
    ['\\frac{(x-3)(x+2)}{x-1}', '<', '0', '(−∞; −2) ∪ (1; 3)'],
    ['\\dfrac{x^2-4}{x+3}', '>=', '0', '(−3; −2] ∪ [2; +∞)'],
    ['\\frac{1}{x}', '<', '1', '(−∞; 0) ∪ (1; +∞)'],
    ['\\ln x', '>', '0', '(1; +∞)'],
    ['\\log_2(x-1)', '<=', '3', '(1; 9]'],
    ['\\sqrt{x-1}', '<', '3-x', '[1; 2)'],
    ['\\sqrt{x}', '>=', '0', '[0; +∞)'],
    ['\\sqrt{x+3}', '>', '1', '(−2; +∞)'],
    ['\\left(\\frac{1}{2}\\right)^{x+1}', '<=', '8', '[−4; +∞)'],
    ['13^{4-x} - 1', '>', '0', '(−∞; 4)'],
    ['3^{2x-1}', '<=', '27', '(−∞; 2]'],
    ['\\left(\\frac{1}{3}\\right)^x', '>', '9', '(−∞; −2)'],
    ['x^2', '=', '4', '{−2; 2}'],
    ['|x - 3|', '=', '5', '{−2; 8}'],
    ['\\sqrt{x + 2}', '=', 'x', '{2}'],
    ['x^2 - 6x + 9', '=', '0', '{3}'],
    ['\\log_2(x+1) + \\log_2(x-1)', '=', '3', '{3}'],
    ['2^x', '=', '3 - x', '{1}'],
  ] as [string, Relation, string, string][])('%s %s %s → %s', (left, relation, right, expected) => {
    expect(solve(left, relation, right)).toBe(expected);
  });

  it('keeps open ends at excluded points and closed ends at included ones', () => {
    const intervals = solveRelation(fn('\\frac{x+1}{x-2}'), '>=', fn('0'), W);
    expect(intervals).toEqual([
      { from: -10, to: -1, fromClosed: false, toClosed: true },
      { from: 2, to: 10, fromClosed: false, toClosed: false },
    ]);
  });

  it('isolated points of non-strict inequalities are single-point intervals', () => {
    expect(solveRelation(fn('(x-1)^2'), '<=', fn('0'), W)).toEqual([{ from: 1, to: 1, fromClosed: true, toClosed: true }]);
  });

  it('trigonometric equations give every root in the window', () => {
    const window = { xmin: 0, xmax: 2 * PI };
    expect(solve('\\cos x', '=', '\\frac{\\sqrt{2}}{2}', window)).toBe('{π/4; 7π/4}');
    expect(solve('2\\sin x - 1', '=', '0', { xmin: 0, xmax: PI })).toBe('{π/6; 5π/6}');
    expect(solve('\\cos 2x + \\sin x', '=', '0', window)).toBe('{π/2; 7π/6; 11π/6}');
  });

  it('roots of ln²x − 3 ln x = 0 are 1 and e³', () => {
    const roots = solveRelation(fn('ln^2x - 3lnx'), '=', fn('0'), { xmin: 0, xmax: 30 }).map((interval) => interval.from);
    close(roots, [1, Math.exp(3)]);
  });
});

describe('formatIntervals (direct)', () => {
  const window = { xmin: -10, xmax: 10 };
  const interval = (from: number, to: number, fromClosed = false, toClosed = false): Interval => ({ from, to, fromClosed, toClosed });
  it('writes school notation', () => {
    expect(formatIntervals([], window)).toBe('∅');
    expect(formatIntervals([interval(-10, 1), interval(3, 10)], window)).toBe('(−∞; 1) ∪ (3; +∞)');
    expect(formatIntervals([interval(-2.5, 0.5, true, false)], window)).toBe('[−2,5; 0,5)');
    expect(formatIntervals([interval(-10, 10)], window)).toBe('(−∞; +∞)');
    expect(formatIntervals([interval(1, 1, true, true)], window)).toBe('{1}');
    expect(formatIntervals([interval(-PI / 2, PI / 2, true, true)], window)).toBe('[−π/2; π/2]');
  });
  it('groups neighbouring single points and keeps them apart from intervals', () => {
    expect(formatIntervals([interval(-2, -2, true, true), interval(2, 2, true, true)], window)).toBe('{−2; 2}');
    expect(formatIntervals([interval(-10, -1, false, true), interval(2, 2, true, true)], window)).toBe('(−∞; −1] ∪ {2}');
    expect(formatIntervals([interval(0, 0, true, true), interval(1, 3, true, true), interval(5, 5, true, true)], window)).toBe('{0} ∪ [1; 3] ∪ {5}');
  });
});

describe('formatNumber', () => {
  it.each([
    [0, '0'], [-0, '0'], [1e-12, '0'], [3, '3'], [-3, '−3'],
    [0.5, '0,5'], [-0.5, '−0,5'], [2.345, '2,35'], [0.1 + 0.2, '0,3'], [1234567, '1234567'],
    [1 / 3, '1/3'], [-2 / 3, '−2/3'], [5 / 7, '5/7'], [1 / 9, '1/9'], [1 / 6, '1/6'], [7 / 3, '7/3'],
    [PI, 'π'], [PI / 2, 'π/2'], [-3 * PI / 4, '−3π/4'], [PI / 6, 'π/6'], [2 * PI, '2π'], [-PI, '−π'], [5 * PI / 6, '5π/6'],
    [Math.SQRT2, '1,41'], [Math.E, '2,72'],
    [NaN, '—'], [Infinity, '—'], [-Infinity, '—'],
  ])('%s → %s', (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });

  it('can turn π fractions off', () => {
    expect(formatNumber(PI, { pi: false })).toBe('3,14');
    expect(formatNumber(PI / 2, { pi: false })).toBe('1,57');
  });

  it('formats points as (x; y)', () => {
    expect(formatPoint(2, -1)).toBe('(2; −1)');
    expect(formatPoint(PI / 2, 1)).toBe('(π/2; 1)');
    expect(formatPoint(-0.5, 2.25)).toBe('(−0,5; 2,25)');
  });
});

describe('snap', () => {
  it('removes floating noise near nice numbers and π multiples', () => {
    expect(snap(0.30000000000000004)).toBe(0.3);
    expect(snap(1.9999999999)).toBe(2);
    expect(snap(1e-10)).toBe(0);
    expect(snap(PI / 3 + 1e-12)).toBe(PI / 3);
    expect(snap(Math.SQRT2)).toBe(Math.SQRT2);
    expect(snap(NaN)).toBeNaN();
    expect(Object.is(snap(-2e-9), 0)).toBe(true);
  });
});

describe('integrate', () => {
  it('computes definite integrals from ENT stems', () => {
    expect(integrate(fn('x^2 + 1'), 0, 2)).toBeCloseTo(14 / 3, 8);
    expect(integrate(fn('3x^2-2x'), -1, 2)).toBeCloseTo(6, 8);
    expect(integrate(fn('\\sin x'), 0, PI)).toBeCloseTo(2, 8);
    expect(integrate(fn('\\cos x'), 0, PI / 2)).toBeCloseTo(1, 8);
    expect(integrate(fn('\\frac{1}{x}'), 1, Math.E)).toBeCloseTo(1, 8);
    expect(integrate(fn('\\sqrt{x}'), 1, 4)).toBeCloseTo(14 / 3, 6);
  });
  it('is NaN when the integrand is undefined on the segment', () => {
    expect(integrate(fn('\\frac{1}{x}'), -1, 1)).toBeNaN();
    expect(integrate(fn('\\ln x'), -1, 1)).toBeNaN();
  });
});

describe('sampleSegments', () => {
  it('draws continuous curves in one piece', () => {
    expect(sampleSegments(fn('x^2'), -2, 2, 100, 10)).toHaveLength(1);
    expect(sampleSegments(fn('\\sin x'), -5, 5, 400, 10)).toHaveLength(1);
  });
  it('breaks at poles and at the domain edge', () => {
    expect(sampleSegments(fn('\\frac{1}{x}'), -2, 2, 400, 10)).toHaveLength(2);
    expect(sampleSegments(fn('\\operatorname{tg} x'), -5, 5, 1000, 10)).toHaveLength(5);
    const root = sampleSegments(fn('\\sqrt{x}'), -2, 2, 100, 10);
    expect(root).toHaveLength(1);
    expect(root[0][0].x).toBeGreaterThanOrEqual(0);
  });
  it('clamps huge values so the path stays drawable', () => {
    const points = sampleSegments(fn('\\frac{1}{x}'), -1, 1, 101, 5).flat();
    expect(points.every((point) => Math.abs(point.y) <= 20)).toBe(true);
  });
});

describe('autoViewport', () => {
  const contains = (viewport: { xmin: number; xmax: number; ymin: number; ymax: number }, x: number, y: number) =>
    viewport.xmin < x && x < viewport.xmax && viewport.ymin < y && y < viewport.ymax;
  const finiteViewport = (viewport: Record<string, number>) => Object.values(viewport).every(Number.isFinite);

  it.each([
    ['x^2 - 4x + 3', [[1, 0], [3, 0], [2, -1], [0, 3]]],
    ['x^3 - 3x', [[-1, 2], [1, -2], [0, 0]]],
    ['x^3 - 6x^2 + 9x - 4', [[1, 0], [3, -4], [4, 0], [0, -4]]],
    ['\\ln x', [[1, 0]]],
    ['\\sqrt{x+3}', [[-3, 0], [0, Math.sqrt(3)]]],
    ['\\frac{x+1}{x-2}', [[-1, 0], [0, -0.5]]],
    ['(x-15)^2', [[15, 0]]],
    ['\\frac{1}{x - 2} + 1', [[1, 0]]],
    ['e^x', [[0, 1]]],
  ] as [string, [number, number][]][])('%s: contains its key points and is finite', (input, points) => {
    const viewport = autoViewport([fn(input)]);
    expect(finiteViewport(viewport)).toBe(true);
    expect(viewport.xmin).toBeLessThan(viewport.xmax);
    expect(viewport.ymin).toBeLessThan(viewport.ymax);
    for (const [x, y] of points) expect(contains(viewport, x, y)).toBe(true);
  });

  it('shows both intersections of y = x² and y = 2x + 3', () => {
    const viewport = autoViewport([fn('x^2'), fn('2x + 3')]);
    expect(contains(viewport, -1, 1) && contains(viewport, 3, 9)).toBe(true);
  });

  it('uses ±2π for trigonometric graphs', () => {
    const viewport = autoViewport([fn('\\sin x')], { trig: true });
    expect([viewport.xmin, viewport.xmax]).toEqual([-2 * PI, 2 * PI]);
    expect(viewport.ymin).toBeLessThan(-1);
    expect(viewport.ymax).toBeGreaterThan(1);
  });

  it('keeps asymptotes from flattening the picture', () => {
    const viewport = autoViewport([fn('\\frac{100}{x}')]);
    expect(finiteViewport(viewport)).toBe(true);
    expect(viewport.ymax - viewport.ymin).toBeLessThan(500);
  });

  it('falls back to a default window for functions with nothing to show', () => {
    const viewport = autoViewport([fn('\\sqrt{-1-x^2}')]);
    expect(finiteViewport(viewport)).toBe(true);
    expect([viewport.xmin, viewport.xmax]).toEqual([-5, 5]);
  });

  it('always includes focus points such as segment ends or integral limits', () => {
    const viewport = autoViewport([fn('x^2')], { focus: [0, 30] });
    expect(contains(viewport, 30, 900)).toBe(true);
    expect(contains(autoViewport([fn('x^2')], { focus: [-2, 0] }), -2, 4)).toBe(true);
  });

  it('equal aspect keeps a circle round', () => {
    const viewport = autoViewport([(x) => Math.sqrt(25 - x * x), (x) => -Math.sqrt(25 - x * x)], { equalAspect: true, aspect: 0.75 });
    expect((viewport.ymax - viewport.ymin) / (viewport.xmax - viewport.xmin)).toBeCloseTo(0.75, 9);
    expect(contains(viewport, 0, 5) && contains(viewport, 0, -5) && contains(viewport, 5, 0) && contains(viewport, -5, 0)).toBe(true);
  });
});

describe('grid steps', () => {
  it('niceStep uses 1-2-5 spacing', () => {
    expect(niceStep(10, 500)).toBe(1);
    expect(niceStep(20, 500)).toBe(2);
    expect(niceStep(100, 500)).toBe(10);
    expect(niceStep(1, 500)).toBeCloseTo(0.1, 12);
  });
  it('piStep picks a multiple of π or gives up for huge spans', () => {
    expect(piStep(4 * PI, 500)).toBeCloseTo(PI / 2, 12);
    expect(piStep(PI, 600)).toBeCloseTo(PI / 6, 12);
    expect(piStep(1000, 500)).toBeNull();
  });
});

describe('settlesBeyond', () => {
  const diff = (left: string, right: string) => { const l = fn(left); const r = fn(right); return (x: number) => l(x) - r(x); };
  it('rejects answers that change outside a ±60 window', () => {
    expect(settlesBeyond(diff('sqrt(x)', '9'), 60)).toBe(false);
    expect(settlesBeyond(diff('log_2(x)', '7'), 60)).toBe(false);
    expect(settlesBeyond(diff('2x', '140'), 60)).toBe(false);
    expect(settlesBeyond(diff('x^3', '1000000'), 60)).toBe(false);
    expect(settlesBeyond(diff('(x-100)(x+100)', '0'), 60)).toBe(false);
    expect(settlesBeyond(diff('1/x', '0.001'), 60)).toBe(false);
    expect(settlesBeyond(diff('x^2', '3600'), 60)).toBe(false);
  });
  it('accepts answers that are complete inside the window', () => {
    expect(settlesBeyond(diff('x^2-4x+3', '0'), 60)).toBe(true);
    expect(settlesBeyond(diff('log_2(x)', '3'), 60)).toBe(true);
    expect(settlesBeyond(diff('x^2+1', '0'), 60)).toBe(true);
    expect(settlesBeyond(diff('2^x', '8'), 60)).toBe(true);
    expect(settlesBeyond(diff('1/x', '2'), 60)).toBe(true);
  });
});
