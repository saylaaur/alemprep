import { describe, expect, it } from 'vitest';
import { hasAssessmentContent } from './content-availability';
import { DIAGNOSTIC_BLUEPRINT } from './exam';

describe('assessment intro availability', () => {
  it('requires every type in both subjects, even when total volume is large', () => {
    expect(hasAssessmentContent({ math: { single: 1000, multi: 10, matching: 10 }, physics: { single: 1000, matching: 10 } }, 'physics', DIAGNOSTIC_BLUEPRINT)).toBe(false);
  });
  it('enables the exact blueprint threshold and rejects the empty locale', () => {
    expect(hasAssessmentContent({ math: { single: 6, multi: 1, matching: 1 }, physics: { single: 6, multi: 1, matching: 1 } }, 'physics', DIAGNOSTIC_BLUEPRINT)).toBe(true);
    expect(hasAssessmentContent({}, 'physics', DIAGNOSTIC_BLUEPRINT)).toBe(false);
  });
});
