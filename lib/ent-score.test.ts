import { describe, it, expect } from 'vitest';
import {
  entProjection,
  meetsSubjectMinimum,
  subjectMinimum,
  thresholdStatus,
  NATIONAL_UNIVERSITY_THRESHOLD,
  OTHER_UNIVERSITY_THRESHOLD,
} from './ent-score';

describe('entProjection', () => {
  it('sums measured profile scores against the official 140-point scale, noting the uncovered mandatory block', () => {
    const projection = entProjection([
      { slug: 'math', score: 42, maxScore: 50 },
      { slug: 'physics', score: 38, maxScore: 50 },
    ]);
    expect(projection.measuredScore).toBe(80);
    expect(projection.measuredMax).toBe(100);
    expect(projection.totalScale).toBe(140);
    // history-kz (20) + reading-literacy (10) + math-literacy (10) = 40, derived from the JSON, not hardcoded
    expect(projection.uncoveredMax).toBe(40);
  });

  it('handles a single profile subject (e.g. partial results)', () => {
    const projection = entProjection([{ slug: 'math', score: 30, maxScore: 50 }]);
    expect(projection.measuredScore).toBe(30);
    expect(projection.measuredMax).toBe(50);
  });

  it('handles no scores at all', () => {
    const projection = entProjection([]);
    expect(projection.measuredScore).toBe(0);
    expect(projection.measuredMax).toBe(0);
    expect(projection.totalScale).toBe(140);
  });
});

describe('meetsSubjectMinimum', () => {
  it('profile subjects (math/physics/informatics) require the profile minimum (5)', () => {
    expect(meetsSubjectMinimum('math', 5)).toBe(true);
    expect(meetsSubjectMinimum('physics', 4)).toBe(false);
    expect(meetsSubjectMinimum('informatics', 5)).toBe(true);
  });

  it('history-kz requires its own mandatory minimum (5)', () => {
    expect(meetsSubjectMinimum('history-kz', 5)).toBe(true);
    expect(meetsSubjectMinimum('history-kz', 4)).toBe(false);
  });

  it('reading-literacy and math-literacy require the lower mandatory minimum (3)', () => {
    expect(meetsSubjectMinimum('reading-literacy', 3)).toBe(true);
    expect(meetsSubjectMinimum('reading-literacy', 2)).toBe(false);
    expect(meetsSubjectMinimum('math-literacy', 3)).toBe(true);
    expect(meetsSubjectMinimum('math-literacy', 2)).toBe(false);
  });
});

describe('subjectMinimum', () => {
  it('returns 5 for profile subjects', () => {
    expect(subjectMinimum('math')).toBe(5);
    expect(subjectMinimum('physics')).toBe(5);
  });

  it('returns the mandatory subject minimum for history-kz (5) and math-literacy (3)', () => {
    expect(subjectMinimum('history-kz')).toBe(5);
    expect(subjectMinimum('math-literacy')).toBe(3);
  });
});

describe('thresholdStatus', () => {
  it('reports meeting a target with zero gap', () => {
    expect(thresholdStatus(70, 65)).toEqual({ meetsTarget: true, gap: 0 });
  });

  it('reports exactly meeting a target as meeting it', () => {
    expect(thresholdStatus(65, 65)).toEqual({ meetsTarget: true, gap: 0 });
  });

  it('reports the point gap when below target', () => {
    expect(thresholdStatus(58, 65)).toEqual({ meetsTarget: false, gap: 7 });
  });

  it('exposes the official university thresholds from the JSON', () => {
    expect(NATIONAL_UNIVERSITY_THRESHOLD).toBe(65);
    expect(OTHER_UNIVERSITY_THRESHOLD).toBe(50);
  });
});
