import { describe, expect, it } from 'vitest';
import { RECIPES } from './ui-sounds';

describe('ui sound recipes', () => {
  it('stay short and quiet so they never startle a student', () => {
    for (const [name, notes] of Object.entries(RECIPES)) {
      const end = Math.max(...notes.map((n) => n.at + n.dur));
      expect(end, name).toBeLessThanOrEqual(0.8);
      for (const n of notes) {
        expect(n.gain, name).toBeLessThanOrEqual(0.14);
        expect(n.f, name).toBeGreaterThan(60);
        expect(n.f, name).toBeLessThan(4000);
      }
    }
  });

  it('a right answer rises and a wrong answer falls', () => {
    const c = RECIPES.correct;
    expect(c[1].f).toBeGreaterThan(c[0].f);
    const w = RECIPES.wrong[0];
    expect(w.to!).toBeLessThan(w.f);
  });
});
