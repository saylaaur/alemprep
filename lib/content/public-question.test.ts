import { describe, expect, it } from 'vitest';
import { toPublicQuestion } from './public-question';
import { versionFixture } from '@/tests/fixtures/learning';

describe('toPublicQuestion', () => {
  it('does not serialize the answer key or explanation before review', () => {
    const question = toPublicQuestion(versionFixture());
    const json = JSON.stringify(question);

    expect(Object.hasOwn(question.body, 'correct')).toBe(false);
    expect(json).not.toContain('EXPLANATION_PRIVATE_MARKER');
    expect(json).not.toContain('gradingBody');
    expect(json).not.toContain('explanation');
    expect(question).toEqual({
      id: '47a9e484-eeb4-4e03-bcfe-057411592a16',
      locale: 'kk',
      type: 'single',
      topicLabel: 'Логарифмдер',
      context: null,
      body: {
        stem: 'Тест сұрағы',
        options: [
          { id: 'A', content: 'A нұсқасы' },
          { id: 'B', content: 'B нұсқасы' },
        ],
      },
    });
  });
});
