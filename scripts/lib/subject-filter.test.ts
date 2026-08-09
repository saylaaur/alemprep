import { describe, it, expect } from 'vitest';
import { applySubjectFilter, summarizeBySubject, UNDETERMINED_SUBJECT_REASON } from './subject-filter';
import type { ReferenceQuestion, TranscriptionItem } from './schema';

function ref(overrides: Partial<ReferenceQuestion> = {}): ReferenceQuestion {
  return {
    topic_slug: 'algebra',
    type: 'single',
    difficulty: 3,
    body: {
      stem: 'x',
      options: [
        { id: 'a', content: '1' },
        { id: 'b', content: '2' },
      ],
      correct: 'a',
    },
    explanation: { blocks: [{ type: 'text', value: 'y' }] },
    source_file: 'p1.jpg',
    ...overrides,
  };
}

describe('applySubjectFilter', () => {
  it('discards an item with subject: null regardless of target', () => {
    const result = applySubjectFilter(ref({ subject: null }), undefined);
    expect(result).toEqual({ keep: false, reason: UNDETERMINED_SUBJECT_REASON });
  });

  it('discards an item with no subject field at all', () => {
    const result = applySubjectFilter(ref(), 'math');
    expect(result.keep).toBe(false);
  });

  it('keeps a determined subject when no target subject is given (auto-detect run)', () => {
    expect(applySubjectFilter(ref({ subject: 'physics' }), undefined)).toEqual({ keep: true });
  });

  it('keeps an item whose subject matches the --subject flag', () => {
    expect(applySubjectFilter(ref({ subject: 'math' }), 'math')).toEqual({ keep: true });
  });

  it('filters out an item whose subject does not match the --subject flag', () => {
    const result = applySubjectFilter(ref({ subject: 'informatics' }), 'math');
    expect(result.keep).toBe(false);
    expect(result.keep === false && result.reason).toMatch(/informatics/);
  });
});

describe('summarizeBySubject', () => {
  it('tallies kept items by subject and counts undetermined skips', () => {
    const items: TranscriptionItem[] = [
      ref({ subject: 'math' }),
      ref({ subject: 'math' }),
      ref({ subject: 'physics' }),
      { skip: 'unsupported', reason: UNDETERMINED_SUBJECT_REASON, source_file: 'p2.jpg' },
      { skip: 'graph', reason: 'circuit diagram', source_file: 'p3.jpg' },
    ];
    const summary = summarizeBySubject(items);
    expect(summary.bySubject.math).toBe(2);
    expect(summary.bySubject.physics).toBe(1);
    expect(summary.bySubject.informatics).toBe(0);
    expect(summary.bySubject['math-literacy']).toBe(0);
    expect(summary.undetermined).toBe(1);
  });
});
