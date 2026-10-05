import { describe, expect, it } from 'vitest';
import { extractTaskGraph, mathSegments, solveForY, type TaskGraph } from './extract';

const { PI } = Math;
function graph(stem: string, blocks?: unknown): TaskGraph {
  const result = extractTaskGraph(stem, blocks);
  if (!result) throw new Error(`no graph for: ${stem}`);
  return result;
}
const legends = (stem: string) => graph(stem).curves.map((curve) => curve.latex);
const value = (result: TaskGraph, curve: number, x: number, branch = 0) => result.curves[curve].branches[branch](x);

describe('extractTaskGraph: functions y = … / f(x) = …', () => {
  it('Найдите наименьшее значение функции y = x² − 4x + 3', () => {
    const result = graph('Найдите наименьшее значение функции $y = x^2 - 4x + 3$.');
    expect(result).toMatchObject({ relation: null, area: null, segment: null, trig: false, equalAspect: false, focus: [] });
    expect(result.curves).toHaveLength(1);
    expect(result.curves[0]).toMatchObject({ latex: 'y = x^2 - 4x + 3', implicit: false });
    expect(value(result, 0, 2)).toBe(-1);
  });

  it('Kazakh: функциясының ең кіші мәнін табыңыз', () => {
    expect(legends('$y = x^2 - 4x + 3$ функциясының ең кіші мәнін табыңыз')).toEqual(['y = x^2 - 4x + 3']);
    expect(legends('$f(x) = \\sqrt{x+3}$ функциясының анықталу облысын табыңыз')).toEqual(['f(x) = \\sqrt{x+3}']);
  });

  it.each([
    ['Найдите промежуток возрастания функции $y = \\ln x + \\frac{2}{x}$', 'y = \\ln x + \\frac{2}{x}', 2, Math.log(2) + 1],
    ['Найдите точки экстремума функции $f(x) = x^3 - 6x^2 + 9x - 4$', 'f(x) = x^3 - 6x^2 + 9x - 4', 3, -4],
    ['Найдите производную функции $f(x) = 3x^4 - 2x$', 'f(x) = 3x^4 - 2x', 1, 1],
    ['Найдите $f(2)$, если $f(x) = x^2 + 1$', 'f(x) = x^2 + 1', 2, 5],
    ['Найдите $f\'(x)$, если $f(x) = x^3 - 3x^2$', 'f(x) = x^3 - 3x^2', 2, -4],
    ['Найдите точку минимума функции $y = (x - 2)^2 e^x$', 'y = (x - 2)^2 e^x', 2, 0],
    ['Постройте график функции $y = |x^2 - 4|$', 'y = |x^2 - 4|', 0, 4],
    ['График функции $y = \\frac{1}{x - 2} + 1$', 'y = \\frac{1}{x - 2} + 1', 3, 2],
    ['Найдите область определения $y = \\lg(9 - x^2)$', 'y = \\lg(9 - x^2)', 1, Math.log10(8)],
    ['Областью определения функции $y = 2 \\cos x - 7$ является', 'y = 2 \\cos x - 7', 0, -5],
    ['Найдите область значений функции $y = 3 - 2\\sin x$', 'y = 3 - 2\\sin x', PI / 2, 1],
    ['Найдите угловой коэффициент касательной к графику $y = x^2$ в точке $x_0 = 1$', 'y = x^2', 3, 9],
    ['Функция задана формулой $g(x) = 2^{x}$', 'g(x) = 2^{x}', 3, 8],
  ])('%s', (stem, latex, x, expected) => {
    const result = graph(stem);
    expect(result.curves.map((curve) => curve.latex)).toEqual([latex]);
    expect(value(result, 0, x)).toBeCloseTo(expected, 9);
  });

  it('marks trigonometric functions so the axis uses π', () => {
    expect(graph('Найдите область значений функции $y = 3 - 2\\sin x$').trig).toBe(true);
    expect(graph('Найдите наименьшее значение функции $y = x^2 - 4x + 3$.').trig).toBe(false);
  });

  it('draws both curves whose intersection is asked', () => {
    expect(legends('Найдите точки пересечения графиков функций $y = x^2$ и $y = 2x + 3$')).toEqual(['y = x^2', 'y = 2x + 3']);
    expect(legends('Найдите точки пересечения графиков $y=x^2$, $y=2x+3$')).toEqual(['y = x^2', 'y = 2x+3']);
    expect(legends('Найдите площадь фигуры, ограниченной линиями $y = x^2$ и $y = 4$')).toEqual(['y = x^2', 'y = 4']);
  });

  it('a region bounded by y = x², y = 0, x = 2 draws the curves and skips the vertical line', () => {
    expect(legends('Найдите площадь фигуры, ограниченной линиями $y = x^2$, $y = 0$, $x = 2$')).toEqual(['y = x^2', 'y = 0']);
  });

  it('draws the same function once', () => {
    expect(legends('Дана функция $y = x^2$. Решите уравнение $x^2 = 4$.')).toEqual(['y = x^2', 'y = 4']);
  });
});

describe('extractTaskGraph: equations and inequalities in x', () => {
  it('a quadratic equation with zero on the right is one curve and the x-axis', () => {
    const result = graph('Решите уравнение $x^2 - 5x + 6 = 0$');
    expect(result.curves.map((curve) => curve.latex)).toEqual(['y = x^2 - 5x + 6']);
    expect(result.relation).toEqual({ relation: '=', left: 0, right: null });
  });

  it.each([
    ['Решите неравенство: $|2x - 8| + |x - 3| \\le 4$', ['y = |2x - 8| + |x - 3|', 'y = 4'], '<='],
    ['Решите уравнение: $\\cos x = \\frac{\\sqrt{2}}{2}$', ['y = \\cos x', 'y = \\frac{\\sqrt{2}}{2}'], '='],
    ['Решите неравенство: $x^2 - 4x + 5 \\geq 0$', ['y = x^2 - 4x + 5'], '>='],
    ['Решите неравенство: $\\sin^2 5x < \\frac{3}{4}$', ['y = \\sin^2 5x', 'y = \\frac{3}{4}'], '<'],
    ['Решите уравнение: $5\\tan x = -15$', ['y = 5\\tan x', 'y = -15'], '='],
    ['Найдите корни уравнения $ln^2x - 3lnx = 0$', ['y = ln^2x - 3lnx'], '='],
    ['Найдите корни уравнения $\\log_3^2 x - 4\\log_3 x = 0$', ['y = \\log_3^2 x - 4\\log_3 x'], '='],
    ['Решите уравнение $3x^2 - 4,5x + 1,5 = 0$', ['y = 3x^2 - 4,5x + 1,5'], '='],
    ['Решите неравенство $\\sqrt{x-1} < 3-x$', ['y = \\sqrt{x-1}', 'y = 3-x'], '<'],
    ['Решите неравенство $\\frac{x+1}{x-2} \\geq 0$', ['y = \\frac{x+1}{x-2}'], '>='],
    ['Решите неравенство $\\log_2(x-1) \\le 3$', ['y = \\log_2(x-1)', 'y = 3'], '<='],
    ['Решите неравенство: $-x^2+6x-5 \\geqslant 0$', ['y = -x^2+6x-5'], '>='],
    ['Решите неравенство $\\dfrac{x^2-4}{x+3} \\geqslant 0$', ['y = \\dfrac{x^2-4}{x+3}'], '>='],
    ['Решите неравенство $\\frac{(x-3)(x+2)}{x-1} < 0$', ['y = \\frac{(x-3)(x+2)}{x-1}'], '<'],
    ['Решите неравенство $\\left(\\frac{1}{3}\\right)^x > 9$', ['y = \\left(\\frac{1}{3}\\right)^x', 'y = 9'], '>'],
    ['Решите неравенство $3^{2x-1} \\le 27$', ['y = 3^{2x-1}', 'y = 27'], '<='],
    ['Решите уравнение $\\log_2 (x+1) + \\log_2 (x-1) = 3$', ['y = \\log_2 (x+1) + \\log_2 (x-1)', 'y = 3'], '='],
    ['Решите уравнение $\\left| x - 2 \\right| = 3$', ['y = \\left| x - 2 \\right|', 'y = 3'], '='],
    ['Решите уравнение $\\sqrt{x + 2} = x$', ['y = \\sqrt{x + 2}', 'y = x'], '='],
    ['Решите уравнение $\\frac{1}{x} = x$', ['y = \\frac{1}{x}', 'y = x'], '='],
    ['Решите уравнение $2^{x} = 3 - x$', ['y = 2^{x}', 'y = 3 - x'], '='],
    ['Решите уравнение: $\\cos^2 x - \\sin^2 x = \\frac{1}{2}$', ['y = \\cos^2 x - \\sin^2 x', 'y = \\frac{1}{2}'], '='],
    ['Решите уравнение $\\operatorname{tg} x = 1$', ['y = \\operatorname{tg} x', 'y = 1'], '='],
    ['Решите неравенство $x^2 - 9 \\ne 0$', ['y = x^2 - 9'], '!='],
    ['Решите неравенство $x^2 ≤ 4$', ['y = x^2', 'y = 4'], '<='],
    ['Найдите сумму корней уравнения $|x - 3| = 5$', ['y = |x - 3|', 'y = 5'], '='],
    ['Теңдеуді шешіңіз: $2^{x} = 8$', ['y = 2^{x}', 'y = 8'], '='],
    ['Теңсіздікті шешіңіз: $x^2 - 9 < 0$', ['y = x^2 - 9'], '<'],
    ['Теңдеудің түбірлерінің қосындысын табыңыз: $x^2 + 3x - 10 = 0$', ['y = x^2 + 3x - 10'], '='],
  ])('%s', (stem, curves, relation) => {
    const result = graph(stem);
    expect(result.curves.map((curve) => curve.latex)).toEqual(curves);
    expect(result.relation).toEqual({ relation, left: 0, right: curves.length > 1 ? 1 : null });
  });

  it('the curves evaluate what the stem says', () => {
    const result = graph('Решите неравенство $\\log_2(x-1) \\le 3$');
    expect(value(result, 0, 9)).toBeCloseTo(3, 12);
    expect(value(result, 0, 1)).toBeNaN();
    expect(value(result, 1, 100)).toBe(3);
    expect(value(graph('Решите уравнение $3x^2 - 4,5x + 1,5 = 0$'), 0, 1)).toBeCloseTo(0, 12);
  });

  it('a restriction like "где x > 0" is not drawn and does not replace the inequality', () => {
    const result = graph('Решите неравенство $x^2 > 4$, где $x > 0$');
    expect(result.curves.map((curve) => curve.latex)).toEqual(['y = x^2', 'y = 4']);
    expect(result.relation).toEqual({ relation: '>', left: 0, right: 1 });
  });

  it('a linear equation is still drawable', () => {
    expect(graph('Найдите $x$, если $3x + 2 = 11$').relation).toEqual({ relation: '=', left: 0, right: 1 });
  });

  it('finds bare maths in OCR’d stems without $', () => {
    expect(mathSegments('решите уравнение x^2 - 5x + 6 = 0.')).toEqual(['x^2 - 5x + 6 = 0']);
    expect(legends('решите уравнение x^2 - 5x + 6 = 0')).toEqual(['y = x^2 - 5x + 6']);
    expect(mathSegments('Найдите площадь поверхности сферы')).toEqual([]);
  });
});

describe('extractTaskGraph: segments and integrals', () => {
  it('на отрезке [a; b] in TeX, with \\left[ … \\right] and with π', () => {
    expect(graph('Найдите наибольшее значение функции $f(x) = x^3 - 3x$ на отрезке $[-2; 0]$')).toMatchObject({ segment: { from: -2, to: 0 }, focus: [-2, 0] });
    expect(graph('Решите уравнение $\\cos 2x + \\sin x = 0$ на отрезке $[0; 2\\pi]$').segment).toEqual({ from: 0, to: 2 * PI });
    expect(graph('Решите уравнение $\\cos 2x + \\sin x = 0$ на отрезке $\\left[0; 2\\pi\\right]$').segment).toEqual({ from: 0, to: 2 * PI });
    const log = graph('Найдите наибольшее значение $y = \\log_{\\frac{1}{3}} x$ на отрезке $\\left[\\frac{1}{3}; 9\\right]$');
    expect(log.segment?.from).toBeCloseTo(1 / 3, 12);
    expect(log.segment?.to).toBe(9);
    expect(graph('Найдите корни уравнения $2\\sin x - 1 = 0$, принадлежащие промежутку $[0; \\pi]$').segment).toEqual({ from: 0, to: PI });
  });

  it('на отрезке [a; b] written as plain text next to TeX formulas', () => {
    expect(graph('Найдите наибольшее значение функции $f(x) = x^3 - 3x$ на отрезке [-2; 0]').segment).toEqual({ from: -2, to: 0 });
    expect(graph('Найдите наименьшее значение функции $y = x^2$ на отрезке [−1; 2,5]').segment).toEqual({ from: -1, to: 2.5 });
    expect(graph('Найдите наименьшее значение функции $y = x^2$ на отрезке [3; 1]').segment).toBeNull();
  });

  it('a segment alone is not a graph', () => {
    expect(extractTaskGraph('Определите соответствующий промежуток $[6; 7]$ для числа $\\sqrt{45}$.')).toBeNull();
  });

  it.each([
    ['Вычислите площадь фигуры: $\\int_{0}^{2} (x^2 + 1)\\,dx$', 'y = (x^2 + 1)', 0, 2],
    ['Вычислите $\\int_{-1}^{2}(3x^2-2x)dx$', 'y = (3x^2-2x)', -1, 2],
    ['Вычислите $\\int_{1}^{4} \\sqrt{x}\\,dx$', 'y = \\sqrt{x}', 1, 4],
    ['Вычислите $\\int_1^e \\frac{1}{x} dx$', 'y = \\frac{1}{x}', 1, Math.E],
    ['Вычислите $\\int\\limits_{0}^{\\pi} \\sin x\\, dx$', 'y = \\sin x', 0, PI],
    ['Вычислите интеграл $\\int_0^{\\frac{\\pi}{2}} \\cos x\\, dx$', 'y = \\cos x', 0, PI / 2],
    ['Вычислите $\\int_{0}^{1} e^{x}\\,\\mathrm{d}x$', 'y = e^{x}', 0, 1],
    ['Интегралды есептеңіз: $\\int_{2}^{0} x\\,dx$', 'y = x', 0, 2],
  ])('definite integral: %s', (stem, latex, from, to) => {
    const result = graph(stem);
    expect(result.curves.map((curve) => curve.latex)).toEqual([latex]);
    expect(result.area?.curve).toBe(0);
    expect(result.area?.from).toBeCloseTo(from, 12);
    expect(result.area?.to).toBeCloseTo(to, 12);
    expect(result.relation).toBeNull();
  });

  it('indefinite integrals have no area and are not drawn', () => {
    expect(extractTaskGraph('Найдите неопределённый интеграл $\\int e^{3x} dx$')).toBeNull();
    expect(extractTaskGraph('Найдите неопределенный интеграл $\\int \\frac{1}{\\cos^2 x} \\cdot \\frac{1}{\\sin^2 x} dx$')).toBeNull();
  });
});

describe('extractTaskGraph: systems in x and y', () => {
  it('circle and line: two branches for the circle, equal aspect', () => {
    const result = graph('Решите систему $\\begin{cases} x^2 + y^2 = 25 \\\\ x + y = 7 \\end{cases}$');
    expect(result.curves.map((curve) => [curve.latex, curve.branches.length, curve.implicit])).toEqual([
      ['x^2 + y^2 = 25', 2, true],
      ['x + y = 7', 1, true],
    ]);
    expect(result.equalAspect).toBe(true);
    const ys = result.curves[0].branches.map((branch) => branch(3)).sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(-4, 12);
    expect(ys[1]).toBeCloseTo(4, 12);
    expect(result.curves[0].branches[0](6)).toBeNaN();
    expect(value(result, 1, 3)).toBeCloseTo(4, 12);
  });

  it('linear system with fractions and a full stop after the last equation', () => {
    const result = graph('Пара чисел $(x_0; y_0)$ является решением системы уравнений $\\begin{cases} \\frac{x}{9} + \\frac{y}{3} = 20, \\\\ \\frac{x}{6} - \\frac{y}{18} = 0. \\end{cases}$ Найдите отношение $\\frac{y_0}{x_0}$');
    expect(result.curves.map((curve) => curve.latex)).toEqual(['\\frac{x}{9} + \\frac{y}{3} = 20', '\\frac{x}{6} - \\frac{y}{18} = 0']);
    // y = 60 − x/3 and y = 3x meet at x = 18.
    expect(value(result, 0, 18)).toBeCloseTo(54, 9);
    expect(value(result, 1, 18)).toBeCloseTo(54, 9);
    expect(result.equalAspect).toBe(false);
  });

  it('system with y = … rows is drawn as explicit functions', () => {
    const result = graph('Решите систему $\\begin{cases} y = x^2 \\\\ y = x + 2 \\end{cases}$');
    expect(result.curves.map((curve) => [curve.latex, curve.implicit])).toEqual([['y = x^2', false], ['y = x + 2', false]]);
  });

  it('hyperbola xy = 6 and a line', () => {
    const result = graph('Решите систему уравнений: $\\begin{cases} xy = 6, \\\\ x + y = 5 \\end{cases}$');
    expect(value(result, 0, 2)).toBeCloseTo(3, 12);
    expect(value(result, 0, 0)).toBeNaN();
    expect(result.equalAspect).toBe(false);
  });

  it('system written with \\left\\{ \\begin{array} … \\right.', () => {
    const result = graph('Решите систему $\\left\\{ \\begin{array}{l} x + y = 5 \\\\ x - y = 1 \\end{array} \\right.$');
    expect(result.curves.map((curve) => curve.latex)).toEqual(['x + y = 5', 'x - y = 1']);
    expect(value(result, 0, 3)).toBeCloseTo(2, 12);
    expect(value(result, 1, 3)).toBeCloseTo(2, 12);
  });

  it('parabola and line solved for y', () => {
    const result = graph('Решите систему уравнений $\\begin{cases} y - x^2 = 0, \\\\ x - y + 2 = 0. \\end{cases}$');
    expect(result.curves.map((curve) => curve.latex)).toEqual(['y - x^2 = 0', 'x - y + 2 = 0']);
    expect(value(result, 0, 2)).toBeCloseTo(4, 12);
    expect(value(result, 1, 2)).toBeCloseTo(4, 12);
  });

  it('a circle from a geometry stem is still a drawable curve', () => {
    const result = graph('Окружность задана уравнением $(x - 1)^2 + (y + 2)^2 = 9$. Найдите радиус.');
    expect(result.curves[0].branches).toHaveLength(2);
    expect(result.equalAspect).toBe(true);
  });

  it('a system of inequalities is drawn without shading', () => {
    const result = graph('Задана система неравенств: $\\begin{cases} \\left(\\frac{1}{2}\\right)^{x+1} \\leq 8 \\\\ 13^{4-x} - 1 > 0 \\end{cases}$\n\nНаибольшее целое решение системы');
    expect(result.curves.map((curve) => curve.latex)).toEqual(['y = \\left(\\frac{1}{2}\\right)^{x+1}', 'y = 8', 'y = 13^{4-x} - 1']);
    expect(result.relation).toBeNull();
  });

  it('a system that cannot be drawn whole is not drawn at all', () => {
    // cos y is not polynomial in y; cube roots of y neither.
    expect(extractTaskGraph('Решите систему уравнений $\\begin{cases} \\cos x + \\cos y = 0, \\\\ x - y = \\frac{2\\pi}{3} \\end{cases}$')).toBeNull();
    expect(extractTaskGraph('Найдите $x_n - y_n$, если $(x_n; y_n)$ – решения системы уравнений $\\begin{cases} x + y = 28 \\\\ \\sqrt[3]{x} + \\sqrt[3]{y} = 4 \\end{cases}$')).toBeNull();
    // "x > 1" only restricts x, so the system is left out (see limitations in the report).
    expect(extractTaskGraph('Решите систему неравенств $\\begin{cases} x > 1 \\\\ x^2 < 9 \\end{cases}$')).toBeNull();
  });
});

describe('extractTaskGraph: nothing to draw', () => {
  it.each([
    'Площадь поверхности сферы с радиусом 6 см равна',
    'Если абсолютную температуру газа увеличить в 25 раз, то средняя квадратичная скорость движения молекул',
    'Упростите выражение: $\\frac{x^2 + 2x - 24}{x + 6}$',
    'Вычислите: $\\frac{27 \\cdot 3^{n-2}}{81^{n-1} \\cdot 9^n}$',
    'Определите ОДЗ дроби: $\\frac{5x+2}{x^2-100}$',
    'Найдите значение выражения $\\frac{x^2 - 9}{x - 3}$ при $x = 2$.',
    'Найдите значение $\\sqrt{x}$ при $x = 16$',
    'Решите неравенство $x > 0$',
    'Если $pH = 5$, найдите $[H^+]$.',
    'Арифметическая прогрессия задана формулой $a_n = 4n - 9$. Какой первый член этой прогрессии?',
    'В арифметической прогрессии выполняется условие $a_3 + a_{17} = 72$. Найдите сумму первых 19 членов.',
    'Даны вектора $\\vec{a}(3; -2; 5)$ и $\\vec{b}(-1; 4; -3)$. Найдите координаты вектора $\\vec{c}$, если $\\vec{c} = 0,8\\vec{a} - 1,5\\vec{b}$',
    'Дан треугольник $XYZ$: $\\angle Y = 55°$, $\\angle Z = 65°$. Вычислите $\\angle X$.',
    'Найдите площадь треугольника со сторонами $a = 5$, $b = 6$ и углом $C = 30^\\circ$.',
    'Дан треугольник $ABC$, $AB = 5$, $BC = 7$.',
    'Прямая $y = kx + b$ проходит через точки $A(1; 3)$ и $B(2; 5)$. Найдите $k$.',
    'Функция задана формулой $y = ax^2 + bx + c$',
    'При каких значениях параметра $a$ уравнение $x^2 + ax + 4 = 0$ имеет два корня?',
    '$x_1$ и $x_2$ корни квадратного уравнения $x^2 - ax + 6 = 0$.',
    'Площадь круга $S = \\pi r^2$',
    'Скорость тела $v = v_0 + at$. Найдите $v$ при $t = 2$.',
    '$F = ma$, найдите $a$',
    'Снаряд выпущен под углом 45° к горизонту со скоростью 40 м/с. Найдите время полета снаряда (sin45° = 0,71, g = 10 м/с²)',
    'Вычислите $\\sin 30^\\circ + \\cos 60^\\circ$',
    'Вычислите: $\\arcsin\\left(-\\frac{\\sqrt{2}}{2}\\right) + \\operatorname{arcctg}\\left(-1\\right)$',
    'Сравните числа $\\sqrt{2}$ и $1{,}5$',
    'Дано: $a = 2{,}5$, $b = -1$. Найдите $a + b$.',
    'Разложите на множители: $225a^2-49b^2$',
    'Составьте уравнение прямой, проходящей через заданные точки $A(-1; 2), B(2; -2)$.',
    'Синус угла между прямой $\\frac{x-1}{5} = \\frac{y+3}{12} = \\frac{z-2}{-4}$ и плоскостью $2x - y + 2z - 1 = 0$ равен',
    'Пара чисел $(3; 2)$ является решением какой из следующих систем уравнений?',
    'Найдите сумму бесконечной убывающей геометрической прогрессии: $6 + 3 + \\frac{3}{2} + \\ldots$',
    'Үшбұрыштың ауданын табыңыз: $a = 7$, $h = 4$.',
    '',
  ])('%s', (stem) => {
    expect(extractTaskGraph(stem)).toBeNull();
  });
});

describe('extractTaskGraph: stem_blocks', () => {
  it('reads text and latex blocks instead of the stem', () => {
    const blocks = [{ type: 'text', value: 'Найдите наименьшее значение функции' }, { type: 'latex', value: 'y = x^2 - 4x + 3' }];
    expect(graph('ignored', blocks).curves.map((curve) => curve.latex)).toEqual(['y = x^2 - 4x + 3']);
  });

  it('ignores malformed and non-text blocks', () => {
    expect(extractTaskGraph('$y = x$', [null, 5, 'y = x', { type: 'image', value: '$y = x$' }, { type: 'latex', value: 7 }])).toBeNull();
  });

  it('falls back to the stem when blocks are empty or not an array', () => {
    expect(legends('$y = x$')).toEqual(['y = x']);
    expect(graph('$y = x$', []).curves).toHaveLength(1);
    expect(graph('$y = x$', { type: 'latex' }).curves).toHaveLength(1);
  });
});

describe('extractTaskGraph: limits', () => {
  it('draws at most four curves', () => {
    const result = graph('Графики $y = x$, $y = 2x$, $y = 3x$, $y = 4x$, $y = 5x$');
    expect(result.curves).toHaveLength(4);
  });
});

describe('solveForY', () => {
  it('solves linear and quadratic relations in y and rejects others', () => {
    const line = solveForY((x, y) => 2 * x + 3 * y - 7);
    expect(line?.quadratic).toBe(false);
    expect(line?.branches[0](2)).toBeCloseTo(1, 12);
    const circle = solveForY((x, y) => x * x + y * y - 25);
    expect(circle?.quadratic).toBe(true);
    expect(circle?.branches.map((branch) => branch(4)).sort()).toEqual([-3, 3]);
    expect(solveForY((x, y) => y ** 3 - x)).toBeNull();
    expect(solveForY((x, y) => Math.cos(y) - x)).toBeNull();
    expect(solveForY((x) => x - 2)).toBeNull();
  });
});
