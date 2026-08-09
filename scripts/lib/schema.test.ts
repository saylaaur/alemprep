import { describe, it, expect } from 'vitest';
import { ReferenceQuestionSchema, GeneratedQuestionSchema, SubjectSchema } from './schema';

const baseBody = {
  stem: 'Найдите $2+2$.',
  options: [
    { id: 'a', content: '3' },
    { id: 'b', content: '4' },
  ],
  correct: 'b',
};

const baseExplanation = { blocks: [{ type: 'text', value: 'Очевидно.' }] };

describe('SubjectSchema', () => {
  it('accepts all four official subjects', () => {
    for (const s of ['math', 'physics', 'informatics', 'math-literacy']) {
      expect(SubjectSchema.safeParse(s).success).toBe(true);
    }
  });

  it('rejects an unknown subject string', () => {
    expect(SubjectSchema.safeParse('chemistry').success).toBe(false);
  });
});

describe('ReferenceQuestionSchema subject field', () => {
  const base = {
    topic_slug: 'algebra',
    type: 'single' as const,
    difficulty: 3,
    body: baseBody,
    explanation: baseExplanation,
    source_file: 'p1.jpg',
  };

  it('parses without a subject field (legacy single-item transcription)', () => {
    expect(ReferenceQuestionSchema.safeParse(base).success).toBe(true);
  });

  it('parses with subject: null (undetermined)', () => {
    const result = ReferenceQuestionSchema.safeParse({ ...base, subject: null });
    expect(result.success).toBe(true);
    expect(result.success && result.data.subject).toBeNull();
  });

  it('parses with a valid subject value', () => {
    const result = ReferenceQuestionSchema.safeParse({ ...base, subject: 'math-literacy' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.subject).toBe('math-literacy');
  });

  it('rejects an invalid subject value', () => {
    expect(ReferenceQuestionSchema.safeParse({ ...base, subject: 'chemistry' }).success).toBe(false);
  });
});

describe('GeneratedQuestionSchema subject field', () => {
  const base = {
    topic_slug: 'algebra',
    type: 'single' as const,
    difficulty: 3,
    body: baseBody,
    explanation: baseExplanation,
    variant_of: 'p1.jpg',
  };

  it('parses without a subject field (legacy generated variant)', () => {
    expect(GeneratedQuestionSchema.safeParse(base).success).toBe(true);
  });

  it('parses with a subject field carried over from the reference', () => {
    const result = GeneratedQuestionSchema.safeParse({ ...base, subject: 'physics' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.subject).toBe('physics');
  });
});
