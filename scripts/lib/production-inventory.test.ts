import { describe, expect, it } from 'vitest';
import { buildInventorySummary } from './production-inventory';

describe('buildInventorySummary', () => {
  it('counts only published questions in language/type coverage while retaining all drafts', () => {
    const summary = buildInventorySummary(
      [
        { topic_id: 'math-topic', language: 'ru', type: 'single', is_published: true },
        { topic_id: 'math-topic', language: 'kk', type: 'matching', is_published: true },
        { topic_id: 'physics-topic', language: 'ru', type: 'multi', is_published: false },
      ],
      [
        { id: 'math-topic', subject_id: 'math' },
        { id: 'physics-topic', subject_id: 'physics' },
      ],
      [
        { id: 'math', slug: 'math' },
        { id: 'physics', slug: 'physics' },
      ],
    );

    expect(summary).toEqual({
      total: 3,
      published: 2,
      drafts: 1,
      byLanguageAndType: {
        ru: { single: 1, multi: 0, matching: 0 },
        kk: { single: 0, multi: 0, matching: 1 },
      },
      bySubject: [
        { slug: 'math', published: 2, drafts: 0 },
        { slug: 'physics', published: 0, drafts: 1 },
      ],
    });
  });
});
