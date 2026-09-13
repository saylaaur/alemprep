import { describe, expect, it } from 'vitest';
import { gradeVersionAnswer } from './grading';
import { versionFixture } from '@/tests/fixtures/learning';

describe('gradeVersionAnswer', () => {
  it('grades from the immutable grading body and rejects an option absent from the issued version', () => {
    const version = versionFixture();

    expect(gradeVersionAnswer(version, 'A')).toEqual({ points: 1, maxPoints: 1 });
    expect(() => gradeVersionAnswer(version, 'C')).toThrow('invalid answer for issued question version');
  });
});
