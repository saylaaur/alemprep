import { describe, it, expect } from 'vitest';
import { resolveTopic } from './topic-resolve';

describe('resolveTopic', () => {
  const mathTopics = new Map([['algebra', 'topic-math-algebra']]);
  const physicsTopics = new Map([['mechanics', 'topic-physics-mechanics']]);
  const maps = new Map<string, ReadonlyMap<string, string> | null>([
    ['math', mathTopics],
    ['physics', physicsTopics],
    ['informatics', null],
  ]);

  it('resolves using the item own subject, ignoring the flag subject', () => {
    const result = resolveTopic({ topic_slug: 'mechanics', subject: 'physics' }, 'math', maps);
    expect(result).toEqual({ kind: 'resolved', subject: 'physics', topicId: 'topic-physics-mechanics' });
  });

  it('falls back to the flag subject when the item has no subject field', () => {
    const result = resolveTopic({ topic_slug: 'algebra' }, 'math', maps);
    expect(result).toEqual({ kind: 'resolved', subject: 'math', topicId: 'topic-math-algebra' });
  });

  it('falls back to the flag subject when the item subject is null', () => {
    const result = resolveTopic({ topic_slug: 'algebra', subject: null }, 'math', maps);
    expect(result).toEqual({ kind: 'resolved', subject: 'math', topicId: 'topic-math-algebra' });
  });

  it('reports unknown_subject when the resolved subject has no topic map (missing in DB)', () => {
    const result = resolveTopic({ topic_slug: 'networks', subject: 'informatics' }, 'math', maps);
    expect(result).toEqual({ kind: 'unknown_subject', subject: 'informatics' });
  });

  it('reports unknown_topic when the slug is missing from its subject map', () => {
    const result = resolveTopic({ topic_slug: 'nonexistent-slug', subject: 'math' }, 'math', maps);
    expect(result).toEqual({ kind: 'unknown_topic', subject: 'math', topicSlug: 'nonexistent-slug' });
  });
});
