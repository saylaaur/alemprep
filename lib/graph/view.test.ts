import { describe, expect, it } from 'vitest';
import { clampView, clean, digitsFor, gridSteps, interpolateView, minorStep, panByPixels, sameView, ticksIn, toScreen, toWorld, zoomAround, MIN_SPAN } from './view';

const view = { xmin: -6, xmax: 6, ymin: -4, ymax: 4 };
const size = { width: 300, height: 200 };

describe('view maths', () => {
  it('screen and world conversions are inverse', () => {
    const screen = toScreen(view, size, 1.5, -2);
    expect(screen).toEqual({ x: 187.5, y: 150 });
    expect(toWorld(view, size, screen.x, screen.y)).toEqual({ x: 1.5, y: -2 });
  });

  it('zooms around a point that stays under the same pixel', () => {
    const zoomed = zoomAround(view, 0.5, 2, 1);
    expect(toScreen(zoomed, size, 2, 1)).toEqual(toScreen(view, size, 2, 1));
    expect(zoomed.xmax - zoomed.xmin).toBe(6);
  });

  it('stops zooming in past the limit but can always zoom back out', () => {
    const tiny = { xmin: 0, xmax: MIN_SPAN / 2, ymin: 0, ymax: MIN_SPAN / 2 };
    expect(zoomAround(tiny, 0.5)).toBe(tiny);
    expect(zoomAround(tiny, 2).xmax).toBeGreaterThan(tiny.xmax);
    expect(clampView(tiny).xmax - clampView(tiny).xmin).toBeCloseTo(MIN_SPAN, 12);
  });

  it('pans with the finger', () => {
    expect(panByPixels(view, size, 25, -50)).toEqual({ xmin: -7, xmax: 5, ymin: -6, ymax: 2 });
  });

  it('interpolates spans geometrically and ends exactly at the target', () => {
    const target = { xmin: -60, xmax: 60, ymin: -40, ymax: 40 };
    const middle = interpolateView(view, target, 0.5);
    expect(middle.xmax - middle.xmin).toBeCloseTo(Math.sqrt(12 * 120), 9);
    expect(sameView(interpolateView(view, target, 1), target)).toBe(true);
  });
});

describe('grid', () => {
  it('uses Desmos-like minor steps', () => {
    expect(minorStep(1)).toBe(0.2);
    expect(minorStep(2)).toBe(0.5);
    expect(minorStep(5)).toBe(1);
    expect(minorStep(0.1)).toBeCloseTo(0.02, 12);
  });

  it('picks π steps for trigonometry', () => {
    const steps = gridSteps(4 * Math.PI, 800, { pi: true });
    expect(steps.pi).toBe(true);
    expect(steps.major / Math.PI).toBeCloseTo(0.5, 12);
    expect(steps.minor / Math.PI).toBeCloseTo(1 / 6, 12);
  });

  it('lists clean tick values', () => {
    expect(ticksIn(-0.5, 0.5, 0.1)).toEqual([-0.5, -0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4, 0.5]);
    expect(ticksIn(0, 1e9, 1)).toEqual([]);
    expect(Object.is(clean(-0), 0)).toBe(true);
  });

  it('knows how many decimals a step needs', () => {
    expect(digitsFor(1)).toBe(0);
    expect(digitsFor(0.2)).toBe(1);
    expect(digitsFor(0.25)).toBe(2);
    expect(digitsFor(0.005)).toBe(3);
    expect(digitsFor(50)).toBe(0);
  });
});
