import { describe, it, expect } from 'vitest';
import { decidePruning, summarizePruning, type TopicForPruning } from './prune-topics';

const OFFICIAL: Record<string, readonly string[]> = {
  math: ['trigonometry', 'progressions'],
  physics: ['electrostatics'],
};

function topic(overrides: Partial<TopicForPruning>): TopicForPruning {
  return {
    id: 'id-1',
    slug: 'algebra',
    subjectSlug: 'math',
    nameRu: 'Алгебра',
    questionCount: 0,
    ...overrides,
  };
}

describe('decidePruning', () => {
  it('deletes a non-official topic with zero questions', () => {
    const [decision] = decidePruning([topic({ slug: 'algebra', questionCount: 0 })], OFFICIAL);
    expect(decision.action).toBe('delete');
  });

  it('never deletes an official topic, even with zero questions', () => {
    const [decision] = decidePruning(
      [topic({ slug: 'trigonometry', questionCount: 0 })],
      OFFICIAL,
    );
    expect(decision.action).toBe('keep_official');
  });

  it('keeps an official topic that also has questions', () => {
    const [decision] = decidePruning(
      [topic({ slug: 'trigonometry', questionCount: 42 })],
      OFFICIAL,
    );
    expect(decision.action).toBe('keep_official');
  });

  it('never deletes a non-official topic that still has questions — flags for manual review instead', () => {
    const [decision] = decidePruning([topic({ slug: 'text_problems', questionCount: 5 })], OFFICIAL);
    expect(decision.action).toBe('keep_has_questions');
  });

  it('a slug official for a different subject does not protect this subject\'s topic', () => {
    const [decision] = decidePruning(
      [topic({ slug: 'electrostatics', subjectSlug: 'math', questionCount: 0 })],
      OFFICIAL,
    );
    expect(decision.action).toBe('delete');
  });
});

describe('summarizePruning', () => {
  it('buckets decisions into deleted / needsReview / keptOfficial', () => {
    const decisions = decidePruning(
      [
        topic({ id: '1', slug: 'algebra', questionCount: 0 }),
        topic({ id: '2', slug: 'text_problems', questionCount: 3 }),
        topic({ id: '3', slug: 'trigonometry', questionCount: 0 }),
        topic({ id: '4', slug: 'progressions', questionCount: 10 }),
      ],
      OFFICIAL,
    );
    const summary = summarizePruning(decisions);
    expect(summary.deleted.map((t) => t.id)).toEqual(['1']);
    expect(summary.needsReview.map((t) => t.id)).toEqual(['2']);
    expect(summary.keptOfficial).toBe(2);
  });
});
