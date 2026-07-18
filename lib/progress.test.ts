import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_PAIR_MAX_SCORE } from '@/lib/exam';
import { WEEKLY_PAIR_MAX_SCORE } from '@/lib/weekly';
import { buildTrajectory, type TrajectorySessionInput } from './progress';

function session(
  mode: TrajectorySessionInput['mode'],
  finishedAt: string | null,
  score: number | null
): TrajectorySessionInput {
  return { mode, finishedAt, score };
}

describe('buildTrajectory', () => {
  it('returns [] for no sessions', () => {
    expect(buildTrajectory([])).toEqual([]);
  });

  it('excludes unfinished sessions', () => {
    const points = buildTrajectory([
      session('diagnostic', null, null),
      session('weekly', null, 10),
    ]);
    expect(points).toEqual([]);
  });

  it('sorts by finishedAt ascending regardless of input order', () => {
    const points = buildTrajectory([
      session('weekly', '2026-07-13T00:00:00.000Z', 10),
      session('diagnostic', '2026-06-29T00:00:00.000Z', 8),
      session('weekly', '2026-07-06T00:00:00.000Z', 9),
    ]);
    expect(points.map((p) => p.date)).toEqual([
      '2026-06-29T00:00:00.000Z',
      '2026-07-06T00:00:00.000Z',
      '2026-07-13T00:00:00.000Z',
    ]);
  });

  it('diagnostic always gets weekIndex 0, regardless of position', () => {
    const points = buildTrajectory([
      session('weekly', '2026-06-20T00:00:00.000Z', 5), // earlier than the diagnostic below (edge case)
      session('diagnostic', '2026-06-29T00:00:00.000Z', 8),
    ]);
    const diag = points.find((p) => p.kind === 'diagnostic');
    expect(diag?.weekIndex).toBe(0);
  });

  it('assigns sequential weekIndex to weekly points in date order', () => {
    const points = buildTrajectory([
      session('diagnostic', '2026-06-29T00:00:00.000Z', 8),
      session('weekly', '2026-07-06T00:00:00.000Z', 9),
      session('weekly', '2026-07-13T00:00:00.000Z', 11),
      session('weekly', '2026-07-20T00:00:00.000Z', 14),
    ]);
    const weeklyIndexes = points.filter((p) => p.kind === 'weekly').map((p) => p.weekIndex);
    expect(weeklyIndexes).toEqual([1, 2, 3]);
  });

  it('resolves maxScore per mode from the real exported constants', () => {
    const points = buildTrajectory([
      session('diagnostic', '2026-06-29T00:00:00.000Z', 8),
      session('weekly', '2026-07-06T00:00:00.000Z', 9),
    ]);
    expect(points[0].maxScore).toBe(DIAGNOSTIC_PAIR_MAX_SCORE);
    expect(points[1].maxScore).toBe(WEEKLY_PAIR_MAX_SCORE);
  });

  it('computes percent as score/maxScore', () => {
    const points = buildTrajectory([session('diagnostic', '2026-06-29T00:00:00.000Z', 12)]);
    expect(points[0].percent).toBeCloseTo(12 / DIAGNOSTIC_PAIR_MAX_SCORE);
  });

  it('treats a null score as 0', () => {
    const points = buildTrajectory([session('weekly', '2026-07-06T00:00:00.000Z', null)]);
    expect(points[0].score).toBe(0);
    expect(points[0].percent).toBe(0);
  });
});
