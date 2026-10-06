import { describe, expect, it } from 'vitest';
import { graphPoints, graphValue, graphExpression } from './presets';

describe('visualization maths', () => {
  it('matches the quadratic formula and table, including negative coefficients', () => {
    expect(graphPoints('quadratic', 1.5, -1)).toEqual([
      { x: -2, y: 5 }, { x: -1, y: 0.5 }, { x: 0, y: -1 }, { x: 1, y: 0.5 }, { x: 2, y: 5 },
    ]);
    expect(graphValue('quadratic', -2, 3, 2)).toBe(-5);
    expect(graphExpression('quadratic', -2, -1)).toBe('y=(-2)x^{2}+(-1)');
  });
  it('keeps linear and zero-slope graphs consistent with their points', () => {
    expect(graphValue('linear', 2, -1, -2)).toBe(-5);
    expect(graphPoints('linear', 0, 3).every((point) => point.y === 3)).toBe(true);
    expect(graphExpression('linear', 2, -1)).toBe('y=(2)x+(-1)');
  });
});
