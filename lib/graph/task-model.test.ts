import { describe, expect, it } from 'vitest';
import { buildTaskModel } from './task-model';

const inView = (model: NonNullable<ReturnType<typeof buildTaskModel>>, x: number) => x >= model.view.xmin && x <= model.view.xmax;

describe('task graph model', () => {
  it('keeps close roots and the interval between them in the expanded window', () => {
    expect(buildTaskModel('Решите уравнение $x^2 - 163x + 6642 = 0$')!.solution).toBe('81; 82');
    expect(buildTaskModel('Решите неравенство $x^2 - 163x + 6642 < 0$')!.solution).toBe('(81; 82)');
    expect(buildTaskModel('Решите уравнение $(x-81.2)(x-81.4) = 0$')!.solution).toBe('81,2; 81,4');
  });

  it('shows constant and linear curves whose only useful feature is the Oy intercept', () => {
    for (const [stem, y] of [['Постройте график $y = 25$', 25], ['Постройте график $y = x + 100$', 100]] as const) {
      const model = buildTaskModel(stem)!;
      expect(model.view.ymin).toBeLessThan(y);
      expect(model.view.ymax).toBeGreaterThan(y);
    }
  });
  it('shows and names solutions that lie beyond the first window', () => {
    const quadratic = buildTaskModel('Решите уравнение $x^2 - 100x + 2400 = 0$')!;
    expect(quadratic.solution).toBe('40; 60');
    expect(inView(quadratic, 40) && inView(quadratic, 60)).toBe(true);
    expect(buildTaskModel('Решите уравнение $\\sqrt{x} = 9$')!.solution).toBe('81');
    expect(buildTaskModel('Решите неравенство $\\log_2 x \\le 7$')!.solution).toBe('(0; 128]');
    expect(buildTaskModel('Решите неравенство $(x-70)(x+5) < 0$')!.solution).toBe('(−5; 70)');
    expect(buildTaskModel('Решите неравенство $\\frac{1}{x} > 0{,}01$')!.solution).toBe('(0; 100)');
  });

  it('keeps every root it writes inside the picture', () => {
    const model = buildTaskModel('Найдите корни уравнения $\\log_2^2 x - 5\\log_2 x = 0$')!;
    expect(model.solution).toBe('1; 32');
    expect(inView(model, 1) && inView(model, 32)).toBe(true);
  });

  it('solves rational inequalities whose sides decay to zero', () => {
    expect(buildTaskModel('Решите неравенство $\\frac{x+4}{(x-1)(x+2)} > 0$')!.solution).toBe('(−4; −2) ∪ (1; +∞)');
  });

  it('shows far intersections of a system', () => {
    const model = buildTaskModel('Решите систему уравнений $\\begin{cases} \\frac{x}{8} + \\frac{y}{4} = 5 \\\\ \\frac{x}{15} - \\frac{y}{5} = 1 \\end{cases}$')!;
    expect(model.visible.some((point) => point.kind === 'intersection' && Math.abs(point.x - 30) < 1e-6 && Math.abs(point.y - 5) < 1e-6)).toBe(true);
  });

  it('does not let one huge Oy value flatten a system of inequalities', () => {
    const model = buildTaskModel('Задана система неравенств: $\\begin{cases} \\left(\\frac{1}{2}\\right)^{x+1} \\leq 8 \\\\ 13^{4-x} - 1 \\geq 0 \\end{cases}$')!;
    expect(model.view.ymax).toBeLessThan(100);
    expect(model.visible.filter((point) => point.kind === 'intersection')).toHaveLength(3);
  });

  it('draws nothing for progressions and never throws', () => {
    for (const stem of [
      'Найдите сумму первых десяти членов арифметической прогрессии, если $a_1 = 3$, $d = 4$.',
      'Арифметическая прогрессия задана формулой $a_n = 3n - 2$. Найдите $a_{10}$.',
      'Найдите $x$, если числа $x - 1$, $2x$, $x + 7$ образуют арифметическую прогрессию.',
      'Найдите разность арифметической прогрессии $5; 9; 13; \\ldots$',
      '$y = \\frac{1}{0}$', '$\\log_0 x$ = 1', '$$', '',
    ]) expect(buildTaskModel(stem)).toBeNull();
  });
});

describe('viewport with a circle', () => {
  it('ignores where the two branches of one circle meet', async () => {
    const { buildUserCurve } = await import('./user-input');
    const { autoViewport } = await import('./analyze');
    const parabola = buildUserCurve('x^2 - 4x + 3', {}); const circle = buildUserCurve('x^2 + y^2 = 9', {});
    if (!parabola.ok || !circle.ok) throw new Error('parse');
    const view = autoViewport([...parabola.branches, ...circle.branches], { equalAspect: true });
    expect(view.xmax - view.xmin).toBeLessThan(30);
    expect(view.ymax).toBeLessThan(20);
  });
});
