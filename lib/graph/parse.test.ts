import { describe, expect, it } from 'vitest';
import { compile, latexToPlain, parseExpression, realPow, toLatex, usesTrig } from './parse';

/** Parses and compiles; fails the test on a parse error. */
function fn(input: string): (x: number, y?: number) => number {
  const result = parseExpression(input);
  if (!result.ok) throw new Error(`${input}: ${result.error} ${result.at ?? ''}`);
  return compile(result.node);
}
const at = (input: string, x: number, y?: number) => fn(input)(x, y);
const latexOf = (input: string) => {
  const result = parseExpression(input);
  if (!result.ok) throw new Error(input);
  return toLatex(result.node);
};
const { PI, E, SQRT2 } = Math;

describe('parseExpression: LaTeX forms from ENT stems', () => {
  it.each([
    ['\\frac{1}{x}', 2, 0.5],
    ['\\dfrac{x+1}{x-1}', 3, 2],
    ['\\tfrac{x}{4}', 2, 0.5],
    ['\\frac12 x', 4, 2],
    ['\\frac{\\sqrt{2}}{2}', 0, SQRT2 / 2],
    ['\\frac{(x-3)(x+2)}{x-1}', 2, -4],
    ['\\sqrt{x}', 9, 3],
    ['\\sqrt{x^2+16}', 3, 5],
    ['\\sqrt[3]{x}', 27, 3],
    ['\\sqrt[3]{x}', -8, -2],
    ['\\sqrt[4]{x}', 16, 2],
    ['\\log_{2}(x-1)', 9, 3],
    ['\\log_2 x', 8, 3],
    ['\\log_{\\frac{1}{3}} x', 9, -2],
    ['\\log_{0,5}x', 4, -2],
    ['\\lg x', 100, 2],
    ['\\lg(9 - x^2)', 1, Math.log10(8)],
    ['\\ln x', E, 1],
    ['\\exp(x)', 0, 1],
    ['e^x', 1, E],
    ['e^{-x}', 0, 1],
    ['2e^x', 0, 2],
    ['\\operatorname{tg} x', PI / 4, 1],
    ['\\operatorname{ctg} x', PI / 4, 1],
    ['\\tg x', PI / 3, Math.sqrt(3)],
    ['\\ctg x', PI / 6, Math.sqrt(3)],
    ['tg x', PI / 4, 1],
    ['ctg x', PI / 4, 1],
    ['\\tan x', PI / 4, 1],
    ['\\arcsin x', 1, PI / 2],
    ['\\operatorname{arctg} x', 1, PI / 4],
    ['\\operatorname{arcctg} x', -1, (3 * PI) / 4],
    ['\\sin^2 x', PI / 4, 0.5],
    ['\\cos^{2}x', PI / 3, 0.25],
    ['\\sin^2 5x', PI / 20, 0.5],
    ['\\cos^2 x - \\sin^2 x', PI / 6, 0.5],
    ['sin 2x', PI / 4, 1],
    ['\\sin2x', PI / 4, 1],
    ['\\cos 2x + \\sin x', PI / 2, 0],
    ['4\\sin x\\cos x', PI / 4, 2],
    ['2\\sin x - 1', PI / 6, 0],
    ['\\sin x^2', 2, Math.sin(4)],
    ['\\sin(x)^2', 1, Math.sin(1) ** 2],
    ['ln^2x - 3lnx', E, -2],
    ['\\log_3^2 x - 4\\log_3 x', 9, -4],
    ['|x-1|', -2, 3],
    ['\\left|x+1\\right|', -3, 2],
    ['|2x - 8| + |x - 3|', 2, 5],
    ['|x|-|x-2|', 1, 0],
    ['\\frac{x}{|x|}', -2, -1],
    ['\\lvert x \\rvert', -4, 4],
    ['\\left(\\frac{1}{2}\\right)^{x+1}', 1, 0.25],
    ['13^{4-x} - 1', 4, 0],
    ['3^{2x-1}', 2, 27],
    ['2^-x', 1, 0.5],
    ['x^{-1}', 2, 0.5],
    ['-x^2', 3, -9],
    ['-x^2+6x-5', 3, 4],
    ['(x - 2)^2 e^x', 0, 4],
    ['x \\cdot 2', 3, 6],
    ['x\\times 3', 2, 6],
    ['x\\div 2', 3, 1.5],
    ['3:x', 3, 1],
    ['\\pi x', 1, PI],
    ['\\displaystyle\\frac{1}{x}', 4, 0.25],
  ])('%s at x = %s', (input, x, expected) => {
    expect(at(input, x)).toBeCloseTo(expected, 9);
  });

  it('reads the decimal comma in both stem spellings', () => {
    expect(at('0{,}5x', 4)).toBe(2);
    expect(at('2,5x', 2)).toBe(5);
    expect(at('3x^2 - 4,5x + 1,5', 1)).toBeCloseTo(0, 12);
  });

  it('reads degrees as a factor of the number they follow', () => {
    // sin 30° is sin(π/6), not sin(30)·π/180.
    expect(at('\\sin 30^\\circ', 0)).toBeCloseTo(0.5, 12);
    expect(at('\\cos 60^{\\circ}', 0)).toBeCloseTo(0.5, 12);
    expect(at('\\sin 30°', 0)).toBeCloseTo(0.5, 12);
    expect(at('\\sin 30^\\circ + \\cos 60^\\circ', 0)).toBeCloseTo(1, 12);
    expect(at('\\operatorname{tg} 45^\\circ', 0)).toBeCloseTo(1, 12);
    expect(at('180°', 0)).toBeCloseTo(PI, 12);
  });

  it('accepts unicode minus, dot, superscripts, root and π', () => {
    expect(at('x² − 3·x', 2)).toBe(-2);
    expect(at('x³', -2)).toBe(-8);
    expect(at('√x', 9)).toBe(3);
    expect(at('√(x+7)', 2)).toBe(3);
    expect(at('2π', 0)).toBeCloseTo(2 * PI, 12);
    expect(at('x × 2 ∙ 3', 1)).toBe(6);
  });

  it('treats e as Euler’s number and keeps 2e+1 as 2e + 1', () => {
    expect(at('2e', 0)).toBeCloseTo(2 * E, 12);
    expect(at('2e+1', 0)).toBeCloseTo(2 * E + 1, 12);
    expect(at('2e-1', 0)).toBeCloseTo(2 * E - 1, 12);
    expect(at('ex', 2)).toBeCloseTo(2 * E, 12);
  });

  it('parses school shorthand typed by pupils', () => {
    expect(at('2x^2-3x+1', 2)).toBe(3);
    expect(at('sin x cos x', 1)).toBeCloseTo(Math.sin(1) * Math.cos(1), 12);
    expect(at('2 sin x', PI / 2)).toBeCloseTo(2, 12);
    expect(at('|x|x', -2)).toBe(-4);
    expect(at('sqrt(x)', 4)).toBe(2);
    expect(at('abs(x)', -3)).toBe(3);
    expect(at('root(x, 3)', 8)).toBeCloseTo(2, 12);
    expect(at('arcsin(x)', 0.5)).toBeCloseTo(PI / 6, 12);
    expect(at('arcctg x', 1)).toBeCloseTo(PI / 4, 12);
  });

  it('reports variables, skipping e and π', () => {
    expect(parseExpression('x^2 + y^2').ok && parseExpression('x^2 + y^2')).toMatchObject({ vars: ['x', 'y'] });
    expect(parseExpression('ax^2 + bx + c')).toMatchObject({ ok: true, vars: ['a', 'b', 'c', 'x'] });
    expect(parseExpression('e^x + \\pi')).toMatchObject({ ok: true, vars: ['x'] });
    expect(parseExpression('\\sin 30^\\circ')).toMatchObject({ ok: true, vars: [] });
  });

  it('evaluates y and named parameters through the scope', () => {
    expect(at('x^2 + y^2', 3, 4)).toBe(25);
    expect(fn('x^2 + y')(1)).toBeNaN();
    const result = parseExpression('kx + b');
    if (!result.ok) throw new Error('kx + b');
    expect(compile(result.node)(2, undefined, { k: 3, b: 1 })).toBe(7);
    expect(compile(result.node)(2)).toBeNaN();
  });
});

describe('parseExpression: errors', () => {
  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['\\left.\\right.', 'empty'],
    ['x+', 'syntax'],
    ['(x', 'syntax'],
    ['x)', 'syntax'],
    ['2**x', 'syntax'],
    ['x^', 'syntax'],
    ['||', 'syntax'],
    ['sin', 'syntax'],
    ['\\log_ x', 'syntax'],
    ['\\frac{}{}', 'syntax'],
    ['\\left( x', 'syntax'],
    ['root(x)', 'syntax'],
    ['sin(x, 2)', 'syntax'],
    ['x_0', 'syntax'],
    ['\\alpha x', 'unknown-symbol'],
    ['\\vec{a}', 'unknown-symbol'],
    ['x$', 'unknown-symbol'],
    ['@', 'unknown-symbol'],
    ['x = 2', 'unknown-symbol'],
    ['x\'', 'syntax'],
    ['\\int x dx', 'unknown-symbol'],
    ['x'.repeat(500), 'too-long'],
  ])('%j → %s without throwing', (input, error) => {
    const result = parseExpression(input);
    expect(result).toMatchObject({ ok: false, error });
  });

  it('names the unknown command', () => {
    expect(parseExpression('\\alpha x')).toEqual({ ok: false, error: 'unknown-symbol', at: '\\alpha' });
  });

  it('never throws on hostile or truncated input', () => {
    const inputs = ['\\frac{1}', '\\sqrt[', '\\sqrt[3', '{{{{', '}}}}', '\\left|x', '|x', 'x|', '^2', '-', '+', '\\', '\\\\', ')(', '1..2', '.', 'constructor', '__proto__', 'x'.repeat(400)];
    for (const input of inputs) expect(() => parseExpression(input)).not.toThrow();
  });
});

describe('compile: domain and real powers', () => {
  it('returns NaN outside the domain instead of complex or infinite values', () => {
    expect(at('\\sqrt{x}', -1)).toBeNaN();
    expect(at('\\sqrt{4-x^2}', 3)).toBeNaN();
    expect(at('\\ln x', 0)).toBeNaN();
    expect(at('\\ln x', -1)).toBeNaN();
    expect(at('\\lg x', 0)).toBeNaN();
    expect(at('\\log_2 x', -4)).toBeNaN();
    expect(at('\\log_{1} x', 4)).toBeNaN();
    expect(at('\\log_{-2} x', 4)).toBeNaN();
    expect(at('\\frac{1}{x}', 0)).toBeNaN();
    expect(at('\\frac{1}{x^2-4}', 2)).toBeNaN();
    expect(at('1/0', 0)).toBeNaN();
    expect(at('\\arcsin x', 2)).toBeNaN();
    expect(at('\\sqrt[0]{x}', 2)).toBeNaN();
    expect(at('x\\ln x', 0)).toBeNaN();
  });

  it('keeps odd roots of negatives real', () => {
    expect(at('\\sqrt[3]{-27}', 0)).toBeCloseTo(-3, 12);
    expect(at('\\sqrt[5]{x}', -32)).toBeCloseTo(-2, 12);
    expect(at('x^{1/3}', -8)).toBeCloseTo(-2, 12);
    expect(at('\\sqrt[4]{x}', -16)).toBeNaN();
    expect(at('x^{0.5}', -4)).toBeNaN();
    // School definition: a^{m/n} with a non-integer exponent needs a ≥ 0 unless it is an odd root.
    expect(at('x^{2/3}', -8)).toBeNaN();
    expect(at('x^{2/3}', 8)).toBeCloseTo(4, 12);
  });

  it('realPow handles integer and fractional exponents', () => {
    expect(realPow(-2, 3)).toBe(-8);
    expect(realPow(-2, -1)).toBe(-0.5);
    expect(realPow(-8, 1 / 3)).toBeCloseTo(-2, 12);
    expect(realPow(-4, 0.5)).toBeNaN();
    expect(realPow(0, 0)).toBe(1);
  });

  it('is not fooled by floating noise in trig values', () => {
    expect(at('\\operatorname{tg} x', PI / 4)).toBeCloseTo(1, 12);
    expect(Math.abs(at('\\cos x', PI / 2))).toBeLessThan(1e-12);
  });
});

describe('latexToPlain', () => {
  it('rewrites fractions, roots and commands brace-aware', () => {
    expect(latexToPlain('\\frac{1}{x}')).toBe('((1)/(x))');
    expect(latexToPlain('\\sqrt[3]{x+1}')).toBe('root((x+1),(3))');
    expect(latexToPlain('\\frac{\\frac{1}{2}}{x}')).toBe('((((1)/(2)))/(x))');
    expect(latexToPlain('\\left|x\\right|')).toBe('|x|');
    expect(latexToPlain('\\operatorname{tg} x')).toBe('tg x');
  });
});

describe('usesTrig', () => {
  const trig = (input: string) => { const result = parseExpression(input); return result.ok && usesTrig(result.node); };
  it('detects trigonometric functions anywhere in the tree', () => {
    expect(trig('\\sin x')).toBe(true);
    expect(trig('2 + \\operatorname{tg}(x^2)')).toBe(true);
    expect(trig('-\\cos x')).toBe(true);
    expect(trig('\\sqrt{\\sin x}')).toBe(true);
    expect(trig('x^2 + 1')).toBe(false);
    expect(trig('\\arcsin x')).toBe(false);
    expect(trig('\\sin 30^\\circ')).toBe(true);
  });
});

describe('toLatex', () => {
  it.each([
    ['2x^2-3x+1', '2 x^{2} - 3 x + 1'],
    ['\\frac{x+1}{x-1}', '\\frac{x + 1}{x - 1}'],
    ['\\sqrt[3]{x}', '\\sqrt[3]{x}'],
    ['|x-1|', '\\left|x - 1\\right|'],
    ['tg x', '\\operatorname{tg}\\left(x\\right)'],
    ['ctg x', '\\operatorname{ctg}\\left(x\\right)'],
    ['\\log_2 x', '\\log_{2}\\left(x\\right)'],
    ['\\lg x', '\\lg\\left(x\\right)'],
    ['e^{2x}', 'e^{2 x}'],
    ['0{,}5x', '0{,}5 x'],
    ['2 \\cdot 3', '2 \\cdot 3'],
    ['-x^2', '-x^{2}'],
    ['2 \\cdot (-x)', '2 \\left(-x\\right)'],
    ['(x+1)(x-2)', '\\left(x + 1\\right) \\left(x - 2\\right)'],
    ['x - (x - 1)', 'x - \\left(x - 1\\right)'],
    ['\\pi x', '\\pi x'],
    // Powers of functions in school notation, never ambiguous or a double superscript.
    ['\\sin^2 x', '\\sin^{2}\\left(x\\right)'],
    ['\\log_3^2 x', '\\log_{3}^{2}\\left(x\\right)'],
    ['\\left(\\frac{1}{2}\\right)^{x}', '\\left(\\frac{1}{2}\\right)^{x}'],
    ['\\exp(x)^2', '\\left(e^{x}\\right)^{2}'],
    ['\\sqrt{x}^3', '\\sqrt{x}^{3}'],
    ['(x+1)^2', '\\left(x + 1\\right)^{2}'],
  ])('%s → %s', (input, expected) => {
    expect(latexOf(input)).toBe(expected);
  });

  it('round-trips through the parser to the same values', () => {
    const inputs = ['\\frac{x^2-1}{x+3}', '\\sin^2 x + \\cos 2x', '\\log_{\\frac{1}{2}}(x+1)', '|x-2| - \\sqrt[3]{x}', '\\left(\\frac{1}{3}\\right)^{x} - 9', '-(x-1)^2 + 4', '2^{-x}', 'e^{x}\\ln x', '\\operatorname{arctg} x'];
    for (const input of inputs) {
      const again = latexOf(input);
      for (const x of [-2.5, -0.7, 0.3, 1.7, 4.2]) {
        const original = at(input, x); const reparsed = at(again, x);
        if (Number.isNaN(original)) expect(reparsed).toBeNaN();
        else expect(reparsed).toBeCloseTo(original, 9);
      }
    }
  });
});
