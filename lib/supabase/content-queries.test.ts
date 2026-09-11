import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeClient, type InMemoryState } from './testing/in-memory-db';

const state = vi.hoisted((): InMemoryState => ({ store: {}, failOnce: null }));
vi.mock('./server', () => ({ createClient: async () => makeClient(state) }));
import { getSubjectsWithCounts, getTopicsForSubject, getQuestionsForTopic, getExamAvailability, getPairExamBlocks } from './queries';

beforeEach(() => {
  state.failOnce = null;
  state.store = {
    subjects: [{ id: 'S1', slug: 'math', name_ru: 'Математика' }, { id: 'S2', slug: 'physics' }],
    topics: [{ id: 'T1', slug: 'powers', subject_id: 'S1' }, { id: 'T2', slug: 'motion', subject_id: 'S2' }],
    questions: Array.from({ length: 1203 }, (_, i) => ({ id: `Q${String(i).padStart(4, '0')}`, topic_id: i < 1100 ? 'T1' : 'T2', language: 'ru', is_published: true, type: 'single', sort_order: i, context_id: null })),
    contexts: [],
  };
});

describe('published content queries', () => {
  it('counts questions after the first PostgREST page for both subjects and topics', async () => {
    expect((await getSubjectsWithCounts('ru')).map(s => s.question_count)).toEqual([1100, 103]);
    expect((await getTopicsForSubject('math', 'ru'))[0].question_count).toBe(1100);
    expect(await getExamAvailability('ru')).toEqual({ math: { single: 1100 }, physics: { single: 103 } });
  });
  it('practice delivers the same complete topic pool that the catalog counts', async () => {
    expect((await getQuestionsForTopic('powers', 'ru')).questions).toHaveLength(1100);
  });
  it('does not substitute Russian or expose Kazakh drafts', async () => {
    state.store.questions.push({ id: 'KK-draft', topic_id: 'T1', language: 'kk', is_published: false, type: 'single' });
    expect((await getQuestionsForTopic('powers', 'kk')).questions).toEqual([]);
    expect((await getSubjectsWithCounts('kk')).every(s => s.question_count === 0)).toBe(true);
  });
  it.each(['topics', 'questions', 'contexts'])('throws on %s failure instead of reporting empty or incomplete content', async table => {
    state.store.questions[0].context_id = 'C1';
    state.store.contexts = [{ id: 'C1', language: 'ru', content: { blocks: [] } }];
    state.failOnce = { table, op: 'select', message: 'database offline' };
    await expect(getQuestionsForTopic('powers', 'ru')).rejects.toThrow();
  });
  it('rejects a missing or wrong-language shared context', async () => {
    state.store.questions[0].context_id = 'C1';
    state.store.contexts = [{ id: 'C1', language: 'kk', content: { blocks: [] } }];
    await expect(getQuestionsForTopic('powers', 'ru')).rejects.toThrow();
  });
  it('preserves not-found only for a successful query with no topic', async () => {
    expect((await getQuestionsForTopic('missing', 'ru')).topic).toBeNull();
  });
  it('exam selection can use questions beyond row 1000', async () => {
    const result = await getPairExamBlocks('physics', 'ru');
    expect(result?.blocks[1].questions.length).toBeGreaterThan(0);
  });
  it('catalog database failures reach the retry boundary', async () => {
    state.failOnce = { table: 'questions', op: 'select', message: 'offline' };
    await expect(getSubjectsWithCounts('kk')).rejects.toThrow();
  });
});
