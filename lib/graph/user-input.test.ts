import { describe, expect, it } from 'vitest';
import { buildDefinitions, buildUserCurve, type UserCurve } from './user-input';
import { parseExpression, compile } from './parse';

type Ok = Extract<UserCurve, { ok: true }>;
const ok = (curve: UserCurve): Ok => {
  if (!curve.ok) throw new Error(`expected a curve, got ${curve.error}`);
  return curve;
};

describe('functions and equations', () => {
  it('draws y = f(x) with slider letters', () => {
    const curve = ok(buildUserCurve('a x^2 + b', { a: 2, b: -1 }));
    expect(curve.params).toEqual(['a', 'b']);
    expect(curve.branches[0](3)).toBe(17);
    expect(curve.latex).toBe('y = a x^{2} + b');
  });

  it('solves x and y equations for y (circle)', () => {
    const circle = ok(buildUserCurve('x^2 + y^2 = 9', {}));
    expect(circle.implicit).toBe(true);
    expect(circle.branches.map((branch) => branch(0)).sort()).toEqual([-3, 3]);
  });

  it('x = 3 is a vertical line, x = a follows its slider', () => {
    expect(ok(buildUserCurve('x = 3', {})).verticals).toEqual([3]);
    expect(ok(buildUserCurve('x = a', { a: -2 })).verticals).toEqual([-2]);
  });

  it('an equation in x only draws vertical lines at its solutions', () => {
    expect(ok(buildUserCurve('x^2 = 4', {})).verticals).toEqual([-2, 2]);
    expect(ok(buildUserCurve('(x-1)^2 = 0', {})).verticals).toEqual([1]);
  });
});

describe('points', () => {
  it('reads (2; 3), (2, 3) and decimal commas', () => {
    expect(ok(buildUserCurve('(2; 3)', {})).point).toEqual({ x: 2, y: 3 });
    expect(ok(buildUserCurve('(2, 3)', {})).point).toEqual({ x: 2, y: 3 });
    expect(ok(buildUserCurve('(2,5; -1)', {})).point).toEqual({ x: 2.5, y: -1 });
    const moving = ok(buildUserCurve('(a; a^2)', { a: 3 }));
    expect(moving.point).toEqual({ x: 3, y: 9 });
    expect(moving.params).toEqual(['a']);
  });

  it('a bracketed expression is still a function', () => {
    const curve = ok(buildUserCurve('(x+1)(x-2)', {}));
    expect(curve.point).toBeUndefined();
    expect(curve.branches[0](2)).toBe(0);
  });

  it('a point cannot depend on x', () => {
    expect(buildUserCurve('(x; 2)', {})).toMatchObject({ ok: false, error: 'unsupported' });
  });
});

describe('inequalities', () => {
  it('y > f(x) shades above with a dashed border, y ≤ f(x) below with a solid one', () => {
    const above = ok(buildUserCurve('y > x^2', {}));
    expect(above).toMatchObject({ fill: 'above', dashed: true });
    expect(above.branches[0](2)).toBe(4);
    expect(ok(buildUserCurve('y <= 2x + 1', {}))).toMatchObject({ fill: 'below', dashed: false });
    expect(ok(buildUserCurve('y ≥ 2x + 1', {}))).toMatchObject({ fill: 'above', dashed: false });
    // f(x) < y is the same as y > f(x).
    expect(ok(buildUserCurve('x^2 < y', {}))).toMatchObject({ fill: 'above', dashed: true });
  });

  it('an inequality in x shades x-intervals', () => {
    const strips = ok(buildUserCurve('x^2 - 4x + 3 <= 0', {}, { window: { xmin: -50, xmax: 50 } })).strips!;
    expect(strips).toHaveLength(1);
    expect(strips[0]).toMatchObject({ from: 1, to: 3, fromClosed: true, toClosed: true });
    const open = ok(buildUserCurve('x > 2', {}, { window: { xmin: -50, xmax: 50 } })).strips!;
    // The solving window is not a real boundary: the piece goes on to +∞.
    expect(open[0]).toMatchObject({ from: 2, fromClosed: false, to: Infinity, toClosed: false });
  });

  it('inequalities in both x and y that are not y vs f(x) are not drawn yet', () => {
    expect(buildUserCurve('x^2 + y^2 < 9', {})).toMatchObject({ ok: false, error: 'unsupported' });
  });
});

describe('restrictions {…}', () => {
  it('draws only the piece where the condition holds', () => {
    const piece = ok(buildUserCurve('x^2 {0 <= x < 3}', {}));
    expect(piece.branches[0](2)).toBe(4);
    expect(piece.branches[0](0)).toBe(0);
    expect(piece.branches[0](-1)).toBeNaN();
    expect(piece.branches[0](3)).toBeNaN();
    expect(piece.latex).toContain('\\left\\{');
  });

  it('a broken condition is a syntax error', () => {
    expect(buildUserCurve('x^2 {0 < }', {})).toMatchObject({ ok: false, error: 'syntax' });
  });
});

describe('definitions and derivatives', () => {
  const lines = ['f(x) = x^3 - 3x', "f'(x)", 'y = f(x - 2) + 1', "g(x) = f''(x)"];
  const { functions, names } = buildDefinitions(lines);

  it('defines f and g for other lines', () => {
    expect(names).toEqual(['f', 'g']);
    expect(functions.f(2)).toBe(2);
    expect(functions.g(1)).toBeCloseTo(6, 4);
  });

  it("plots f'(x) as the derivative", () => {
    const derivative = ok(buildUserCurve("f'(x)", {}, { functions }));
    expect(derivative.branches[0](2)).toBeCloseTo(9, 6);
    expect(derivative.branches[0](0)).toBeCloseTo(-3, 6);
    expect(derivative.latex).toBe("y = f'\\left(x\\right)");
  });

  it('shifts f and marks the defining line', () => {
    expect(ok(buildUserCurve('y = f(x - 2) + 1', {}, { functions })).branches[0](2)).toBe(1);
    const definition = ok(buildUserCurve('f(x) = x^3 - 3x', {}, { functions }));
    expect(definition.defines).toBe('f');
    expect(definition.latex).toBe('f\\left(x\\right) = x^{3} - 3 x');
  });

  it('a definition that calls itself is rejected before it is evaluated', () => {
    const loop = buildDefinitions(['f(x) = f(x) + 1']);
    expect(loop.cyclic).toEqual(['f']);
    expect(loop.functions.f).toBeUndefined();
  });

  it('without a definition, f stays a slider letter', () => {
    const curve = ok(buildUserCurve('f(x+1)', { f: 2 }));
    expect(curve.params).toEqual(['f']);
    expect(curve.branches[0](1)).toBe(4);
  });

  it('parses primes only for defined names', () => {
    expect(parseExpression("f'(x)").ok).toBe(false);
    const parsed = parseExpression("f''(2x)", { functions: ['f'] });
    expect(parsed.ok && parsed.node.k === 'ufn' && parsed.node.primes).toBe(2);
    if (parsed.ok) expect(compile(parsed.node, { f: (x) => x * x * x })(1)).toBeCloseTo(12, 3);
  });
});

describe('review 2026-10-10: cycles and bounded work', () => {
  const build = (lines: string[], scope: Record<string, number> = {}) => {
    const { functions, cyclic } = buildDefinitions(lines);
    return lines.map((line) => buildUserCurve(line, scope, { functions, cyclic }));
  };

  it("rejects f(x) = f'(x) quickly instead of evaluating it", () => {
    const started = performance.now();
    const [definition, use] = build(["f(x) = f'(x)", 'f(2) + x']);
    expect(definition).toMatchObject({ ok: false, error: 'cycle' });
    expect(use).toMatchObject({ ok: false, error: 'cycle' });
    expect(performance.now() - started).toBeLessThan(50);
  });

  it('rejects indirect cycles and keeps unrelated definitions', () => {
    const { cyclic, functions } = buildDefinitions(['f(x) = g(x) + 1', "g(x) = h'(x)", 'h(x) = f(x)']);
    expect(cyclic.sort()).toEqual(['f', 'g', 'h']);
    expect(Object.keys(functions)).toEqual([]);
    const [f, g, h, other] = build(['f(x) = g(x) + 1', 'g(x) = f(2x)', 'h(x) = x^2', 'h(3) + x']);
    expect([f, g]).toMatchObject([{ error: 'cycle' }, { error: 'cycle' }]);
    expect(ok(h).branches[0](3)).toBe(9);
    expect(ok(other).branches[0](1)).toBe(10);
  });

  it('a cycle through a restriction is a cycle too', () => {
    expect(buildDefinitions(['f(x) = x {g(x) > 0}', 'g(x) = f(x)']).cyclic.sort()).toEqual(['f', 'g']);
  });

  it('nested derivatives of definitions stay within a fixed amount of work', () => {
    const [, , deep] = build(['f(x) = sin x', "g(x) = f''(f''(x))", "h(x) = g''(g''(x))"]);
    const started = performance.now();
    for (let index = 0; index < 50; index++) ok(deep).branches[0](index / 10);
    expect(performance.now() - started).toBeLessThan(500);
    const [, nested] = build(['f(x) = sin x', "f''(f''(x))"]);
    expect(ok(nested).branches[0](1)).toBeCloseTo(-Math.sin(-Math.sin(1)), 5);
  });
});

describe('review 2026-10-10: restrictions', () => {
  it('a definition keeps its restriction, also through shifted arguments', () => {
    const lines = ['f(x) = x^2 {0 < x < 3}', 'g(x) = f(x)', 'y = f(x - 2)'];
    const { functions, cyclic } = buildDefinitions(lines);
    expect(functions.f(2)).toBe(4);
    expect(functions.f(4)).toBeNaN();
    expect(functions.g(4)).toBeNaN();
    const shifted = ok(buildUserCurve(lines[2], {}, { functions, cyclic })).branches[0];
    expect(shifted(4)).toBe(4);
    expect(shifted(1)).toBeNaN();
  });

  it('letters in a restriction become sliders and follow them', () => {
    const curve = ok(buildUserCurve('x^2 {a < x < b}', { a: 1, b: 2 }));
    expect(curve.params).toEqual(['a', 'b']);
    expect(curve.branches[0](1.5)).toBe(2.25);
    expect(curve.branches[0](3)).toBeNaN();
    expect(ok(buildUserCurve('x^2 {a < x < b}', { a: 1, b: 4 })).branches[0](3)).toBe(9);
    const { functions } = buildDefinitions(['f(x) = x {x < c}']);
    expect(functions.f(2, { c: 3 })).toBe(2);
    expect(functions.f(2, { c: 1 })).toBeNaN();
  });

  it('inequalities in x keep narrow restricted domains', () => {
    expect(ok(buildUserCurve('x^2 < 1 {0 < x < 1}', {})).strips).toEqual([{ from: 0, to: 1, fromClosed: false, toClosed: false }]);
    expect(ok(buildUserCurve('x > 0 {0 < x < 1}', {})).strips).toEqual([{ from: 0, to: 1, fromClosed: false, toClosed: false }]);
    expect(ok(buildUserCurve('x^2 <= 1 {0 <= x <= 1}', {})).strips).toEqual([{ from: 0, to: 1, fromClosed: true, toClosed: true }]);
    expect(ok(buildUserCurve('x <= 0 {x > -3}', {})).strips).toEqual([{ from: -3, to: 0, fromClosed: false, toClosed: true }]);
    const tiny = ok(buildUserCurve('x > 0 {0.001 < x < 0.002}', {})).strips!;
    expect(tiny).toHaveLength(1);
    expect(tiny[0].from).toBeCloseTo(0.001, 9);
    expect(tiny[0].to).toBeCloseTo(0.002, 9);
  });

  it('x = c and equations in x respect the restriction', () => {
    expect(ok(buildUserCurve('x = 3 {x < 0}', {})).verticals).toEqual([]);
    expect(ok(buildUserCurve('x = 3 {x > 0}', {})).verticals).toEqual([3]);
    expect(ok(buildUserCurve('x^2 = 4 {x > 0}', {})).verticals).toEqual([2]);
    expect(ok(buildUserCurve('x = a {x < b}', { a: 1, b: 2 })).params).toEqual(['a', 'b']);
  });
});

describe('review 2026-10-10: x-only lines and the window', () => {
  it('unbounded answers reach infinity on both sides, whatever window is used', () => {
    for (const window of [undefined, { xmin: -50, xmax: 50 }, { xmin: -4096, xmax: 4096 }]) {
      expect(ok(buildUserCurve('x > 2', {}, { window })).strips).toEqual([{ from: 2, to: Infinity, fromClosed: false, toClosed: false }]);
      expect(ok(buildUserCurve('x^2 >= 1', {}, { window })).strips).toEqual([
        { from: -Infinity, to: -1, fromClosed: false, toClosed: true },
        { from: 1, to: Infinity, fromClosed: true, toClosed: false },
      ]);
    }
  });

  it('x = x and other identities are reported instead of drawing 50 lines', () => {
    for (const line of ['x = x', '2x = x + x', 'sqrt(x)^2 = x']) expect(buildUserCurve(line, {})).toMatchObject({ ok: false, error: 'identity' });
    expect(ok(buildUserCurve('x^2 = 4', {})).verticals).toEqual([-2, 2]);
  });
});

describe('pilot numeric solver capability limits', () => {
  it.each(['f(x)>0', 'f(x)-0.5=0'])('rejects %s rather than losing an inherited narrow domain', text => {
    const definitions = buildDefinitions(['f(x)=x {0<x<1}']);
    expect(buildUserCurve(text, {}, definitions)).toMatchObject({ ok: false, error: 'unsupported' });
    expect(ok(buildUserCurve('y>f(x)', {}, definitions)).branches[0](0.5)).toBe(0.5);
  });
  it.each(['x>0 {abs(x)<0.01}', 'x>0 {x^2<0.001}'])('rejects nonlinear domain boundaries in %s instead of a false interval', text => {
    expect(buildUserCurve(text, {})).toMatchObject({ ok: false, error: 'unsupported' });
    expect(ok(buildUserCurve('x^2 {abs(x)<0.01}', {})).branches[0](0.005)).toBeCloseTo(0.000025);
  });
});
