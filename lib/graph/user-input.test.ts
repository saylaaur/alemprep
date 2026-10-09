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
    expect(open[0]).toMatchObject({ from: 2, fromClosed: false, to: 50 });
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

  it('a definition that calls itself does not hang', () => {
    const loop = buildDefinitions(['f(x) = f(x) + 1']);
    expect(loop.functions.f(1)).toBeNaN();
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
