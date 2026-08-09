import { describe, it, expect } from 'vitest';
import { groupBySubject, subjectReferenceFileName } from './subject-split';
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

describe('groupBySubject', () => {
  it('groups items by subject, in SUBJECT_VALUES order, skipping subjects with no items', () => {
    const items: TranscriptionItem[] = [
      ref({ subject: 'physics', source_file: 'p1' }),
      ref({ subject: 'math', source_file: 'p2' }),
      ref({ subject: 'math', source_file: 'p3' }),
    ];
    const groups = groupBySubject(items);
    expect(groups.map((g) => g.subject)).toEqual(['math', 'physics']);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].items).toHaveLength(1);
  });

  it('excludes skip items', () => {
    const items: TranscriptionItem[] = [
      ref({ subject: 'math' }),
      { skip: 'graph', reason: 'x', source_file: 'p' },
    ];
    const groups = groupBySubject(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].subject).toBe('math');
  });

  it('excludes items with subject null or missing, even if not already filtered upstream', () => {
    const items: TranscriptionItem[] = [ref({ subject: null }), ref({ source_file: 'no-subject' })];
    expect(groupBySubject(items)).toEqual([]);
  });

  it('returns an empty array when there are no reference-question items at all', () => {
    expect(groupBySubject([{ skip: 'unsupported', reason: 'x', source_file: 'p' }])).toEqual([]);
  });

  it('returns an empty array for an empty input', () => {
    expect(groupBySubject([])).toEqual([]);
  });
});

describe('subjectReferenceFileName', () => {
  it('formats as <subject>-<timestamp>.json', () => {
    expect(subjectReferenceFileName('math', '2026-08-09T22-30')).toBe('math-2026-08-09T22-30.json');
  });

  it('uses the exact subject slug, including hyphenated ones', () => {
    expect(subjectReferenceFileName('math-literacy', 'ts')).toBe('math-literacy-ts.json');
  });
});
